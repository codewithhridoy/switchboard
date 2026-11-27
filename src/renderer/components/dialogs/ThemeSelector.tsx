import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference } from '../../utils/theme';

interface ThemeSelectorProps {
  theme: ThemePreference;
  systemIsDark: boolean;
  onSelect: (theme: ThemePreference) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  theme,
  systemIsDark,
  onSelect,
}) => (
  <div className="field">
    <label>Appearance</label>
    <span className="field-hint">
      Follows your OS color scheme by default, or pin Light / Dark explicitly.
    </span>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
      <button type="button" className={`preset-tile ${theme === 'system' ? 'active' : ''}`} onClick={() => onSelect('system')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Monitor size={14} />
          <strong style={{ fontSize: 12.5 }}>System</strong>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          Currently {systemIsDark ? 'Dark' : 'Light'}
        </span>
      </button>
      <button type="button" className={`preset-tile ${theme === 'light' ? 'active' : ''}`} onClick={() => onSelect('light')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sun size={14} />
          <strong style={{ fontSize: 12.5 }}>Light</strong>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Always light</span>
      </button>
      <button type="button" className={`preset-tile ${theme === 'dark' ? 'active' : ''}`} onClick={() => onSelect('dark')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Moon size={14} />
          <strong style={{ fontSize: 12.5 }}>Dark</strong>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Always dark</span>
      </button>
    </div>
  </div>
);
