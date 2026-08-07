//! `serve`: accept TCP connections and feed each one to hyper, with our Tower
//! service stack handling the requests.
//!
//! This is the seam between Tower's world (`Service<Request<Incoming>>`) and
//! hyper's world (`hyper::service::Service`). `hyper_util`'s
//! [`TowerToHyperService`] adapts the former into the latter, and
//! `hyper::server::conn::http1` drives a single connection's request/response
//! loop. We spawn one Tokio task per accepted connection.
//!
//! ## Graceful shutdown
//!
//! [`serve_with_shutdown`] takes a `shutdown` future (an *injectable* signal, so
//! tests can drive it with a `oneshot` and `main` can pass
//! `tokio::signal::ctrl_c()`). When it resolves we:
//!
//! 1. stop accepting new connections (break the accept loop, dropping the
//!    listener — a fresh connect afterwards is refused), and
//! 2. let the connections already in flight *drain* — finish their current
//!    request/response — bounded by [`SHUTDOWN_TIMEOUT`] so a stuck peer can't
//!    keep the process alive forever.
//!
//! We use `hyper_util::server::graceful::GracefulShutdown` for (2): each
//! connection is wrapped with `graceful.watch(conn)` before being spawned, and
//! `graceful.shutdown()` resolves once every watched connection has completed.
//!
//! [`serve`] is the convenience wrapper that never shuts down (a
//! never-resolving signal), so existing call sites keep their two-argument form.

use crate::body::Body;
use http::{Request, Response};
use hyper::body::Incoming;
use hyper_util::rt::TokioIo;
use hyper_util::server::graceful::GracefulShutdown;
use hyper_util::service::TowerToHyperService;
use std::convert::Infallible;
use std::future::Future;
use std::time::Duration;
use tokio::net::TcpListener;
use tower::Service;

/// How long to wait for in-flight connections to drain after the shutdown
/// signal before giving up and returning anyway.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);

// The `Service` contract a Tower stack must satisfy to be served by hyper:
// turns `Request<Incoming>` into our `Response<Body>` infallibly, is cheaply
// cloneable (one clone per connection), `Send`, and `'static` with a `Send`
// future. Spelled out inline on each entry point (below) so the public API
// carries no private trait bound.

/// Bind `addr` and serve `service` forever (until the process is killed). This
/// is the simple entry point; it delegates to [`serve_with_shutdown`] with a
/// signal that never fires.
pub async fn serve<S>(
    addr: &str,
    service: S,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    S: Service<Request<Incoming>, Response = Response<Body>, Error = Infallible>
        + Clone
        + Send
        + 'static,
    S::Future: Send + 'static,
{
    serve_with_shutdown(addr, service, std::future::pending::<()>()).await
}

/// Bind `addr` and serve `service` until `shutdown` resolves, then drain
/// in-flight connections (bounded by [`SHUTDOWN_TIMEOUT`]) and return.
///
/// `shutdown` is any future; the moment it completes we stop accepting. Tests
/// pass a `oneshot`; production passes `tokio::signal::ctrl_c()`.
pub async fn serve_with_shutdown<S, F>(
    addr: &str,
    service: S,
    shutdown: F,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    S: Service<Request<Incoming>, Response = Response<Body>, Error = Infallible>
        + Clone
        + Send
        + 'static,
    S::Future: Send + 'static,
    F: Future<Output = ()>,
{
    let listener = TcpListener::bind(addr).await?;
    println!("rustpol listening on http://{addr}");

    let graceful = GracefulShutdown::new();
    // Pin the shutdown future so we can poll it repeatedly in `select!` without
    // moving it, and so a `!Unpin` signal (like `ctrl_c()`) is usable. `pin!`
    // yields a pinned mutable binding, which `&mut shutdown` below re-borrows.
    let mut shutdown = std::pin::pin!(shutdown);

    // The accept loop. `select!` races a new connection against the shutdown
    // signal; whichever is ready first wins. When shutdown wins we break, which
    // drops `listener` and stops accepting.
    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, _peer) = match accepted {
                    Ok(pair) => pair,
                    // A transient accept error (e.g. fd exhaustion) shouldn't
                    // kill the whole server; log and keep looping.
                    Err(err) => {
                        eprintln!("accept error: {err:?}");
                        continue;
                    }
                };

                let io = TokioIo::new(stream);
                let hyper_service = TowerToHyperService::new(service.clone());

                // Build the connection as a *future we can watch*, rather than
                // awaiting `serve_connection` inline. `graceful.watch` ties this
                // connection's lifetime to the drain in `shutdown()` below.
                let conn = hyper::server::conn::http1::Builder::new()
                    .serve_connection(io, hyper_service);
                let watched = graceful.watch(conn);

                tokio::task::spawn(async move {
                    if let Err(err) = watched.await {
                        eprintln!("connection error: {err:?}");
                    }
                });
            }

            _ = &mut shutdown => {
                println!("shutdown signal received; draining connections");
                break;
            }
        }
    }

    // Listener is dropped here (loop left scope) → no new connections accepted.
    // Now wait for in-flight connections to finish, but not forever.
    tokio::select! {
        _ = graceful.shutdown() => {
            println!("all connections drained; shutting down");
        }
        _ = tokio::time::sleep(SHUTDOWN_TIMEOUT) => {
            eprintln!(
                "drain timed out after {}s; forcing shutdown",
                SHUTDOWN_TIMEOUT.as_secs()
            );
        }
    }

    Ok(())
}
