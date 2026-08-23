# rustpol Backend Roadmap

> A phased plan for turning `rustpol` — the from-scratch, `axum`-shaped web
> framework built directly on **Hyper 1.x + Tower + Tokio** (`src/lib.rs` and
> submodules, with the todo demo in `src/main.rs`) — from a teaching prototype
> into a small, production-credible server framework **without breaking its two
> founding constraints**:
>
> 1. **Tiny binary, low idle RAM.** The current size-optimized release binary is
>    **~711 KB** (`opt-level="z"`, `lto`, `strip`, `panic="abort"`). Every phase
>    below states its size/RAM cost, and anything heavy is **feature-gated** so
>    the minimal build stays tiny.
> 2. **Understand every line.** No feature lands as an opaque dependency. Where
>    we adopt a crate (e.g. `matchit`), we do it deliberately and document *why*;
>    where the learning is the point, we hand-write it.
>
> This roadmap is derived from a source-by-source review of the prototype and a
> fact-checked deep-research pass (Hyper 1.x guides, axum internals/issues,
> `matchit`, tower-http, RustSec). Sources are listed at the end.

---

## 0. Where we are today (honest baseline)

**What exists and is good:**

- A clean four-part framework: `routing` (linear scan, `:param`, 404 vs 405),
  `extract` (`FromRequestParts`/`FromRequest` with the axum coherence-marker
  trick), `handler` (macro-generated `Handler` for arity 0–5), `response`
  (`IntoResponse`), `middleware` (hand-written Tower `LogLayer`), `server`
  (accept loop), `body` (single `Full<Bytes>` type).
- End-to-end tests over a real socket (`tests/api.rs`).
- A ~711 KB release binary — the whole premise, already proven.

**The gaps that block "production-credible" (from the research):**

| Gap | Symptom today | Severity |
| --- | --- | --- |
| No graceful shutdown | `Ctrl-C` kills in-flight requests mid-response | **High** |
| No timeouts (read/idle/keep-alive) | Slowloris / slow-client DoS: an idle socket ties up a task forever | **High** |
| No body/header size limits | A large or malicious body is buffered whole into RAM | **High** |
| Fully-buffered `Full<Bytes>` only | Can't stream; a 1 GB upload/download allocates 1 GB (contradicts the RAM goal) | **Medium** |
| Linear-scan router | O(routes) per request; fine now, wrong shape at scale | **Medium** |
| No panic isolation | A panicking handler drops the connection (and with `panic="abort"`, aborts the **process**) | **Medium** |
| HTTP/1 only | No HTTP/2, no TLS | **Low/opt-in** |
| `println!` logging | No levels, no request IDs, no structure | **Low** |

> **Doc-vs-code drift to fix first (Phase 0):** `README.md` still describes
> rustpol as a *Postman-style HTTP **client***, while the code is a *server-side
> web framework*. The README's own rule — "if a sentence stops matching the
> code, fix one or the other" — applies. This must be reconciled before the
> roadmap is meaningful to a reader.

---

## Guiding principles (apply to every phase)

- **Feature-gate anything with size cost.** `tls`, `http2`, `tracing` become
  Cargo features. The default build stays ~1 MB.
- **Measure, don't assume.** `opt-level="z"` is *not* guaranteed smallest —
  Rust docs and `rust-lang/rust#54026` note `z` is sometimes worse than `s` or
  even `3`. Track binary size in CI and A/B the opt level on the real binary.
- **Target `hyper >= 1.11.0.** PR #4018 ("flush buffered data before shutdown",
  first released in 1.11.0, 2026-07-20) fixes a flush/shutdown race that
  produces sporadic `unexpected EOF` on large GETs to slow peers. It interacts
  directly with the graceful-shutdown work in Phase 1, so pin the floor now.
- **One body consumer per handler.** When streaming lands, encode the rule that
  only one body-consuming extractor (`Json`/`Bytes`/stream) may run, and it runs
  last — non-body `FromRequestParts` (`Path`, `Query`, `State`) run first.
- **Keep the single ergonomic body type.** Streaming is added *through* the same
  `Body` type, never by exposing raw generics to handlers.

---

## Phase 0 — Reconcile docs & lock the baseline (0.5–1 day)

**Goal:** the repo tells one true story, and we can see size regressions.

- Rewrite `README.md` §9 (and the intro framing) so it describes the *web
  framework* that actually exists, or split the client-narrative into a separate
  doc. Keep §1–8 (the excellent Hyper/Tower/body/`Result` explainer) — it's
  accurate and valuable; just re-point the "what we're building" sections.
- Add a `size` check: a small script or CI step that runs
  `cargo build --release` and asserts the binary stays under a budget
  (start: 1.2 MB). Record the current ~711 KB as the baseline.
- Bump the `hyper` floor to `1.11` in `Cargo.toml`.

**Acceptance:** README matches code; CI prints and gates binary size; `cargo
build --release` still produces a stripped binary well under 1 MB.

---

## Phase 1 — Production-readiness: shutdown, timeouts, limits (2–4 days) ★ highest impact

These are the three **High-severity** gaps. All are low binary cost (reuse
`hyper-util`, `tower`, `tokio` — already dependencies).

### 1a. Graceful shutdown

- Adopt the canonical Hyper 1.x pattern in `server.rs`:
  `hyper_util::server::graceful::GracefulShutdown::new()`, `graceful.watch(conn)`
  each connection before spawning, and after the accept loop breaks,
  `graceful.shutdown().await`.
- Make the accept loop `tokio::select!` between `listener.accept()` and a
  shutdown signal (`tokio::signal::ctrl_c()`, plus an injectable
  `oneshot`/`watch` for tests). On signal: drop the listener (stop new accepts),
  let in-flight connections drain.
- Bound the drain: a second `tokio::select!` racing `graceful.shutdown()`
  against `tokio::time::sleep(shutdown_timeout)` (default 10 s).

### 1b. Timeouts (closes the Slowloris/slow-client DoS)

- Set HTTP/1 header-read / keep-alive behavior on the low-level builder
  (`hyper::server::conn::http1::Builder` — we already use it directly, so unlike
  `axum::serve` we *can* configure it): enable `.keep_alive(true)` deliberately
  and add an **idle/read timeout** by wrapping `serve_connection` in
  `tokio::time::timeout` (or a header-read deadline).
- Add a **per-request handler timeout** as a Tower layer
  (`tower::timeout` is already available via the `timeout` feature) so a slow
  handler can't pin a task indefinitely.

### 1c. Request size limits

- Add a **max body size** guard *before* buffering: check `Content-Length`
  and enforce a cap while collecting the streaming `Incoming` body in
  `RouterService::call` (today it `.collect()`s unconditionally — the exact spot
  a size limit belongs). Return `413 Payload Too Large` on overflow.
- Add a configurable **max header size / max number of headers** via the Hyper
  builder where supported.
- Pick sane defaults (e.g. 2 MB body, 16 KB headers), overridable via a config
  struct.

**Acceptance:**
- `Ctrl-C` lets in-flight requests finish (up to the timeout) instead of being
  cut off; a test drives a slow handler and asserts it completes on shutdown.
- A client that connects and idles is dropped after the timeout (regression test
  mirroring `josecelano/axum-server-timeout`).
- A body over the limit returns 413 and never allocates the full payload.

---

## Phase 2 — Streaming bodies without losing the single body type (3–5 days) ★ core to the RAM goal

**Goal:** stop buffering everything. Support `Empty`, `Full`, *and* streamed
bodies behind one ergonomic `Body` type, exactly as axum does.

- Replace `pub type Body = Full<Bytes>` (`body.rs`) with a **newtype wrapping a
  boxed, type-erased body**:
  - Simple path (fewer trait bounds): `BoxBody<Bytes, hyper::Error>` (Hyper's
    own echo-guide pattern), or
  - axum-parity path: `UnsyncBoxBody<Bytes, Error>` with a small crate-local
    `Error`, erasing via `body.map_err(Error::new).boxed_unsync()`.
- Keep all existing ergonomics as `From` conversions that funnel through the new
  type: `&str`, `String`, `Vec<u8>`, `Bytes`, `&[u8]` → wrap in `Full` → box.
  Every current `body::from(...)` / `body::empty()` call site keeps working.
- Add `Body::from_stream(stream)` accepting any `TryStream` whose items are
  `Into<Bytes>` — wrap in `StreamBody` (with a `SyncWrapper` if we go the axum
  route). This is what lets a handler stream a large download frame-by-frame.
- Add a **streaming body extractor** and encode the single-consumer rule from
  Phase 1 in the type system: only one body-consuming extractor per handler,
  running last. Non-body extractors stay `FromRequestParts`.
- Update `RouterService::call`: instead of always `.collect()`-ing the incoming
  body, thread the streaming body through so buffered extractors (`Json`,
  `Bytes`) collect *on demand* (with the Phase 1c size cap) and streaming
  handlers never buffer.

**Acceptance:** a handler can return a multi-MB streamed response and a test
confirms RAM stays flat (no full-body allocation); `Json`/`Bytes` extractors
still work unchanged; the todo demo compiles with zero handler changes.

---

## Phase 3 — Radix-trie router (2–3 days) ★ correctness of shape

**Goal:** replace the O(routes) linear scan with O(path-length) radix matching,
preserving `:param` capture and 404/405 semantics.

- Two options, both consistent with "understand every line":
  - **Adopt `matchit`** (axum's internal router): a small, single-purpose,
    zero-copy radix-trie crate. Benchmarks: ~2.4 µs against 130 routes vs
    `route-recognizer` ~49 µs, `regex` ~422 µs, actix ~454 µs. **Recommended** —
    tiny, well-scoped, and reading its trie is itself educational.
  - **Hand-write a radix trie** for maximum "own every line" — more code, same
    result, slower to ship. Reasonable as a stretch/learning fork.
- Follow axum's **two-step** design: `matchit` maps `path → RouteId` (radix
  tree), then a `HashMap<RouteId, MethodRouter>` maps to the per-method handler
  table. This cleanly preserves the current 404 (no path) vs 405 (path exists,
  wrong method) distinction — the method layer sits *on top* of the path match.
- Keep the existing `MethodRouter`/`PendingHandler`/`with_state` machinery; only
  the `Vec<(PathPattern, _)>` linear scan in `routing.rs` changes.

**Acceptance:** all routing tests pass unchanged (including
`/items/all`-beats-`/items/:id` specificity and 404/405); a bench with dozens of
routes shows constant-ish match time vs the linear baseline.

---

## Phase 4 — Error & panic resilience (2–3 days)

**Goal:** one bad handler can't take down the server.

> **Key tension the research surfaced:** the release profile sets
> `panic = "abort"`, which **disables unwinding** — so `catch_unwind` around a
> handler **cannot** work in release builds. This must be resolved explicitly,
> not assumed away.

- **Decide the panic policy** (pick one, document it):
  - **(Recommended) Keep `panic="abort"`** for size, and treat panics as bugs:
    make handlers return `Result` and convert errors to responses via
    `IntoResponse` (already supported). Ensure no framework-internal path
    panics on attacker-controlled input (audit `unwrap`/`expect` in
    `extract.rs`, `routing.rs`). This keeps the binary small and the failure
    mode honest.
  - **OR switch to `panic="unwind"`** (accept a small binary-size increase) and
    add a `CatchPanic` Tower layer that wraps handler calls in `catch_unwind`,
    turning a panic into a `500` and keeping the connection/server alive
    (tower-http's `CatchPanic` is the reference design). Feature-gate the unwind
    profile so a "min-size" build can still choose abort.
- Harden the connection task: today `serve` logs `connection error` and moves
  on (good). Verify no path in `RouterService`/extractors can panic on
  malformed input — convert those to `400`/`413` responses instead.

**Acceptance:** a handler that panics (in the chosen policy) yields a 500 and the
server keeps accepting new connections — or, under abort, the audit proves no
attacker-reachable panic exists and this is documented.

---

## Phase 5 — Opt-in TLS & HTTP/2 (3–5 days, feature-gated)

**Goal:** HTTPS and HTTP/2 available for those who want them, **zero cost when
off**.

- **TLS:** add a `tls` feature using `tokio-rustls` (rustls under a Tokio
  wrapper) rather than OpenSSL, to stay pure-Rust and auditable. Wrap the
  accepted `TcpStream` in a `TlsAcceptor` before `TokioIo`. Backend choice
  (`ring` vs `aws-lc-rs`) affects size — **measure both** (see Open Questions).
- **HTTP/2:** add an `http2` feature that switches `server.rs` to
  `hyper::server::conn::http2` (or `hyper-util`'s `auto::Builder` to negotiate
  h1/h2 by ALPN when TLS is on). Handlers and the router are protocol-agnostic,
  so nothing above the connection layer changes.
- Keep both **out of the default feature set**; the minimal build never links
  rustls or the h2 state machine.

**Acceptance:** `cargo build --release --features tls,http2` serves HTTPS + h2;
`cargo build --release` (no features) links neither and stays near the ~711 KB
baseline (size delta recorded in CI).

---

## Phase 6 — Observability & hardening polish (2–4 days)

**Goal:** structured, low-overhead insight and the remaining security niceties.

- **Logging/tracing (feature-gated `tracing`):** offer two modes — the current
  hand-written `LogLayer` (zero deps, keeps the "understand every line" default)
  *and* an optional `tracing` + `tracing-subscriber` integration behind a
  feature for those who want spans/levels/JSON. Don't force the `tracing`
  ecosystem into the minimal build.
- **Request IDs:** a tiny Tower layer that generates/propagates an `X-Request-Id`
  and attaches it to logs — hand-written, no new heavy deps.
- **CORS:** a small hand-written CORS layer (or optional `tower-http` `cors`
  behind a feature) — allow-list origins, handle preflight `OPTIONS`.
- **Metrics (optional):** a minimal counter/histogram layer or a
  feature-gated Prometheus text endpoint; keep it off by default.

**Acceptance:** the default build's observability is the existing `LogLayer`
(no new deps); enabling `tracing` yields structured logs with request IDs; CORS
preflight works against a browser client.

---

## Phase 7 — CLI Usage & Headless Runner (2–3 days)

**Goal:** Provide a fast, headless terminal interface and test runner (`rustman-cli` / `rustman run`) for CI/CD pipelines, automated testing, and terminal-first workflows without needing the desktop UI.

- **Headless collection execution:** Run full collection suites, single endpoints, or mock assertions from the command line (`rustman run <collection.json> --env <env-name>`).
- **Environment & variable overrides:** Pass environment files (`--env-file <path>`) or inline key-value overrides (`--var api_key=secret`).
- **Multiple output formats:**
  - Rich, ANSI-colored terminal output with status badges and microsecond duration summaries.
  - Machine-readable `--json` output stream for shell scripting and piping into tools like `jq`.
  - Standard `--reporter junit` XML / TAP output for seamless integration into GitHub Actions, GitLab CI, and other CI/CD test runners.
  - `--export-curl` flag to output reproducible cURL commands directly to stdout.
- **Interactive CLI / REPL mode:** Lightweight terminal prompt for ad-hoc requests, method picking, parameter editing, and quick inspection without spawning a window.
- **Zero bloat:** Standalone binary (< 1.5 MB) leveraging the shared zero-copy Hyper 1.x / Tokio networking core.

**Acceptance:** `rustman run ./collections/todos.json --env local` executes all requests and assertions headlessly, exits with code `0` on success and `1` on failed assertions, outputs JUnit reports, and runs within CI pipelines in under 100ms.

---

## Phase 8 — Collaborative Coding & Team Workspaces (4–6 days)

**Goal:** Enable real-time pair API testing, synchronized team workspaces, and Git-native collaboration without centralized vendor lock-in.

- **Git-native, local-first file synchronization:**
  - Store collections, environments, and mock definitions in clean, human-readable, deterministic formats (`.json`, `.toml`, `.http`) to prevent merge conflicts in version control.
  - Instant workspace re-indexing when files are modified externally via Git branches or team pulls.
- **Live pair-testing & shared sessions:**
  - Lightweight peer-to-peer or local WebSocket relay for live pair-debugging.
  - Live session broadcasting: teammates can inspect live outgoing requests, stream incoming responses in real time, and view synchronized network waterfall telemetry.
- **Team workspace management & RBAC:**
  - Shared collection hierarchies with team-level and personal-level workspace scopes.
  - Granular environment variable management: shared variables sync across the team, while sensitive credentials (bearer tokens, private API keys) are masked and remain strictly local to each developer.
- **Live diffing & conflict resolution:** Visual side-by-side diffing between local workspace edits and upstream team changes before applying merges.

**Acceptance:** Multiple engineers can connect to a shared workspace session, trigger requests, collaboratively inspect synchronized live response payloads and telemetry waterfalls, and cleanly version-control team collections in Git.

---

## Phase 9 — AI Integration: Request & Error/Success Diagnostics (3–5 days, feature-gated)

**Goal:** Provide intelligent, context-aware explanations of HTTP requests, payload structures, network bottlenecks, and root-cause diagnostics for errors and successes.

- **Request explanation & translation:**
  - Natural language breakdown of complex HTTP requests: explains header semantics, authentication strategies (OAuth2, Bearer, HMAC), query parameters, and multipart/nested JSON body payloads in clear prose.
  - Natural-language-to-request synthesis (e.g., convert "POST a new user with email and admin role to /users" into an executable request with appropriate headers and schema).
- **Intelligent error & failure diagnostics:**
  - Context-aware root-cause explanation for `4xx` client errors, `5xx` server exceptions, network drops, DNS failures, and TLS handshake issues.
  - Actionable remediation suggestions: pinpoints the exact malformed header, invalid payload field, expired token, or CORS misconfiguration with concrete fix recommendations and patch previews.
- **Success response & telemetry insights:**
  - Automated analysis of `2xx` success responses: schema inference, response payload diffing, and detection of subtle contract drift across API revisions.
  - Network telemetry analysis: AI-assisted performance diagnostics highlighting latency bottlenecks across DNS resolution, TCP handshake, TLS negotiation, and TTFB phases.
- **Privacy-first & LLM provider agnostic:**
  - Feature-gated (`--features ai`): zero AI dependency overhead in minimal builds.
  - Bring-your-own-provider support: Google Gemini, OpenAI, Anthropic, or local offline inference (via Ollama / llama.cpp).
  - Strict privacy guarantees: zero request or payload data logged or transmitted without explicit user trigger ("Explain Request" / "Diagnose Error" button).

**Acceptance:** Clicking "Explain" on any request, response, or error triggers an instant, structured diagnostic pane detailing semantic intent, root cause of failures, and fix recommendations; builds cleanly without AI dependencies when the feature flag is disabled.

---

## Priority & sequencing

```
Phase 0  Reconcile docs + size CI        ── must do first, cheap
Phase 1  Shutdown + timeouts + limits    ── ★ do next: closes the High-severity
                                             production/DoS gaps, low size cost
Phase 2  Streaming bodies                ── ★ core to the RAM thesis
Phase 3  Radix router (matchit)          ── correctness of shape, medium effort
Phase 4  Panic/error policy              ── resolve the panic="abort" tension
Phase 5  TLS + HTTP/2 (feature-gated)    ── opt-in, keep default tiny
Phase 6  Observability + CORS polish     ── feature-gated niceties
Phase 7  CLI Usage & Headless Runner     ── headless CI/CD & terminal workflows
Phase 8  Collaborative Coding & Sync     ── real-time pair testing & team workspaces
Phase 9  AI Diagnostics Integration      ── request explanation & error/success insights
```

Rationale: Phases 0–1 are the difference between "demo" and "won't fall over."
Phase 2 is the one that actually *earns* the low-RAM claim the README makes.
Phases 3–4 improve shape and resilience. Phases 5–6 are strictly opt-in so the
minimal binary never regresses. Phases 7–9 expand into headless CI/CD execution,
team collaboration, and intelligent AI diagnostics while strictly preserving
zero-bloat defaults.

---

## Cross-cutting acceptance criteria

- **Minimal build stays tiny:** `cargo build --release` with default features
  stays within the size budget tracked in CI (baseline ~711 KB).
- **Every heavy addition is feature-gated:** TLS, HTTP/2, tracing, metrics.
- **Tests grow with features:** graceful-shutdown drain, idle-timeout drop,
  body-limit 413, streaming-RAM-flatness, radix routing equivalence, panic
  policy — each phase ships its regression test.
- **Docs never drift:** the README's own rule enforced — code and prose move
  together.

---

## Open questions (flagged by the research as not yet answered with confidence)

1. **TLS/HTTP-2 size delta:** what does `tokio-rustls` (with `ring` vs
   `aws-lc-rs`) plus the h2 state machine actually add to the `opt-level=z`
   binary, and does feature-gating fully protect the minimal build? *Measure.*
2. **Lightest observability:** how much binary/RAM does the `tracing`
   ecosystem add vs the hand-rolled `LogLayer`, and is a middle-ground
   (structured-but-tiny) worth building?
3. **matchit vs hand-written trie:** adopt the crate (ship fast, still
   educational) or hand-roll for total "own every line"? Recommend matchit,
   revisit if it ever conflicts with the learning goal.
4. **Panic policy:** confirm the Phase 4 decision — keep `panic="abort"` +
   no-panic audit, or switch to `unwind` + `CatchPanic` layer (size cost).
5. **`opt-level` A/B:** is `z` actually smallest for *this* binary, or does `s`
   / `3` win? Benchmark before trusting the default.

---

## Sources (fact-checked, June–July 2026)

- [Hyper 1.x graceful shutdown guide](https://hyper.rs/guides/1/server/graceful-shutdown/)
- [Hyper 1.x echo (streaming bodies) guide](https://hyper.rs/guides/1/server/echo/)
- [Hyper `body` module docs (Frame streaming)](https://docs.rs/hyper/latest/hyper/body/index.html)
- [axum #2323 — hyper 1.0 removed high-level Server / graceful shutdown](https://github.com/tokio-rs/axum/issues/2323)
- [axum 0.7 announcement (axum::serve, low-level Hyper)](https://tokio.rs/blog/2023-11-27-announcing-axum-0-7-0)
- [axum #2939 — keep-alive must be set via hyper-util builder](https://github.com/tokio-rs/axum/discussions/2939)
- [axum-server-timeout — Slowloris/idle gap demonstrated](https://github.com/josecelano/axum-server-timeout)
- [axum `axum-core/src/body.rs` — the boxed Body newtype pattern](https://github.com/tokio-rs/axum/blob/main/axum-core/src/body.rs)
- [axum #1438 — two-step matchit routing](https://github.com/tokio-rs/axum/discussions/1438)
- [`matchit` crate — radix-trie router + benchmarks](https://crates.io/crates/matchit)
- [actix-web `FromRequest` — single body consumer rule](https://docs.rs/actix-web/latest/actix_web/trait.FromRequest.html)
- [hyper PR #4018 — flush-before-shutdown fix (target >= 1.11.0)](https://github.com/hyperium/hyper/pull/4018)
- [axum `DefaultBodyLimit` — request size limits](https://docs.rs/axum/latest/axum/extract/struct.DefaultBodyLimit.html)
- [tower-http #214 — body limit layer](https://github.com/tower-rs/tower-http/pull/214)
- [RUSTSEC-2022-0055 — why body/header limits matter](https://rustsec.org/advisories/RUSTSEC-2022-0055.html)
- [min-sized-rust — opt-level "z" not always smallest; profile tuning](https://github.com/johnthagen/min-sized-rust)
- [rustls](https://github.com/rustls/rustls)

*This roadmap is a living document. When a phase ships, update its acceptance
row in §0 and record the binary-size delta. Understanding — and staying tiny —
is the deliverable.*
