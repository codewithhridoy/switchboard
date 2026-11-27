import React from 'react';
import { BarChart3, Clock, Flame, Zap } from 'lucide-react';
import { formatTokens } from './usageFormat';

interface UsageOverviewCardsProps {
  total5hTokens: number;
  total5hRuns: number;
  totalDailyTokens: number;
  totalDailyRuns: number;
  totalWeeklyTokens: number;
  totalWeeklyRuns: number;
  totalRateLimitHits: number;
  combined7d: Array<{ date: string; label: string; tokens: number; runs: number }>;
}

export const UsageOverviewCards: React.FC<UsageOverviewCardsProps> = ({
  total5hTokens,
  total5hRuns,
  totalDailyTokens,
  totalDailyRuns,
  totalWeeklyTokens,
  totalWeeklyRuns,
  totalRateLimitHits,
  combined7d,
}) => {
  const maxDayTokens = Math.max(1, ...combined7d.map((d) => d.tokens));

  return (
    <>
      <section className="kpi-grid" aria-label="Usage overview">
        <div className="card kpi-card">
          <div className="kpi-label">
            <Clock size={13} style={{ color: 'var(--accent)' }} /> 5-Hour Window
          </div>
          <div className="kpi-value mono">{formatTokens(total5hTokens)}</div>
          <div className="kpi-sub">{total5hRuns} turns across all accounts</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">
            <Flame size={13} style={{ color: 'var(--warning)' }} /> Today (Daily)
          </div>
          <div className="kpi-value mono">{formatTokens(totalDailyTokens)}</div>
          <div className="kpi-sub">{totalDailyRuns} turns since midnight</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">
            <BarChart3 size={13} style={{ color: 'var(--success)' }} /> Last 7 Days (Weekly)
          </div>
          <div className="kpi-value mono">{formatTokens(totalWeeklyTokens)}</div>
          <div className="kpi-sub">{totalWeeklyRuns} total turns this week</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">
            <Zap size={13} style={{ color: 'var(--danger)' }} /> Limit Hits (7d)
          </div>
          <div className="kpi-value mono">{totalRateLimitHits}</div>
          <div className="kpi-sub">Automatic cooldown &amp; failover triggers</div>
        </div>
      </section>

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
    </>
  );
};
