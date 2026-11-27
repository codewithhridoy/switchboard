import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { AccountLimits } from '../../../shared/types';

interface AccountLimitsEditorProps {
  accountId: string;
  initialLimits: AccountLimits;
  onCancel: () => void;
  onSave: (limits: AccountLimits) => Promise<void>;
}

export const AccountLimitsEditor: React.FC<AccountLimitsEditorProps> = ({
  accountId,
  initialLimits,
  onCancel,
  onSave,
}) => {
  const [draft, setDraft] = useState<AccountLimits>(initialLimits);

  return (
    <div className="account-meta-box" style={{ gap: 10 }}>
      <div className="field-row-2">
        <div className="field">
          <label htmlFor={`lim-5h-${accountId}`}>5h Token Cap</label>
          <input
            id={`lim-5h-${accountId}`}
            type="number"
            step={50000}
            className="input-field mono"
            value={draft.session5hTokens}
            onChange={(e) => setDraft((d) => ({ ...d, session5hTokens: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`lim-day-${accountId}`}>Daily Token Cap</label>
          <input
            id={`lim-day-${accountId}`}
            type="number"
            step={100000}
            className="input-field mono"
            value={draft.dailyTokens}
            onChange={(e) => setDraft((d) => ({ ...d, dailyTokens: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="field-row-2">
        <div className="field">
          <label htmlFor={`lim-week-${accountId}`}>Weekly Token Cap</label>
          <input
            id={`lim-week-${accountId}`}
            type="number"
            step={500000}
            className="input-field mono"
            value={draft.weeklyTokens}
            onChange={(e) => setDraft((d) => ({ ...d, weeklyTokens: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`lim-runs-${accountId}`}>Daily Run Cap</label>
          <input
            id={`lim-runs-${accountId}`}
            type="number"
            step={10}
            className="input-field mono"
            value={draft.dailyRuns}
            onChange={(e) => setDraft((d) => ({ ...d, dailyRuns: Number(e.target.value) }))}
          />
        </div>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: 'var(--text-primary)' }}>
        <input
          type="checkbox"
          checked={draft.autoSwitchOnLimit}
          onChange={(e) => setDraft((d) => ({ ...d, autoSwitchOnLimit: e.target.checked }))}
        />
        <Shield size={13} />
        Proactively switch to next account when any cap hits 100%
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() =>
            void onSave({
              session5hTokens: Math.max(10_000, Number(draft.session5hTokens) || 500_000),
              dailyTokens: Math.max(10_000, Number(draft.dailyTokens) || 2_000_000),
              weeklyTokens: Math.max(10_000, Number(draft.weeklyTokens) || 10_000_000),
              dailyRuns: Math.max(1, Number(draft.dailyRuns) || 100),
              weeklyRuns: Math.max(1, Number(draft.weeklyRuns) || 500),
              autoSwitchOnLimit: draft.autoSwitchOnLimit,
            })
          }
        >
          Save Limits
        </button>
      </div>
    </div>
  );
};
