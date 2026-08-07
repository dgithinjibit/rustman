//! Routing: match `(method, path)` to a handler, capturing path parameters.
//!
//! Three pieces:
//!
//! * [`PathPattern`] — a compiled route pattern like `/todos/:id`, split into
//!   segments. Matching `/todos/42` against it yields the captures
//!   `[("id", "42")]`, or `None` if it doesn't match.
//! * [`MethodRouter`] — for a *single* path, the table of `Method → handler`.
//!   This is what `get(h).post(h2)` builds.
//! * [`Router`] — the whole app: an ordered list of `(PathPattern,
//!   MethodRouter)`. `.route("/x", …)` adds an entry; `.with_state(s)` freezes
//!   in the shared state and produces a [`RouterService`] that implements
//!   `tower::Service` — i.e. the router *is* the request→response service that
//!   middleware wraps and hyper drives.
//!
//! Real frameworks use a radix/prefix tree for O(path-length) matching. We use
//! a linear scan of patterns: clearer to read, and for the dozens-of-routes
//! scale this targets, indistinguishable in practice. The matching *semantics*
//! (static vs `:param` segments, longest-literal-wins ordering) are the part
//! worth understanding, and those are identical.

use crate::body::{self, Body};
use crate::extract::PathParams;
use crate::handler::{BoxedHandler, Handler};
use crate::response::IntoResponse;
use bytes::Bytes;
use http::{Method, Request, Response, StatusCode};
use http_body_util::BodyExt;
use std::collections::HashMap;
use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

/// A compiled path pattern. Each segment is either a literal or a `:name`
/// capture.
#[derive(Clone, Debug)]
struct PathPattern {
    segments: Vec<Segment>,
}

#[derive(Clone, Debug)]
enum Segment {
    Static(String),
    Param(String),
}

impl PathPattern {
    fn parse(pattern: &str) -> Self {
        let segments = pattern
            .split('/')
            .filter(|s| !s.is_empty())
            .map(|seg| match seg.strip_prefix(':') {
                Some(name) => Segment::Param(name.to_string()),
                None => Segment::Static(seg.to_string()),
            })
            .collect();
        PathPattern { segments }
    }

    /// Try to match a concrete request path. Returns the captured params on a
    /// match, `None` otherwise. Segment counts must be equal — we don't do
    /// wildcards or trailing-slash fuzziness, to keep matching predictable.
    fn match_path(&self, path: &str) -> Option<Vec<(String, String)>> {
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if parts.len() != self.segments.len() {
            return None;
        }
        let mut params = Vec::new();
        for (seg, part) in self.segments.iter().zip(parts.iter()) {
            match seg {
                Segment::Static(lit) if lit == part => {}
                Segment::Static(_) => return None,
                Segment::Param(name) => params.push((name.clone(), (*part).to_string())),
            }
        }
        Some(params)
    }

    /// Count of literal (non-param) segments — used to order routes so the more
    /// specific pattern wins when two could match (e.g. `/todos/all` beats
    /// `/todos/:id`).
    fn literal_weight(&self) -> usize {
        self.segments
            .iter()
            .filter(|s| matches!(s, Segment::Static(_)))
            .count()
    }
}

/// The set of method handlers registered for one path.
#[derive(Clone)]
pub struct MethodRouter<S> {
    routes: HashMap<Method, PendingHandler<S>>,
}

// Manual `Default` so we don't pick up the derive's spurious `S: Default` bound
// (the map starts empty regardless of what `S` is).
impl<S> Default for MethodRouter<S> {
    fn default() -> Self {
        MethodRouter {
            routes: HashMap::new(),
        }
    }
}

/// A handler that hasn't been bound to state yet. We keep it as a closure that,
/// given the state, erases the handler into a [`BoxedHandler`]. This is what
/// lets `Router::with_state` defer state injection until the very end.
#[derive(Clone)]
struct PendingHandler<S> {
    #[allow(clippy::type_complexity)]
    bind: Arc<dyn Fn(S) -> BoxedHandler + Send + Sync>,
}

impl<S> PendingHandler<S>
where
    S: Clone + Send + Sync + 'static,
{
    fn new<H, T>(handler: H) -> Self
    where
        H: Handler<T, S>,
        T: 'static,
    {
        PendingHandler {
            bind: Arc::new(move |state| BoxedHandler::new(handler.clone(), state)),
        }
    }
}

impl<S> MethodRouter<S>
where
    S: Clone + Send + Sync + 'static,
{
    fn with<H, T>(mut self, method: Method, handler: H) -> Self
    where
        H: Handler<T, S>,
        T: 'static,
    {
        self.routes.insert(method, PendingHandler::new(handler));
        self
    }

    /// Chain another method onto the same path: `get(list).post(create)`.
    pub fn get<H, T>(self, handler: H) -> Self
    where
        H: Handler<T, S>,
        T: 'static,
    {
        self.with(Method::GET, handler)
    }
    pub fn post<H, T>(self, handler: H) -> Self
    where
        H: Handler<T, S>,
        T: 'static,
    {
        self.with(Method::POST, handler)
    }
    pub fn put<H, T>(self, handler: H) -> Self
    where
        H: Handler<T, S>,
        T: 'static,
    {
        self.with(Method::PUT, handler)
    }
    pub fn delete<H, T>(self, handler: H) -> Self
    where
        H: Handler<T, S>,
        T: 'static,
    {
        self.with(Method::DELETE, handler)
    }
}

/// Start a `MethodRouter` with a GET handler. Free functions `get`/`post`/… are
/// the ergonomic entry points used in `Router::route("/path", get(handler))`.
pub fn get<H, T, S>(handler: H) -> MethodRouter<S>
where
    H: Handler<T, S>,
    T: 'static,
    S: Clone + Send + Sync + 'static,
{
    MethodRouter::default().get(handler)
}

pub fn post<H, T, S>(handler: H) -> MethodRouter<S>
where
    H: Handler<T, S>,
    T: 'static,
    S: Clone + Send + Sync + 'static,
{
    MethodRouter::default().post(handler)
}

pub fn put<H, T, S>(handler: H) -> MethodRouter<S>
where
    H: Handler<T, S>,
    T: 'static,
    S: Clone + Send + Sync + 'static,
{
    MethodRouter::default().put(handler)
}

pub fn delete<H, T, S>(handler: H) -> MethodRouter<S>
where
    H: Handler<T, S>,
    T: 'static,
    S: Clone + Send + Sync + 'static,
{
    MethodRouter::default().delete(handler)
}

/// The application router: patterns in registration form, plus their method
/// tables. Still generic over the state type `S` until [`with_state`] is called.
pub struct Router<S> {
    routes: Vec<(PathPattern, MethodRouter<S>)>,
}

impl<S> Default for Router<S> {
    fn default() -> Self {
        Router { routes: Vec::new() }
    }
}

impl<S> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    pub fn new() -> Self {
        Router::default()
    }

    /// Register a path and its method handlers.
    pub fn route(mut self, path: &str, method_router: MethodRouter<S>) -> Self {
        self.routes.push((PathPattern::parse(path), method_router));
        self
    }

    /// Freeze in the shared state, binding every handler. Routes are sorted so
    /// that patterns with more literal segments are tried first (specific wins
    /// over `:param`). The result is a ready-to-serve `tower::Service`.
    pub fn with_state(self, state: S) -> RouterService {
        let mut routes = self.routes;
        routes.sort_by(|a, b| b.0.literal_weight().cmp(&a.0.literal_weight()));

        let compiled = routes
            .into_iter()
            .map(|(pattern, method_router)| {
                let methods = method_router
                    .routes
                    .into_iter()
                    .map(|(method, pending)| (method, (pending.bind)(state.clone())))
                    .collect();
                CompiledRoute { pattern, methods }
            })
            .collect();

        RouterService {
            routes: Arc::new(compiled),
        }
    }
}

/// A route after state binding: pattern + concrete per-method handlers.
struct CompiledRoute {
    pattern: PathPattern,
    methods: HashMap<Method, BoxedHandler>,
}

/// The router as a `tower::Service`. Cloning is cheap (`Arc`), which matters
/// because hyper-util clones the service once per connection.
#[derive(Clone)]
pub struct RouterService {
    routes: Arc<Vec<CompiledRoute>>,
}

impl RouterService {
    /// Core dispatch: find a matching pattern, inject captured params, run the
    /// handler. Distinguishes "no such path" (404) from "path exists but not
    /// this method" (405) — the HTTP-correct behavior.
    async fn dispatch(self, req: Request<Bytes>) -> Response<Body> {
        let path = req.uri().path().to_string();
        let mut path_existed = false;

        for route in self.routes.iter() {
            if let Some(params) = route.pattern.match_path(&path) {
                path_existed = true;
                if let Some(handler) = route.methods.get(req.method()) {
                    let (mut parts, body) = req.into_parts();
                    parts.extensions.insert(PathParams(params));
                    let req = Request::from_parts(parts, body);
                    return handler.call(req).await;
                }
            }
        }

        if path_existed {
            (StatusCode::METHOD_NOT_ALLOWED, "405 Method Not Allowed").into_response()
        } else {
            (StatusCode::NOT_FOUND, "404 Not Found").into_response()
        }
    }
}

/// `tower::Service` impl. The incoming body is hyper's streaming body; we buffer
/// it to `Bytes` up front so handlers/extractors get a simple owned body. The
/// associated `Error` is [`Infallible`] — every failure is turned into an HTTP
/// response *inside* the service, so the connection itself never errors.
impl Service<Request<hyper::body::Incoming>> for RouterService {
    type Response = Response<Body>;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // Stateless: always ready. (A pooled/limited service would gate here.)
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<hyper::body::Incoming>) -> Self::Future {
        let this = self.clone();
        Box::pin(async move {
            let (parts, incoming) = req.into_parts();
            // Buffer the streaming request body into one `Bytes` buffer.
            let collected = match incoming.collect().await {
                Ok(buf) => buf.to_bytes(),
                Err(_) => {
                    return Ok((StatusCode::BAD_REQUEST, "could not read request body")
                        .into_response());
                }
            };
            let req = Request::from_parts(parts, collected);
            Ok(this.dispatch(req).await)
        })
    }
}

// Bring tower's Service trait into scope under a local name to avoid leaking the
// dependency name across the crate.
use tower::Service;

/// Convenience: a 404 body for callers that want one directly.
pub fn not_found() -> Response<Body> {
    let mut res = Response::new(body::from("404 Not Found"));
    *res.status_mut() = StatusCode::NOT_FOUND;
    res
}
