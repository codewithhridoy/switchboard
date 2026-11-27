import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  KeyRound,
  Loader2,
  RotateCcw,
  Terminal,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { AccountProfile, ModelChoice } from '../../../shared/types';
import { AccountModelControls } from './AccountModelControls';

interface AccountCardProps {
  account: AccountProfile;
  index: number;
  totalCount: number;
  discoveredModels?: ModelChoice[];
  onMovePriority: (delta: -1 | 1) => Promise<void>;
  onUpdateAccount: (id: string, patch: Partial<AccountProfile>) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onClearCooldown: (id: string) => Promise<void>;
  onTestAccount: (id: string) => Promise<{ ok: boolean; message: string; latencyMs: number }>;
  onLaunchCliLogin: (id: string) => Promise<{ ok: boolean; command: string; error?: string }>;
}

function isCliProvider(p: AccountProfile['provider']): boolean {
  return p === 'claude-cli' || p === 'agy-cli' || p === 'gemini-cli' || p === 'codex-cli';
}

function formatCooldown(until?: number | null): string | null {
  if (!until) return null;
  const diff = until - Date.now();
  if (diff <= 0) return null;
  return `${Math.ceil(diff / 60_000)} min remaining (until ${new Date(until).toLocaleTimeString()})`;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account: acc,
  index,
  totalCount,
  discoveredModels,
  onMovePriority,
  onUpdateAccount,
  onDeleteAccount,
  onClearCooldown,
  onTestAccount,
  onLaunchCliLogin,
}) => {
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const cooldownText = formatCooldown(acc.cooldownUntil);
  const isCli = isCliProvider(acc.provider);
  const canToggleProfile =
    acc.provider === 'claude-cli' || acc.provider === 'gemini-cli' || acc.provider === 'codex-cli';

  return (
    <article className="card account-card">
      <div className="account-card-top">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="pill mono">#{index + 1}</span>
            <strong style={{ fontSize: 14.5 }}>{acc.name}</strong>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
            {acc.provider} · {acc.model}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="btn btn-ghost btn-icon" disabled={index === 0} title="Increase priority" aria-label="Increase priority" onClick={() => void onMovePriority(-1)}>
            <ArrowUp size={13} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" disabled={index === totalCount - 1} title="Decrease priority" aria-label="Decrease priority" onClick={() => void onMovePriority(1)}>
            <ArrowDown size={13} />
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, marginLeft: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={acc.enabled} onChange={(e) => void onUpdateAccount(acc.id, { enabled: e.target.checked })} />
            On
          </label>
        </div>
      </div>

      <AccountModelControls
        account={acc}
        discoveredModels={discoveredModels}
        onUpdateAccount={onUpdateAccount}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {!acc.enabled ? (
          <span className="pill">Disabled</span>
        ) : cooldownText ? (
          <span className="pill pill-warning">Cooldown · {cooldownText}</span>
        ) : (
          <span className="pill pill-success">Ready</span>
        )}
        <span className="pill">{acc.totalRuns} runs</span>
        {acc.totalFailovers > 0 && <span className="pill">{acc.totalFailovers} failovers</span>}
      </div>

      <div className="account-meta-box">
        {isCli ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {acc.provider === 'agy-cli' || acc.useDefaultProfile ? 'System Default CLI Login' : 'Isolated Profile Directory'}
              </span>
              {canToggleProfile && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(acc.useDefaultProfile)} onChange={(e) => void onUpdateAccount(acc.id, { useDefaultProfile: e.target.checked })} />
                  Use default login
                </label>
              )}
            </div>
            <div className="mono" style={{ wordBreak: 'break-all' }}>
              {acc.provider === 'agy-cli'
                ? 'Uses active `agy` Google AI Pro session'
                : acc.useDefaultProfile
                  ? acc.provider === 'claude-cli'
                    ? '~/.claude (existing logged-in session)'
                    : 'Default CLI config'
                  : acc.profileDir || 'Default CLI config'}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, color: 'var(--text-primary)' }}>
              <KeyRound size={12} /> API Endpoint
            </div>
            <div className="mono" style={{ wordBreak: 'break-all' }}>
              {acc.baseUrl || 'Default'} · {acc.apiKey ? 'Key configured' : 'No key set'}
            </div>
          </>
        )}
        {acc.cooldownReason && cooldownText && (
          <div style={{ color: 'var(--warning)', marginTop: 2 }}>Last limit: {acc.cooldownReason}</div>
        )}
      </div>

      {feedback && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: feedback.ok ? 'var(--success)' : 'var(--danger)' }}>
          <span style={{ marginTop: 2, flexShrink: 0 }}>
            {feedback.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          </span>
          <span style={{ wordBreak: 'break-word' }}>{feedback.message}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
        {isCli && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              const res = await onLaunchCliLogin(acc.id);
              setFeedback({ ok: res.ok, message: res.ok ? `Opened Terminal: ${res.command}` : res.error || 'Could not launch terminal' });
            }}
          >
            <Terminal size={13} /> Sign In in Terminal
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            const res = await onTestAccount(acc.id);
            setTesting(false);
            setFeedback({ ok: res.ok, message: `${res.message} (${res.latencyMs}ms)` });
          }}
        >
          {testing ? <Loader2 size={13} className="spin" /> : <Wifi size={13} />} Test
        </button>
        {cooldownText && (
          <button type="button" className="btn btn-sm" onClick={() => void onClearCooldown(acc.id)}>
            <RotateCcw size={13} /> Reset Cooldown
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => void onDeleteAccount(acc.id)}>
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </article>
  );
};
