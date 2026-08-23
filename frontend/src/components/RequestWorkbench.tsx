import React, { useState } from 'react';
import {
  Send,
  Plus,
  Trash2,
  Check,
  Code,
  Shield,
  FileText,
  Sliders,
  Sparkles,
  CheckSquare,
  Square,
  HelpCircle,
} from 'lucide-react';
import {
  HttpRequest,
  HttpMethod,
  KeyValuePair,
  AuthType,
  BodyType,
  Assertion,
  EnvironmentVariable,
} from '../types';
import { getMethodBadgeClasses } from '../utils/formatter';
import { extractVariableNames, resolveVariables } from '../utils/interpolation';

interface RequestWorkbenchProps {
  request: HttpRequest;
  onChange: (updated: HttpRequest) => void;
  onSend: () => void;
  isLoading: boolean;
  onCancel: () => void;
  environmentVariables: EnvironmentVariable[];
}

type TabType = 'params' | 'headers' | 'auth' | 'body' | 'assertions';

export const RequestWorkbench: React.FC<RequestWorkbenchProps> = ({
  request,
  onChange,
  onSend,
  isLoading,
  onCancel,
  environmentVariables,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('params');
  const [bulkParamsMode, setBulkParamsMode] = useState(false);
  const [bulkParamsText, setBulkParamsText] = useState('');

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  // Handle method change
  const handleMethodChange = (method: HttpMethod) => {
    onChange({ ...request, method });
  };

  // Handle URL change
  const handleUrlChange = (url: string) => {
    // If user types query string into URL bar, parse it into params
    if (url.includes('?')) {
      const [baseUrl, query] = url.split('?');
      const searchParams = new URLSearchParams(query);
      const newParams: KeyValuePair[] = [];
      searchParams.forEach((val, key) => {
        newParams.push({
          id: crypto.randomUUID(),
          key,
          value: val,
          enabled: true,
        });
      });
      onChange({ ...request, url: baseUrl, params: newParams });
    } else {
      onChange({ ...request, url });
    }
  };

  // Param helpers
  const handleAddParam = () => {
    const newParam: KeyValuePair = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
      enabled: true,
    };
    onChange({ ...request, params: [...request.params, newParam] });
  };

  const handleUpdateParam = (id: string, field: keyof KeyValuePair, val: any) => {
    const updated = request.params.map((p) => (p.id === id ? { ...p, [field]: val } : p));
    onChange({ ...request, params: updated });
  };

  const handleDeleteParam = (id: string) => {
    onChange({ ...request, params: request.params.filter((p) => p.id !== id) });
  };

  // Header helpers
  const handleAddHeader = () => {
    const newHeader: KeyValuePair = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
      enabled: true,
    };
    onChange({ ...request, headers: [...request.headers, newHeader] });
  };

  const handleUpdateHeader = (id: string, field: keyof KeyValuePair, val: any) => {
    const updated = request.headers.map((h) => (h.id === id ? { ...h, [field]: val } : h));
    onChange({ ...request, headers: updated });
  };

  const handleDeleteHeader = (id: string) => {
    onChange({ ...request, headers: request.headers.filter((h) => h.id !== id) });
  };

  // Add standard header presets
  const handleAddHeaderPreset = (key: string, value: string) => {
    const exists = request.headers.some((h) => h.key.toLowerCase() === key.toLowerCase());
    if (exists) {
      const updated = request.headers.map((h) =>
        h.key.toLowerCase() === key.toLowerCase() ? { ...h, value, enabled: true } : h
      );
      onChange({ ...request, headers: updated });
    } else {
      onChange({
        ...request,
        headers: [
          ...request.headers,
          { id: crypto.randomUUID(), key, value, enabled: true },
        ],
      });
    }
  };

  // Assertion helpers
  const handleAddAssertion = () => {
    const newAssertion: Assertion = {
      id: crypto.randomUUID(),
      name: 'Status is 200',
      type: 'status_code',
      targetValue: '200',
      enabled: true,
    };
    onChange({ ...request, assertions: [...(request.assertions || []), newAssertion] });
  };

  const handleUpdateAssertion = (id: string, field: keyof Assertion, val: any) => {
    const updated = (request.assertions || []).map((a) =>
      a.id === id ? { ...a, [field]: val } : a
    );
    onChange({ ...request, assertions: updated });
  };

  const handleDeleteAssertion = (id: string) => {
    onChange({
      ...request,
      assertions: (request.assertions || []).filter((a) => a.id !== id),
    });
  };

  // Format JSON body
  const handleFormatJson = () => {
    if (!request.body.jsonContent) return;
    try {
      const parsed = JSON.parse(request.body.jsonContent);
      onChange({
        ...request,
        body: {
          ...request.body,
          jsonContent: JSON.stringify(parsed, null, 2),
        },
      });
    } catch {
      // ignore invalid json format attempt
    }
  };

  // Check detected variables
  const urlVariables = extractVariableNames(request.url);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-white text-xs">
      {/* 1. Request Title Bar */}
      <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-surface-50 px-3">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={request.name}
            onChange={(e) => onChange({ ...request, name: e.target.value })}
            className="rounded border border-transparent bg-transparent px-1.5 py-0.5 font-semibold text-slate-800 text-[12px] outline-none hover:border-slate-300 focus:border-blue-400 focus:bg-white"
          />
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          ID: {request.id.slice(0, 8)}
        </div>
      </div>

      {/* 2. Omnibar (Method, URL, Send Trigger) */}
      <div className="flex items-center space-x-2 border-b border-slate-200 p-3 bg-surface-50">
        {/* Method Selector */}
        <div className="relative">
          <select
            value={request.method}
            onChange={(e) => handleMethodChange(e.target.value as HttpMethod)}
            className={`h-8 cursor-pointer rounded border px-2.5 font-mono text-[11px] font-bold outline-none shadow-subtle ${getMethodBadgeClasses(
              request.method
            )}`}
          >
            {methods.map((m) => (
              <option key={m} value={m} className="bg-white text-slate-900 font-medium">
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* URL Input */}
        <div className="relative flex flex-1 items-center">
          <input
            type="text"
            value={request.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                onSend();
              }
            }}
            placeholder="https://api.domain.com/v1/resource or {{base_url}}/users"
            className="h-8 w-full rounded border border-slate-300 bg-white px-3 font-mono text-[11px] text-slate-900 shadow-subtle outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />

          {/* Inline Variable resolution peek */}
          {urlVariables.length > 0 && (
            <div className="absolute right-2 flex items-center space-x-1">
              {urlVariables.slice(0, 2).map((v) => {
                const envMatch = environmentVariables.find((env) => env.key === v);
                return (
                  <span
                    key={v}
                    title={envMatch ? `Resolved: ${envMatch.value}` : 'Unresolved variable'}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                      envMatch
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {`{{${v}}}`}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Send Action */}
        {isLoading ? (
          <button
            onClick={onCancel}
            className="flex h-8 items-center space-x-1.5 rounded border border-rose-300 bg-rose-50 px-4 font-semibold text-rose-700 shadow-subtle hover:bg-rose-100"
          >
            <span>Cancel</span>
          </button>
        ) : (
          <button
            onClick={onSend}
            className="flex h-8 items-center space-x-1.5 rounded border border-blue-600 bg-blue-600 px-4 font-semibold text-white shadow-subtle hover:bg-blue-700 active:bg-blue-800"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        )}
      </div>

      {/* 3. Workbench Tabs Bar */}
      <div className="flex border-b border-slate-200 bg-surface-50 px-3">
        <TabButton
          label="Params"
          count={request.params.filter((p) => p.enabled && p.key).length}
          active={activeTab === 'params'}
          onClick={() => setActiveTab('params')}
        />
        <TabButton
          label="Headers"
          count={request.headers.filter((h) => h.enabled && h.key).length}
          active={activeTab === 'headers'}
          onClick={() => setActiveTab('headers')}
        />
        <TabButton
          label="Auth"
          count={request.auth.type !== 'none' ? 1 : 0}
          active={activeTab === 'auth'}
          onClick={() => setActiveTab('auth')}
        />
        <TabButton
          label="Body"
          badge={request.body.type !== 'none' ? request.body.type.toUpperCase() : undefined}
          active={activeTab === 'body'}
          onClick={() => setActiveTab('body')}
        />
        <TabButton
          label="Assertions"
          count={(request.assertions || []).filter((a) => a.enabled).length}
          active={activeTab === 'assertions'}
          onClick={() => setActiveTab('assertions')}
        />
      </div>

      {/* 4. Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* PARAMS TAB */}
        {activeTab === 'params' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Query Parameters
              </span>
              <button
                onClick={handleAddParam}
                className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
              >
                <Plus className="h-3 w-3" />
                <span>Add Param</span>
              </button>
            </div>

            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                  <th className="w-8 pb-1.5 pl-1 text-center">Active</th>
                  <th className="pb-1.5 pl-2">Key</th>
                  <th className="pb-1.5 pl-2">Value</th>
                  <th className="pb-1.5 pl-2">Description</th>
                  <th className="w-8 pb-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {request.params.map((param) => (
                  <tr key={param.id} className="group hover:bg-surface-50">
                    <td className="py-1 text-center">
                      <input
                        type="checkbox"
                        checked={param.enabled}
                        onChange={(e) => handleUpdateParam(param.id, 'enabled', e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        type="text"
                        value={param.key}
                        onChange={(e) => handleUpdateParam(param.id, 'key', e.target.value)}
                        placeholder="Key"
                        className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-slate-900 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        type="text"
                        value={param.value}
                        onChange={(e) => handleUpdateParam(param.id, 'value', e.target.value)}
                        placeholder="Value"
                        className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-slate-900 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        type="text"
                        value={param.description || ''}
                        onChange={(e) => handleUpdateParam(param.id, 'description', e.target.value)}
                        placeholder="Optional description"
                        className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 text-[11px] text-slate-500 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                      />
                    </td>
                    <td className="py-1 text-center">
                      <button
                        onClick={() => handleDeleteParam(param.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* HEADERS TAB */}
        {activeTab === 'headers' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Request Headers
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => handleAddHeaderPreset('Content-Type', 'application/json')}
                  className="rounded border border-slate-200 bg-surface-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-surface-200"
                >
                  + JSON
                </button>
                <button
                  onClick={() => handleAddHeaderPreset('Accept', 'application/json')}
                  className="rounded border border-slate-200 bg-surface-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-surface-200"
                >
                  + Accept JSON
                </button>
                <button
                  onClick={handleAddHeader}
                  className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Header</span>
                </button>
              </div>
            </div>

            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                  <th className="w-8 pb-1.5 pl-1 text-center">Active</th>
                  <th className="pb-1.5 pl-2">Header Name</th>
                  <th className="pb-1.5 pl-2">Header Value</th>
                  <th className="pb-1.5 pl-2">Description</th>
                  <th className="w-8 pb-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {request.headers.map((header) => (
                  <tr key={header.id} className="group hover:bg-surface-50">
                    <td className="py-1 text-center">
                      <input
                        type="checkbox"
                        checked={header.enabled}
                        onChange={(e) => handleUpdateHeader(header.id, 'enabled', e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        type="text"
                        value={header.key}
                        onChange={(e) => handleUpdateHeader(header.id, 'key', e.target.value)}
                        placeholder="Header (e.g. Authorization)"
                        className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-slate-900 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        type="text"
                        value={header.value}
                        onChange={(e) => handleUpdateHeader(header.id, 'value', e.target.value)}
                        placeholder="Value"
                        className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-slate-900 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        type="text"
                        value={header.description || ''}
                        onChange={(e) => handleUpdateHeader(header.id, 'description', e.target.value)}
                        placeholder="Description"
                        className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 text-[11px] text-slate-500 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                      />
                    </td>
                    <td className="py-1 text-center">
                      <button
                        onClick={() => handleDeleteHeader(header.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* AUTH TAB */}
        {activeTab === 'auth' && (
          <div className="max-w-xl space-y-4">
            <div className="flex items-center space-x-4 border-b border-slate-200 pb-3">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Auth Type
              </span>
              <div className="flex items-center space-x-2">
                {(['none', 'bearer', 'basic', 'apikey'] as AuthType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      onChange({
                        ...request,
                        auth: { ...request.auth, type },
                      })
                    }
                    className={`rounded border px-2.5 py-1 text-[11px] font-medium capitalize shadow-subtle ${
                      request.auth.type === type
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-surface-50'
                    }`}
                  >
                    {type === 'apikey' ? 'API Key' : type}
                  </button>
                ))}
              </div>
            </div>

            {request.auth.type === 'bearer' && (
              <div className="space-y-1.5">
                <label className="block font-medium text-slate-700 text-[11px]">
                  Bearer Token
                </label>
                <input
                  type="text"
                  value={request.auth.bearerToken || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      auth: { ...request.auth, bearerToken: e.target.value },
                    })
                  }
                  placeholder="e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... or {{token}}"
                  className="h-7 w-full rounded border border-slate-300 px-2 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
            )}

            {request.auth.type === 'basic' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700 text-[11px]">
                    Username
                  </label>
                  <input
                    type="text"
                    value={request.auth.basicUsername || ''}
                    onChange={(e) =>
                      onChange({
                        ...request,
                        auth: { ...request.auth, basicUsername: e.target.value },
                      })
                    }
                    placeholder="Username or {{username}}"
                    className="h-7 w-full rounded border border-slate-300 px-2 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700 text-[11px]">
                    Password
                  </label>
                  <input
                    type="password"
                    value={request.auth.basicPassword || ''}
                    onChange={(e) =>
                      onChange({
                        ...request,
                        auth: { ...request.auth, basicPassword: e.target.value },
                      })
                    }
                    placeholder="Password"
                    className="h-7 w-full rounded border border-slate-300 px-2 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {request.auth.type === 'apikey' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-700 text-[11px]">
                      Key Name
                    </label>
                    <input
                      type="text"
                      value={request.auth.apiKeyName || ''}
                      onChange={(e) =>
                        onChange({
                          ...request,
                          auth: { ...request.auth, apiKeyName: e.target.value },
                        })
                      }
                      placeholder="X-API-Key"
                      className="h-7 w-full rounded border border-slate-300 px-2 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-700 text-[11px]">
                      Key Value
                    </label>
                    <input
                      type="text"
                      value={request.auth.apiKeyValue || ''}
                      onChange={(e) =>
                        onChange({
                          ...request,
                          auth: { ...request.auth, apiKeyValue: e.target.value },
                        })
                      }
                      placeholder="secret_key_123 or {{api_key}}"
                      className="h-7 w-full rounded border border-slate-300 px-2 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BODY TAB */}
        {activeTab === 'body' && (
          <div className="flex h-full flex-col space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center space-x-2">
                {(['none', 'json', 'raw', 'x-www-form-urlencoded'] as BodyType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      onChange({
                        ...request,
                        body: { ...request.body, type },
                      })
                    }
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium uppercase shadow-subtle ${
                      request.body.type === type
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-surface-50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {request.body.type === 'json' && (
                <button
                  onClick={handleFormatJson}
                  className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
                >
                  <Sparkles className="h-3 w-3 text-blue-600" />
                  <span>Beautify JSON</span>
                </button>
              )}
            </div>

            {request.body.type === 'json' && (
              <div className="flex-1">
                <textarea
                  value={request.body.jsonContent || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      body: { ...request.body, jsonContent: e.target.value },
                    })
                  }
                  placeholder={`{\n  "name": "example",\n  "value": 123\n}`}
                  className="h-64 w-full rounded border border-slate-200 bg-surface-50 p-2.5 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-400 focus:bg-white resize-y"
                  spellCheck={false}
                />
              </div>
            )}

            {request.body.type === 'raw' && (
              <div className="flex-1">
                <textarea
                  value={request.body.rawText || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      body: { ...request.body, rawText: e.target.value },
                    })
                  }
                  placeholder="Raw text payload"
                  className="h-64 w-full rounded border border-slate-200 bg-surface-50 p-2.5 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-400 focus:bg-white resize-y"
                  spellCheck={false}
                />
              </div>
            )}

            {request.body.type === 'none' && (
              <div className="flex flex-1 items-center justify-center text-slate-400 pt-8">
                <span>This request has no body payload attached.</span>
              </div>
            )}
          </div>
        )}

        {/* ASSERTIONS TAB */}
        {activeTab === 'assertions' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <div>
                <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                  Response Assertions & Tests
                </span>
                <p className="text-[10px] text-slate-500">
                  Verify status codes, latency thresholds, headers, or JSON body values.
                </p>
              </div>
              <button
                onClick={handleAddAssertion}
                className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
              >
                <Plus className="h-3 w-3" />
                <span>Add Assertion</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {(request.assertions || []).map((assertion) => (
                <div
                  key={assertion.id}
                  className="flex items-center space-x-2 rounded border border-slate-200 bg-white p-2 shadow-subtle"
                >
                  <input
                    type="checkbox"
                    checked={assertion.enabled}
                    onChange={(e) => handleUpdateAssertion(assertion.id, 'enabled', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 cursor-pointer"
                  />

                  <input
                    type="text"
                    value={assertion.name}
                    onChange={(e) => handleUpdateAssertion(assertion.id, 'name', e.target.value)}
                    placeholder="Assertion Name"
                    className="h-6 w-48 rounded border border-slate-200 px-1.5 text-[11px] text-slate-800 outline-none focus:border-blue-400"
                  />

                  <select
                    value={assertion.type}
                    onChange={(e) => handleUpdateAssertion(assertion.id, 'type', e.target.value)}
                    className="h-6 rounded border border-slate-200 bg-surface-50 px-1.5 text-[10px] text-slate-700 outline-none"
                  >
                    <option value="status_code">Status Code is</option>
                    <option value="response_time">Response Time &lt;= (ms)</option>
                    <option value="json_path">JSON Path expression</option>
                    <option value="header_exists">Header exists</option>
                    <option value="body_contains">Body contains text</option>
                  </select>

                  <input
                    type="text"
                    value={assertion.targetValue}
                    onChange={(e) =>
                      handleUpdateAssertion(assertion.id, 'targetValue', e.target.value)
                    }
                    placeholder="Expected value (e.g. 200, data.id == 1)"
                    className="h-6 flex-1 rounded border border-slate-200 font-mono px-1.5 text-[11px] text-slate-900 outline-none focus:border-blue-400"
                  />

                  <button
                    onClick={() => handleDeleteAssertion(assertion.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {(request.assertions || []).length === 0 && (
                <div className="pt-6 text-center text-slate-400 text-[11px]">
                  No assertions added. Click &quot;Add Assertion&quot; to test your endpoint automatically.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TabButton: React.FC<{
  label: string;
  count?: number;
  badge?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, badge, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-1.5 border-b-2 px-3 py-2 text-[11px] font-medium transition ${
        active
          ? 'border-blue-600 text-blue-700 bg-white'
          : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-slate-200 px-1.5 py-0.2 font-mono text-[9px] font-bold text-slate-700">
          {count}
        </span>
      )}
      {badge && (
        <span className="rounded bg-blue-100 px-1 py-0.2 font-mono text-[9px] font-bold text-blue-800">
          {badge}
        </span>
      )}
    </button>
  );
};
