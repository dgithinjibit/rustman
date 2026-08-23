export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  type?: 'text' | 'file';
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export interface AuthConfig {
  type: AuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyLocation?: 'header' | 'query';
}

export type BodyType = 'none' | 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded';

export interface BodyConfig {
  type: BodyType;
  rawText?: string;
  jsonContent?: string;
  formParams?: KeyValuePair[];
}

export interface Assertion {
  id: string;
  name: string;
  type: 'status_code' | 'response_time' | 'json_path' | 'header_exists' | 'body_contains';
  targetValue: string;
  enabled: boolean;
}

export interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  auth: AuthConfig;
  body: BodyConfig;
  assertions: Assertion[];
  collectionId?: string;
  folderId?: string;
}

export interface TelemetryBreakdown {
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  isJson: boolean;
  telemetry: TelemetryBreakdown;
  assertionResults: AssertionResult[];
  timestamp: string;
}

export interface CollectionFolder {
  id: string;
  name: string;
  parentId?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  folders: CollectionFolder[];
  requests: HttpRequest[];
}

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface MockRoute {
  id: string;
  method: HttpMethod;
  path: string;
  status: number;
  responseHeaders: KeyValuePair[];
  responseBody: string;
  delayMs: number;
  enabled: boolean;
  hitCount: number;
}

export interface MockLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
}

export interface MockServerState {
  running: boolean;
  port: number;
  routes: MockRoute[];
  logs: MockLogEntry[];
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  request: HttpRequest;
  response: HttpResponse;
}

export type ActiveSidebarTab = 'collections' | 'environments' | 'mock' | 'history' | 'codegen';
