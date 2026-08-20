import { HttpRequest, EnvironmentVariable } from '../types';
import { resolveVariables } from './interpolation';

export function generateCurl(req: HttpRequest, envVars: EnvironmentVariable[]): string {
  const url = resolveVariables(req.url, envVars);
  const activeParams = req.params.filter((p) => p.enabled && p.key);
  let finalUrl = url;
  if (activeParams.length > 0) {
    const searchParams = new URLSearchParams();
    activeParams.forEach((p) => searchParams.append(resolveVariables(p.key, envVars), resolveVariables(p.value, envVars)));
    const sep = finalUrl.includes('?') ? '&' : '?';
    finalUrl = `${finalUrl}${sep}${searchParams.toString()}`;
  }

  const lines = [`curl -X ${req.method} "${finalUrl}"`];

  // Auth
  if (req.auth.type === 'bearer' && req.auth.bearerToken) {
    lines.push(`  -H "Authorization: Bearer ${resolveVariables(req.auth.bearerToken, envVars)}"`);
  } else if (req.auth.type === 'basic' && (req.auth.basicUsername || req.auth.basicPassword)) {
    const u = resolveVariables(req.auth.basicUsername || '', envVars);
    const p = resolveVariables(req.auth.basicPassword || '', envVars);
    lines.push(`  -u "${u}:${p}"`);
  } else if (req.auth.type === 'apikey' && req.auth.apiKeyLocation === 'header' && req.auth.apiKeyName) {
    lines.push(`  -H "${req.auth.apiKeyName}: ${resolveVariables(req.auth.apiKeyValue || '', envVars)}"`);
  }

  // Headers
  req.headers
    .filter((h) => h.enabled && h.key)
    .forEach((h) => {
      lines.push(`  -H "${resolveVariables(h.key, envVars)}: ${resolveVariables(h.value, envVars)}"`);
    });

  // Body
  if (req.body.type === 'json' && req.body.jsonContent) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${resolveVariables(req.body.jsonContent, envVars).replace(/'/g, "'\\''")}'`);
  } else if (req.body.type === 'raw' && req.body.rawText) {
    lines.push(`  -d '${resolveVariables(req.body.rawText, envVars).replace(/'/g, "'\\''")}'`);
  } else if (req.body.type === 'x-www-form-urlencoded' && req.body.formParams) {
    const formPairs = req.body.formParams
      .filter((p) => p.enabled && p.key)
      .map((p) => `${encodeURIComponent(resolveVariables(p.key, envVars))}=${encodeURIComponent(resolveVariables(p.value, envVars))}`)
      .join('&');
    lines.push(`  -H "Content-Type: application/x-www-form-urlencoded"`);
    lines.push(`  -d "${formPairs}"`);
  }

  return lines.join(' \\\n');
}

export function generateRustReqwest(req: HttpRequest, envVars: EnvironmentVariable[]): string {
  const url = resolveVariables(req.url, envVars);
  const method = req.method.toLowerCase();

  return `use reqwest::Client;
use std::error::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let client = Client::new();
    let mut request = client.${method}("${url}");

${req.headers
  .filter((h) => h.enabled && h.key)
  .map((h) => `    request = request.header("${resolveVariables(h.key, envVars)}", "${resolveVariables(h.value, envVars)}");`)
  .join('\n')}${
    req.auth.type === 'bearer' && req.auth.bearerToken
      ? `\n    request = request.bearer_auth("${resolveVariables(req.auth.bearerToken, envVars)}");`
      : ''
  }${
    req.body.type === 'json' && req.body.jsonContent
      ? `\n    request = request.header("Content-Type", "application/json").body(r#"${resolveVariables(req.body.jsonContent, envVars)}"#);`
      : ''
  }

    let response = request.send().await?;
    println!("Status: {}", response.status());
    let body = response.text().await?;
    println!("Response:\n{}", body);

    Ok(())
}`;
}

export function generateRustHyper(req: HttpRequest, envVars: EnvironmentVariable[]): string {
  const url = resolveVariables(req.url, envVars);
  return `// Hyper 1.x zero-copy client execution
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::Request;
use hyper_util::rt::TokioIo;
use std::error::Error;
use tokio::net::TcpStream;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let uri: hyper::Uri = "${url}".parse()?;
    let host = uri.host().unwrap_or("127.0.0.1");
    let port = uri.port_u16().unwrap_or(80);
    let addr = format!("{}:{}", host, port);

    let stream = TcpStream::connect(addr).await?;
    let io = TokioIo::new(stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            eprintln!("Connection failed: {:?}", err);
        }
    });

    let req = Request::builder()
        .method("${req.method}")
        .uri(uri.path_and_query().map(|x| x.as_str()).unwrap_or("/"))
        .header(hyper::header::HOST, host)
${req.headers
  .filter((h) => h.enabled && h.key)
  .map((h) => `        .header("${resolveVariables(h.key, envVars)}", "${resolveVariables(h.value, envVars)}")`)
  .join('\n')}
        .body(Full::new(Bytes::from_static(${
          req.body.type === 'json' && req.body.jsonContent
            ? `b"${resolveVariables(req.body.jsonContent, envVars).replace(/"/g, '\\"')}"`
            : `b""`
        })))?;

    let mut res = sender.send_request(req).await?;
    println!("Response status: {}", res.status());

    let body = res.body_mut().collect().await?.to_bytes();
    println!("Body: {}", String::from_utf8_lossy(&body));

    Ok(())
}`;
}

export function generateTypeScriptFetch(req: HttpRequest, envVars: EnvironmentVariable[]): string {
  const url = resolveVariables(req.url, envVars);
  const headersObj: Record<string, string> = {};
  
  req.headers.filter((h) => h.enabled && h.key).forEach((h) => {
    headersObj[resolveVariables(h.key, envVars)] = resolveVariables(h.value, envVars);
  });

  if (req.auth.type === 'bearer' && req.auth.bearerToken) {
    headersObj['Authorization'] = `Bearer ${resolveVariables(req.auth.bearerToken, envVars)}`;
  }

  const options: Record<string, any> = {
    method: req.method,
    headers: headersObj,
  };

  if (req.body.type === 'json' && req.body.jsonContent) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.parse(resolveVariables(req.body.jsonContent, envVars) || '{}');
  }

  return `async function executeRequest() {
  const response = await fetch("${url}", {
    method: "${req.method}",
    headers: ${JSON.stringify(options.headers, null, 4)},
${req.body.type === 'json' && req.body.jsonContent ? `    body: JSON.stringify(${JSON.stringify(options.body, null, 6)}),\n` : ''}  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", data);
}

executeRequest();`;
}

export function generatePython(req: HttpRequest, envVars: EnvironmentVariable[]): string {
  const url = resolveVariables(req.url, envVars);
  return `import requests

url = "${url}"
headers = {
${req.headers
  .filter((h) => h.enabled && h.key)
  .map((h) => `    "${resolveVariables(h.key, envVars)}": "${resolveVariables(h.value, envVars)}",`)
  .join('\n')}
}

response = requests.request(
    "${req.method}",
    url,
    headers=headers,
${req.body.type === 'json' && req.body.jsonContent ? `    json=${resolveVariables(req.body.jsonContent, envVars)},\n` : ''})

print(f"Status: {response.status_code}")
print(response.text)`;
}
