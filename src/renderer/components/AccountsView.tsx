import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import {
  composeModelId,
  EFFORT_LABELS,
  GroupedModel,
  groupModelsByBase,
  pickBestEffort,
  splitModelAndEffort,
} from '../../shared/models';
import { PROVIDER_MODELS } from '../../shared/presets';
import {
  AccountProfile,
  AccountScope,
  EffortLevel,
  SwitchboardState,
} from '../../shared/types';

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

const CUSTOM_MODEL_SENTINEL = '__custom__';

function isCliProvider(provider: AccountProfile['provider']): boolean {
  return (
    provider === 'claude-cli' ||
    provider === 'agy-cli' ||
    provider === 'gemini-cli' ||
    provider === 'codex-cli'
  );
}

function supportsProfileToggle(provider: AccountProfile['provider']): boolean {
  return provider === 'claude-cli' || provider === 'gemini-cli' || provider === 'codex-cli';
}

function formatCooldown(until?: number | null): string | null {
  if (!until) return null;
  const diff = until - Date.now();
  if (diff <= 0) return null;
  const mins = Math.ceil(diff / 60_000);
  return `${mins} min remaining (until ${new Date(until).toLocaleTimeString()})`;
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
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [customModelDrafts, setCustomModelDrafts] = useState<Record<string, string>>({});

  const sortedAccounts = [...state.accounts].sort((a, b) => a.priority - b.priority);

  const movePriority = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sortedAccounts.length) return;
    const current = sortedAccounts[index];
    const swap = sortedAccounts[target];
    await onUpdateAccount(current.id, { priority: swap.priority });
    await onUpdateAccount(swap.id, { priority: current.priority });
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    const res = await onTestAccount(id);
    setTestingId(null);
    setTestFeedback((prev) => ({
      ...prev,
      [id]: { ok: res.ok, message: `${res.message} (${res.latencyMs}ms)` },
    }));
  };

  const handleBaseModelChange = (
    acc: AccountProfile,
    groups: GroupedModel[],
    nextBaseId: string
  ) => {
    if (nextBaseId === CUSTOM_MODEL_SENTINEL) {
      setCustomModelDrafts((prev) => ({ ...prev, [acc.id]: acc.model }));
      return;
    }

    setCustomModelDrafts((prev) => {
      const next = { ...prev };
      delete next[acc.id];
      return next;
    });

    const targetGroup = groups.find((g) => g.baseId === nextBaseId);
    if (!targetGroup) {
      void onUpdateAccount(acc.id, { model: nextBaseId });
      return;
    }

    const currentParsed = splitModelAndEffort(acc.model);
    const preferredEffort = acc.effort ?? currentParsed.effort;
    const chosenEffort = pickBestEffort(targetGroup, preferredEffort);
    const composedModel = composeModelId(targetGroup, chosenEffort);

    void onUpdateAccount(acc.id, {
      model: composedModel,
      effort: targetGroup.suffixEncoded ? chosenEffort : acc.effort,
    });
  };

  const handleEffortChange = (
    acc: AccountProfile,
    activeGroup: GroupedModel | undefined,
    value: string
  ) => {
    const nextEffort = (value || undefined) as EffortLevel | undefined;
    if (activeGroup?.suffixEncoded && nextEffort) {
      const composed = composeModelId(activeGroup, nextEffort);
      void onUpdateAccount(acc.id, { model: composed, effort: nextEffort });
    } else {
      void onUpdateAccount(acc.id, { effort: nextEffort });
    }
  };

  const commitCustomModel = (accId: string) => {
    const draft = (customModelDrafts[accId] ?? '').trim();
    if (!draft) return;
    void onUpdateAccount(accId, { model: draft });
    setCustomModelDrafts((prev) => {
      const next = { ...prev };
      delete next[accId];
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Local CLI detection bar */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div>
            <strong style={{ fontSize: 13.5 }}>Official CLI Runtimes on This Machine</strong>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Uses official CLIs (`claude`, `agy`, `gemini`, `codex`) with live model discovery and isolated profiles for multi-account Claude.
            </div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void onRefreshCliHealth()}>
            <RefreshCw size={13} />
            Re-scan CLIs & Models
          </button>
        </div>

        <div className="cli-health-strip">
          {state.cliHealth.map((cli) => (
            <div key={cli.provider} className="cli-chip">
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Terminal size={14} />
                  <strong className="mono" style={{ fontSize: 13 }}>
                    {cli.binary}
                  </strong>
                  <span className={`pill ${cli.installed ? 'pill-success' : 'pill-warning'}`}>
                    {cli.installed ? 'Installed' : 'Not found'}
                  </span>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginTop: 4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cli.installed ? cli.version || cli.resolvedPath : cli.installHint}
                </div>
              </div>
              {!cli.installed && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(cli.installHint);
                    setCopiedCmd(cli.binary);
                    setTimeout(() => setCopiedCmd(null), 1600);
                  }}
                >
                  <Copy size={12} />
                  {copiedCmd === cli.binary ? 'Copied' : 'Copy Install'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Connected Accounts Grid */}
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
              Pick a unique model and reasoning effort independently. Higher priority accounts are chosen first when capability scores tie.
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddAccount}>
            <Plus size={14} />
            Connect Account
          </button>
        </div>

        <div className="grid-2">
          {sortedAccounts.map((acc, idx) => {
            const cooldownText = formatCooldown(acc.cooldownUntil);
            const feedback = testFeedback[acc.id];
            const isCli = isCliProvider(acc.provider);
            const canToggleProfile = supportsProfileToggle(acc.provider);

            const groupedModels = groupModelsByBase(
              acc.provider,
              state.discoveredModels?.[acc.provider],
              PROVIDER_MODELS[acc.provider] ?? []
            );
            const parsedCurrent = splitModelAndEffort(acc.model);
            const activeGroup = groupedModels.find((g) => g.baseId === parsedCurrent.baseId);
            const activeEffort = parsedCurrent.effort ?? acc.effort ?? '';
            const isEditingCustom = acc.id in customModelDrafts;
            const showEffortSelect = Boolean(activeGroup && activeGroup.efforts.length > 0);

            return (
              <article key={acc.id} className="card account-card">
                <div className="account-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="pill mono">#{idx + 1}</span>
                      <strong style={{ fontSize: 14.5 }}>{acc.name}</strong>
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}
                    >
                      {acc.provider} · {acc.model}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      disabled={idx === 0}
                      title="Increase priority"
                      aria-label="Increase priority"
                      onClick={() => void movePriority(idx, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      disabled={idx === sortedAccounts.length - 1}
                      title="Decrease priority"
                      aria-label="Decrease priority"
                      onClick={() => void movePriority(idx, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        marginLeft: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={acc.enabled}
                        onChange={(e) =>
                          void onUpdateAccount(acc.id, { enabled: e.target.checked })
                        }
                      />
                      On
                    </label>
                  </div>
                </div>

                {/* Inline Unique Model + Effort + Scope Switchers */}
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
                    <label
                      htmlFor={`model-${acc.id}`}
                      style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}
                    >
                      <Cpu size={12} />
                      Active Model
                    </label>
                    <select
                      id={`model-${acc.id}`}
                      className="select-compact"
                      value={
                        isEditingCustom
                          ? CUSTOM_MODEL_SENTINEL
                          : activeGroup
                            ? activeGroup.baseId
                            : acc.model
                      }
                      onChange={(e) =>
                        handleBaseModelChange(acc, groupedModels, e.target.value)
                      }
                    >
                      {!activeGroup && !isEditingCustom && (
                        <option value={acc.model}>{acc.model} (Custom)</option>
                      )}
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
                      <label
                        htmlFor={`effort-${acc.id}`}
                        style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}
                      >
                        <Gauge size={12} />
                        Effort
                      </label>
                      <select
                        id={`effort-${acc.id}`}
                        className="select-compact"
                        value={activeEffort}
                        onChange={(e) =>
                          handleEffortChange(acc, activeGroup, e.target.value)
                        }
                      >
                        {!activeGroup.suffixEncoded && (
                          <option value="">Default</option>
                        )}
                        {activeGroup.efforts.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {EFFORT_LABELS[lvl]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="field">
                    <label
                      htmlFor={`scope-${acc.id}`}
                      style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}
                    >
                      Scope
                    </label>
                    <select
                      id={`scope-${acc.id}`}
                      className="select-compact"
                      value={acc.scope}
                      onChange={(e) =>
                        void onUpdateAccount(acc.id, { scope: e.target.value as AccountScope })
                      }
                    >
                      <option value="personal">Personal</option>
                      <option value="team">Team</option>
                      <option value="any">Any</option>
                    </select>
                  </div>
                </div>

                {isEditingCustom && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="input-field mono"
                      style={{ flex: 1 }}
                      placeholder="Enter exact model ID (e.g. claude-opus-5-5, gemini-4-neon-high)"
                      value={customModelDrafts[acc.id] ?? ''}
                      onChange={(e) =>
                        setCustomModelDrafts((prev) => ({ ...prev, [acc.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitCustomModel(acc.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => commitCustomModel(acc.id)}
                    >
                      <Check size={13} />
                      Apply
                    </button>
                  </div>
                )}

                {/* Status Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {!acc.enabled ? (
                    <span className="pill">Disabled</span>
                  ) : cooldownText ? (
                    <span className="pill pill-warning">Cooldown · {cooldownText}</span>
                  ) : (
                    <span className="pill pill-success">Ready</span>
                  )}
                  <span className="pill">{acc.totalRuns} runs</span>
                  {acc.totalFailovers > 0 && (
                    <span className="pill">{acc.totalFailovers} failovers</span>
                  )}
                </div>

                {/* Profile or API details */}
                <div className="account-meta-box">
                  {isCli ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {acc.provider === 'agy-cli' || acc.useDefaultProfile
                            ? 'System Default CLI Login'
                            : 'Isolated Profile Directory'}
                        </span>
                        {canToggleProfile && (
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(acc.useDefaultProfile)}
                              onChange={(e) =>
                                void onUpdateAccount(acc.id, {
                                  useDefaultProfile: e.target.checked,
                                })
                              }
                            />
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
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        <KeyRound size={12} />
                        API Endpoint
                      </div>
                      <div className="mono" style={{ wordBreak: 'break-all' }}>
                        {acc.baseUrl || 'Default'} · {acc.apiKey ? 'Key configured' : 'No key set'}
                      </div>
                    </>
                  )}
                  {acc.cooldownReason && cooldownText && (
                    <div style={{ color: 'var(--warning)', marginTop: 2 }}>
                      Last limit: {acc.cooldownReason}
                    </div>
                  )}
                </div>

                {feedback && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                      fontSize: 12,
                      color: feedback.ok ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
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
                        setTestFeedback((prev) => ({
                          ...prev,
                          [acc.id]: {
                            ok: res.ok,
                            message: res.ok
                              ? `Opened Terminal: ${res.command}`
                              : res.error || 'Could not launch terminal',
                          },
                        }));
                      }}
                    >
                      <Terminal size={13} />
                      Sign In in Terminal
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={testingId === acc.id}
                    onClick={() => void handleTest(acc.id)}
                  >
                    {testingId === acc.id ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      <Wifi size={13} />
                    )}
                    Test
                  </button>

                  {cooldownText && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void onClearCooldown(acc.id)}
                    >
                      <RotateCcw size={13} />
                      Reset Cooldown
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', color: 'var(--danger)' }}
                    onClick={() => void onDeleteAccount(acc.id)}
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
