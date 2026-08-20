# Rustman UI & Frontend Architecture Specification

> **A native, zero-bloat API testing workbench and Postman alternative built on Tauri and Hyper 1.x.**
> Engineered for extreme performance (<50ms startup, sub-20MB RAM), local-first Git-native workflow, high information density, and a clean light mode by default.

---

## 1. Executive Summary & Design Vision

Postman and Insomnia rely on heavy Electron runtimes (bundled Chromium + Node.js) that consume **600 MB to 1 GB+ of RAM** and hundreds of megabytes on disk. **Rustman** reverses this paradigm by pairing an embedded, zero-copy Rust HTTP client/server engine (`Hyper 1.x`, `Tower`, and `Tokio`) with a high-performance native desktop shell (`Tauri`) and virtual DOM-free frontend architecture.

### Core Architectural Axioms
1. **Light Mode by Default:** Crisp, high-contrast palette engineered for clarity and reduced cognitive fatigue.
2. **Professional & Noise-Free:** No emojis, bouncy animations, decorative gradients, or non-functional styling.
3. **Local-First & Git-Native:** Collections, environments, and mock route definitions are stored as plain text files (`.json`, `.http`, `.toml`) inside the user's workspace directory.
4. **Dual Engine Utility:** Acts both as a high-precision HTTP client with microsecond telemetry and as a local mock server powered by the embedded `rustpol` routing framework.

---

## 2. Visual System & Design Tokens

### Color Palette (Default Light Mode)

| Token Name | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `surface-0` (Base) | `#FFFFFF` | Primary content panels, code editors, table backgrounds |
| `surface-50` | `#F8F9FA` | Sidebar, tab strip, omnibar container, bottom status strip |
| `surface-100` | `#F1F3F5` | Icon navigation rail, code line number gutters, table headers |
| `surface-200` | `#E9ECEF` | Hover state for tree items and dropdown options |
| `border-subtle` | `#E2E8F0` | 1px borders between split panes, inputs, and tables |
| `border-strong` | `#CBD5E1` | Active input outlines, focused tabs |
| `text-primary` | `#0F172A` | Primary text, request URLs, response body data |
| `text-secondary` | `#475569` | Parameter keys, inactive tab titles, descriptions |
| `text-muted` | `#94A3B8` | Placeholders, keyboard shortcut badges, inactive line numbers |
| `accent-primary` | `#2563EB` | Primary triggers ("Send", "Add Variable"), focus rings |
| `accent-subtle` | `#EFF6FF` | Active selection backgrounds, highlighted items |

---

### Method Badges & HTTP Status Coding

HTTP methods and status responses use muted, legible background badges with bordered containers and high-contrast font colors:

- **`GET`**: Background `#EFF6FF`, Border `#BFDBFE`, Text `#1D4ED8`
- **`POST`**: Background `#F0FDF4`, Border `#BBF7D0`, Text `#15803D`
- **`PUT`**: Background `#FEFCE8`, Border `#FEF08A`, Text `#A16207`
- **`PATCH`**: Background `#FAF5FF`, Border `#E9D5FF`, Text `#7E22CE`
- **`DELETE`**: Background `#FEF2F2`, Border `#FECACA`, Text `#B91C1C`
- **`HEAD / OPTIONS`**: Background `#F1F5F9`, Border `#CBD5E1`, Text `#475569`
- **`2xx Success`**: `#16A34A` text on `#DCFCE7` badge
- **`3xx Redirect`**: `#D97706` text on `#FEF3C7` badge
- **`4xx Client Error`**: `#DC2626` text on `#FEE2E2` badge
- **`5xx Server Error`**: `#991B1B` text on `#FEE2E2` badge

---

### Typography

- **UI Interface:** `Inter`, `system-ui`, `-apple-system`, `sans-serif` (11px base, 12px headers, 13px omnibar input)
- **Monospace / Code / Data:** `JetBrains Mono`, `Fira Code`, `ui-monospace`, `monospace` (11px editor, 10px badges and telemetry metrics)

---

## 3. Window Anatomy & Component Layout

```
+-----------------------------------------------------------------------------------------------------------------------+
| [R] RUSTMAN v0.1  |  /home/bethwel/rustman  |  [Ctrl+K Search Omnibar]  |  [Mock Engine: 4000] [Env: Local v] [Hyper] |
+-----------------------------------------------------------------------------------------------------------------------+
| Rail | Sidebar (320px)       | Center Request Workbench (Variable)          | Right Response & Telemetry (Split)     |
| [F]  | Collections:          | Title: List Todos                            | 200 OK | 24.1 ms | 1.24 KB | 2/2 Tests |
| [E]  | v Rustpol Todo Service| [GET v] [ {{base_url}}/api/todos           ] | Tabs: [Pretty] [Raw] [Headers] [Tele]  |
| [M]  |   > List Todos        | [ Send (Ctrl+Enter) ]                        | +------------------------------------+ |
| [H]  |   > Create Todo       |                                              | | 1  {                               | |
| [C]  |   * Mock: List Users  | Tabs: [Params] [Headers(1)] [Auth] [Body]    | | 2    "status": "success",          | |
|      |   > Mock: Health      | +------------------------------------------+ | | 3    "data": [ ... ]               | |
|      |                       | | Active | Key      | Value      | Desc     | | | 4  }                               | |
|      | Filter: [           ] | | [x]    | page     | 1          | Page num | | +------------------------------------+ |
|      | + Request  + Folder   | | [x]    | limit    | 25         | Per page | | Telemetry Waterfall:                 | |
|      |                       | +------------------------------------------+ | | DNS: 0.1ms | TCP: 1.2ms | TTFB: 18ms| |
+-----------------------------------------------------------------------------------------------------------------------+
| Status Strip: Rust Core: Hyper 1.x + Tower | Mock Engine: Listening :4000 | Tauri Bridge: Ready | RAM: 14.2 MB        |
+-----------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Feature Specifications

### 1. Global Navigation & Header Bar (`HeaderBar.tsx`)
- **Workspace Indicator:** Direct pointer to the active directory root on disk.
- **Global Command Palette (`Ctrl+K`):** Instantly search and navigate across endpoints, folders, mock routes, and environment variables.
- **Embedded Mock Engine Controller:** Single-click start/stop trigger for the local `rustpol` mock server on port `4000`.
- **Environment Switcher:** Fast selector with dedicated management modal for API keys, bearer tokens, and base URLs.

### 2. Multi-Mode Navigation Rail (`Sidebar.tsx`)
- **Collections View:** Folder and request hierarchy with direct filesystem mapping. Context actions include adding requests, nesting subfolders, and deleting endpoints.
- **Environments View:** Live variable matrix with instant secret masking and value inspection.
- **Embedded Mock Engine:** Route definitions (Method, Path, HTTP Status, JSON Body, Simulated Latency ms) with live server log streaming.
- **Execution Log (History):** Chronological log of recent requests with method badges, timestamps, durations, and one-click re-run loading.
- **Native Code Exporter:** Fast export trigger to copy requests into multi-language snippets.

### 3. Request Workbench (`RequestWorkbench.tsx`)
- **Omnibar:** Method dropdown + URL input with live variable peeking (e.g. `{{base_url}}` resolves inline).
- **Query Parameters Table:** Row-by-row key, value, and description fields with active checkboxes and automatic query-string sync.
- **Headers Matrix:** Preset insertion (`+ JSON`, `+ Accept JSON`, `+ Bearer`) with header key autocompletion.
- **Authentication Handler:** Supports `Bearer Token`, `Basic Auth` (Base64 encoding), and `API Key` (Header or Query).
- **Body Editor:** Supports `JSON`, `Raw Text`, `x-www-form-urlencoded`, and `Form-Data` with built-in JSON Beautifier.
- **Assertion Builder:** Declarative test runner supporting status codes (`200`), response time thresholds (`<= 100ms`), header checks, and JSONPath expressions (`data.id == 1`).

### 4. Response & Telemetry Suite (`ResponseInspector.tsx`)
- **Formatted JSON Viewer:** High-speed syntax highlighting with line numbering and real-time substring search.
- **Raw Byte & Text View:** Unformatted response body inspection.
- **Headers & Metadata Table:** Comprehensive key-value display of server response headers.
- **Network Lifecycle Waterfall:** Microsecond breakdown across 5 phases:
  1. DNS Resolution
  2. TCP Handshake
  3. TLS Negotiation
  4. Time to First Byte (TTFB)
  5. Content Download Stream
- **Side-by-Side Response Diff:** Automated comparison between the current response and the previous run to catch API regressions.
- **Assertion Summary:** Pass/fail checkmarks with explicit failure diagnostics.

### 5. Multi-Language Code Generation (`CodeGeneratorModal.tsx`)
Export requests into production code with single-click copying:
- **Rust (Hyper 1.x):** Zero-copy client using `TcpStream`, `TokioIo`, and `BodyExt::collect`.
- **Rust (Reqwest):** Asynchronous client with typed headers and JSON bodies.
- **cURL:** Shell command with headers, method, and payload flags.
- **TypeScript (Fetch):** Modern async/await fetch request.
- **Python (Requests / HTTPX):** Idiomatic Python script.

---

## 5. Technical Architecture & File Structure

```
/home/bethwel/rustman/
├── Cargo.toml                    # Rustpol core framework
├── src/                          # Server framework (routing, extract, handler, body)
├── frontend/                     # Tauri / Web Frontend
│   ├── package.json              # React 18, Tailwind CSS, Lucide Icons, TypeScript
│   ├── vite.config.ts            # Vite desktop bundler config
│   ├── tailwind.config.js        # Design tokens & light theme specification
│   ├── index.html                # App shell
│   └── src/
│       ├── App.tsx               # Main state container & view coordinator
│       ├── main.tsx              # React mounting root
│       ├── index.css             # Tailwind base & scrollbar rules
│       ├── types/index.ts        # TypeScript models (Request, Response, Telemetry, etc.)
│       ├── utils/
│       │   ├── interpolation.ts  # Dynamic {{var}} template resolution engine
│       │   ├── codegen.ts        # Multi-language client code generator
│       │   ├── formatter.ts      # Byte, duration, badge style formatters
│       │   └── ipc.ts            # Tauri IPC bridge & browser test runner
│       └── components/
│           ├── HeaderBar.tsx     # Workspace, Mock toggle, Env dropdown, Omnibar
│           ├── Sidebar.tsx       # Collections, Envs, Mock, History, Codegen tabs
│           ├── RequestWorkbench.tsx # Method, URL, Params, Headers, Body, Tests
│           ├── ResponseInspector.tsx # Pretty viewer, Telemetry, Diff, Headers
│           ├── EnvironmentModal.tsx  # Environment manager modal
│           ├── CodeGeneratorModal.tsx # Multi-language code modal
│           └── CommandPaletteModal.tsx # Ctrl+K search palette
└── src-tauri/                    # Tauri Desktop Core
    ├── Cargo.toml                # Tauri 2.0 & Hyper dependencies
    ├── tauri.conf.json           # Native window size, title, and build triggers
    └── src/main.rs               # Rust IPC command handlers (send_http_request)
```

---

## 6. How to Run & Build

### Development Mode (Web Preview)
```bash
cd /home/bethwel/rustman/frontend
npm run dev
# Open http://localhost:1420
```

### Production Build (Frontend Assets)
```bash
cd /home/bethwel/rustman/frontend
npm run build
# Compiles to frontend/dist/
```

### Tauri Desktop Compilation
```bash
# From workspace root
cargo tauri build
# or run in dev mode:
cargo tauri dev
```
