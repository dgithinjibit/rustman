//! Phase 1 · slice 1 — graceful shutdown.
//!
//! Behaviour we pin down (TDD, written before the implementation):
//!
//! 1. **In-flight requests drain.** A request that is already being served when
//!    the shutdown signal fires must still complete with its real response, not
//!    be cut off mid-flight.
//! 2. **New connections are refused after shutdown.** Once the signal fires the
//!    listener is dropped, so a *fresh* TCP connect started afterwards fails.
//! 3. **`serve_with_shutdown` returns.** After the in-flight work drains, the
//!    server future resolves (the process can exit cleanly), and it does so
//!    within the bounded drain timeout rather than hanging forever.
//!
//! The shutdown trigger is an injectable future (here a `oneshot`), so the test
//! is deterministic; `main.rs` passes `tokio::signal::ctrl_c()` for the real
//! signal.

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{Method, Request, StatusCode};
use hyper_util::rt::TokioIo;
use rustpol::prelude::*;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

/// A handler that takes a noticeable amount of time, so we can reliably catch it
/// "in flight" when the shutdown signal fires.
async fn slow() -> &'static str {
    tokio::time::sleep(Duration::from_millis(300)).await;
    "done"
}

async fn quick() -> &'static str {
    "quick"
}

fn app() -> rustpol::routing::RouterService {
    Router::new()
        .route("/slow", get(slow))
        .route("/quick", get(quick))
        .with_state(())
}

/// Bind an ephemeral port and hand the address to `serve_with_shutdown`, driven
/// by a `oneshot` we can fire from the test. Returns the bound address, the
/// shutdown trigger, and the server's `JoinHandle`.
async fn spawn() -> (
    String,
    oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    drop(listener); // free the port so serve can re-bind it

    let (tx, rx) = oneshot::channel::<()>();
    let addr2 = addr.clone();
    let handle = tokio::spawn(async move {
        // `rx` resolves when we fire `tx`; that's the shutdown signal.
        let shutdown = async move {
            let _ = rx.await;
        };
        rustpol::server::serve_with_shutdown(&addr2, app(), shutdown)
            .await
            .unwrap();
    });

    // Let the accept loop bind before clients connect.
    tokio::time::sleep(Duration::from_millis(100)).await;
    (addr, tx, handle)
}

/// Open one connection and return the live `sender` plus the spawned connection
/// driver's handle, so the caller controls *when* the request is sent relative
/// to shutdown.
async fn connect(
    addr: &str,
) -> hyper::client::conn::http1::SendRequest<Full<Bytes>> {
    let stream = TcpStream::connect(addr).await.unwrap();
    let io = TokioIo::new(stream);
    let (sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
    tokio::spawn(async move {
        let _ = conn.await;
    });
    sender
}

fn get_req(addr: &str, path: &str) -> Request<Full<Bytes>> {
    Request::builder()
        .method(Method::GET)
        .uri(format!("http://{addr}{path}"))
        .header("host", "localhost")
        .body(Full::new(Bytes::new()))
        .unwrap()
}

#[tokio::test]
async fn in_flight_request_drains_then_server_stops() {
    let (addr, tx, handle) = spawn().await;

    // Start a slow request and let it get *into* the handler.
    let mut sender = connect(&addr).await;
    let req = get_req(&addr, "/slow");
    let inflight = tokio::spawn(async move { sender.send_request(req).await });
    tokio::time::sleep(Duration::from_millis(50)).await; // now mid-handler

    // Fire shutdown while that request is in flight.
    tx.send(()).unwrap();

    // 1. The in-flight request must still complete successfully.
    let res = inflight.await.unwrap().expect("in-flight request was cut off");
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], b"done");

    // 3. The server future must resolve (drain finished) within the timeout.
    tokio::time::timeout(Duration::from_secs(5), handle)
        .await
        .expect("server did not shut down within timeout")
        .unwrap();
}

#[tokio::test]
async fn refuses_new_connections_after_shutdown() {
    let (addr, tx, handle) = spawn().await;

    // Sanity: server accepts before shutdown.
    let mut sender = connect(&addr).await;
    let res = sender.send_request(get_req(&addr, "/quick")).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // Fire shutdown and wait for the server to fully stop.
    tx.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(5), handle)
        .await
        .expect("server did not shut down within timeout")
        .unwrap();

    // 2. A brand-new connection after shutdown must fail (listener is gone).
    // Either the connect fails, or the handshake/first request fails.
    let connect_result = TcpStream::connect(&addr).await;
    let refused = match connect_result {
        Err(_) => true,
        Ok(stream) => {
            let io = TokioIo::new(stream);
            match hyper::client::conn::http1::handshake::<_, Full<Bytes>>(io).await {
                Err(_) => true,
                Ok((mut s, conn)) => {
                    tokio::spawn(async move {
                        let _ = conn.await;
                    });
                    s.send_request(get_req(&addr, "/quick")).await.is_err()
                }
            }
        }
    };
    assert!(refused, "server still accepted a new connection after shutdown");
}
