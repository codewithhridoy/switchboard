import React, { useState } from 'react';
import { Check, Cpu, Gauge } from 'lucide-react';
import {
  composeModelId,
  EFFORT_LABELS,
  GroupedModel,
  groupModelsByBase,
  pickBestEffort,
  splitModelAndEffort,
} from '../../../shared/models';
import { PROVIDER_MODELS } from '../../../shared/presets';
import { AccountProfile, AccountScope, EffortLevel, ModelChoice } from '../../../shared/types';

const CUSTOM_MODEL_SENTINEL = '__custom__';

interface AccountModelControlsProps {
  account: AccountProfile;
  discoveredModels?: ModelChoice[];
  onUpdateAccount: (id: string, patch: Partial<AccountProfile>) => Promise<void>;
}

export const AccountModelControls: React.FC<AccountModelControlsProps> = ({
  account: acc,
  discoveredModels,
  onUpdateAccount,
}) => {
  const [customDraft, setCustomDraft] = useState<string | null>(null);

  const groupedModels = groupModelsByBase(
    acc.provider,
    discoveredModels,
    PROVIDER_MODELS[acc.provider] ?? []
  );
  const parsedCurrent = splitModelAndEffort(acc.model);
  const activeGroup = groupedModels.find((g) => g.baseId === parsedCurrent.baseId);
  const activeEffort = parsedCurrent.effort ?? acc.effort ?? '';
  const showEffortSelect = Boolean(activeGroup && activeGroup.efforts.length > 0);

  const handleBaseModelChange = (nextBaseId: string) => {
    if (nextBaseId === CUSTOM_MODEL_SENTINEL) {
      setCustomDraft(acc.model);
      return;
    }
    setCustomDraft(null);
    const targetGroup: GroupedModel | undefined = groupedModels.find((g) => g.baseId === nextBaseId);
    if (!targetGroup) {
      void onUpdateAccount(acc.id, { model: nextBaseId });
      return;
    }
    const chosenEffort = pickBestEffort(targetGroup, acc.effort ?? parsedCurrent.effort);
    void onUpdateAccount(acc.id, {
      model: composeModelId(targetGroup, chosenEffort),
      effort: targetGroup.suffixEncoded ? chosenEffort : acc.effort,
    });
  };

  const handleEffortChange = (value: string) => {
    const nextEffort = (value || undefined) as EffortLevel | undefined;
    if (activeGroup?.suffixEncoded && nextEffort) {
      void onUpdateAccount(acc.id, { model: composeModelId(activeGroup, nextEffort), effort: nextEffort });
    } else {
      void onUpdateAccount(acc.id, { effort: nextEffort });
    }
  };

  const commitCustomModel = () => {
    const draft = (customDraft ?? '').trim();
    if (!draft) return;
    void onUpdateAccount(acc.id, { model: draft });
    setCustomDraft(null);
  };

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showEffortSelect
            ? 'minmax(0, 1.5fr) minmax(88px, 0.75fr) minmax(88px, 0.75fr)'
            : 'minmax(0, 1.8fr) minmax(96px, 0.8fr)',
          gap: 8,
          alignItems: 'end',
        }}
      >
        <div className="field">
          <label htmlFor={`model-${acc.id}`} style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <Cpu size={12} /> Active Model
          </label>
          <select
            id={`model-${acc.id}`}
            className="select-compact"
            value={customDraft !== null ? CUSTOM_MODEL_SENTINEL : activeGroup ? activeGroup.baseId : acc.model}
            onChange={(e) => handleBaseModelChange(e.target.value)}
          >
            {!activeGroup && customDraft === null && <option value={acc.model}>{acc.model} (Custom)</option>}
            {groupedModels.map((g) => (
              <option key={g.baseId} value={g.baseId}>
                {g.label}
              </option>
            ))}
            <option value={CUSTOM_MODEL_SENTINEL}>Custom model ID...</option>
          </select>
        </div>

        {showEffortSelect && activeGroup && (
          <div className="field">
            <label htmlFor={`effort-${acc.id}`} style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              <Gauge size={12} /> Effort
            </label>
            <select
              id={`effort-${acc.id}`}
              className="select-compact"
              value={activeEffort}
              onChange={(e) => handleEffortChange(e.target.value)}
            >
              {!activeGroup.suffixEncoded && <option value="">Default</option>}
              {activeGroup.efforts.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {EFFORT_LABELS[lvl]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor={`scope-${acc.id}`} style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            Scope
          </label>
          <select
            id={`scope-${acc.id}`}
            className="select-compact"
            value={acc.scope}
            onChange={(e) => void onUpdateAccount(acc.id, { scope: e.target.value as AccountScope })}
          >
            <option value="personal">Personal</option>
            <option value="team">Team</option>
            <option value="any">Any</option>
          </select>
        </div>
      </div>

      {customDraft !== null && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="input-field mono"
            style={{ flex: 1 }}
            placeholder="Enter exact model ID (e.g. claude-opus-5-5, gemini-4-neon-high)"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCustomModel();
              }
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={commitCustomModel}>
            <Check size={13} /> Apply
          </button>
        </div>
      )}
    </>
  );
};
