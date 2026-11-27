import React from 'react';
import { AccountProfile } from '../../../shared/types';

function getAccountDotClass(acc: AccountProfile): string {
  if (!acc.enabled) return 'disabled';
  if (acc.cooldownUntil && acc.cooldownUntil > Date.now()) return 'cooldown';
  return 'ready';
}

function formatRemaining(until?: number | null): string | null {
  if (!until) return null;
  const diff = until - Date.now();
  if (diff <= 0) return null;
  const mins = Math.ceil(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export const AccountPoolList: React.FC<{ accounts: AccountProfile[] }> = ({ accounts }) => {
  const sorted = [...accounts].sort((a, b) => a.priority - b.priority);
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-label">Active Pool</div>
      <div className="pool-list scroller">
        {sorted.map((acc) => {
          const dot = getAccountDotClass(acc);
          const cooldownText = formatRemaining(acc.cooldownUntil);
          return (
            <div key={acc.id} className="pool-mini" title={`${acc.name} (${acc.model})`}>
              <div style={{ minWidth: 0 }}>
                <div className="pool-mini-name">{acc.name}</div>
                <div className="pool-mini-model">
                  {cooldownText ? `Cooldown · ${cooldownText}` : acc.model}
                </div>
              </div>
              <span className={`status-dot ${dot}`} aria-label={dot} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
