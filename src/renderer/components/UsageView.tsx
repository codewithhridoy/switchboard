import React, { useState } from 'react';
import {
  BarChart3,
  Clock,
  Flame,
  Info,
  RefreshCw,
  Shield,
  Sliders,
  Zap,
} from 'lucide-react';
import {
  AccountLimits,
  AccountProfile,
  AccountUsageSummary,
  SwitchboardState,
} from '../../shared/types';

interface UsageViewProps {
  state: SwitchboardState;
  onRefreshUsage: () => Promise<void>;
  onUpdateAccount: (id: string, patch: Partial<AccountProfile>) => Promise<void>;
}

const DEFAULT_LIMITS: AccountLimits = {
  session5hTokens: 500_000,
  dailyTokens: 2_000_000,
  weeklyTokens: 10_000_000,
  dailyRuns: 100,
  weeklyRuns: 500,
  autoSwitchOnLimit: false,
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getMeterClass(pct: number): string {
  if (pct >= 92) return 'sb-progress danger';
  if (pct >= 72) return 'sb-progress warn';
  return 'sb-progress';
}

function formatResetTime(until?: number | null): string | null {
  if (!until) return null;
  const diff = until - Date.now();
  if (diff <= 0) return null;
  const mins = Math.ceil(diff / 60_000);
  return `Resets in ${mins}m (${new Date(until).toLocaleTimeString()})`;
}

export const UsageView: React.FC<UsageViewProps> = ({
  state,
  onRefreshUsage,
  onUpdateAccount,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLimits, setDraftLimits] = useState<AccountLimits>(DEFAULT_LIMITS);

  const sortedAccounts = [...state.accounts].sort((a, b) => a.priority - b.priority);
  const summaries = state.usageSummaries ?? {};

  // Aggregate totals across all accounts
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
      if (!combined7d[idx]) {
        combined7d[idx] = { ...day };
      } else {
        combined7d[idx].tokens += day.tokens;
        combined7d[idx].runs += day.runs;
      }
    });
  }

  const maxDayTokens = Math.max(1, ...combined7d.map((d) => d.tokens));

  const openEditor = (acc: AccountProfile) => {
    if (editingId === acc.id) {
      setEditingId(null);
      return;
    }
    setDraftLimits({ ...DEFAULT_LIMITS, ...(acc.limits ?? {}) });
    setEditingId(acc.id);
  };

  const saveLimits = async (accId: string) => {
    await onUpdateAccount(accId, {
      limits: {
        session5hTokens: Math.max(10_000, Number(draftLimits.session5hTokens) || 500_000),
        dailyTokens: Math.max(10_000, Number(draftLimits.dailyTokens) || 2_000_000),
        weeklyTokens: Math.max(10_000, Number(draftLimits.weeklyTokens) || 10_000_000),
        dailyRuns: Math.max(1, Number(draftLimits.dailyRuns) || 100),
        weeklyRuns: Math.max(1, Number(draftLimits.weeklyRuns) || 500),
        autoSwitchOnLimit: draftLimits.autoSwitchOnLimit,
      },
    });
    setEditingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ fontSize: 13.5 }}>5-Hour, Daily & Weekly Usage Telemetry</strong>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Combines real local Claude Code JSONL token logs (`~/.claude` & isolated profiles) with Switchboard’s universal execution ledger.
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void onRefreshUsage()}>
          <RefreshCw size={13} />
          Refresh Usage
        </button>
      </div>

      {/* Top KPI Cards */}
      <section className="kpi-grid" aria-label="Usage overview">
        <div className="card kpi-card">
          <div className="kpi-label">
            <Clock size={13} style={{ color: 'var(--accent)' }} />
            5-Hour Window
          </div>
          <div className="kpi-value mono">{formatTokens(total5hTokens)}</div>
          <div className="kpi-sub">{total5hRuns} turns across all accounts</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">
            <Flame size={13} style={{ color: 'var(--warning)' }} />
            Today (Daily)
          </div>
          <div className="kpi-value mono">{formatTokens(totalDailyTokens)}</div>
          <div className="kpi-sub">{totalDailyRuns} turns since midnight</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">
            <BarChart3 size={13} style={{ color: 'var(--success)' }} />
            Last 7 Days (Weekly)
          </div>
          <div className="kpi-value mono">{formatTokens(totalWeeklyTokens)}</div>
          <div className="kpi-sub">{totalWeeklyRuns} total turns this week</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">
            <Zap size={13} style={{ color: 'var(--danger)' }} />
            Limit Hits (7d)
          </div>
          <div className="kpi-value mono">{totalRateLimitHits}</div>
          <div className="kpi-sub">Automatic cooldown & failover triggers</div>
        </div>
      </section>

      {/* 7-Day Activity Bar Chart */}
      {combined7d.length > 0 && (
        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 13 }}>7-Day Combined Token Activity</strong>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Peak day: {formatTokens(maxDayTokens)} tokens
            </span>
          </div>
          <div className="chart-7d" role="img" aria-label="7 day token activity bar chart">
            {combined7d.map((day) => {
              const heightPct = day.tokens > 0 ? Math.max(6, Math.round((day.tokens / maxDayTokens) * 100)) : 0;
              return (
                <div
                  key={day.date}
                  className="chart-bar-col"
                  title={`${day.date}: ${formatTokens(day.tokens)} tokens · ${day.runs} turns`}
                >
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                    {day.tokens > 0 ? formatTokens(day.tokens) : '—'}
                  </span>
                  <div className="chart-bar-track">
                    <div className="chart-bar-fill" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{day.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Per-Account Quotas & Limits */}
      <section>
        <div style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5 }}>Per-Account Quotas & Configurable Budgets</strong>
        </div>

        <div className="grid-2">
          {sortedAccounts.map((acc) => {
            const summary = summaries[acc.id];
            const limits: AccountLimits = { ...DEFAULT_LIMITS, ...(acc.limits ?? {}) };
            const resetMsg = formatResetTime(acc.cooldownUntil);

            const s5h = summary?.session5h ?? { runs: 0, totalTokens: 0, cacheTokens: 0, inputTokens: 0, outputTokens: 0 };
            const sDay = summary?.daily ?? { runs: 0, totalTokens: 0, cacheTokens: 0, inputTokens: 0, outputTokens: 0 };
            const sWeek = summary?.weekly ?? { runs: 0, totalTokens: 0, cacheTokens: 0, inputTokens: 0, outputTokens: 0 };

            const pct5h = Math.min(100, Math.round((s5h.totalTokens / Math.max(1, limits.session5hTokens)) * 100));
            const pctDay = Math.min(100, Math.round((sDay.totalTokens / Math.max(1, limits.dailyTokens)) * 100));
            const pctWeek = Math.min(100, Math.round((sWeek.totalTokens / Math.max(1, limits.weeklyTokens)) * 100));

            const isEditing = editingId === acc.id;

            return (
              <article key={acc.id} className="card account-card">
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

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => openEditor(acc)}
                  >
                    <Sliders size={12} />
                    {isEditing ? 'Close' : 'Set Limits'}
                  </button>
                </div>

                {/* 5-Hour Session Window Meter */}
                <div className="quota-meter-row">
                  <div className="quota-meter-head">
                    <span id={`m5h-${acc.id}`} style={{ fontWeight: 600 }}>
                      5-Hour Window
                    </span>
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatTokens(s5h.totalTokens)} / {formatTokens(limits.session5hTokens)} ({pct5h}%) · {s5h.runs} runs
                    </span>
                  </div>
                  <progress
                    className={getMeterClass(pct5h)}
                    value={Math.min(s5h.totalTokens, limits.session5hTokens)}
                    max={limits.session5hTokens}
                    aria-labelledby={`m5h-${acc.id}`}
                  />
                </div>

                {/* Daily Limit Meter */}
                <div className="quota-meter-row">
                  <div className="quota-meter-head">
                    <span id={`mday-${acc.id}`} style={{ fontWeight: 600 }}>
                      Daily Limit (Today)
                    </span>
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatTokens(sDay.totalTokens)} / {formatTokens(limits.dailyTokens)} ({pctDay}%) · {sDay.runs}/{limits.dailyRuns} runs
                    </span>
                  </div>
                  <progress
                    className={getMeterClass(pctDay)}
                    value={Math.min(sDay.totalTokens, limits.dailyTokens)}
                    max={limits.dailyTokens}
                    aria-labelledby={`mday-${acc.id}`}
                  />
                </div>

                {/* Weekly Limit Meter */}
                <div className="quota-meter-row">
                  <div className="quota-meter-head">
                    <span id={`mweek-${acc.id}`} style={{ fontWeight: 600 }}>
                      Weekly Limit (7 Days)
                    </span>
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatTokens(sWeek.totalTokens)} / {formatTokens(limits.weeklyTokens)} ({pctWeek}%) · {sWeek.runs}/{limits.weeklyRuns} runs
                    </span>
                  </div>
                  <progress
                    className={getMeterClass(pctWeek)}
                    value={Math.min(sWeek.totalTokens, limits.weeklyTokens)}
                    max={limits.weeklyTokens}
                    aria-labelledby={`mweek-${acc.id}`}
                  />
                </div>

                {/* Extra stats: Cache tokens + Models used */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
                  {sWeek.cacheTokens > 0 && (
                    <span className="pill mono">
                      Cache read (7d): {formatTokens(sWeek.cacheTokens)}
                    </span>
                  )}
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

                {/* Inline Budget Editor */}
                {isEditing && (
                  <div className="account-meta-box" style={{ gap: 10 }}>
                    <div className="field-row-2">
                      <div className="field">
                        <label htmlFor={`lim-5h-${acc.id}`}>5h Token Cap</label>
                        <input
                          id={`lim-5h-${acc.id}`}
                          type="number"
                          step={50000}
                          className="input-field mono"
                          value={draftLimits.session5hTokens}
                          onChange={(e) =>
                            setDraftLimits((d) => ({ ...d, session5hTokens: Number(e.target.value) }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`lim-day-${acc.id}`}>Daily Token Cap</label>
                        <input
                          id={`lim-day-${acc.id}`}
                          type="number"
                          step={100000}
                          className="input-field mono"
                          value={draftLimits.dailyTokens}
                          onChange={(e) =>
                            setDraftLimits((d) => ({ ...d, dailyTokens: Number(e.target.value) }))
                          }
                        />
                      </div>
                    </div>

                    <div className="field-row-2">
                      <div className="field">
                        <label htmlFor={`lim-week-${acc.id}`}>Weekly Token Cap</label>
                        <input
                          id={`lim-week-${acc.id}`}
                          type="number"
                          step={500000}
                          className="input-field mono"
                          value={draftLimits.weeklyTokens}
                          onChange={(e) =>
                            setDraftLimits((d) => ({ ...d, weeklyTokens: Number(e.target.value) }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`lim-runs-${acc.id}`}>Daily Run Cap</label>
                        <input
                          id={`lim-runs-${acc.id}`}
                          type="number"
                          step={10}
                          className="input-field mono"
                          value={draftLimits.dailyRuns}
                          onChange={(e) =>
                            setDraftLimits((d) => ({ ...d, dailyRuns: Number(e.target.value) }))
                          }
                        />
                      </div>
                    </div>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={draftLimits.autoSwitchOnLimit}
                        onChange={(e) =>
                          setDraftLimits((d) => ({ ...d, autoSwitchOnLimit: e.target.checked }))
                        }
                      />
                      <Shield size={13} />
                      Proactively switch to next account when any cap hits 100%
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void saveLimits(acc.id)}
                      >
                        Save Limits
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>How Limits Are Measured:</strong>{' '}
          Anthropic and Google do not expose exact server-side subscription quota percentages over official CLIs. For Claude accounts, Switchboard reads real token counts directly from your local Claude Code JSONL transcripts (including terminal sessions outside Switchboard). For Google AI Pro (`agy`), Codex, and APIs, Switchboard tracks every run in its local ledger and automatically detects real provider rate-limit responses (`429`, `usage limit reached`) to start live cooldown timers.
        </div>
      </div>
    </div>
  );
};
