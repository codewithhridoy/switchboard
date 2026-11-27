import React from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { AccountProfile, AccountUsageSummary, SwitchboardState } from '../../shared/types';
import { AccountUsageCard } from './usage/AccountUsageCard';
import { UsageOverviewCards } from './usage/UsageOverviewCards';

interface UsageViewProps {
  state: SwitchboardState;
  onRefreshUsage: () => Promise<void>;
  onUpdateAccount: (id: string, patch: Partial<AccountProfile>) => Promise<void>;
}

export const UsageView: React.FC<UsageViewProps> = ({
  state,
  onRefreshUsage,
  onUpdateAccount,
}) => {
  const sortedAccounts = [...state.accounts].sort((a, b) => a.priority - b.priority);
  const summaries = state.usageSummaries ?? {};

  let total5hTokens = 0;
  let total5hRuns = 0;
  let totalDailyTokens = 0;
  let totalDailyRuns = 0;
  let totalWeeklyTokens = 0;
  let totalWeeklyRuns = 0;
  let totalRateLimitHits = 0;
  const combined7d: Array<{ date: string; label: string; tokens: number; runs: number }> = [];

  for (const acc of sortedAccounts) {
    const s: AccountUsageSummary | undefined = summaries[acc.id];
    if (!s) continue;
    total5hTokens += s.session5h.totalTokens;
    total5hRuns += s.session5h.runs;
    totalDailyTokens += s.daily.totalTokens;
    totalDailyRuns += s.daily.runs;
    totalWeeklyTokens += s.weekly.totalTokens;
    totalWeeklyRuns += s.weekly.runs;
    totalRateLimitHits += s.rateLimitHits7d;

    s.dailySeries.forEach((day, idx) => {
      if (!combined7d[idx]) combined7d[idx] = { ...day };
      else {
        combined7d[idx].tokens += day.tokens;
        combined7d[idx].runs += day.runs;
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 13.5 }}>5-Hour, Daily &amp; Weekly Usage Telemetry</strong>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Combines real local Claude Code JSONL token logs (`~/.claude` &amp; isolated profiles)
            with Switchboard’s universal execution ledger.
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void onRefreshUsage()}>
          <RefreshCw size={13} /> Refresh Usage
        </button>
      </div>

      <UsageOverviewCards
        total5hTokens={total5hTokens}
        total5hRuns={total5hRuns}
        totalDailyTokens={totalDailyTokens}
        totalDailyRuns={totalDailyRuns}
        totalWeeklyTokens={totalWeeklyTokens}
        totalWeeklyRuns={totalWeeklyRuns}
        totalRateLimitHits={totalRateLimitHits}
        combined7d={combined7d}
      />

      <section>
        <div style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5 }}>Per-Account Quotas &amp; Configurable Budgets</strong>
        </div>
        <div className="grid-2">
          {sortedAccounts.map((acc) => (
            <AccountUsageCard
              key={acc.id}
              account={acc}
              summary={summaries[acc.id]}
              onSaveLimits={(id, limits) => onUpdateAccount(id, { limits })}
            />
          ))}
        </div>
      </section>

      <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>How Limits Are Measured:</strong>{' '}
          Anthropic and Google do not expose exact server-side subscription quota percentages over
          official CLIs. For Claude accounts, Switchboard reads real token counts directly from your
          local Claude Code JSONL transcripts (including terminal sessions outside Switchboard). For
          Google AI Pro (`agy`), Codex, and APIs, Switchboard tracks every run in its local ledger
          and automatically detects real provider rate-limit responses (`429`, `usage limit reached`)
          to start live cooldown timers.
        </div>
      </div>
    </div>
  );
};
