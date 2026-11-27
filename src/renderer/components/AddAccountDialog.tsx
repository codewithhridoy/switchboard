import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PROVIDER_PRESETS, ProviderPreset } from '../../shared/presets';
import { AccountScope, CreateAccountInput } from '../../shared/types';
import { attachDialogLightDismissFallback, syncFieldAriaValidation } from '../utils/dialogHelpers';
import { AccountAuthFields } from './dialogs/AccountAuthFields';

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateAccountInput) => Promise<void>;
}

export const AddAccountDialog: React.FC<AddAccountDialogProps> = ({ open, onClose, onCreate }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [preset, setPreset] = useState<ProviderPreset>(PROVIDER_PRESETS[0]);
  const [name, setName] = useState(PROVIDER_PRESETS[0].label);
  const [model, setModel] = useState(PROVIDER_PRESETS[0].defaultModel);
  const [scope, setScope] = useState<AccountScope>(PROVIDER_PRESETS[0].defaultScope);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS[0].defaultBaseUrl ?? '');
  const [profileDir, setProfileDir] = useState('');
  const [useDefaultProfile, setUseDefaultProfile] = useState(Boolean(PROVIDER_PRESETS[0].defaultUseDefaultProfile));

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    el.addEventListener('close', onClose);
    return () => { cleanup(); el.removeEventListener('close', onClose); };
  }, [onClose]);

  const selectPreset = (next: ProviderPreset) => {
    setPreset(next);
    setName(next.label);
    setModel(next.defaultModel);
    setScope(next.defaultScope);
    setBaseUrl(next.defaultBaseUrl ?? '');
    setApiKey('');
    setProfileDir('');
    setUseDefaultProfile(Boolean(next.defaultUseDefaultProfile));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(syncFieldAriaValidation);
      return;
    }
    await onCreate({
      name: name.trim(),
      provider: preset.provider,
      model: model.trim(),
      scope,
      tags: preset.defaultTags,
      strengths: preset.defaultStrengths,
      apiKey: preset.requiresApiKey ? apiKey.trim() : undefined,
      baseUrl: preset.requiresApiKey ? baseUrl.trim() || preset.defaultBaseUrl : undefined,
      profileDir: preset.supportsIsolatedProfile ? profileDir.trim() || undefined : undefined,
      useDefaultProfile: preset.supportsIsolatedProfile ? useDefaultProfile : undefined,
    });
    dialogRef.current?.close();
  };

  return (
    <dialog ref={dialogRef} className="sb-dialog" aria-labelledby={titleId} {...({ closedby: 'any' } as Record<string, string>)}>
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>Connect AI Account</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
          <div className="dialog-body scroller">
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Choose Provider Preset</div>
              <div className="preset-grid">
                {PROVIDER_PRESETS.map((p) => (
                  <button key={p.id} type="button" className={`preset-tile ${preset.id === p.id ? 'active' : ''}`} onClick={() => selectPreset(p)}>
                    <strong style={{ fontSize: 12.5 }}>{p.label}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="acc-name">Account Label</label>
              <span id="acc-name-hint" className="field-hint">Give each subscription a clear name (e.g. Claude Personal, Claude Team, Google Pro).</span>
              <input id="acc-name" className="input-field" type="text" required minLength={2} value={name} aria-invalid="false" aria-describedby="acc-name-hint" data-error="acc-name-error" onChange={(e) => { setName(e.target.value); syncFieldAriaValidation(e.target); }} onBlur={(e) => syncFieldAriaValidation(e.target)} />
              <div id="acc-name-error" className="field-error">Please enter an account name with at least 2 characters.</div>
            </div>
            <div className="field-row-2">
              <div className="field">
                <label htmlFor="acc-model">Model Identifier</label>
                <span id="acc-model-hint" className="field-hint">Pick a preset model or type any supported model ID.</span>
                <input id="acc-model" className="input-field mono" type="text" list="preset-models" required value={model} aria-invalid="false" aria-describedby="acc-model-hint" data-error="acc-model-error" onChange={(e) => { setModel(e.target.value); syncFieldAriaValidation(e.target); }} onBlur={(e) => syncFieldAriaValidation(e.target)} />
                <div id="acc-model-error" className="field-error">Please enter a valid model identifier.</div>
                <datalist id="preset-models">{preset.models.map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <div className="field">
                <label htmlFor="acc-scope">Account Scope</label>
                <span className="field-hint">Controls Team vs Personal isolation.</span>
                <select id="acc-scope" className="select-compact" value={scope} onChange={(e) => setScope(e.target.value as AccountScope)}>
                  <option value="personal">Personal</option>
                  <option value="team">Team / Work</option>
                  <option value="any">Any Workspace</option>
                </select>
              </div>
            </div>
            <AccountAuthFields
              preset={preset}
              useDefaultProfile={useDefaultProfile}
              profileDir={profileDir}
              apiKey={apiKey}
              baseUrl={baseUrl}
              onChangeUseDefault={setUseDefaultProfile}
              onChangeProfileDir={setProfileDir}
              onChangeApiKey={setApiKey}
              onChangeBaseUrl={setBaseUrl}
            />
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Account</button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
