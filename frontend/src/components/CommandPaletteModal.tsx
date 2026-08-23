import React, { useState, useEffect } from 'react';
import { Search, Folder, Server, Layers, Play, Code2, ArrowRight } from 'lucide-react';
import { Collection, HttpRequest, Environment, MockRoute } from '../types';
import { getMethodBadgeClasses } from '../utils/formatter';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  onSelectRequest: (req: HttpRequest) => void;
  environments: Environment[];
  onSelectEnvironment: (id: string) => void;
  mockRoutes: MockRoute[];
  onOpenCodeModal: () => void;
  onOpenEnvironmentModal: () => void;
  onSendActiveRequest: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  collections,
  onSelectRequest,
  environments,
  onSelectEnvironment,
  mockRoutes,
  onOpenCodeModal,
  onOpenEnvironmentModal,
  onSendActiveRequest,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Flatten searchable items
  const allRequests: { type: 'request'; item: HttpRequest; collectionName: string }[] = [];
  collections.forEach((c) => {
    c.requests.forEach((r) => {
      allRequests.push({ type: 'request', item: r, collectionName: c.name });
    });
  });

  const filteredRequests = allRequests.filter(
    (r) =>
      r.item.name.toLowerCase().includes(query.toLowerCase()) ||
      r.item.url.toLowerCase().includes(query.toLowerCase())
  );

  const filteredEnvironments = environments.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase())
  );

  const filteredMockRoutes = mockRoutes.filter((m) =>
    m.path.toLowerCase().includes(query.toLowerCase())
  );

  const actions = [
    {
      id: 'send',
      label: 'Execute Active Request',
      action: () => {
        onSendActiveRequest();
        onClose();
      },
    },
    {
      id: 'code',
      label: 'Generate Client Code (Rust / cURL / TS)',
      action: () => {
        onOpenCodeModal();
        onClose();
      },
    },
    {
      id: 'envs',
      label: 'Manage Environments & Variables',
      action: () => {
        onOpenEnvironmentModal();
        onClose();
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/30 backdrop-blur-xs text-xs">
      <div className="flex w-[600px] flex-col rounded-lg border border-slate-300 bg-white shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex h-12 items-center border-b border-slate-200 px-4">
          <Search className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command or search endpoints, collections, environments..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            className="h-full w-full font-medium text-slate-900 text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Results List */}
        <div className="max-h-[360px] overflow-y-auto p-2 space-y-3">
          {/* Requests */}
          {filteredRequests.length > 0 && (
            <div>
              <div className="px-2 pb-1 font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                Requests ({filteredRequests.length})
              </div>
              <div className="space-y-0.5">
                {filteredRequests.map(({ item, collectionName }) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectRequest(item);
                      onClose();
                    }}
                    className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 hover:bg-surface-100 transition"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span
                        className={`rounded border px-1 py-0.2 font-mono text-[9px] font-bold ${getMethodBadgeClasses(
                          item.method
                        )}`}
                      >
                        {item.method}
                      </span>
                      <span className="font-medium text-slate-800 text-[11px] truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono truncate">
                        {item.url}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 pl-2">{collectionName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <div className="px-2 pb-1 font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
              Quick Actions
            </div>
            <div className="space-y-0.5">
              {actions.map((act) => (
                <div
                  key={act.id}
                  onClick={act.action}
                  className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 hover:bg-surface-100 transition text-slate-800"
                >
                  <span className="font-medium text-[11px]">{act.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Environments */}
          {filteredEnvironments.length > 0 && (
            <div>
              <div className="px-2 pb-1 font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                Environments
              </div>
              <div className="space-y-0.5">
                {filteredEnvironments.map((env) => (
                  <div
                    key={env.id}
                    onClick={() => {
                      onSelectEnvironment(env.id);
                      onClose();
                    }}
                    className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 hover:bg-surface-100 transition"
                  >
                    <div className="flex items-center space-x-2">
                      <Layers className="h-3.5 w-3.5 text-blue-600" />
                      <span className="font-medium text-slate-800 text-[11px]">
                        Switch to {env.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {env.variables.length} variables
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
