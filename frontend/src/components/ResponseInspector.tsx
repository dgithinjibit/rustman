import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  GitCompare,
  Pin,
  RefreshCw,
} from 'lucide-react';
import { HttpResponse, TelemetryBreakdown, AssertionResult } from '../types';
import { getStatusBadgeClasses, formatDuration, formatBytes } from '../utils/formatter';

interface ResponseInspectorProps {
  response: HttpResponse | null;
  previousResponse: HttpResponse | null;
  isLoading: boolean;
  onPinBaseline?: () => void;
}

type ResponseTab = 'pretty' | 'raw' | 'headers' | 'telemetry' | 'tests' | 'diff';

export const ResponseInspector: React.FC<ResponseInspectorProps> = ({
  response,
  previousResponse,
  isLoading,
  onPinBaseline,
}) => {
  const [activeTab, setActiveTab] = useState<ResponseTab>('pretty');
  const [copied, setCopied] = useState(false);
  const [filterText, setFilterText] = useState('');

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center border-l border-slate-200 bg-white text-slate-500">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mb-2" />
        <span className="font-mono text-[11px]">Executing request via Hyper client...</span>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center border-l border-slate-200 bg-white text-slate-400 p-8 text-center">
        <Activity className="h-10 w-10 stroke-1 text-slate-300 mb-3" />
        <span className="font-semibold text-slate-700 text-sm mb-1">No Response Yet</span>
        <p className="max-w-xs text-[11px] text-slate-500">
          Enter an endpoint URL above and click &quot;Send&quot; (or press Ctrl+Enter) to execute the request.
        </p>
      </div>
    );
  }

  const handleCopyBody = () => {
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([response.body], {
      type: response.isJson ? 'application/json' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${Date.now()}.${response.isJson ? 'json' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const headersList = Object.entries(response.headers);
  const passedAssertions = response.assertionResults.filter((a) => a.passed).length;
  const totalAssertions = response.assertionResults.length;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden border-l border-slate-200 bg-white text-xs">
      {/* 1. Status & Metrics Header */}
      <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-surface-50 px-3">
        {/* Status code and timing badges */}
        <div className="flex items-center space-x-2">
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold shadow-subtle ${getStatusBadgeClasses(
              response.status
            )}`}
          >
            {response.status} {response.statusText}
          </span>

          <div className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700 shadow-subtle">
            <Clock className="h-3 w-3 text-slate-400" />
            <span className="font-mono text-[10px] font-semibold">
              {formatDuration(response.durationMs)}
            </span>
          </div>

          <div className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700 shadow-subtle">
            <HardDrive className="h-3 w-3 text-slate-400" />
            <span className="font-mono text-[10px] font-semibold">
              {formatBytes(response.sizeBytes)}
            </span>
          </div>

          {totalAssertions > 0 && (
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                passedAssertions === totalAssertions
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {passedAssertions}/{totalAssertions} Tests Passed
            </span>
          )}
        </div>

        {/* Action triggers: Copy, Download */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleCopyBody}
            title="Copy Response Body"
            className="flex items-center space-x-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            title="Download Response File"
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 shadow-subtle hover:bg-surface-100"
          >
            <Download className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 2. Response Inspector Tabs */}
      <div className="flex border-b border-slate-200 bg-surface-50 px-3">
        <TabButton
          label="Pretty"
          active={activeTab === 'pretty'}
          onClick={() => setActiveTab('pretty')}
        />
        <TabButton
          label="Raw"
          active={activeTab === 'raw'}
          onClick={() => setActiveTab('raw')}
        />
        <TabButton
          label="Headers"
          count={headersList.length}
          active={activeTab === 'headers'}
          onClick={() => setActiveTab('headers')}
        />
        <TabButton
          label="Telemetry & Waterfall"
          active={activeTab === 'telemetry'}
          onClick={() => setActiveTab('telemetry')}
        />
        <TabButton
          label="Test Results"
          count={totalAssertions}
          active={activeTab === 'tests'}
          onClick={() => setActiveTab('tests')}
        />
        <TabButton
          label="Diff"
          active={activeTab === 'diff'}
          onClick={() => setActiveTab('diff')}
        />
      </div>

      {/* 3. Panel Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* PRETTY TAB */}
        {activeTab === 'pretty' && (
          <div className="flex h-full flex-col">
            {/* Quick search inside JSON */}
            <div className="mb-2 flex items-center justify-between">
              <div className="relative flex items-center w-64">
                <Search className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Find in response..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-6 w-full rounded border border-slate-200 bg-white pl-7 pr-2 font-mono text-[10px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400"
                />
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {response.body.split('\n').length} lines
              </span>
            </div>

            <div className="flex-1 overflow-auto rounded border border-slate-200 bg-surface-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 shadow-subtle">
              <FormattedJsonView jsonString={response.body} search={filterText} />
            </div>
          </div>
        )}

        {/* RAW TAB */}
        {activeTab === 'raw' && (
          <pre className="h-full overflow-auto rounded border border-slate-200 bg-surface-50 p-3 font-mono text-[11px] text-slate-800 whitespace-pre-wrap">
            {response.body}
          </pre>
        )}

        {/* HEADERS TAB */}
        {activeTab === 'headers' && (
          <div className="space-y-2">
            <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
              Response Headers ({headersList.length})
            </span>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                  <th className="pb-1.5 pl-2">Header</th>
                  <th className="pb-1.5 pl-2">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {headersList.map(([key, val]) => (
                  <tr key={key} className="hover:bg-surface-50">
                    <td className="py-1.5 pl-2 font-semibold text-slate-900">{key}</td>
                    <td className="py-1.5 pl-2 text-slate-700 break-all select-all">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TELEMETRY & WATERFALL TAB */}
        {activeTab === 'telemetry' && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Network Lifecycle Telemetry
              </span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Zero-copy connection and socket timings captured by the native Hyper engine.
              </p>
            </div>

            <div className="space-y-2.5 rounded border border-slate-200 bg-surface-50 p-3.5">
              <TimingRow
                label="DNS Lookup"
                duration={response.telemetry.dnsMs}
                total={response.telemetry.totalMs}
                color="bg-sky-500"
              />
              <TimingRow
                label="TCP Handshake"
                duration={response.telemetry.tcpMs}
                total={response.telemetry.totalMs}
                color="bg-indigo-500"
              />
              {response.telemetry.tlsMs > 0 && (
                <TimingRow
                  label="TLS Negotiation"
                  duration={response.telemetry.tlsMs}
                  total={response.telemetry.totalMs}
                  color="bg-purple-500"
                />
              )}
              <TimingRow
                label="Time to First Byte (TTFB)"
                duration={response.telemetry.ttfbMs}
                total={response.telemetry.totalMs}
                color="bg-emerald-500"
              />
              <TimingRow
                label="Content Download"
                duration={response.telemetry.downloadMs}
                total={response.telemetry.totalMs}
                color="bg-amber-500"
              />
            </div>

            {/* Performance Summary Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded border border-slate-200 bg-white p-2.5">
                <span className="text-[10px] font-medium text-slate-500">Total Latency</span>
                <div className="font-mono text-sm font-bold text-slate-900">
                  {formatDuration(response.durationMs)}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2.5">
                <span className="text-[10px] font-medium text-slate-500">Payload Size</span>
                <div className="font-mono text-sm font-bold text-slate-900">
                  {formatBytes(response.sizeBytes)}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2.5">
                <span className="text-[10px] font-medium text-slate-500">Memory Allocation</span>
                <div className="font-mono text-sm font-bold text-emerald-700">
                  Zero-Copy (&lt; 2 KB)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TEST RESULTS TAB */}
        {activeTab === 'tests' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Assertion Evaluation ({passedAssertions}/{totalAssertions} Passed)
              </span>
            </div>

            <div className="space-y-1.5">
              {response.assertionResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-start space-x-2.5 rounded border p-2.5 shadow-subtle ${
                    result.passed
                      ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900'
                      : 'border-rose-200 bg-rose-50/40 text-rose-900'
                  }`}
                >
                  {result.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold text-[11px]">{result.name}</div>
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                      {result.message}
                    </div>
                  </div>
                </div>
              ))}

              {totalAssertions === 0 && (
                <div className="text-center text-slate-400 pt-8 text-[11px]">
                  No assertions were configured for this request.
                </div>
              )}
            </div>
          </div>
        )}

        {/* DIFF TAB */}
        {activeTab === 'diff' && (
          <div className="flex h-full flex-col space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                Response Diff (Current vs Previous Execution)
              </span>
            </div>

            {previousResponse ? (
              <div className="grid grid-cols-2 gap-3 h-full overflow-hidden font-mono text-[10px]">
                <div className="flex flex-col rounded border border-slate-200 bg-surface-50 p-2 overflow-auto">
                  <span className="font-bold text-slate-500 pb-1 border-b border-slate-200 mb-2">
                    Previous ({previousResponse.timestamp})
                  </span>
                  <pre className="whitespace-pre-wrap">{previousResponse.body}</pre>
                </div>
                <div className="flex flex-col rounded border border-blue-200 bg-blue-50/30 p-2 overflow-auto">
                  <span className="font-bold text-blue-700 pb-1 border-b border-blue-200 mb-2">
                    Current ({response.timestamp})
                  </span>
                  <pre className="whitespace-pre-wrap">{response.body}</pre>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 pt-8 text-[11px]">
                Send this request again to see an automated side-by-side response diff.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TabButton: React.FC<{
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => {
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
    </button>
  );
};

const TimingRow: React.FC<{
  label: string;
  duration: number;
  total: number;
  color: string;
}> = ({ label, duration, total, color }) => {
  const percentage = Math.min(100, Math.max(3, (duration / (total || 1)) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono text-slate-600">{formatDuration(duration)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const FormattedJsonView: React.FC<{ jsonString: string; search: string }> = ({
  jsonString,
  search,
}) => {
  try {
    const parsed = JSON.parse(jsonString);
    const pretty = JSON.stringify(parsed, null, 2);

    return (
      <pre className="whitespace-pre-wrap break-words">
        {pretty.split('\n').map((line, idx) => {
          const isMatched = search && line.toLowerCase().includes(search.toLowerCase());
          return (
            <div
              key={idx}
              className={`flex ${isMatched ? 'bg-amber-100 font-semibold' : ''}`}
            >
              <span className="w-8 select-none text-slate-300 text-right pr-3">{idx + 1}</span>
              <span className="flex-1">{line}</span>
            </div>
          );
        })}
      </pre>
    );
  } catch {
    return <pre className="whitespace-pre-wrap">{jsonString}</pre>;
  }
};
