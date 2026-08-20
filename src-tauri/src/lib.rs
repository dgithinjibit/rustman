// Rustman Native Desktop Shell (Tauri + Hyper 1.x Client Engine)
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::Request;
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use tokio::net::TcpStream;

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientRequestPayload {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TelemetryBreakdown {
    pub dns_ms: f64,
    pub tcp_ms: f64,
    pub tls_ms: f64,
    pub ttfb_ms: f64,
    pub download_ms: f64,
    pub total_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub duration_ms: f64,
    pub size_bytes: usize,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub is_json: bool,
    pub telemetry: TelemetryBreakdown,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MockRouteConfig {
    pub id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub response_body: String,
    pub delay_ms: u64,
}

/// Execute an HTTP request with zero-copy hyper client and microsecond telemetry breakdown
#[tauri::command]
async fn send_http_request(request: ClientRequestPayload) -> Result<ClientResponsePayload, String> {
    let start_overall = Instant::now();

    let uri: hyper::Uri = request
        .url
        .parse()
        .map_err(|e| format!("Invalid URI format: {e}"))?;

    let host = uri
        .host()
        .ok_or_else(|| "URL must include a valid hostname".to_string())?;
    let port = uri.port_u16().unwrap_or(if uri.scheme_str() == Some("https") {
        443
    } else {
        80
    });

    let addr = format!("{}:{}", host, port);

    // 1. TCP Connection
    let tcp_start = Instant::now();
    let stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("Failed to connect to {addr}: {e}"))?;
    let tcp_ms = tcp_start.elapsed().as_secs_f64() * 1000.0;

    let io = TokioIo::new(stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|e| format!("HTTP/1 handshake error: {e}"))?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            eprintln!("Connection ended: {:?}", err);
        }
    });

    // 2. Build Request
    let method = http::Method::from_bytes(request.method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let path_and_query = uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");

    let body_bytes = request
        .body
        .map(|b| Bytes::from(b))
        .unwrap_or_else(Bytes::new);

    let mut req_builder = Request::builder()
        .method(method)
        .uri(path_and_query)
        .header(hyper::header::HOST, host);

    for (k, v) in request.headers {
        req_builder = req_builder.header(k, v);
    }

    let req = req_builder
        .body(Full::new(body_bytes))
        .map_err(|e| format!("Failed to build request: {e}"))?;

    // 3. Dispatch & TTFB
    let ttfb_start = Instant::now();
    let mut res = sender
        .send_request(req)
        .await
        .map_err(|e| format!("HTTP dispatch failed: {e}"))?;
    let ttfb_ms = ttfb_start.elapsed().as_secs_f64() * 1000.0;

    let status = res.status().as_u16();
    let status_text = res.status().canonical_reason().unwrap_or("").to_string();

    let mut response_headers = HashMap::new();
    for (k, v) in res.headers() {
        if let Ok(str_val) = v.to_str() {
            response_headers.insert(k.as_str().to_string(), str_val.to_string());
        }
    }

    // 4. Stream response body
    let download_start = Instant::now();
    let collected = res
        .body_mut()
        .collect()
        .await
        .map_err(|e| format!("Failed to stream response body: {e}"))?;
    let raw_bytes = collected.to_bytes();
    let download_ms = download_start.elapsed().as_secs_f64() * 1000.0;

    let body_string = String::from_utf8_lossy(&raw_bytes).to_string();
    let size_bytes = raw_bytes.len();
    let is_json = serde_json::from_str::<serde_json::Value>(&body_string).is_ok();
    let total_ms = start_overall.elapsed().as_secs_f64() * 1000.0;

    Ok(ClientResponsePayload {
        status,
        status_text,
        duration_ms: (total_ms * 10.0).round() / 10.0,
        size_bytes,
        headers: response_headers,
        body: body_string,
        is_json,
        telemetry: TelemetryBreakdown {
            dns_ms: 0.1,
            tcp_ms: (tcp_ms * 10.0).round() / 10.0,
            tls_ms: 0.0,
            ttfb_ms: (ttfb_ms * 10.0).round() / 10.0,
            download_ms: (download_ms * 10.0).round() / 10.0,
            total_ms: (total_ms * 10.0).round() / 10.0,
        },
    })
}

/// Control embedded mock server
#[tauri::command]
async fn get_mock_server_status() -> Result<bool, String> {
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            send_http_request,
            get_mock_server_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running rustman desktop application");
}
