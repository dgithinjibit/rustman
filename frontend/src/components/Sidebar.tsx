import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Clock,
  Layers,
  Server,
  Code2,
  FileCode,
  Search,
  MoreVertical,
  Play,
  Check,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import {
  ActiveSidebarTab,
  Collection,
  CollectionFolder,
  HttpRequest,
  Environment,
  MockRoute,
  MockServerState,
  HistoryItem,
  HttpMethod,
} from '../types';
import { getMethodBadgeClasses, getStatusBadgeClasses, formatDuration } from '../utils/formatter';

interface SidebarProps {
  activeTab: ActiveSidebarTab;
  onSelectTab: (tab: ActiveSidebarTab) => void;
  collections: Collection[];
  activeRequestId: string | null;
  onSelectRequest: (request: HttpRequest) => void;
  onAddRequest: (collectionId: string, folderId?: string) => void;
  onAddFolder: (collectionId: string, parentId?: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onDeleteFolder: (collectionId: string, folderId: string) => void;
  activeEnvironment: Environment | null;
  onUpdateEnvironmentVariable: (envId: string, varId: string, key: string, value: string) => void;
  onAddEnvironmentVariable: (envId: string) => void;
  mockState: MockServerState;
  onToggleMockRoute: (routeId: string) => void;
  onAddMockRoute: () => void;
  onDeleteMockRoute: (routeId: string) => void;
  history: HistoryItem[];
  onSelectHistoryItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  activeRequest: HttpRequest | null;
  onOpenCodeModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collections,
  activeRequestId,
  onSelectRequest,
  onAddRequest,
  onAddFolder,
  onDeleteRequest,
  onDeleteFolder,
  activeEnvironment,
  onUpdateEnvironmentVariable,
  onAddEnvironmentVariable,
  mockState,
  onToggleMockRoute,
  onAddMockRoute,
  onDeleteMockRoute,
  history,
  onSelectHistoryItem,
  onClearHistory,
  activeRequest,
  onOpenCodeModal,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const toggleSecret = (varId: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [varId]: !prev[varId] }));
  };

  return (
    <aside className="flex h-full w-80 flex-shrink-0 select-none border-r border-slate-200 bg-surface-50 text-xs">
      {/* Left Icon Strip */}
      <div className="flex w-11 flex-col items-center justify-between border-r border-slate-200 bg-surface-100 py-2">
        <div className="flex flex-col space-y-1.5">
          <button
            onClick={() => onSelectTab('collections')}
            title="Collections"
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              activeTab === 'collections'
                ? 'bg-white text-blue-600 shadow-subtle'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <Folder className="h-4 w-4" />
          </button>

          <button
            onClick={() => onSelectTab('environments')}
            title="Environments & Globals"
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              activeTab === 'environments'
                ? 'bg-white text-blue-600 shadow-subtle'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <Layers className="h-4 w-4" />
          </button>

          <button
            onClick={() => onSelectTab('mock')}
            title="Mock Server"
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              activeTab === 'mock'
                ? 'bg-white text-blue-600 shadow-subtle'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <Server className="h-4 w-4" />
          </button>

          <button
            onClick={() => onSelectTab('history')}
            title="History"
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              activeTab === 'history'
                ? 'bg-white text-blue-600 shadow-subtle'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
          </button>

          <button
            onClick={() => onSelectTab('codegen')}
            title="Code Exporter"
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              activeTab === 'codegen'
                ? 'bg-white text-blue-600 shadow-subtle'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <Code2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Pane Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TAB 1: COLLECTIONS */}
        {activeTab === 'collections' && (
          <div className="flex h-full flex-col">
            {/* Header & Filter */}
            <div className="border-b border-slate-200 p-2.5">
              <div className="flex items-center justify-between pb-2">
                <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                  Collections
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      if (collections.length > 0) {
                        onAddRequest(collections[0].id);
                      }
                    }}
                    title="Add Request"
                    className="flex h-6 items-center space-x-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Request</span>
                  </button>
                </div>
              </div>

              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter collections..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-6 w-full rounded border border-slate-200 bg-white pl-7 pr-2 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400"
                />
              </div>
            </div>

            {/* Tree View */}
            <div className="flex-1 overflow-y-auto p-1">
              {collections.map((coll) => {
                const filteredReqs = coll.requests.filter(
                  (r) =>
                    !searchFilter ||
                    r.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                    r.url.toLowerCase().includes(searchFilter.toLowerCase())
                );

                return (
                  <div key={coll.id} className="mb-2">
                    {/* Collection Header */}
                    <div className="flex items-center justify-between px-2 py-1 text-slate-800 font-semibold">
                      <div className="flex items-center space-x-1.5 truncate">
                        <Folder className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                        <span className="truncate text-[11px]">{coll.name}</span>
                      </div>
                      <button
                        onClick={() => onAddFolder(coll.id)}
                        title="Add Folder"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Folders & Root Requests */}
                    <div className="pl-2 space-y-0.5">
                      {coll.folders.map((folder) => {
                        const isCollapsed = collapsedFolders[folder.id];
                        const folderReqs = filteredReqs.filter((r) => r.folderId === folder.id);

                        return (
                          <div key={folder.id} className="space-y-0.5">
                            <div className="group flex items-center justify-between rounded px-1.5 py-1 text-slate-700 hover:bg-surface-200">
                              <div
                                onClick={() => toggleFolder(folder.id)}
                                className="flex flex-1 cursor-pointer items-center space-x-1 truncate"
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                                <span className="truncate font-medium text-[11px]">{folder.name}</span>
                              </div>
                              <button
                                onClick={() => onAddRequest(coll.id, folder.id)}
                                title="Add Request to Folder"
                                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-slate-400 hover:text-slate-700"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                            </div>

                            {!isCollapsed && (
                              <div className="pl-3 space-y-0.5">
                                {folderReqs.map((req) => (
                                  <RequestTreeItem
                                    key={req.id}
                                    request={req}
                                    isActive={req.id === activeRequestId}
                                    onSelect={() => onSelectRequest(req)}
                                    onDelete={() => onDeleteRequest(req.id)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Root Requests */}
                      {filteredReqs
                        .filter((r) => !r.folderId)
                        .map((req) => (
                          <RequestTreeItem
                            key={req.id}
                            request={req}
                            isActive={req.id === activeRequestId}
                            onSelect={() => onSelectRequest(req)}
                            onDelete={() => onDeleteRequest(req.id)}
                          />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: ENVIRONMENTS & GLOBALS */}
        {activeTab === 'environments' && (
          <div className="flex h-full flex-col p-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                  Active Environment
                </span>
                <div className="text-[11px] font-semibold text-slate-800">
                  {activeEnvironment ? activeEnvironment.name : 'No Environment Selected'}
                </div>
              </div>
              {activeEnvironment && (
                <button
                  onClick={() => onAddEnvironmentVariable(activeEnvironment.id)}
                  className="flex h-6 items-center space-x-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
                >
                  <Plus className="h-3 w-3" />
                  <span>Variable</span>
                </button>
              )}
            </div>

            {activeEnvironment ? (
              <div className="flex-1 overflow-y-auto pt-2 space-y-1.5">
                {activeEnvironment.variables.map((v) => {
                  const isRevealed = revealedSecrets[v.id];
                  return (
                    <div
                      key={v.id}
                      className="rounded border border-slate-200 bg-white p-2 text-slate-700 shadow-subtle"
                    >
                      <div className="flex items-center justify-between pb-1">
                        <span className="font-mono text-[10px] font-semibold text-blue-700">
                          {`{{${v.key}}}`}
                        </span>
                        {v.isSecret && (
                          <button
                            onClick={() => toggleSecret(v.id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                      <input
                        type={v.isSecret && !isRevealed ? 'password' : 'text'}
                        value={v.value}
                        onChange={(e) =>
                          onUpdateEnvironmentVariable(activeEnvironment.id, v.id, v.key, e.target.value)
                        }
                        className="h-6 w-full rounded border border-slate-200 bg-surface-50 px-1.5 font-mono text-[10px] text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-400">
                <Layers className="h-8 w-8 stroke-1 text-slate-300 mb-2" />
                <p className="text-[11px]">Select or create an environment in the top bar to manage variables.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MOCK SERVER */}
        {activeTab === 'mock' && (
          <div className="flex h-full flex-col p-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                  Mock Routes
                </span>
                <div className="text-[11px] text-slate-600 font-mono">
                  http://127.0.0.1:{mockState.port}
                </div>
              </div>
              <button
                onClick={onAddMockRoute}
                className="flex h-6 items-center space-x-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
              >
                <Plus className="h-3 w-3" />
                <span>Route</span>
              </button>
            </div>

            {/* Routes List */}
            <div className="flex-1 overflow-y-auto pt-2 space-y-1.5">
              {mockState.routes.map((route) => (
                <div
                  key={route.id}
                  className="rounded border border-slate-200 bg-white p-2 shadow-subtle"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`rounded border px-1 py-0.5 font-mono text-[9px] font-bold ${getMethodBadgeClasses(
                          route.method
                        )}`}
                      >
                        {route.method}
                      </span>
                      <span className="font-mono text-[11px] text-slate-800">{route.path}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span
                        className={`rounded border px-1 py-0.5 font-mono text-[9px] ${getStatusBadgeClasses(
                          route.status
                        )}`}
                      >
                        {route.status}
                      </span>
                      <button
                        onClick={() => onDeleteMockRoute(route.id)}
                        className="p-0.5 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Hits: {route.hitCount || 0}</span>
                    <span>Delay: {route.delayMs}ms</span>
                    <button
                      onClick={() => onToggleMockRoute(route.id)}
                      className={`text-[10px] font-medium ${
                        route.enabled ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {route.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Hit Logs */}
              {mockState.logs.length > 0 && (
                <div className="mt-4 border-t border-slate-200 pt-2">
                  <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                    Server Logs ({mockState.logs.length})
                  </span>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-[9px]">
                    {mockState.logs.slice(0, 10).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded bg-surface-100 px-1.5 py-0.5 text-slate-700"
                      >
                        <span>
                          [{log.timestamp}] {log.method} {log.path}
                        </span>
                        <span className="font-semibold text-emerald-700">{log.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: HISTORY */}
        {activeTab === 'history' && (
          <div className="flex h-full flex-col p-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Execution Log ({history.length})
              </span>
              {history.length > 0 && (
                <button
                  onClick={onClearHistory}
                  className="rounded p-1 text-slate-400 hover:text-rose-600"
                  title="Clear Log"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pt-2 space-y-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectHistoryItem(item)}
                  className="group flex cursor-pointer items-center justify-between rounded border border-slate-200 bg-white p-1.5 shadow-subtle hover:border-slate-300 hover:bg-surface-50"
                >
                  <div className="flex flex-1 items-center space-x-1.5 truncate">
                    <span
                      className={`rounded border px-1 py-0.5 font-mono text-[9px] font-bold ${getMethodBadgeClasses(
                        item.request.method
                      )}`}
                    >
                      {item.request.method}
                    </span>
                    <span className="truncate font-mono text-[10px] text-slate-800">
                      {item.request.url}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-[9px] font-mono text-slate-500">
                    <span className={`px-1 rounded border ${getStatusBadgeClasses(item.response.status)}`}>
                      {item.response.status}
                    </span>
                    <span>{formatDuration(item.response.durationMs)}</span>
                  </div>
                </div>
              ))}

              {history.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-400 pt-12">
                  <Clock className="h-8 w-8 stroke-1 text-slate-300 mb-2" />
                  <p className="text-[11px]">No requests sent yet in this session.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: CODE EXPORTER */}
        {activeTab === 'codegen' && (
          <div className="flex h-full flex-col p-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Native Code Exporter
              </span>
              <button
                onClick={onOpenCodeModal}
                className="flex h-6 items-center space-x-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
              >
                <Code2 className="h-3 w-3" />
                <span>Full View</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pt-3 space-y-2 text-slate-700">
              <p className="text-[11px] text-slate-600">
                Generate native client code directly from the active request in the workbench:
              </p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div
                  onClick={onOpenCodeModal}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-200 bg-white p-2 shadow-subtle hover:border-blue-300"
                >
                  <span className="font-semibold text-slate-900">Rust (Hyper 1.x)</span>
                  <span className="text-[10px] text-slate-500">Zero-copy client</span>
                </div>
                <div
                  onClick={onOpenCodeModal}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-200 bg-white p-2 shadow-subtle hover:border-blue-300"
                >
                  <span className="font-semibold text-slate-900">Rust (Reqwest)</span>
                  <span className="text-[10px] text-slate-500">Async / Tokio</span>
                </div>
                <div
                  onClick={onOpenCodeModal}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-200 bg-white p-2 shadow-subtle hover:border-blue-300"
                >
                  <span className="font-semibold text-slate-900">cURL</span>
                  <span className="text-[10px] text-slate-500">CLI command</span>
                </div>
                <div
                  onClick={onOpenCodeModal}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-200 bg-white p-2 shadow-subtle hover:border-blue-300"
                >
                  <span className="font-semibold text-slate-900">TypeScript (Fetch)</span>
                  <span className="text-[10px] text-slate-500">Modern browser/Node</span>
                </div>
                <div
                  onClick={onOpenCodeModal}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-200 bg-white p-2 shadow-subtle hover:border-blue-300"
                >
                  <span className="font-semibold text-slate-900">Python (Requests)</span>
                  <span className="text-[10px] text-slate-500">Standard script</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

const RequestTreeItem: React.FC<{
  request: HttpRequest;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ request, isActive, onSelect, onDelete }) => {
  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 transition ${
        isActive
          ? 'bg-blue-50 text-blue-900 font-medium'
          : 'text-slate-700 hover:bg-surface-200'
      }`}
    >
      <div className="flex items-center space-x-1.5 truncate">
        <span
          className={`rounded border px-1 py-0.2 font-mono text-[9px] font-bold ${getMethodBadgeClasses(
            request.method
          )}`}
        >
          {request.method}
        </span>
        <span className="truncate text-[11px]">{request.name}</span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete Request"
        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-slate-400 hover:text-rose-600"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
};
