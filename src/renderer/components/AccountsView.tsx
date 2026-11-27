import React from 'react';
import { Plus } from 'lucide-react';
import { AccountProfile, SwitchboardState } from '../../shared/types';
import { AccountCard } from './accounts/AccountCard';
import { CliHealthStrip } from './accounts/CliHealthStrip';

interface AccountsViewProps {
  state: SwitchboardState;
  onAddAccount: () => void;
  onUpdateAccount: (id: string, patch: Partial<AccountProfile>) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onClearCooldown: (id: string) => Promise<void>;
  onTestAccount: (id: string) => Promise<{ ok: boolean; message: string; latencyMs: number }>;
  onLaunchCliLogin: (id: string) => Promise<{ ok: boolean; command: string; error?: string }>;
  onRefreshCliHealth: () => Promise<void>;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  state,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onClearCooldown,
  onTestAccount,
  onLaunchCliLogin,
  onRefreshCliHealth,
}) => {
  const sortedAccounts = [...state.accounts].sort((a, b) => a.priority - b.priority);

  const movePriority = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sortedAccounts.length) return;
    const current = sortedAccounts[index];
    const swap = sortedAccounts[target];
    await onUpdateAccount(current.id, { priority: swap.priority });
    await onUpdateAccount(swap.id, { priority: current.priority });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <CliHealthStrip cliHealth={state.cliHealth} onRefreshCliHealth={onRefreshCliHealth} />

      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 13.5 }}>Connected Accounts ({sortedAccounts.length})</strong>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Pick a unique model and reasoning effort independently. Higher priority accounts are
              chosen first when capability scores tie.
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddAccount}>
            <Plus size={14} />
            Connect Account
          </button>
        </div>

        <div className="grid-2">
          {sortedAccounts.map((acc, idx) => (
            <AccountCard
              key={acc.id}
              account={acc}
              index={idx}
              totalCount={sortedAccounts.length}
              discoveredModels={state.discoveredModels?.[acc.provider]}
              onMovePriority={(delta) => movePriority(idx, delta)}
              onUpdateAccount={onUpdateAccount}
              onDeleteAccount={onDeleteAccount}
              onClearCooldown={onClearCooldown}
              onTestAccount={onTestAccount}
              onLaunchCliLogin={onLaunchCliLogin}
            />
          ))}
        </div>
      </section>
    </div>
  );
};
