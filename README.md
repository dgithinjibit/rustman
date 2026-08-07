# rustpol — a from-scratch web framework, in Rust, that fits in your pocket

> A learning project. The goal is to build a small, `axum`-shaped **web
> framework** — routing, extractors, handlers, middleware — directly on the
> low-level Rust HTTP stack (Hyper + Tower + Tokio), **specifically to save on
> disk space and RAM**, and to *understand every single line we write* along the
> way. 
>
> The comparison that motivates it: an Electron app (like Postman) ships a whole
> Chromium browser just to render a form and show you some JSON. It idles at
> **600 MB–1 GB of RAM** and hundreds of MB on disk. Our size-optimized release
> binary is **~711 KB** and idles at a **few MB of RAM**. This README explains
> *why* that gap exists and *how* the Rust HTTP stack lets us close it.
>
> **Where we're headed:** see [`ROADMAP.md`](./ROADMAP.md) for the phased plan
> to take this from a teaching prototype to a production-credible framework
> (graceful shutdown, timeouts, streaming bodies, a radix router, opt-in
> TLS/HTTP-2) — all without breaking the tiny-binary constraint.

---

## Table of contents

1. [Why Rust, and why this saves space + RAM](#1-why-rust-and-why-this-saves-space--ram)
2. [The mental model: four layers, four crates](#2-the-mental-model-four-layers-four-crates)
3. [`http` — the vocabulary (types with no behavior)](#3-http--the-vocabulary-types-with-no-behavior)
4. [`hyper` — the protocol engine](#4-hyper--the-protocol-engine)
5. [`tower` — the middleware abstraction (Service + Layer)](#5-tower--the-middleware-abstraction-service--layer)
6. [Bodies: `http-body`, `http-body-util`, and `Bytes`](#6-bodies-http-body-http-body-util-and-bytes)
7. [A complete annotated request — every line explained](#7-a-complete-annotated-request--every-line-explained)
8. [What `Result<()>` actually means (the `?` operator, errors)](#8-what-result-actually-means-the--operator-errors)
9. [Roadmap](#9-roadmap)
10. [Sources](#10-sources)

---

## 1. Why Rust, and why this saves space + RAM

Postman is an **Electron** app. Electron = Chromium (a full web browser) +
Node.js (a full JavaScript runtime) bundled into every app. You pay for that
twice:

- **Disk:** the browser engine is ~150–250 MB on its own.
- **RAM:** a browser keeps a JS heap, a render process, a GPU process, a
  garbage collector, and DOM trees alive even when the window just shows a
  text box. That is where the 600 MB–1 GB idle figure comes from.

Rust changes the economics on three axes:

| Cost          | Electron / Node                              | Rust                                                        |
| ------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Runtime       | Ships a whole VM (V8) + browser              | **No runtime, no VM.** Compiles straight to machine code.   |
| Memory mgmt   | Garbage collector — keeps slack memory around | **Ownership + borrowing** — memory freed the instant it's unused, no GC, no slack. |
| What you ship | App code *plus* the entire engine            | **Only the code paths you actually call** (dead-code eliminated by LTO). |

The key phrase is **"zero-cost abstractions."** In Rust, the nice high-level
constructs (iterators, async/await, the `Service` trait) compile down to the
same machine code you'd write by hand. There is no interpreter sitting between
your program and the CPU, and no garbage collector deciding when to reclaim
memory. A request you're done with is freed *deterministically* the moment its
owner goes out of scope. That's the structural reason an idle Rust HTTP client
sits at a few MB instead of a few hundred.

The `[profile.release]` block in our `Cargo.toml` (size-opt, LTO, strip, panic=abort)
is the second lever — it tells the compiler to *throw away everything we don't
use*. Combined with hand-picked crate `features` (no `"full"`), that's how the
binary stays small.

> **Learning note:** "saving RAM" in Rust is not a runtime trick you turn on.
> It's a consequence of (a) no VM/GC and (b) the compiler deleting unused code.
> Most of the work is *choosing dependencies and features carefully* — which is
> exactly why this README spends so long on what each crate is for.

---

## 2. The mental model: four layers, four crates

Hyper 1.0 deliberately **split one big library into several small, composable
crates.** This is the single most important thing to understand about the
modern Rust HTTP ecosystem. Older tutorials (hyper 0.14 and earlier) show a
monolithic `hyper` with a built-in `Body` type and `make_service_fn` helpers —
**that API is gone.** Today the responsibilities are separated:

```
   YOUR APP  (rustpol)
        │
        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  tower      "middleware":  Service + Layer.                  │  behavior, composition
   │             timeout, retry, rate-limit, logging — protocol-  │
   │             agnostic wrappers around "request -> response".  │
   ├─────────────────────────────────────────────────────────────┤
   │  hyper      "the engine":  speaks HTTP/1 and HTTP/2 on the   │  the actual protocol
   │             wire. Byte framing, chunked encoding, keep-alive.│
   │  hyper-util "the glue":    TokioIo adapter + a pooled client │
   │             so you don't hand-write connection management.   │
   ├─────────────────────────────────────────────────────────────┤
   │  http-body  "the body":    a trait for an async *stream* of  │  streaming payloads
   │  + util     byte chunks (so you never buffer a 1 GB download)│
   ├─────────────────────────────────────────────────────────────┤
   │  http       "the nouns":   Request, Response, Uri, Method,   │  pure data types
   │             StatusCode, HeaderMap. Just structs/enums. No    │
   │             I/O, no networking, no async. Shared by everyone.│
   └─────────────────────────────────────────────────────────────┘
        │
        ▼
   tokio        "the runtime":  actually runs the async tasks, owns the
                event loop, the timers, and the TCP sockets.
```

**Why split it this way?** Because each layer is useful on its own and is shared
across the ecosystem. `reqwest`, `axum`, `tonic` (gRPC), and our `rustpol` *all*
speak in the same `http::Request` / `http::Response` types. A Tower middleware
you write for one works in all of them. This separation is also *why* we can
keep the binary small: we only compile the layers we touch.

The rest of this README walks **up** that stack: nouns first (`http`), then the
engine (`hyper`), then behavior (`tower`), then bodies, then a full working
example tying it together.

---

## 3. `http` — the vocabulary (types with no behavior)

The [`http`](https://docs.rs/http) crate is the foundation. It contains **only
data types** — no sockets, no async, no I/O. Think of it as the agreed-upon
*vocabulary* that every other crate speaks.

```rust
use http::{Request, Response, Method, StatusCode, Uri, HeaderMap};
```

### `Request<B>` and `Response<B>` — generic over the body

The two headline types are **generic over their body type `B`**:

```rust
struct Request<B>  { /* method, uri, headers, ... */  body: B }
struct Response<B> { /* status, headers, ...      */  body: B }
```

Why generic? Because "the body" can be many things depending on where you are:

- On a **client sending** a request, the body might be `Empty<Bytes>` (no body
  for a GET) or `Full<Bytes>` (a fixed JSON payload for a POST).
- On a **client receiving** a response, hyper hands you back a *streaming*
  body type you read chunk by chunk.
- After you deserialize, the "body" might be your own `struct User { ... }`.

Making `B` generic means the same `Request`/`Response` types serve every stage
without copying data into a one-size-fits-all container. **This is a zero-cost
abstraction in action**: the body type is resolved at compile time, so there's
no runtime tagging or boxing unless you ask for it.

### `into_parts` / `from_parts` — why they exist

A real client needs to *transform* a request/response — e.g. take the response
hyper gives you, read its body, and replace it with a parsed struct. You can't
mutate the body type in place (the type itself changes), so `http` lets you
split the message into its **head** (status/headers) and its **body**, then
rebuild it:

```rust
let (mut parts, body) = response.into_parts(); // split head from body
parts.status = StatusCode::BAD_REQUEST;        // tweak the head freely
let response = Response::from_parts(parts, body); // reassemble
```

This is the idiomatic way middleware rewrites messages without cloning the
whole thing.

### `Uri`, `Method`, `StatusCode`, `HeaderMap`

- **`Uri`** — a parsed URL. `"http://httpbin.org/ip".parse::<Uri>()?` gives you
  typed access to `.host()`, `.port_u16()`, `.authority()`, `.path()`. Parsing
  can fail (bad URL), which is why it returns a `Result` and we use `?` (see §8).
- **`Method`** — an enum: `GET`, `POST`, `PUT`, `DELETE`, … Using an enum
  instead of a string means a typo is a *compile error*, not a runtime 400.
- **`StatusCode`** — `200 OK`, `404 NOT_FOUND`, etc., with helpers like
  `.is_success()`. Again: a type, not a magic number you have to remember.
- **`HeaderMap`** — a multi-map of header name → value(s), optimized so common
  headers don't heap-allocate. For a web framework this is central: extractors
  read request headers and `IntoResponse` sets response ones.

> **Takeaway:** `http` is *just nouns*. It exists so that hyper, tower, reqwest,
> axum, and rustpol all agree on what a "Request" is. Nothing here does any
> networking.

---

## 4. `hyper` — the protocol engine

[`hyper`](https://docs.rs/hyper) is where bytes meet the wire. It takes the
`http::Request` you built and **serializes it into the actual HTTP/1 or HTTP/2
byte stream**, manages the connection's state machine (keep-alive, chunked
transfer-encoding, HTTP/2 multiplexing), and parses the bytes coming back into
an `http::Response`.

Crucially, **hyper 1.0 is low-level and runtime-agnostic on purpose.** It does
*not* assume Tokio, does *not* give you a one-liner `get(url)`, and does *not*
include a default body type. It gives you precise control — which is what we
want for a small, predictable binary — at the cost of more setup. (If you just
wanted a batteries-included server you'd reach for `axum`, which is hyper + tower
+ ergonomics. We build the framework directly on hyper *because the learning is
the point.*)

The handshake below is shown on the **client** side because it's the shortest
way to see the `sender`/`conn` split; rustpol uses the exact mirror on the
server side — `hyper::server::conn::http1::Builder::new().serve_connection(...)`
in [`src/server.rs`](./src/server.rs).

### The connection handshake

```rust
let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
```

This one line is dense, so unpack it:

- **`hyper::client::conn::http1`** — the client-side, HTTP/1 connection module.
  (There's a parallel `http2` module.) Working at the `conn` level means *you*
  decide the protocol version explicitly — no hidden negotiation.
- **`handshake(io)`** — performs the initial HTTP handshake over some I/O object
  `io` and returns a **pair**:
  - **`sender`** — the handle you use to *send requests* on this connection.
    Calling `sender.send_request(req)` returns a future resolving to the
    `Response`. It's `mut` because each send advances the connection's state.
  - **`conn`** — a future that **drives the connection**: it pumps bytes in and
    out of the socket. It does nothing until polled, so...

### Why you must `spawn` the connection

```rust
tokio::task::spawn(async move {
    if let Err(err) = conn.await {
        eprintln!("Connection failed: {:?}", err);
    }
});
```

This trips up everyone the first time. In hyper 1.0 the **connection driver and
the request sender are separate**. `sender.send_request(...)` won't make progress
unless *something* is also polling `conn` to actually move bytes on the socket.
So we hand `conn` to the Tokio runtime as its own background task with
`tokio::task::spawn`. Now:

- The spawned task owns the socket pumping (the "engine running").
- Our main task owns the request/response logic (the "driver steering").

`async move` means the closure *takes ownership* (`move`) of `conn` so the task
can outlive the current scope. This explicit separation is the price of control,
and it's also *why* hyper can stay runtime-agnostic — it never calls `spawn`
itself, leaving you (or hyper-util) to decide how tasks are scheduled.

### `hyper-util` — the glue you don't want to hand-write

Hand-rolling `TcpStream::connect` + `handshake` + `spawn` for *every* request
would mean a new TCP+TLS handshake each time — slow and wasteful. For real use,
[`hyper-util`](https://docs.rs/hyper-util) provides:

- **`TokioIo`** — an adapter that wraps a Tokio stream so it satisfies hyper's
  *own* I/O traits. hyper 1.0 defines `hyper::rt::Read`/`Write` (runtime-neutral)
  rather than depending on `tokio::io` directly; `TokioIo::new(stream)` bridges
  the two. This tiny shim is the seam that lets hyper not depend on Tokio.
- **`TowerToHyperService`** — the *server-side* glue we actually use: it adapts
  a `tower::Service` (our whole router + middleware stack) into the
  `hyper::service::Service` that `serve_connection` expects. See
  [`src/server.rs`](./src/server.rs) — that one adapter is the seam between
  Tower's world and hyper's on the accept side.
- **A pooled `Client`** (`hyper_util::client::legacy::Client`) — the *client*
  counterpart: a pool of warm keep-alive connections. rustpol is a server, so we
  don't use it, but it's the mirror of what `serve` does for incoming
  connections. (It's named `legacy` because it ports the old hyper 0.14
  high-level client forward while the new design settles — the name is
  historical, not a warning.)

> **Takeaway:** `hyper` = the protocol state machine. `hyper-util` = the runtime
> adapters and pooling that make it convenient. Splitting them keeps `hyper`
> itself runtime-neutral and lean.

---

## 5. `tower` — the middleware abstraction (Service + Layer)

[`tower`](https://docs.rs/tower) answers: *"how do I add timeouts, retries, rate
limiting, auth, and logging to an HTTP client without tangling that logic into
every request?"* Its answer is two traits.

### `Service` — an async function from request to response

```rust
// Conceptually:
trait Service<Request> {
    type Response;
    type Error;
    async fn call(&mut self, req: Request) -> Result<Self::Response, Self::Error>;
}
```

A `Service` is **"an asynchronous function of a request to a response."** That's
the whole idea: `async fn(Request) -> Result<Response, Error>`, but as a trait
so it can be named, stored, and *wrapped*. Both clients and servers are modeled
as `Service`s — sending a request is calling a service; handling one is being a
service.

(The real trait also has `poll_ready`, which lets a service signal
backpressure — "I'm not ready for another request yet" — *before* you hand it
one. That's how rate-limiters and connection pools push back without dropping
data. You rarely call it by hand; `ServiceExt::ready` does it for you.)

### `Layer` — a function that wraps one `Service` in another

```rust
// Conceptually:
trait Layer<S> {
    type Service;
    fn layer(&self, inner: S) -> Self::Service;
}
```

If a `Service` is `Request -> Response`, a **`Layer` is `Service -> Service`** —
a *factory* that takes an inner service and returns a new one with extra
behavior bolted on before/after the inner call. A timeout layer, given any
service, returns a service that does the same thing but gives up after N seconds.

This is **the** key insight: middleware in Tower is *protocol-agnostic and
composable*. A `Timeout` layer doesn't know or care that it's wrapping HTTP — it
works on any `Service`. That's why the same Tower middleware ecosystem is reused
by axum, tonic, reqwest, and us.

### `ServiceBuilder` — stacking layers, and why order matters

```rust
use tower::ServiceBuilder;
use std::time::Duration;

let svc = ServiceBuilder::new()
    .rate_limit(5, Duration::from_secs(1)) // outermost: at most 5 req/sec
    .timeout(Duration::from_secs(10))      // then: each req must finish in 10s
    .service(my_http_service);             // innermost: actually sends over hyper
```

**Order is not cosmetic — it changes behavior.** Layers added *first* see the
request *first*. Above, the rate limiter is the outermost gate: a request must
pass it before the timeout clock even starts. Reverse the two and you'd be timing
out requests that are merely *waiting in the rate-limiter queue* — a different
(and usually wrong) policy. Reading top-to-bottom = outermost-to-innermost =
the order the request is touched on the way *in* (and the reverse on the way out).

For rustpol, Tower is how we cleanly add the features a real server needs —
per-request timeouts, concurrency limits, a global rate limit, and request/
response logging — **as independent, testable, reusable layers** instead of
`if` statements smeared through the request path. The demo already stacks a
hand-written `LogLayer` and Tower's `ConcurrencyLimit` this way (`src/main.rs`),
and `ROADMAP.md` extends it with timeouts and size limits.

> **Takeaway:** `Service` = "a callable async request→response." `Layer` =
> "wrap a service to add behavior." `ServiceBuilder` stacks them, outermost
> first. This is the composition model that keeps features decoupled.

---

## 6. Bodies: `http-body`, `http-body-util`, and `Bytes`

A "body" is the payload — the JSON you POST, or the megabytes you download. The
defining design choice in modern hyper: **a body is a *stream* of chunks, not a
single buffer.**

### The `Body` trait (from `http-body`)

[`http-body`](https://docs.rs/http-body) defines a trait representing **"an
asynchronous, streaming HTTP body"** — essentially an async iterator that yields
`Frame`s (data chunks, and optionally trailers) until the stream ends. You pull
one frame at a time:

```rust
while let Some(next) = res.frame().await {  // ask for the next frame
    let frame = next?;                      // it might be an I/O error -> ?
    if let Some(chunk) = frame.data_ref() { // is this frame data (vs trailers)?
        io::stdout().write_all(chunk).await?; // use the chunk and drop it
    }
}
```

**Why streaming matters for our RAM goal:** if you download a 1 GB response,
a buffering client allocates 1 GB. A streaming client holds **one chunk at a
time** (a few KB), writes it out, frees it, and pulls the next. For a project
whose entire premise is "use less memory," streaming bodies aren't a nice-to-have
— they're the mechanism. Buffering the whole body in memory is the thing we're
deliberately *not* doing.

### `http-body-util` — the ergonomic helpers

The raw `Body` trait is poll-based and verbose, so
[`http-body-util`](https://docs.rs/http-body-util) provides ready-made body
types and combinators:

- **`Empty<Bytes>`** — a body with zero bytes. The correct body for a GET. You
  must set it explicitly (`Empty::<Bytes>::new()`); hyper has no implicit "no
  body" because it stays explicit about everything.
- **`Full<Bytes>`** — a body that is one fixed buffer, sent in full. The right
  choice for a POST with a known JSON payload.
- **`BodyExt`** — an extension trait adding combinators like `.frame()` (used
  above), `.collect()` (gather a whole body into memory *when you actually want
  that*), and `.map_err()`. You bring it into scope with
  `use http_body_util::BodyExt;` and it lights up methods on any body.

### `Bytes` — cheap, shareable byte buffers

[`Bytes`](https://docs.rs/bytes) is a reference-counted, immutable byte buffer.
Its superpower: **slicing and cloning are O(1) and copy *no* data** — a `clone()`
just bumps a refcount and shares the underlying allocation. When hyper parses a
network read into chunks, multiple `Bytes` can view slices of the *same* buffer
with zero copying. That's why body types are parameterized as `Empty<Bytes>` /
`Full<Bytes>`: `Bytes` is the zero-copy currency the whole stack passes around.
Fewer copies = less memory traffic = less RAM. It ties straight back to the goal.

> **Takeaway:** Bodies stream chunk-by-chunk (low memory), `http-body-util` gives
> you `Empty`/`Full`/`BodyExt` to work with them ergonomically, and `Bytes`
> makes passing chunks around copy-free.

---

## 7. A complete annotated request — every line explained

This is the canonical hyper 1.x GET request (adapted from the official guide),
annotated so **nothing is magic.** rustpol is a *server* framework, not this
client — but the exact same primitives (`TokioIo`, the handshake, spawning the
connection driver, streaming frames off a body) power *both* sides of Hyper, and
they're easiest to see in this short client. The **server** counterpart lives in
[`src/server.rs`](./src/server.rs) (`serve` accepts connections and hands each to
`hyper::server::conn::http1`), with the framework it drives in `src/lib.rs` and
the todo app in `src/main.rs`. Read every comment here; then read `src/server.rs`
to see the mirror image on the accept side.

```rust
use http_body_util::{BodyExt, Empty};   // BodyExt -> .frame(); Empty -> empty GET body
use hyper::body::Bytes;                  // the zero-copy byte-buffer type (see §6)
use hyper::Request;                      // the request type we build and send
use hyper_util::rt::TokioIo;             // adapter: Tokio I/O  ->  hyper's I/O traits
use tokio::io::{self, AsyncWriteExt as _}; // async stdout; `as _` = import the trait's methods only
use tokio::net::TcpStream;               // the async TCP socket we connect with

// `#[tokio::main]` is a macro that rewrites `async fn main` into a normal `fn main`
// that boots the Tokio runtime and blocks on our async body. Without a runtime,
// nothing async ever runs — futures are inert until something polls them.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // ---- 1. Parse the URL into a typed `Uri` ------------------------------
    // `.parse::<hyper::Uri>()` can fail on a malformed URL, so it returns a
    // Result. The `?` says "if it's an Err, return that error from main now."
    let url = "http://httpbin.org/ip".parse::<hyper::Uri>()?;

    // ---- 2. Pull out the pieces we need to open a socket ------------------
    // A TCP connection needs host + port; `Uri` gives them to us, already parsed.
    let host = url.host().expect("uri has no host"); // `expect` = "this must exist or crash with this message"
    let port = url.port_u16().unwrap_or(80);         // default to port 80 if none given
    let address = format!("{}:{}", host, port);      // e.g. "httpbin.org:80"

    // ---- 3. Open the TCP connection (this is the actual network I/O) ------
    // `.await` yields control to the runtime until the connection is established.
    let stream = TcpStream::connect(address).await?;

    // ---- 4. Bridge Tokio's socket into hyper's runtime-neutral I/O traits -
    // hyper 1.0 doesn't depend on Tokio; TokioIo is the thin shim that adapts
    // a tokio stream to `hyper::rt::Read`/`Write`. (See §4.)
    let io = TokioIo::new(stream);

    // ---- 5. HTTP handshake: get a request `sender` + a connection `conn` --
    // (See §4 for the full breakdown of this pair.)
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;

    // ---- 6. Spawn the connection driver as its own background task --------
    // `sender` can't make progress unless `conn` is being polled to pump bytes.
    // We hand `conn` to the runtime; `move` transfers ownership into the task.
    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            eprintln!("Connection failed: {:?}", err);
        }
    });

    // ---- 7. Build the HTTP request ---------------------------------------
    // HTTP/1.1 requires a Host header. We derive it from the URL's authority
    // (host[:port]). `Empty::<Bytes>::new()` = "this request has no body" (GET).
    let authority = url.authority().unwrap().clone();
    let req = Request::builder()
        .uri(url)
        .header(hyper::header::HOST, authority.as_str())
        .body(Empty::<Bytes>::new())?;

    // ---- 8. Send it and await the response head --------------------------
    // Resolves once status + headers have arrived. The body still streams after.
    let mut res = sender.send_request(req).await?;
    println!("Response status: {}", res.status());

    // ---- 9. Stream the body to stdout, one frame at a time ---------------
    // This is the low-RAM payoff: we never hold the whole body in memory.
    while let Some(next) = res.frame().await {
        let frame = next?;
        if let Some(chunk) = frame.data_ref() {      // data frame (not trailers)?
            io::stdout().write_all(chunk).await?;     // write it, then it's freed
        }
    }

    // ---- 10. Success ------------------------------------------------------
    // `Ok(())` = "finished, no error, no meaningful value." (See §8.)
    Ok(())
}
```

---

## 8. What `Result<()>` actually means (the `?` operator, errors)

You wrote `Result<()>` in your request — this section is for you. It's one of
the most important ideas in Rust and it shows up in *every* function above.

### `Result<T, E>` — Rust has no exceptions

Rust does **not** have exceptions that unwind invisibly. Instead, any operation
that can fail returns a value of this enum:

```rust
enum Result<T, E> {
    Ok(T),   // success, carrying a value of type T
    Err(E),  // failure, carrying an error of type E
}
```

This is huge for correctness: **failure is in the type signature.** If a function
returns `Result`, the compiler *forces* you to acknowledge the error case — you
can't accidentally ignore a failed network call. There's no hidden control flow.

### `()` — the unit type, "no meaningful value"

`()` (pronounced "unit") is the empty tuple — a type with exactly one value,
also written `()`. It means **"nothing useful to return."** So:

- `Result<(), E>` = "this either succeeds with *no payload*, or fails with `E`."
- `Ok(())` = "I succeeded, and there's nothing to hand back."

Our `main` returns `Result<(), Box<dyn std::error::Error + Send + Sync>>`:
"main either completes with nothing, or fails with *some* error." If it returns
`Err`, the process exits non-zero and prints the error — exactly what you want
from a CLI tool.

(`Box<dyn std::error::Error + Send + Sync>` means "a heap-allocated, type-erased
*any* error that's safe to send across threads." It lets `?` accept errors from
many different libraries — a URL parse error, a TCP error, an HTTP error — through
one return type, because each knows how to convert *into* this boxed form.)

### `?` — the early-return operator

This is the syntax that makes `Result` pleasant instead of verbose. On any
`Result`, the `?` postfix means:

```rust
let stream = TcpStream::connect(address).await?;
// is shorthand for:
let stream = match TcpStream::connect(address).await {
    Ok(value) => value,           // unwrap the success and continue
    Err(e)    => return Err(e.into()), // on failure, convert + return immediately
};
```

So `?` reads as: **"give me the success value, or bail out of this function with
the error."** It's why our `main` is a clean top-to-bottom sequence instead of a
pyramid of `match` blocks — every fallible step is marked with a single `?`, and
any failure short-circuits straight to `main`'s `Err` return. The `.into()` it
inserts is what converts each library's specific error into our boxed error type.

> **Mental model:** `Result` makes failure explicit and type-checked; `()` means
> "no payload"; `?` is the ergonomic "unwrap-or-return-the-error" that threads
> errors up to `main` without exceptions. Once this clicks, the whole client in
> §7 reads as a straight line of "do this, and if it fails, stop."

---

## 9. Roadmap

The prototype above is a teaching framework. The plan to make it
production-credible — graceful shutdown, read/idle timeouts and DoS hardening,
streaming request/response bodies, a radix-trie router, an explicit panic
policy, and opt-in (feature-gated) TLS + HTTP/2 — lives in its own document,
kept phased and prioritized by impact vs binary-size cost:

**→ [`ROADMAP.md`](./ROADMAP.md)**

It is derived from a source-by-source review of this code plus a fact-checked
research pass over the Hyper 1.x guides, axum's internals, and the wider Rust
HTTP ecosystem. Every phase there respects the two constraints this README is
about: **stay tiny** (the current release binary is ~711 KB) and **understand
every line**.

---

## 10. Sources

Researched June 2026. Primary references:

- [Getting Started with a Client — official hyper 1.x guide](https://hyper.rs/guides/1/client/basic/) — the canonical client code in §7.
- [`hyper` API docs](https://docs.rs/hyper) — the protocol engine and `client::conn` modules.
- [`hyper-util` crate](https://lib.rs/crates/hyper-util) — `TokioIo`, the pooled `legacy::Client`.
- [`tower` API docs](https://docs.rs/tower) — `Service`, `Layer`, `ServiceBuilder`, layer ordering.
- [`tower::ServiceBuilder` docs](https://docs.rs/tower/latest/tower/builder/struct.ServiceBuilder.html) — middleware composition and order semantics.
- [`http-body` / Getting Started (DeepWiki)](https://deepwiki.com/hyperium/http-body/1.2-getting-started) — the streaming `Body` trait.
- [`http-body-util` crate](https://crates.io/crates/http-body-util) — `Empty`, `Full`, `BodyExt`.
- [`http` crate docs](https://docs.rs/http) — `Request`/`Response`/`Uri`/`HeaderMap` types and `into_parts`/`from_parts`.
- [Tokio + Tower + Hyper + Rustls server series (Weirich, Medium)](https://medium.com/@alfred.weirich/tokio-tower-hyper-and-rustls-building-high-performance-and-secure-servers-in-rust-part-3-0387f034c936) — how the layers fit in a production stack.

---

*This README is a learning document. If a sentence here ever stops matching the
code, fix the code or fix the sentence — never let the two drift. Understanding
is the deliverable.*
