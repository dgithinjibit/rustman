//! # rustpol — a tiny, from-scratch web framework on Hyper + Tower
//!
//! This crate is a miniature, `axum`-shaped web framework built directly on the
//! low-level Rust HTTP stack, written to *understand every line*. It implements
//! the four things a web framework is made of:
//!
//! * **Routing** — [`routing::Router`] maps `(method, path)` to handlers and
//!   captures `:param` path segments.
//! * **Extractors** — [`extract`] turns parts of a request into typed handler
//!   arguments ([`extract::Path`], [`extract::Query`], [`extract::State`],
//!   [`response::Json`] as a body extractor, …) purely via the trait system.
//! * **Handlers** — [`handler::Handler`] lets any `async fn` of extractors be a
//!   route handler, across arities, via a macro-generated blanket impl.
//! * **Middleware** — [`middleware::LogLayer`] is a hand-written Tower
//!   `Layer`/`Service`; the [`routing::RouterService`] itself is a
//!   `tower::Service`, so the whole stack composes with the Tower ecosystem.
//!
//! [`server::serve`] bridges that Tower stack into hyper and runs the accept
//! loop. See `src/main.rs` for the full-stack todo app built on all of this.
//!
//! The companion `README.md` is the narrative explanation of *why* each layer
//! exists; this is the code those words describe.

pub mod body;
pub mod extract;
pub mod handler;
pub mod middleware;
pub mod response;
pub mod routing;
pub mod server;

/// Glob-import this to get the framework's common names in one line:
/// `use rustpol::prelude::*;`
pub mod prelude {
    pub use crate::body::Body;
    pub use crate::extract::{FromRequest, FromRequestParts, Path, Query, State};
    pub use crate::middleware::LogLayer;
    pub use crate::response::{Html, IntoResponse, Json};
    pub use crate::routing::{delete, get, post, put, Router};
    pub use crate::server::serve;
    pub use http::{HeaderMap, Method, Request, Response, StatusCode};
}
