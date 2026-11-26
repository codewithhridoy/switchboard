import React, { useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, Monitor, Moon, Sun, X } from 'lucide-react';
import { AppSettings } from '../../shared/types';
import { attachDialogLightDismissFallback } from '../utils/dialogHelpers';
import {
  applyThemePreference,
  getStoredTheme,
  subscribeSystemColorScheme,
  ThemePreference,
} from '../utils/theme';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  onPickFolder: () => Promise<string | null>;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  settings,
  onClose,
  onSave,
  onPickFolder,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
  const [systemIsDark, setSystemIsDark] = useState(true);
  const [defaultWorkspaceDir, setDefaultWorkspaceDir] = useState(settings.defaultWorkspaceDir);
  const [defaultCooldownMinutes, setDefaultCooldownMinutes] = useState(
    settings.defaultCooldownMinutes
  );
  const [maxAttemptsPerSubtask, setMaxAttemptsPerSubtask] = useState(
    settings.maxAttemptsPerSubtask
  );
  const [handoffContextChars, setHandoffContextChars] = useState(settings.handoffContextChars);

  useEffect(() => {
    setDefaultWorkspaceDir(settings.defaultWorkspaceDir);
    setDefaultCooldownMinutes(settings.defaultCooldownMinutes);
    setMaxAttemptsPerSubtask(settings.maxAttemptsPerSubtask);
    setHandoffContextChars(settings.handoffContextChars);
  }, [settings]);

  useEffect(() => {
    return subscribeSystemColorScheme(setSystemIsDark);
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => {
      cleanup();
      el.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  const handleThemeSelect = (next: ThemePreference) => {
    setTheme(next);
    applyThemePreference(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      theme,
      defaultWorkspaceDir,
      defaultCooldownMinutes: Math.max(1, Number(defaultCooldownMinutes) || 45),
      maxAttemptsPerSubtask: Math.max(1, Math.min(10, Number(maxAttemptsPerSubtask) || 4)),
      handoffContextChars: Math.max(500, Number(handoffContextChars) || 4000),
    });
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="sb-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>Switchboard Settings</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close settings"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="dialog-body scroller">
            <div className="field">
              <label>Appearance</label>
              <span className="field-hint">
                Follows your OS color scheme by default, or pin Light / Dark explicitly.
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className={`preset-tile ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => handleThemeSelect('system')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Monitor size={14} />
                    <strong style={{ fontSize: 12.5 }}>System</strong>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Currently {systemIsDark ? 'Dark' : 'Light'}
                  </span>
                </button>
                <button
                  type="button"
                  className={`preset-tile ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => handleThemeSelect('light')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sun size={14} />
                    <strong style={{ fontSize: 12.5 }}>Light</strong>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Always light</span>
                </button>
                <button
                  type="button"
                  className={`preset-tile ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => handleThemeSelect('dark')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Moon size={14} />
                    <strong style={{ fontSize: 12.5 }}>Dark</strong>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Always dark</span>
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="set-workspace">Default Coding Workspace</label>
              <span className="field-hint">Pre-selected directory for new Coding tasks.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="set-workspace"
                  className="input-field mono"
                  style={{ flex: 1 }}
                  value={defaultWorkspaceDir}
                  onChange={(e) => setDefaultWorkspaceDir(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    const picked = await onPickFolder();
                    if (picked) setDefaultWorkspaceDir(picked);
                  }}
                >
                  <FolderOpen size={14} />
                  Browse
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label htmlFor="set-cooldown">Default Cooldown (Minutes)</label>
                <span className="field-hint">
                  Used when a provider hits a limit without returning a reset time.
                </span>
                <input
                  id="set-cooldown"
                  type="number"
                  min={1}
                  max={720}
                  className="input-field"
                  value={defaultCooldownMinutes}
                  onChange={(e) => setDefaultCooldownMinutes(Number(e.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor="set-attempts">Max Failover Attempts</label>
                <span className="field-hint">Maximum accounts tried per subtask.</span>
                <input
                  id="set-attempts"
                  type="number"
                  min={1}
                  max={10}
                  className="input-field"
                  value={maxAttemptsPerSubtask}
                  onChange={(e) => setMaxAttemptsPerSubtask(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="set-handoff">Failover Handoff Context (Characters)</label>
              <span className="field-hint">
                Maximum partial output passed to the fallback model so it continues seamlessly.
              </span>
              <input
                id="set-handoff"
                type="number"
                min={500}
                max={20000}
                step={500}
                className="input-field"
                value={handoffContextChars}
                onChange={(e) => setHandoffContextChars(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="dialog-footer">
            <button
              type="button"
              className="btn"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
