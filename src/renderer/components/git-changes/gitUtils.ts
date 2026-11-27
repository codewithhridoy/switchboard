export function statusLetter(s: string): string {
  if (s === 'untracked') return '?';
  if (s === 'added') return 'A';
  if (s === 'deleted') return 'D';
  if (s === 'renamed') return 'R';
  return 'M';
}

export function cleanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim();
}
