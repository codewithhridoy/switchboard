import React, { useMemo, useState } from 'react';
import { Github, Globe, Lock, RefreshCw, Search } from 'lucide-react';
import { GitHubRepoSummary } from '../../../shared/types';

interface GitHubRepoPickerProps {
  githubUsername?: string;
  repos: GitHubRepoSummary[];
  loading: boolean;
  selectedCloneUrl: string;
  onRefresh: () => Promise<void>;
  onSelectRepo: (repo: GitHubRepoSummary) => void;
}

export const GitHubRepoPicker: React.FC<GitHubRepoPickerProps> = ({
  githubUsername,
  repos,
  loading,
  selectedCloneUrl,
  onRefresh,
  onSelectRepo,
}) => {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) => r.fullName.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }, [repos, filter]);

  return (
    <div className="field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <label htmlFor="clone-search">
          <Github size={13} /> Pick from GitHub {githubUsername ? `(@${githubUsername})` : ''}
        </label>
        <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void onRefresh()}>
          <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <Search
          size={13}
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
        />
        <input
          id="clone-search"
          type="search"
          className="input-field"
          style={{ width: '100%', paddingLeft: 30 }}
          placeholder="Filter your repositories..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div
        className="scroller"
        style={{
          maxHeight: 168,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          marginTop: 4,
          padding: 4,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            Loading repositories...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            No matching repositories found. You can still paste any Git URL below.
          </div>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`preset-tile ${selectedCloneUrl === r.cloneUrl ? 'active' : ''}`}
              style={{ padding: '7px 10px' }}
              onClick={() => onSelectRepo(r)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <strong className="mono" style={{ fontSize: 12 }}>{r.fullName}</strong>
                <span className="pill" style={{ fontSize: 10.5 }}>
                  {r.private ? <Lock size={10} /> : <Globe size={10} />}
                  {r.private ? 'Private' : 'Public'}
                </span>
              </div>
              {r.description && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.description}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
