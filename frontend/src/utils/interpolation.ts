import { EnvironmentVariable } from '../types';

export function resolveVariables(text: string, variables: EnvironmentVariable[]): string {
  if (!text) return '';
  let resolved = text;

  // Replace dynamic system variables
  resolved = resolved.replace(/\{\{\$timestamp\}\}/g, () => Date.now().toString());
  resolved = resolved.replace(/\{\{\$isoTimestamp\}\}/g, () => new Date().toISOString());
  resolved = resolved.replace(/\{\{\$guid\}\}/g, () => crypto.randomUUID());
  resolved = resolved.replace(/\{\{\$randomInt\}\}/g, () => Math.floor(Math.random() * 10000).toString());

  // Replace user environment variables
  for (const v of variables) {
    if (!v.enabled || !v.key) continue;
    const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, 'g');
    resolved = resolved.replace(regex, v.value);
  }

  return resolved;
}

export function extractVariableNames(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim())));
}
