import { HttpMethod } from '../types';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${Math.round(ms * 1000)} µs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function getMethodBadgeClasses(method: HttpMethod): string {
  switch (method) {
    case 'GET':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'POST':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PUT':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'PATCH':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'DELETE':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'HEAD':
    case 'OPTIONS':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

export function getStatusBadgeClasses(status: number): string {
  if (status >= 200 && status < 300) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status >= 300 && status < 400) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (status >= 400 && status < 500) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (status >= 500) {
    return 'bg-red-100 text-red-800 border-red-300';
  }
  return 'bg-slate-100 text-slate-700 border-slate-300';
}
