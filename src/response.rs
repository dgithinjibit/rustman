//! `IntoResponse`: how a handler's return value becomes an HTTP response.
//!
//! A handler should be allowed to `return "hello"`, or a `String`, or a status
//! code, or `Json(some_struct)`, or a tuple `(StatusCode, Json<T>)`. None of
//! those are literally an `http::Response`. `IntoResponse` is the trait that
//! converts each of them into one, so the router only ever has to deal with a
//! single, uniform `Response<Body>`.
//!
//! This is the exact pattern axum uses, and it's a small showcase of the type
//! system doing real work: the *return type* of your function decides how the
//! HTTP response is built, with zero runtime cost.

use crate::body::{self, Body};
use bytes::Bytes;
use http::{header, HeaderValue, Response, StatusCode};
use serde::Serialize;

/// Anything a handler can return.
pub trait IntoResponse {
    fn into_response(self) -> Response<Body>;
}

// --- The base case: a Response is already a response -----------------------
impl IntoResponse for Response<Body> {
    fn into_response(self) -> Response<Body> {
        self
    }
}

// --- Status codes ----------------------------------------------------------
impl IntoResponse for StatusCode {
    fn into_response(self) -> Response<Body> {
        let mut res = Response::new(body::empty());
        *res.status_mut() = self;
        res
    }
}

// --- Plain text ------------------------------------------------------------
impl IntoResponse for &'static str {
    fn into_response(self) -> Response<Body> {
        text(self)
    }
}

impl IntoResponse for String {
    fn into_response(self) -> Response<Body> {
        text(self)
    }
}

fn text<T: Into<Bytes>>(data: T) -> Response<Body> {
    let mut res = Response::new(body::from(data));
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    res
}

// --- The unit type: 200 with an empty body ---------------------------------
impl IntoResponse for () {
    fn into_response(self) -> Response<Body> {
        Response::new(body::empty())
    }
}

// --- Result: either branch must itself be a response -----------------------
// This is what lets a handler use `?` and return `Result<T, E>` where both the
// success and error types implement `IntoResponse`.
impl<T, E> IntoResponse for Result<T, E>
where
    T: IntoResponse,
    E: IntoResponse,
{
    fn into_response(self) -> Response<Body> {
        match self {
            Ok(t) => t.into_response(),
            Err(e) => e.into_response(),
        }
    }
}

// --- (StatusCode, T): override the status of an inner response -------------
impl<T: IntoResponse> IntoResponse for (StatusCode, T) {
    fn into_response(self) -> Response<Body> {
        let (status, inner) = self;
        let mut res = inner.into_response();
        *res.status_mut() = status;
        res
    }
}

/// `Json(value)` — serialize `value` to JSON and set `Content-Type`.
pub struct Json<T>(pub T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response<Body> {
        match serde_json::to_vec(&self.0) {
            Ok(bytes) => {
                let mut res = Response::new(body::from(bytes));
                res.headers_mut().insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("application/json"),
                );
                res
            }
            // Serialization should never fail for our types, but if it does we
            // surface a 500 rather than panicking inside the connection task.
            Err(err) => {
                let mut res = Response::new(body::from(format!(
                    "JSON serialization error: {err}"
                )));
                *res.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
                res
            }
        }
    }
}

/// `Html(content)` — send `content` with a `text/html` content type.
pub struct Html<T>(pub T);

impl<T: Into<Bytes>> IntoResponse for Html<T> {
    fn into_response(self) -> Response<Body> {
        let mut res = Response::new(body::from(self.0));
        res.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/html; charset=utf-8"),
        );
        res
    }
}
