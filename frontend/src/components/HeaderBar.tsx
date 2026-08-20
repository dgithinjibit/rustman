import React from 'react';
import {
  Server,
  FolderOpen,
  ChevronDown,
  Layers,
  Activity,
  Play,
  Square,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Environment, MockServerState } from '../types';

interface HeaderBarProps {
  workspacePath: string;
  environments: Environment[];
  activeEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  onOpenEnvironmentModal: () => void;
  mockState: MockServerState;
  onToggleMockServer: () => void;
  onOpenCommandPalette: () => void;
  onOpenCodeModal: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  workspacePath,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onOpenEnvironmentModal,
  mockState,
  onToggleMockServer,
  onOpenCommandPalette,
  onOpenCodeModal,
}) => {
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  return (
    <header className="flex h-11 w-full select-none items-center justify-between border-b border-slate-200 bg-surface-50 px-3 text-xs">
      {/* Left Section: Logo & Workspace */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 font-bold tracking-tight text-slate-900">
          <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white font-mono text-[10px] text-slate-800 shadow-sm">
            R
          </div>
          <span className="text-sm font-semibold tracking-tight">RUSTMAN</span>
          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-mono text-slate-500">
            v0.1.0-alpha
          </span>
        </div>

        <div className="h-4 w-px bg-slate-300" />

        <div className="flex items-center space-x-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 shadow-subtle">
          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-mono text-[11px] text-slate-700">{workspacePath}</span>
        </div>
      </div>

      {/* Center Section: Quick Search omnibar trigger */}
      <div className="flex flex-1 max-w-md items-center justify-center px-4">
        <button
          onClick={onOpenCommandPalette}
          className="flex h-7 w-full items-center justify-between rounded border border-slate-200 bg-white px-2.5 text-slate-400 shadow-subtle hover:border-slate-300 hover:text-slate-600"
        >
          <div className="flex items-center space-x-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px]">Search endpoints, collections, variables...</span>
          </div>
          <kbd className="rounded border border-slate-200 bg-surface-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right Section: Environment Selector, Mock Engine, Telemetry Mode */}
      <div className="flex items-center space-x-2">
        {/* Mock Server Controller */}
        <div
          className={`flex items-center space-x-1.5 rounded border px-2 py-1 text-[11px] font-medium shadow-subtle transition-colors ${
            mockState.running
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-surface-100'
          }`}
        >
          <Server className="h-3.5 w-3.5 text-slate-500" />
          <span>Mock Engine:</span>
          <span className="font-mono text-[10px]">{mockState.port}</span>
          <button
            onClick={onToggleMockServer}
            className={`flex items-center space-x-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
              mockState.running
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {mockState.running ? (
              <>
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>Running</span>
              </>
            ) : (
              <>
                <Play className="h-2.5 w-2.5 fill-current" />
                <span>Start</span>
              </>
            )}
          </button>
        </div>

        {/* Environment Selector Dropdown */}
        <div className="flex items-center space-x-1">
          <div className="relative flex items-center rounded border border-slate-200 bg-white shadow-subtle">
            <div className="flex items-center pl-2 pr-1 text-slate-400">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <select
              value={activeEnvironmentId || ''}
              onChange={(e) => onSelectEnvironment(e.target.value || null)}
              className="h-7 cursor-pointer appearance-none bg-transparent py-0 pl-1 pr-6 text-[11px] font-medium text-slate-700 outline-none"
            >
              <option value="">No Environment</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-slate-400" />
          </div>

          <button
            onClick={onOpenEnvironmentModal}
            title="Manage Environments"
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-subtle hover:bg-surface-100"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Engine status indicator */}
        <div className="hidden lg:flex items-center space-x-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 shadow-subtle">
          <Activity className="h-3.5 w-3.5 text-blue-600" />
          <span className="font-mono text-[10px] text-slate-600">Hyper 1.x</span>
        </div>
      </div>
    </header>
  );
};
