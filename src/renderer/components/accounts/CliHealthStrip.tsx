import React, { useState } from 'react';
import { Copy, RefreshCw, Terminal } from 'lucide-react';
import { CliHealthInfo } from '../../../shared/types';

interface CliHealthStripProps {
  cliHealth: CliHealthInfo[];
  onRefreshCliHealth: () => Promise<void>;
}

export const CliHealthStrip: React.FC<CliHealthStripProps> = ({
  cliHealth,
  onRefreshCliHealth,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  return (
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
            Uses official CLIs (`claude`, `agy`, `gemini`, `codex`) with live model discovery and
            isolated profiles for multi-account Claude.
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void onRefreshCliHealth()}>
          <RefreshCw size={13} />
          Re-scan CLIs &amp; Models
        </button>
      </div>

      <div className="cli-health-strip">
        {cliHealth.map((cli) => (
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
  );
};
