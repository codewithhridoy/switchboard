import React, { useState } from 'react';
import { Sliders } from 'lucide-react';
import { AccountLimits, AccountProfile, AccountUsageSummary } from '../../../shared/types';
import { AccountLimitsEditor } from './AccountLimitsEditor';
import {
  DEFAULT_ACCOUNT_LIMITS,
  formatResetTime,
  formatTokens,
  getMeterClass,
} from './usageFormat';

interface AccountUsageCardProps {
  account: AccountProfile;
  summary?: AccountUsageSummary;
  onSaveLimits: (id: string, limits: AccountLimits) => Promise<void>;
}

const EMPTY_BUCKET = { runs: 0, totalTokens: 0, cacheTokens: 0, inputTokens: 0, outputTokens: 0 };

export const AccountUsageCard: React.FC<AccountUsageCardProps> = ({
  account: acc,
  summary,
  onSaveLimits,
}) => {
  const [editing, setEditing] = useState(false);
  const limits: AccountLimits = { ...DEFAULT_ACCOUNT_LIMITS, ...(acc.limits ?? {}) };
  const resetMsg = formatResetTime(acc.cooldownUntil);

  const s5h = summary?.session5h ?? EMPTY_BUCKET;
  const sDay = summary?.daily ?? EMPTY_BUCKET;
  const sWeek = summary?.weekly ?? EMPTY_BUCKET;

  const pct5h = Math.min(100, Math.round((s5h.totalTokens / Math.max(1, limits.session5hTokens)) * 100));
  const pctDay = Math.min(100, Math.round((sDay.totalTokens / Math.max(1, limits.dailyTokens)) * 100));
  const pctWeek = Math.min(100, Math.round((sWeek.totalTokens / Math.max(1, limits.weeklyTokens)) * 100));

  return (
    <article className="card account-card">
      <div className="account-card-top">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14.5 }}>{acc.name}</strong>
            <span className="pill mono">{acc.model}</span>
            {summary?.dataSource === 'claude-local+switchboard' && (
              <span className="pill pill-accent">Live Claude Logs</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
            {resetMsg ? (
              <span style={{ color: 'var(--warning)' }}>Cooldown · {resetMsg}</span>
            ) : limits.autoSwitchOnLimit ? (
              <span style={{ color: 'var(--success)' }}>Proactive budget switch enabled</span>
            ) : (
              'Auto-failover on provider rate limit'
            )}
          </div>
        </div>

        <button type="button" className="btn btn-sm" onClick={() => setEditing((v) => !v)}>
          <Sliders size={12} />
          {editing ? 'Close' : 'Set Limits'}
        </button>
      </div>

      <div className="quota-meter-row">
        <div className="quota-meter-head">
          <span id={`m5h-${acc.id}`} style={{ fontWeight: 600 }}>5-Hour Window</span>
          <span className="mono" style={{ color: 'var(--text-secondary)' }}>
            {formatTokens(s5h.totalTokens)} / {formatTokens(limits.session5hTokens)} ({pct5h}%) · {s5h.runs} runs
          </span>
        </div>
        <progress className={getMeterClass(pct5h)} value={Math.min(s5h.totalTokens, limits.session5hTokens)} max={limits.session5hTokens} aria-labelledby={`m5h-${acc.id}`} />
      </div>

      <div className="quota-meter-row">
        <div className="quota-meter-head">
          <span id={`mday-${acc.id}`} style={{ fontWeight: 600 }}>Daily Limit (Today)</span>
          <span className="mono" style={{ color: 'var(--text-secondary)' }}>
            {formatTokens(sDay.totalTokens)} / {formatTokens(limits.dailyTokens)} ({pctDay}%) · {sDay.runs}/{limits.dailyRuns} runs
          </span>
        </div>
        <progress className={getMeterClass(pctDay)} value={Math.min(sDay.totalTokens, limits.dailyTokens)} max={limits.dailyTokens} aria-labelledby={`mday-${acc.id}`} />
      </div>

      <div className="quota-meter-row">
        <div className="quota-meter-head">
          <span id={`mweek-${acc.id}`} style={{ fontWeight: 600 }}>Weekly Limit (7 Days)</span>
          <span className="mono" style={{ color: 'var(--text-secondary)' }}>
            {formatTokens(sWeek.totalTokens)} / {formatTokens(limits.weeklyTokens)} ({pctWeek}%) · {sWeek.runs}/{limits.weeklyRuns} runs
          </span>
        </div>
        <progress className={getMeterClass(pctWeek)} value={Math.min(sWeek.totalTokens, limits.weeklyTokens)} max={limits.weeklyTokens} aria-labelledby={`mweek-${acc.id}`} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
        {sWeek.cacheTokens > 0 && <span className="pill mono">Cache read (7d): {formatTokens(sWeek.cacheTokens)}</span>}
        {(summary?.byModel ?? []).slice(0, 3).map((m) => (
          <span key={m.model} className="pill mono">
            {m.model}: {formatTokens(m.tokens)} ({m.runs})
          </span>
        ))}
        {(summary?.rateLimitHits7d ?? 0) > 0 && (
          <span className="pill pill-warning">
            {summary!.rateLimitHits7d} limit hit{summary!.rateLimitHits7d > 1 ? 's' : ''} (7d)
          </span>
        )}
      </div>

      {editing && (
        <AccountLimitsEditor
          accountId={acc.id}
          initialLimits={limits}
          onCancel={() => setEditing(false)}
          onSave={async (next) => {
            await onSaveLimits(acc.id, next);
            setEditing(false);
          }}
        />
      )}
    </article>
  );
};
