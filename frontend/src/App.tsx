import React, { useState, useEffect } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { Sidebar } from './components/Sidebar';
import { RequestWorkbench } from './components/RequestWorkbench';
import { ResponseInspector } from './components/ResponseInspector';
import { EnvironmentModal } from './components/EnvironmentModal';
import { CodeGeneratorModal } from './components/CodeGeneratorModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import {
  ActiveSidebarTab,
  Collection,
  HttpRequest,
  HttpResponse,
  Environment,
  MockRoute,
  MockServerState,
  HistoryItem,
} from './types';
import { executeHttpRequest } from './utils/ipc';

// Initial Mock Server Seed
const INITIAL_MOCK_ROUTES: MockRoute[] = [
  {
    id: 'mock-1',
    method: 'GET',
    path: '/api/v1/users',
    status: 200,
    responseHeaders: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
    responseBody: JSON.stringify(
      {
        status: 'success',
        data: [
          { id: 1, name: 'Alice Smith', email: 'alice@domain.com', role: 'admin' },
          { id: 2, name: 'Bob Jones', email: 'bob@domain.com', role: 'engineer' },
        ],
      },
      null,
      2
    ),
    delayMs: 15,
    enabled: true,
    hitCount: 0,
  },
  {
    id: 'mock-2',
    method: 'POST',
    path: '/api/v1/auth/login',
    status: 200,
    responseHeaders: [{ id: 'h2', key: 'Content-Type', value: 'application/json', enabled: true }],
    responseBody: JSON.stringify(
      {
        token: 'rustpol_jwt_mock_token_8899',
        token_type: 'Bearer',
        expires_in: 3600,
        user: { id: 1, username: 'alice' },
      },
      null,
      2
    ),
    delayMs: 22,
    enabled: true,
    hitCount: 0,
  },
  {
    id: 'mock-3',
    method: 'GET',
    path: '/api/v1/system/health',
    status: 200,
    responseHeaders: [{ id: 'h3', key: 'Content-Type', value: 'application/json', enabled: true }],
    responseBody: JSON.stringify(
      {
        status: 'healthy',
        engine: 'rustpol (Hyper 1.x + Tokio)',
        idle_ram_kb: 1420,
        uptime_seconds: 14820,
      },
      null,
      2
    ),
    delayMs: 4,
    enabled: true,
    hitCount: 0,
  },
];

// Initial Environments Seed
const INITIAL_ENVIRONMENTS: Environment[] = [
  {
    id: 'env-local',
    name: 'Local Mock / Rustpol',
    variables: [
      { id: 'v1', key: 'base_url', value: 'http://127.0.0.1:4000', isSecret: false, enabled: true },
      { id: 'v2', key: 'todo_api', value: 'http://127.0.0.1:3000', isSecret: false, enabled: true },
      { id: 'v3', key: 'auth_token', value: 'rustpol_bearer_sec_9918', isSecret: true, enabled: true },
    ],
  },
  {
    id: 'env-prod',
    name: 'Production Cloud',
    variables: [
      { id: 'v4', key: 'base_url', value: 'https://api.example.com/v1', isSecret: false, enabled: true },
      { id: 'v5', key: 'auth_token', value: 'prod_bearer_token_xyz', isSecret: true, enabled: true },
    ],
  },
];

// Initial Collections Seed
const INITIAL_COLLECTIONS: Collection[] = [
  {
    id: 'coll-todo',
    name: 'Rustpol Todo Service',
    description: 'Endpoints for the local Rustpol full-stack service',
    folders: [
      { id: 'f-todos', name: 'Todo CRUD' },
    ],
    requests: [
      {
        id: 'req-get-todos',
        name: 'List Todos',
        method: 'GET',
        url: '{{todo_api}}/api/todos',
        params: [],
        headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
        auth: { type: 'none' },
        body: { type: 'none' },
        assertions: [
          { id: 'a1', name: 'Status is 200', type: 'status_code', targetValue: '200', enabled: true },
          { id: 'a2', name: 'Response time under 50ms', type: 'response_time', targetValue: '50', enabled: true },
        ],
        folderId: 'f-todos',
      },
      {
        id: 'req-create-todo',
        name: 'Create New Todo',
        method: 'POST',
        url: '{{todo_api}}/api/todos',
        params: [],
        headers: [{ id: 'h2', key: 'Content-Type', value: 'application/json', enabled: true }],
        auth: { type: 'none' },
        body: {
          type: 'json',
          jsonContent: JSON.stringify({ title: 'Build Tauri lightweight frontend' }, null, 2),
        },
        assertions: [
          { id: 'a3', name: 'Status is 200', type: 'status_code', targetValue: '200', enabled: true },
        ],
        folderId: 'f-todos',
      },
      {
        id: 'req-mock-users',
        name: 'Mock: List Users',
        method: 'GET',
        url: '{{base_url}}/api/v1/users',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none' },
        assertions: [
          { id: 'a4', name: 'Status is 200 OK', type: 'status_code', targetValue: '200', enabled: true },
          { id: 'a5', name: 'Response contains status success', type: 'body_contains', targetValue: 'success', enabled: true },
        ],
      },
      {
        id: 'req-mock-health',
        name: 'Mock: System Health',
        method: 'GET',
        url: '{{base_url}}/api/v1/system/health',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none' },
        assertions: [
          { id: 'a6', name: 'Status code 200', type: 'status_code', targetValue: '200', enabled: true },
        ],
      },
    ],
  },
];

export function App() {
  const [workspacePath] = useState('/home/bethwel/rustman');
  const [activeSidebarTab, setActiveSidebarTab] = useState<ActiveSidebarTab>('collections');
  const [collections, setCollections] = useState<Collection[]>(INITIAL_COLLECTIONS);
  const [environments, setEnvironments] = useState<Environment[]>(INITIAL_ENVIRONMENTS);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>('env-local');

  const [activeRequest, setActiveRequest] = useState<HttpRequest>(
    INITIAL_COLLECTIONS[0].requests[0]
  );
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [previousResponse, setPreviousResponse] = useState<HttpResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [mockState, setMockState] = useState<MockServerState>({
    running: true,
    port: 4000,
    routes: INITIAL_MOCK_ROUTES,
    logs: [],
  });

  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Modals state
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Active Environment & Variables
  const activeEnvironment = environments.find((e) => e.id === activeEnvironmentId) || null;
  const activeEnvVars = activeEnvironment ? activeEnvironment.variables : [];

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteRequest();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRequest, activeEnvVars, mockState]);

  // Execute Request Action
  const handleExecuteRequest = async () => {
    if (!activeRequest || isLoading) return;
    setIsLoading(true);

    try {
      const res = await executeHttpRequest(activeRequest, activeEnvVars, mockState);
      if (response) {
        setPreviousResponse(response);
      }
      setResponse(res);

      // Append to History
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        request: { ...activeRequest },
        response: res,
      };
      setHistory((prev) => [historyItem, ...prev.slice(0, 49)]);
    } catch (err: any) {
      console.error('Request execution error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock server toggle
  const handleToggleMockServer = () => {
    setMockState((prev) => ({
      ...prev,
      running: !prev.running,
    }));
  };

  // Update active request in collections
  const handleRequestChange = (updated: HttpRequest) => {
    setActiveRequest(updated);
    setCollections((prev) =>
      prev.map((c) => ({
        ...c,
        requests: c.requests.map((r) => (r.id === updated.id ? updated : r)),
      }))
    );
  };

  // Select request from collection tree or history
  const handleSelectRequest = (req: HttpRequest) => {
    setActiveRequest(req);
  };

  const handleAddRequest = (collectionId: string, folderId?: string) => {
    const newReq: HttpRequest = {
      id: crypto.randomUUID(),
      name: 'New Request',
      method: 'GET',
      url: '{{base_url}}/api/v1/resource',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none' },
      assertions: [
        { id: crypto.randomUUID(), name: 'Status is 200', type: 'status_code', targetValue: '200', enabled: true },
      ],
      collectionId,
      folderId,
    };

    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, requests: [...c.requests, newReq] } : c))
    );
    setActiveRequest(newReq);
  };

  const handleAddFolder = (collectionId: string, parentId?: string) => {
    const folderName = prompt('Enter folder name:', 'New Folder');
    if (!folderName) return;

    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              folders: [...c.folders, { id: crypto.randomUUID(), name: folderName, parentId }],
            }
          : c
      )
    );
  };

  const handleDeleteRequest = (requestId: string) => {
    setCollections((prev) =>
      prev.map((c) => ({
        ...c,
        requests: c.requests.filter((r) => r.id !== requestId),
      }))
    );
  };

  const handleDeleteFolder = (collectionId: string, folderId: string) => {
    setCollections((prev) =>
      prev.map((c) => ({
        ...c,
        folders: c.folders.filter((f) => f.id !== folderId),
        requests: c.requests.filter((r) => r.folderId !== folderId),
      }))
    );
  };

  // Mock routes handlers
  const handleToggleMockRoute = (routeId: string) => {
    setMockState((prev) => ({
      ...prev,
      routes: prev.routes.map((r) => (r.id === routeId ? { ...r, enabled: !r.enabled } : r)),
    }));
  };

  const handleAddMockRoute = () => {
    const path = prompt('Enter route path (e.g. /api/v1/orders):', '/api/v1/orders');
    if (!path) return;
    const newRoute: MockRoute = {
      id: crypto.randomUUID(),
      method: 'GET',
      path,
      status: 200,
      responseHeaders: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
      responseBody: JSON.stringify({ message: 'Custom mock response' }, null, 2),
      delayMs: 10,
      enabled: true,
      hitCount: 0,
    };
    setMockState((prev) => ({
      ...prev,
      routes: [...prev.routes, newRoute],
    }));
  };

  const handleDeleteMockRoute = (routeId: string) => {
    setMockState((prev) => ({
      ...prev,
      routes: prev.routes.filter((r) => r.id !== routeId),
    }));
  };

  // Environment variables quick edit
  const handleUpdateEnvVar = (envId: string, varId: string, key: string, value: string) => {
    setEnvironments((prev) =>
      prev.map((e) =>
        e.id === envId
          ? {
              ...e,
              variables: e.variables.map((v) => (v.id === varId ? { ...v, key, value } : v)),
            }
          : e
      )
    );
  };

  const handleAddEnvVar = (envId: string) => {
    const newVar = {
      id: crypto.randomUUID(),
      key: 'NEW_KEY',
      value: 'value',
      isSecret: false,
      enabled: true,
    };
    setEnvironments((prev) =>
      prev.map((e) => (e.id === envId ? { ...e, variables: [...e.variables, newVar] } : e))
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-slate-900 select-none">
      {/* 1. Global Header Bar */}
      <HeaderBar
        workspacePath={workspacePath}
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        onSelectEnvironment={setActiveEnvironmentId}
        onOpenEnvironmentModal={() => setIsEnvModalOpen(true)}
        mockState={mockState}
        onToggleMockServer={handleToggleMockServer}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenCodeModal={() => setIsCodeModalOpen(true)}
      />

      {/* 2. Main Workbench Three-Pane Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeSidebarTab}
          onSelectTab={setActiveSidebarTab}
          collections={collections}
          activeRequestId={activeRequest?.id || null}
          onSelectRequest={handleSelectRequest}
          onAddRequest={handleAddRequest}
          onAddFolder={handleAddFolder}
          onDeleteRequest={handleDeleteRequest}
          onDeleteFolder={handleDeleteFolder}
          activeEnvironment={activeEnvironment}
          onUpdateEnvironmentVariable={handleUpdateEnvVar}
          onAddEnvironmentVariable={handleAddEnvVar}
          mockState={mockState}
          onToggleMockRoute={handleToggleMockRoute}
          onAddMockRoute={handleAddMockRoute}
          onDeleteMockRoute={handleDeleteMockRoute}
          history={history}
          onSelectHistoryItem={(item) => {
            setActiveRequest(item.request);
            setResponse(item.response);
          }}
          onClearHistory={() => setHistory([])}
          activeRequest={activeRequest}
          onOpenCodeModal={() => setIsCodeModalOpen(true)}
        />

        {/* Center Request Workbench */}
        {activeRequest ? (
          <RequestWorkbench
            request={activeRequest}
            onChange={handleRequestChange}
            onSend={handleExecuteRequest}
            isLoading={isLoading}
            onCancel={() => setIsLoading(false)}
            environmentVariables={activeEnvVars}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            Select a request from the sidebar
          </div>
        )}

        {/* Right Response & Telemetry Inspector */}
        <ResponseInspector
          response={response}
          previousResponse={previousResponse}
          isLoading={isLoading}
        />
      </div>

      {/* 3. Bottom Status Strip */}
      <footer className="flex h-6 w-full items-center justify-between border-t border-slate-200 bg-surface-100 px-3 text-[10px] text-slate-600">
        <div className="flex items-center space-x-3">
          <span className="font-mono font-medium">Rust Core: Hyper 1.x + Tower</span>
          <span className="text-slate-300">|</span>
          <span className="font-mono">
            Mock Engine:{' '}
            <span className={mockState.running ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
              {mockState.running ? `Listening :${mockState.port}` : 'Stopped'}
            </span>
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Tauri Desktop Bridge: Ready</span>
          <span className="text-slate-300">|</span>
          <span className="font-mono">Memory: ~14.2 MB</span>
        </div>
      </footer>

      {/* Modals */}
      <EnvironmentModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
        environments={environments}
        onSaveEnvironments={setEnvironments}
        activeEnvironmentId={activeEnvironmentId}
        onSelectEnvironment={setActiveEnvironmentId}
      />

      {activeRequest && (
        <CodeGeneratorModal
          isOpen={isCodeModalOpen}
          onClose={() => setIsCodeModalOpen(false)}
          request={activeRequest}
          environmentVariables={activeEnvVars}
        />
      )}

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        collections={collections}
        onSelectRequest={handleSelectRequest}
        environments={environments}
        onSelectEnvironment={setActiveEnvironmentId}
        mockRoutes={mockState.routes}
        onOpenCodeModal={() => setIsCodeModalOpen(true)}
        onOpenEnvironmentModal={() => setIsEnvModalOpen(true)}
        onSendActiveRequest={handleExecuteRequest}
      />
    </div>
  );
}
export default App;
