//! A hand-written Tower middleware, so the `Layer`/`Service` mechanics are
//! visible rather than hidden behind `tower-http`.
//!
//! [`LogLayer`] is a `Layer` (a `Service → Service` factory). [`LogService`] is
//! the wrapper it produces: it records the method + path, calls the inner
//! service, then logs the status and elapsed time. Because it's generic over
//! any inner `Service<Request<B>>`, it composes with our router *and* with any
//! other Tower layer, in any order — that's the whole point of the abstraction.

use http::{Request, Response};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;
use tower::{Layer, Service};

/// The layer. Stateless here, but a real one might hold a log target, sampling
/// rate, etc. `layer()` wraps whatever inner service it's given.
#[derive(Clone, Copy, Default)]
pub struct LogLayer;

impl<S> Layer<S> for LogLayer {
    type Service = LogService<S>;
    fn layer(&self, inner: S) -> Self::Service {
        LogService { inner }
    }
}

/// The wrapping service produced by [`LogLayer`].
#[derive(Clone)]
pub struct LogService<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for LogService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    ReqBody: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // Backpressure passes straight through to the inner service.
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let method = req.method().clone();
        let path = req.uri().path().to_string();

        // `poll_ready` may have been called on `&mut self`, but the future must
        // own a ready service. The standard Tower idiom: clone self, then swap
        // so the *clone we call* is the one that was polled ready.
        let clone = self.inner.clone();
        let mut inner = std::mem::replace(&mut self.inner, clone);

        Box::pin(async move {
            let start = Instant::now();
            let result = inner.call(req).await;
            let elapsed = start.elapsed();
            if let Ok(res) = &result {
                println!(
                    "{:>6} {:<30} -> {} ({:.1?})",
                    method.as_str(),
                    path,
                    res.status().as_u16(),
                    elapsed
                );
            }
            result
        })
    }
}
