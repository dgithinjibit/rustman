//! End-to-end tests: spin up a real rustpol server on an ephemeral port, then
//! hit it with a real hyper HTTP client. This exercises the whole stack —
//! accept loop, router, extractors, handlers, middleware — over an actual TCP
//! socket, not a mock.

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{Method, Request, StatusCode};
use hyper_util::rt::TokioIo;
use rustpol::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tower::ServiceBuilder;

#[derive(Clone, Default)]
struct Counter(Arc<Mutex<Vec<String>>>);

#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct Item {
    name: String,
}

// --- handlers under test ---------------------------------------------------

async fn hello() -> &'static str {
    "hello"
}

async fn echo_id(Path(id): Path<u64>) -> String {
    format!("id={id}")
}

async fn greet(Query(item): Query<Item>) -> String {
    format!("hi {}", item.name)
}

async fn push(State(state): State<Counter>, Json(item): Json<Item>) -> (StatusCode, String) {
    state.0.lock().unwrap().push(item.name.clone());
    (StatusCode::CREATED, format!("stored {}", item.name))
}

async fn count(State(state): State<Counter>) -> Json<usize> {
    Json(state.0.lock().unwrap().len())
}

fn build_router() -> rustpol::routing::RouterService {
    Router::new()
        .route("/hello", get(hello))
        .route("/items/:id", get(echo_id))
        .route("/greet", get(greet))
        .route("/items", get(count).post(push))
        .with_state(Counter::default())
}

/// Boot the server on an OS-assigned port; return the bound address.
async fn spawn_server() -> String {
    // Bind first to learn the port, then hand the listener's address to serve.
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener); // free it so serve() can re-bind the same port

    // Wrap the router in the logging middleware so the middleware path is
    // covered end-to-end too. ServiceBuilder yields a tower Service that the
    // server accepts generically.
    let app = ServiceBuilder::new().layer(LogLayer).service(build_router());
    tokio::spawn(async move {
        let _ = serve(&addr.to_string(), app).await;
    });

    // Give the accept loop a moment to bind.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    addr.to_string()
}

/// Minimal one-shot HTTP/1 client: open a connection, send one request, read the
/// full response. Returns (status, body-as-string).
async fn request(
    addr: &str,
    method: Method,
    path: &str,
    body: Option<&str>,
) -> (StatusCode, String) {
    let stream = TcpStream::connect(addr).await.unwrap();
    let io = TokioIo::new(stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
    tokio::spawn(async move {
        let _ = conn.await;
    });

    let body = Full::new(Bytes::from(body.unwrap_or("").to_owned()));
    let mut builder = Request::builder().method(method).uri(format!("http://{addr}{path}"));
    if let Some(headers) = builder.headers_mut() {
        headers.insert("host", "localhost".parse().unwrap());
        headers.insert("content-type", "application/json".parse().unwrap());
    }
    let req = builder.body(body).unwrap();

    let res = sender.send_request(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

#[tokio::test]
async fn routing_and_extractors() {
    let addr = spawn_server().await;

    // basic static route
    let (status, body) = request(&addr, Method::GET, "/hello", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "hello");

    // path param extractor
    let (status, body) = request(&addr, Method::GET, "/items/42", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "id=42");

    // a non-numeric :id must fail Path<u64> extraction with 400
    let (status, _) = request(&addr, Method::GET, "/items/abc", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // query extractor
    let (status, body) = request(&addr, Method::GET, "/greet?name=ada", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "hi ada");

    // unknown path -> 404
    let (status, _) = request(&addr, Method::GET, "/nope", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // known path, wrong method -> 405
    let (status, _) = request(&addr, Method::DELETE, "/hello", None).await;
    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn json_body_and_shared_state() {
    let addr = spawn_server().await;

    // starts empty
    let (status, body) = request(&addr, Method::GET, "/items", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "0");

    // POST a JSON body -> 201
    let (status, body) =
        request(&addr, Method::POST, "/items", Some(r#"{"name":"milk"}"#)).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body, "stored milk");

    // state persisted across requests
    let (_, body) = request(&addr, Method::GET, "/items", None).await;
    assert_eq!(body, "1");

    // malformed JSON -> 400
    let (status, _) = request(&addr, Method::POST, "/items", Some("not json")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
