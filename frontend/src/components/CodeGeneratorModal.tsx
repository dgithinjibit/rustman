import React, { useState } from 'react';
import { X, Copy, Check, Code2, Terminal } from 'lucide-react';
import { HttpRequest, EnvironmentVariable } from '../types';
import {
  generateCurl,
  generateRustHyper,
  generateRustReqwest,
  generateTypeScriptFetch,
  generatePython,
} from '../utils/codegen';

interface CodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: HttpRequest;
  environmentVariables: EnvironmentVariable[];
}

type CodeLanguage = 'hyper' | 'reqwest' | 'curl' | 'ts' | 'python';

export const CodeGeneratorModal: React.FC<CodeGeneratorModalProps> = ({
  isOpen,
  onClose,
  request,
  environmentVariables,
}) => {
  const [lang, setLang] = useState<CodeLanguage>('hyper');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  let code = '';
  switch (lang) {
    case 'hyper':
      code = generateRustHyper(request, environmentVariables);
      break;
    case 'reqwest':
      code = generateRustReqwest(request, environmentVariables);
      break;
    case 'curl':
      code = generateCurl(request, environmentVariables);
      break;
    case 'ts':
      code = generateTypeScriptFetch(request, environmentVariables);
      break;
    case 'python':
      code = generatePython(request, environmentVariables);
      break;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs text-xs">
      <div className="flex h-[560px] w-[850px] flex-col rounded-lg border border-slate-300 bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex h-11 items-center justify-between border-b border-slate-200 bg-surface-50 px-4">
          <div className="flex items-center space-x-2 font-semibold text-slate-800 text-sm">
            <Code2 className="h-4 w-4 text-blue-600" />
            <span>Generate Client Code</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Language Tabs & Copy Action */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-surface-50 px-4 py-1.5">
          <div className="flex items-center space-x-1.5">
            <LanguageTab
              label="Rust (Hyper 1.x)"
              active={lang === 'hyper'}
              onClick={() => setLang('hyper')}
            />
            <LanguageTab
              label="Rust (Reqwest)"
              active={lang === 'reqwest'}
              onClick={() => setLang('reqwest')}
            />
            <LanguageTab
              label="cURL"
              active={lang === 'curl'}
              onClick={() => setLang('curl')}
            />
            <LanguageTab
              label="TypeScript (Fetch)"
              active={lang === 'ts'}
              onClick={() => setLang('ts')}
            />
            <LanguageTab
              label="Python"
              active={lang === 'python'}
              onClick={() => setLang('python')}
            />
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 rounded border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 shadow-subtle hover:bg-surface-100"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>

        {/* Code Content View */}
        <div className="flex-1 overflow-auto bg-surface-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
          <pre className="whitespace-pre-wrap select-all">{code}</pre>
        </div>
      </div>
    </div>
  );
};

const LanguageTab: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2.5 py-1 text-[11px] font-medium transition shadow-subtle ${
        active
          ? 'border-blue-600 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-surface-100'
      }`}
    >
      {label}
    </button>
  );
};
