//! Extractors: turn parts of the raw request into typed handler arguments.
//!
//! This is the feature that makes a framework feel magical: you write
//!
//! ```ignore
//! async fn show(Path(id): Path<u64>, State(db): State<Db>) -> Json<Todo> { ... }
//! ```
//!
//! and the framework figures out, *from the argument types alone*, how to pull
//! `id` out of the URL path and hand you a clone of the shared state. There is
//! no reflection and no runtime cost — it's all the trait system.
//!
//! ## The two traits, and the coherence trick
//!
//! Most extractors only need the request *head* (method, headers, path params)
//! and must NOT consume the body — otherwise you could only ever have one of
//! them. That's [`FromRequestParts`]. Exactly one extractor (e.g. [`Json`]) is
//! allowed to consume the body; that's [`FromRequest`].
//!
//! We want every `FromRequestParts` type to *also* be usable as the final
//! `FromRequest` argument. The naive blanket impl
//! `impl<T: FromRequestParts> FromRequest for T` collides, under Rust's
//! coherence rules, with the direct `impl FromRequest for Json<T>` (the checker
//! can't prove `Json<T>` will never implement `FromRequestParts`). axum's fix —
//! which we copy — is a **marker type parameter** `M` on `FromRequest`: the
//! blanket impl uses `ViaParts`, direct body impls use the default `ViaRequest`.
//! Different markers ⇒ no overlap. It's a neat demonstration of steering the
//! coherence checker with a phantom type.

use crate::body::Body;
use crate::response::{IntoResponse, Json};
use bytes::Bytes;
use http::request::Parts;
use http::{HeaderMap, Method, Request, Response, StatusCode};
use serde::de::DeserializeOwned;

/// Path parameters captured by the router (e.g. `/todos/:id` → `("id","42")`).
/// The router inserts this into the request's extensions before dispatch; the
/// [`Path`] extractor reads it back out.
#[derive(Clone, Debug, Default)]
pub struct PathParams(pub Vec<(String, String)>);

/// Private marker types that disambiguate the two `FromRequest` impls. They
/// have no values (empty enums) and never appear in your code.
mod marker {
    pub enum ViaParts {}
    pub enum ViaRequest {}
}

/// Extract from the request head only. Never touches the body, so any number of
/// these can appear in a handler's argument list.
pub trait FromRequestParts<S>: Sized {
    type Rejection: IntoResponse;
    fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection>;
}

/// Extract from the whole request (may consume the body). At most one of these
/// per handler, and it must be the *last* argument. `M` is the coherence marker
/// described in the module docs — callers always use the default.
pub trait FromRequest<S, M = marker::ViaRequest>: Sized {
    type Rejection: IntoResponse;
    fn from_request(req: Request<Bytes>, state: &S) -> Result<Self, Self::Rejection>;
}

// Every `FromRequestParts` type is automatically a `FromRequest` (via the
// `ViaParts` marker): split off the body, extract from the head, drop the body.
impl<S, T> FromRequest<S, marker::ViaParts> for T
where
    T: FromRequestParts<S>,
{
    type Rejection = <T as FromRequestParts<S>>::Rejection;
    fn from_request(req: Request<Bytes>, state: &S) -> Result<Self, Self::Rejection> {
        let (mut parts, _body) = req.into_parts();
        T::from_request_parts(&mut parts, state)
    }
}

// ---------------------------------------------------------------------------
// Concrete extractors
// ---------------------------------------------------------------------------

/// The request method (`GET`, `POST`, …).
impl<S> FromRequestParts<S> for Method {
    type Rejection = (StatusCode, String);
    fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parts.method.clone())
    }
}

/// All request headers.
impl<S> FromRequestParts<S> for HeaderMap {
    type Rejection = (StatusCode, String);
    fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parts.headers.clone())
    }
}

/// `State(s)` — hand the handler a clone of the shared application state.
pub struct State<S>(pub S);

impl<S: Clone> FromRequestParts<S> for State<S> {
    type Rejection = (StatusCode, String);
    fn from_request_parts(_parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Ok(State(state.clone()))
    }
}

/// `Path(value)` — deserialize the captured path parameters into `T`.
///
/// `T` can be a single value (`Path<u64>` for `/todos/:id`) or a struct/tuple
/// for multiple params. We bridge the string params into `serde` by building a
/// JSON value and deserializing from it (see [`params_to_value`]).
pub struct Path<T>(pub T);

impl<T, S> FromRequestParts<S> for Path<T>
where
    T: DeserializeOwned,
{
    type Rejection = (StatusCode, String);
    fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let params = parts
            .extensions
            .get::<PathParams>()
            .cloned()
            .unwrap_or_default();
        let value = params_to_value(&params.0, params.0.len() == 1);
        serde_json::from_value(value)
            .map(Path)
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid path param: {e}")))
    }
}

/// `Query(value)` — deserialize the URL query string (`?a=1&b=two`) into `T`.
pub struct Query<T>(pub T);

impl<T, S> FromRequestParts<S> for Query<T>
where
    T: DeserializeOwned,
{
    type Rejection = (StatusCode, String);
    fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let raw = parts.uri.query().unwrap_or("");
        let pairs: Vec<(String, String)> = raw
            .split('&')
            .filter(|s| !s.is_empty())
            .map(|pair| match pair.split_once('=') {
                Some((k, v)) => (k.to_string(), v.replace('+', " ")),
                None => (pair.to_string(), String::new()),
            })
            .collect();
        let value = params_to_value(&pairs, false);
        serde_json::from_value(value)
            .map(Query)
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid query string: {e}")))
    }
}

/// `Json(value)` as an **extractor**: parse the request body as JSON into `T`.
/// (The same `Json` type is also a response — see `response.rs`.)
impl<T, S> FromRequest<S> for Json<T>
where
    T: DeserializeOwned,
{
    type Rejection = Response<Body>;
    fn from_request(req: Request<Bytes>, _state: &S) -> Result<Self, Self::Rejection> {
        let body = req.into_body();
        serde_json::from_slice(&body).map(Json).map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("invalid JSON body: {e}")).into_response()
        })
    }
}

/// `Bytes` extractor: the raw request body, untouched.
impl<S> FromRequest<S> for Bytes {
    type Rejection = (StatusCode, String);
    fn from_request(req: Request<Bytes>, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(req.into_body())
    }
}

/// Turn a list of `(key, string-value)` pairs into a `serde_json::Value` so we
/// can lean on serde for the actual typed deserialization.
///
/// Each value is parsed *heuristically*: if it's valid JSON on its own (`42`,
/// `true`) we keep that; otherwise we treat it as a JSON string. That makes
/// `Path<u64>` and `Path<String>` both "just work" without a bespoke
/// deserializer. When `single` is true and there's one pair, we deserialize
/// from the bare value (so `Path<u64>` sees `42`, not `{"id": 42}`).
fn params_to_value(pairs: &[(String, String)], single: bool) -> serde_json::Value {
    use serde_json::Value;
    let coerce = |s: &str| -> Value {
        serde_json::from_str::<Value>(s).unwrap_or_else(|_| Value::String(s.to_string()))
    };
    if single && pairs.len() == 1 {
        coerce(&pairs[0].1)
    } else {
        let map = pairs
            .iter()
            .map(|(k, v)| (k.clone(), coerce(v)))
            .collect::<serde_json::Map<_, _>>();
        Value::Object(map)
    }
}
