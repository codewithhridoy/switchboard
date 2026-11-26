import React from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { TASK_CATEGORY_META } from '../../shared/presets';
import { RoutingRule, SwitchboardState } from '../../shared/types';

interface RoutingViewProps {
  state: SwitchboardState;
  onUpdateRule: (category: RoutingRule['category'], patch: Partial<RoutingRule>) => Promise<void>;
}

export const RoutingView: React.FC<RoutingViewProps> = ({ state, onUpdateRule }) => {
  const accounts = [...state.accounts].sort((a, b) => a.priority - b.priority);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sparkles size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>How Auto-Routing Works:</strong> When set to{' '}
          <em>Auto (Best Capability Score)</em>, Switchboard matches each subtask to the strongest ready model (e.g. Claude for architecture/coding/debugging, Google AI Pro Gemini for large context/frontend UI/research). If that account hits a quota limit, it cools down and automatically fails over to the next eligible account.
        </div>
      </div>

      <div className="routing-list">
        {state.routingRules.map((rule) => {
          const meta = TASK_CATEGORY_META[rule.category];
          const primaryId = rule.preferredAccountIds[0] ?? '';
          const fallbackId = rule.preferredAccountIds[1] ?? '';

          const setPrimaryAndFallback = (nextPrimary: string, nextFallback: string) => {
            const ids = [nextPrimary, nextFallback].filter(
              (id, idx, arr) => Boolean(id) && arr.indexOf(id) === idx
            );
            void onUpdateRule(rule.category, { preferredAccountIds: ids });
          };

          return (
            <div key={rule.category} className="card routing-row">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      background: meta.accent,
                      display: 'inline-block',
                    }}
                  />
                  <strong style={{ fontSize: 13.5 }}>{rule.label}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {rule.description}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="field">
                  <label htmlFor={`primary-${rule.category}`} style={{ fontSize: 11.5 }}>
                    Primary Account
                  </label>
                  <select
                    id={`primary-${rule.category}`}
                    className="select-compact"
                    value={primaryId}
                    onChange={(e) => setPrimaryAndFallback(e.target.value, fallbackId)}
                  >
                    <option value="">Auto (Best Capability)</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.model})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`fallback-${rule.category}`} style={{ fontSize: 11.5 }}>
                    1st Fallback
                  </label>
                  <select
                    id={`fallback-${rule.category}`}
                    className="select-compact"
                    value={fallbackId}
                    onChange={(e) => setPrimaryAndFallback(primaryId, e.target.value)}
                  >
                    <option value="">Auto (Next Eligible)</option>
                    {accounts
                      .filter((a) => a.id !== primaryId)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.model})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rule.allowFailover}
                    onChange={(e) =>
                      void onUpdateRule(rule.category, { allowFailover: e.target.checked })
                    }
                  />
                  Auto-failover on limit
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                  }}
                  title="Allow falling back between Team and Personal accounts when one hits its quota"
                >
                  <input
                    type="checkbox"
                    checked={rule.allowCrossScopeFailover}
                    onChange={(e) =>
                      void onUpdateRule(rule.category, {
                        allowCrossScopeFailover: e.target.checked,
                      })
                    }
                  />
                  <ShieldAlert size={12} />
                  Cross-scope fallback
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
