import React, { useState } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, Layers, Check } from 'lucide-react';
import { Environment, EnvironmentVariable } from '../types';

interface EnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  environments: Environment[];
  onSaveEnvironments: (environments: Environment[]) => void;
  activeEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  isOpen,
  onClose,
  environments,
  onSaveEnvironments,
  activeEnvironmentId,
  onSelectEnvironment,
}) => {
  const [localEnvs, setLocalEnvs] = useState<Environment[]>(environments);
  const [selectedEnvId, setSelectedEnvId] = useState<string>(
    activeEnvironmentId || (environments[0]?.id ?? '')
  );
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const currentEnv = localEnvs.find((e) => e.id === selectedEnvId);

  const handleAddEnvironment = () => {
    const newEnv: Environment = {
      id: crypto.randomUUID(),
      name: `Environment ${localEnvs.length + 1}`,
      variables: [
        {
          id: crypto.randomUUID(),
          key: 'base_url',
          value: 'http://127.0.0.1:4000',
          isSecret: false,
          enabled: true,
        },
      ],
    };
    const updated = [...localEnvs, newEnv];
    setLocalEnvs(updated);
    setSelectedEnvId(newEnv.id);
    onSaveEnvironments(updated);
  };

  const handleDeleteEnvironment = (id: string) => {
    const updated = localEnvs.filter((e) => e.id !== id);
    setLocalEnvs(updated);
    if (selectedEnvId === id) {
      setSelectedEnvId(updated[0]?.id || '');
    }
    if (activeEnvironmentId === id) {
      onSelectEnvironment(updated[0]?.id || null);
    }
    onSaveEnvironments(updated);
  };

  const handleUpdateEnvName = (name: string) => {
    if (!currentEnv) return;
    const updated = localEnvs.map((e) => (e.id === currentEnv.id ? { ...e, name } : e));
    setLocalEnvs(updated);
    onSaveEnvironments(updated);
  };

  const handleAddVariable = () => {
    if (!currentEnv) return;
    const newVar: EnvironmentVariable = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
      isSecret: false,
      enabled: true,
    };
    const updated = localEnvs.map((e) =>
      e.id === currentEnv.id ? { ...e, variables: [...e.variables, newVar] } : e
    );
    setLocalEnvs(updated);
    onSaveEnvironments(updated);
  };

  const handleUpdateVariable = (varId: string, field: keyof EnvironmentVariable, val: any) => {
    if (!currentEnv) return;
    const updatedVars = currentEnv.variables.map((v) =>
      v.id === varId ? { ...v, [field]: val } : v
    );
    const updated = localEnvs.map((e) =>
      e.id === currentEnv.id ? { ...e, variables: updatedVars } : e
    );
    setLocalEnvs(updated);
    onSaveEnvironments(updated);
  };

  const handleDeleteVariable = (varId: string) => {
    if (!currentEnv) return;
    const updatedVars = currentEnv.variables.filter((v) => v.id !== varId);
    const updated = localEnvs.map((e) =>
      e.id === currentEnv.id ? { ...e, variables: updatedVars } : e
    );
    setLocalEnvs(updated);
    onSaveEnvironments(updated);
  };

  const toggleSecret = (varId: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [varId]: !prev[varId] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs text-xs">
      <div className="flex h-[520px] w-[800px] flex-col rounded-lg border border-slate-300 bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex h-11 items-center justify-between border-b border-slate-200 bg-surface-50 px-4">
          <div className="flex items-center space-x-2 font-semibold text-slate-800 text-sm">
            <Layers className="h-4 w-4 text-blue-600" />
            <span>Manage Environments & Variables</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Environments List Sidebar */}
          <div className="w-56 border-r border-slate-200 bg-surface-50 p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2">
                <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                  Environments
                </span>
                <button
                  onClick={handleAddEnvironment}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[380px]">
                {localEnvs.map((env) => (
                  <div
                    key={env.id}
                    onClick={() => setSelectedEnvId(env.id)}
                    className={`flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 transition ${
                      selectedEnvId === env.id
                        ? 'bg-blue-50 text-blue-900 font-semibold'
                        : 'text-slate-700 hover:bg-surface-200'
                    }`}
                  >
                    <span className="truncate text-[11px]">{env.name}</span>
                    <div className="flex items-center space-x-1">
                      {activeEnvironmentId === env.id && (
                        <span className="rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-bold text-emerald-800">
                          Active
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEnvironment(env.id);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleAddEnvironment}
              className="flex items-center justify-center space-x-1 rounded border border-slate-300 bg-white py-1.5 text-[11px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Environment</span>
            </button>
          </div>

          {/* Variables Table */}
          <div className="flex flex-1 flex-col p-4 overflow-hidden">
            {currentEnv ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={currentEnv.name}
                      onChange={(e) => handleUpdateEnvName(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-900 text-sm outline-none focus:border-blue-500"
                    />
                    {activeEnvironmentId !== currentEnv.id && (
                      <button
                        onClick={() => onSelectEnvironment(currentEnv.id)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
                      >
                        Set as Active
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleAddVariable}
                    className="flex items-center space-x-1 rounded border border-blue-600 bg-blue-600 px-3 py-1 font-medium text-white shadow-subtle hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Variable</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pt-3">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                        <th className="w-8 pb-1.5 pl-1 text-center">Active</th>
                        <th className="pb-1.5 pl-2">Variable Key</th>
                        <th className="pb-1.5 pl-2">Value</th>
                        <th className="w-16 pb-1.5 text-center">Secret</th>
                        <th className="w-8 pb-1.5 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {currentEnv.variables.map((v) => {
                        const isRevealed = revealedSecrets[v.id];
                        return (
                          <tr key={v.id} className="hover:bg-surface-50">
                            <td className="py-1 text-center">
                              <input
                                type="checkbox"
                                checked={v.enabled}
                                onChange={(e) =>
                                  handleUpdateVariable(v.id, 'enabled', e.target.checked)
                                }
                                className="rounded border-slate-300 text-blue-600 cursor-pointer"
                              />
                            </td>
                            <td className="py-1 pl-2">
                              <input
                                type="text"
                                value={v.key}
                                onChange={(e) => handleUpdateVariable(v.id, 'key', e.target.value)}
                                placeholder="KEY_NAME"
                                className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 text-slate-900 font-semibold outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                              />
                            </td>
                            <td className="py-1 pl-2">
                              <div className="flex items-center space-x-1">
                                <input
                                  type={v.isSecret && !isRevealed ? 'password' : 'text'}
                                  value={v.value}
                                  onChange={(e) =>
                                    handleUpdateVariable(v.id, 'value', e.target.value)
                                  }
                                  placeholder="Variable value"
                                  className="h-6 flex-1 rounded border border-transparent bg-transparent px-1.5 text-slate-700 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                                />
                                {v.isSecret && (
                                  <button
                                    onClick={() => toggleSecret(v.id)}
                                    className="p-1 text-slate-400 hover:text-slate-700"
                                  >
                                    {isRevealed ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-1 text-center">
                              <input
                                type="checkbox"
                                checked={v.isSecret}
                                onChange={(e) =>
                                  handleUpdateVariable(v.id, 'isSecret', e.target.checked)
                                }
                                className="rounded border-slate-300 text-purple-600 cursor-pointer"
                              />
                            </td>
                            <td className="py-1 text-center">
                              <button
                                onClick={() => handleDeleteVariable(v.id)}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                <span>Select or create an environment on the left to configure variables.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
