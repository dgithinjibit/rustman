//! The one body type the whole framework passes around.
//!
//! Hyper is generic over *any* `http_body::Body`. A framework, though, wants a
//! single concrete body type so that handlers, extractors, middleware, and the
//! router can all name the same `Request<Body>` / `Response<Body>` without
//! drowning in generics. axum makes the same choice. We use `Full<Bytes>`:
//! a body that is one in-memory buffer of [`Bytes`] (the zero-copy,
//! refcounted byte buffer — cloning it just bumps a refcount, see the README).
//!
//! Keeping the whole body in memory is a deliberate simplification: a request
//! handler is far easier to write against `&[u8]` than against an async stream
//! of frames, and the payloads a JSON API handles are small. The streaming
//! machinery is still there underneath in hyper if we ever need it.

use bytes::Bytes;
use http_body_util::Full;

/// The single body type used across the framework.
pub type Body = Full<Bytes>;

/// Build an empty body (the right body for a bare 204 / GET response).
pub fn empty() -> Body {
    Full::new(Bytes::new())
}

/// Build a body from anything that can become [`Bytes`] (a `String`, `&str`,
/// `Vec<u8>`, `&[u8]`, …). One funnel so call sites never touch `Full` directly.
pub fn from<T: Into<Bytes>>(data: T) -> Body {
    Full::new(data.into())
}
