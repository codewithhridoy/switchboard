import { AccountLimits } from '../../../shared/types';

export const DEFAULT_ACCOUNT_LIMITS: AccountLimits = {
  session5hTokens: 500_000,
  dailyTokens: 2_000_000,
  weeklyTokens: 10_000_000,
  dailyRuns: 100,
  weeklyRuns: 500,
  autoSwitchOnLimit: false,
};

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function getMeterClass(pct: number): string {
  if (pct >= 92) return 'sb-progress danger';
  if (pct >= 72) return 'sb-progress warn';
  return 'sb-progress';
}

export function formatResetTime(until?: number | null): string | null {
  if (!until) return null;
  const diff = until - Date.now();
  if (diff <= 0) return null;
  return `Resets in ${Math.ceil(diff / 60_000)}m (${new Date(until).toLocaleTimeString()})`;
}
