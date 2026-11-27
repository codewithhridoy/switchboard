import React from 'react';
import { ProviderPreset } from '../../../shared/presets';
import { syncFieldAriaValidation } from '../../utils/dialogHelpers';

interface AccountAuthFieldsProps {
  preset: ProviderPreset;
  useDefaultProfile: boolean;
  profileDir: string;
  apiKey: string;
  baseUrl: string;
  onChangeUseDefault: (val: boolean) => void;
  onChangeProfileDir: (val: string) => void;
  onChangeApiKey: (val: string) => void;
  onChangeBaseUrl: (val: string) => void;
}

export const AccountAuthFields: React.FC<AccountAuthFieldsProps> = ({
  preset,
  useDefaultProfile,
  profileDir,
  apiKey,
  baseUrl,
  onChangeUseDefault,
  onChangeProfileDir,
  onChangeApiKey,
  onChangeBaseUrl,
}) => (
  <>
    {preset.supportsIsolatedProfile && (
      <div className="field">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={useDefaultProfile} onChange={(e) => onChangeUseDefault(e.target.checked)} />
          Use existing system CLI login (~/.claude / ~/.gemini)
        </label>
        {!useDefaultProfile && (
          <>
            <label htmlFor="acc-profile" style={{ marginTop: 6 }}>
              Isolated Profile Directory (Optional)
            </label>
            <span className="field-hint">
              Leave blank to auto-create an isolated folder under ~/.switchboard/profiles/ so you
              can run two Claude accounts on the same Gmail side by side.
            </span>
            <input
              id="acc-profile"
              className="input-field mono"
              type="text"
              placeholder="Auto-generated isolated profile directory"
              value={profileDir}
              onChange={(e) => onChangeProfileDir(e.target.value)}
            />
          </>
        )}
      </div>
    )}

    {preset.requiresApiKey && (
      <>
        <div className="field">
          <label htmlFor="acc-apikey">API Key</label>
          <span id="acc-apikey-hint" className="field-hint">
            Stored locally in ~/.switchboard/state.json. Optional for local Ollama endpoints.
          </span>
          <input
            id="acc-apikey"
            className="input-field mono"
            type="password"
            required={!(baseUrl && /localhost|127\.0\.0\.1/.test(baseUrl))}
            placeholder="sk-..."
            value={apiKey}
            aria-invalid="false"
            aria-describedby="acc-apikey-hint"
            data-error="acc-apikey-error"
            onChange={(e) => { onChangeApiKey(e.target.value); syncFieldAriaValidation(e.target); }}
            onBlur={(e) => syncFieldAriaValidation(e.target)}
          />
          <div id="acc-apikey-error" className="field-error">
            Please enter an API key (or point Base URL to localhost for Ollama).
          </div>
        </div>

        <div className="field">
          <label htmlFor="acc-baseurl">Base URL</label>
          <span id="acc-baseurl-hint" className="field-hint">
            Format: https://api.provider.com or http://localhost:11434/v1
          </span>
          <input
            id="acc-baseurl"
            className="input-field mono"
            type="url"
            value={baseUrl}
            aria-invalid="false"
            aria-describedby="acc-baseurl-hint"
            data-error="acc-baseurl-error"
            onChange={(e) => { onChangeBaseUrl(e.target.value); syncFieldAriaValidation(e.target); }}
            onBlur={(e) => syncFieldAriaValidation(e.target)}
          />
          <div id="acc-baseurl-error" className="field-error">
            Please enter a valid URL starting with http:// or https://.
          </div>
        </div>
      </>
    )}
  </>
);
