//! A full-stack todo app, built entirely on the rustpol framework (`src/lib.rs`).
//!
//! * **Backend**: a JSON REST API — list / create / toggle / delete todos —
//!   with all state in an in-memory store guarded by a `Mutex`, shared via the
//!   framework's `State` extractor.
//! * **Frontend**: a single self-contained HTML page (with a little vanilla JS)
//!   served at `/`, which talks to that API. No build step, no node_modules —
//!   the whole "full stack" is this one Rust binary.
//! * **Middleware**: a `ServiceBuilder` stack — our hand-written request logger
//!   plus Tower's `ConcurrencyLimit` — wraps the router.
//!
//! Run it: `cargo run`, then open http://127.0.0.1:3000 .

use rustpol::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tower::ServiceBuilder;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
struct Todo {
    id: u64,
    title: String,
    done: bool,
}

/// Body of `POST /api/todos`.
#[derive(Deserialize)]
struct NewTodo {
    title: String,
}

// ---------------------------------------------------------------------------
// Shared application state
// ---------------------------------------------------------------------------

/// Cloneable handle to the app's state. `State<AppState>` clones this per
/// request — cheap, because the data lives behind an `Arc`. The `Mutex` is fine
/// for an in-memory demo store; a real app would swap in a database pool here
/// without changing a single handler signature.
#[derive(Clone, Default)]
struct AppState {
    inner: Arc<Mutex<Store>>,
}

#[derive(Default)]
struct Store {
    todos: HashMap<u64, Todo>,
    next_id: u64,
}

impl AppState {
    fn create(&self, title: String) -> Todo {
        let mut store = self.inner.lock().unwrap();
        store.next_id += 1;
        let id = store.next_id;
        let todo = Todo { id, title, done: false };
        store.todos.insert(id, todo.clone());
        todo
    }

    fn list(&self) -> Vec<Todo> {
        let store = self.inner.lock().unwrap();
        let mut todos: Vec<Todo> = store.todos.values().cloned().collect();
        todos.sort_by_key(|t| t.id);
        todos
    }

    /// Flip a todo's `done` flag. Returns the updated todo, or `None` if no such id.
    fn toggle(&self, id: u64) -> Option<Todo> {
        let mut store = self.inner.lock().unwrap();
        let todo = store.todos.get_mut(&id)?;
        todo.done = !todo.done;
        Some(todo.clone())
    }

    /// Remove a todo. Returns whether anything was removed.
    fn delete(&self, id: u64) -> bool {
        let mut store = self.inner.lock().unwrap();
        store.todos.remove(&id).is_some()
    }
}

// ---------------------------------------------------------------------------
// Handlers — each one is a plain async fn taking extractors
// ---------------------------------------------------------------------------

const INDEX_HTML: &str = include_str!("../frontend/dist/index.html");
const JS_BUNDLE: &str = include_str!("../frontend/dist/assets/index-Bmdue8mx.js");
const CSS_BUNDLE: &str = include_str!("../frontend/dist/assets/index-6gpVMWfw.css");

/// `GET /` — serve the modern Rustman desktop/web frontend.
async fn index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

/// `GET /assets/index-Bmdue8mx.js` — serve the compiled UI JavaScript bundle.
async fn js_asset() -> Response<rustpol::body::Body> {
    let mut res = Response::new(rustpol::body::from(JS_BUNDLE));
    res.headers_mut().insert(
        http::header::CONTENT_TYPE,
        http::HeaderValue::from_static("application/javascript; charset=utf-8"),
    );
    res
}

/// `GET /assets/index-6gpVMWfw.css` — serve the compiled UI CSS styles.
async fn css_asset() -> Response<rustpol::body::Body> {
    let mut res = Response::new(rustpol::body::from(CSS_BUNDLE));
    res.headers_mut().insert(
        http::header::CONTENT_TYPE,
        http::HeaderValue::from_static("text/css; charset=utf-8"),
    );
    res
}

/// `GET /api/todos` — list all todos as JSON.
async fn list_todos(State(state): State<AppState>) -> Json<Vec<Todo>> {
    Json(state.list())
}

/// `POST /api/todos` — create a todo from a JSON body `{ "title": "..." }`.
/// Returns 201 + the created todo, or 400 if the title is blank.
async fn create_todo(
    State(state): State<AppState>,
    Json(input): Json<NewTodo>,
) -> Result<(StatusCode, Json<Todo>), (StatusCode, String)> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "title must not be empty".into()));
    }
    let todo = state.create(title.to_string());
    Ok((StatusCode::CREATED, Json(todo)))
}

/// `PUT /api/todos/:id` — toggle the done flag. 404 if the id is unknown.
async fn toggle_todo(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Json<Todo>, StatusCode> {
    state.toggle(id).map(Json).ok_or(StatusCode::NOT_FOUND)
}

/// `DELETE /api/todos/:id` — delete a todo. 204 on success, 404 if unknown.
async fn delete_todo(State(state): State<AppState>, Path(id): Path<u64>) -> StatusCode {
    if state.delete(id) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/// Build the router for the app. Factored out so the integration tests can
/// mount the exact same routes against a fresh state.
pub(crate) fn app(state: AppState) -> rustpol::routing::RouterService {
    Router::new()
        .route("/", get(index))
        .route("/assets/index-Bmdue8mx.js", get(js_asset))
        .route("/assets/index-6gpVMWfw.css", get(css_asset))
        .route("/api/todos", get(list_todos).post(create_todo))
        .route("/api/todos/:id", put(toggle_todo).delete(delete_todo))
        .with_state(state)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = AppState::default();

    // The middleware stack, outermost first: every request is logged, and no
    // more than 64 may be in flight at once (Tower's ConcurrencyLimit applies
    // backpressure via the Service `poll_ready` we implement on the router).
    let service = ServiceBuilder::new()
        .layer(LogLayer)
        .concurrency_limit(64)
        .service(app(state));

    // Shut down gracefully on Ctrl-C: stop accepting new connections and let
    // in-flight requests finish (bounded by the drain timeout in `server.rs`).
    let shutdown = async {
        let _ = tokio::signal::ctrl_c().await;
        println!();
    };

    rustpol::server::serve_with_shutdown("127.0.0.1:3000", service, shutdown).await
}
