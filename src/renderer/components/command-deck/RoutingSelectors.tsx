import React from 'react';
import {
  EFFORT_LABELS,
  groupModelsByBase,
  pickBestEffort,
  splitModelAndEffort,
} from '../../../shared/models';
import { PROVIDER_MODELS } from '../../../shared/presets';
import {
  AccountProfile,
  AccountScope,
  EffortLevel,
  ModelChoice,
  ProviderKind,
} from '../../../shared/types';

interface RoutingSelectorsProps {
  accounts: AccountProfile[];
  discoveredModels?: Partial<Record<ProviderKind, ModelChoice[]>>;
  workspaceScope: AccountScope;
  forcedAccountId: string;
  forcedBaseModel: string;
  forcedEffort: EffortLevel | '';
  onChangeScope: (scope: AccountScope) => void;
  onChangeForcedAccount: (accountId: string) => void;
  onChangeForcedModel: (baseModel: string) => void;
  onChangeForcedEffort: (effort: EffortLevel | '') => void;
}

export const RoutingSelectors: React.FC<RoutingSelectorsProps> = ({
  accounts,
  discoveredModels,
  workspaceScope,
  forcedAccountId,
  forcedBaseModel,
  forcedEffort,
  onChangeScope,
  onChangeForcedAccount,
  onChangeForcedModel,
  onChangeForcedEffort,
}) => {
  const pinned = forcedAccountId ? accounts.find((a) => a.id === forcedAccountId) : null;
  const groups = pinned
    ? groupModelsByBase(
        pinned.provider,
        discoveredModels?.[pinned.provider],
        PROVIDER_MODELS[pinned.provider] ?? []
      )
    : [];
  const parsedPinned = pinned ? splitModelAndEffort(pinned.model) : null;
  const activeGroup = pinned
    ? groups.find((g) => g.baseId === (forcedBaseModel || parsedPinned?.baseId))
    : null;

  return (
    <>
      <select
        className="select-compact"
        aria-label="Account scope"
        value={workspaceScope}
        onChange={(e) => onChangeScope(e.target.value as AccountScope)}
      >
        <option value="any">Scope: Any</option>
        <option value="team">Scope: Team First</option>
        <option value="personal">Scope: Personal First</option>
      </select>

      <select
        className="select-compact"
        aria-label="Routing mode"
        value={forcedAccountId}
        onChange={(e) => onChangeForcedAccount(e.target.value)}
      >
        <option value="">Routing: Auto</option>
        {[...accounts]
          .sort((a, b) => a.priority - b.priority)
          .map((acc) => (
            <option key={acc.id} value={acc.id}>
              Pin: {acc.name}
            </option>
          ))}
      </select>

      {pinned && (
        <>
          <select
            className="select-compact"
            aria-label="Model override"
            value={forcedBaseModel}
            onChange={(e) => {
              const nextBase = e.target.value;
              onChangeForcedModel(nextBase);
              const nextGroup = groups.find((g) => g.baseId === nextBase);
              if (nextGroup && forcedEffort && !nextGroup.efforts.includes(forcedEffort)) {
                onChangeForcedEffort(pickBestEffort(nextGroup) ?? '');
              }
            }}
          >
            <option value="">{activeGroup?.label ?? parsedPinned?.baseId}</option>
            {groups.map((g) => (
              <option key={g.baseId} value={g.baseId}>
                {g.label}
              </option>
            ))}
          </select>

          {activeGroup && activeGroup.efforts.length > 0 && (
            <select
              className="select-compact"
              aria-label="Effort override"
              value={forcedEffort}
              onChange={(e) => onChangeForcedEffort(e.target.value as EffortLevel | '')}
            >
              <option value="">
                {parsedPinned?.effort
                  ? EFFORT_LABELS[parsedPinned.effort]
                  : pinned.effort
                    ? EFFORT_LABELS[pinned.effort]
                    : 'Default'}
              </option>
              {activeGroup.efforts.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {EFFORT_LABELS[lvl]}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </>
  );
};
