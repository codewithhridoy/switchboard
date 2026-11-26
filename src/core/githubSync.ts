import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import {
  AccountProfile,
  AppSettings,
  ChatThread,
  OrchestratedTask,
  ProjectWorkspace,
  RoutingRule,
} from '../shared/types';
import { buildEnrichedPath, resolveExecutable } from './runners/cliEnv';
import { PersistedData } from './store';

const execFileAsync = promisify(execFile);

const GIST_FILENAME = 'switchboard-sync.json';
const GIST_DESCRIPTION = 'Switchboard AI — Private Settings, Projects & Chat Sync';

export interface SyncPayload {
  schemaVersion: number;
  exportedAt: number;
  accounts: Array<Omit<AccountProfile, 'apiKey' | 'cooldownUntil' | 'cooldownReason'>>;
  encryptedSecrets?: string;
  routingRules: RoutingRule[];
  projects: ProjectWorkspace[];
  threads: ChatThread[];
  tasks: OrchestratedTask[];
  settings: AppSettings;
}

export interface GitHubUserInfo {
  login: string;
  avatar_url: string;
}

export function encryptSecretsBlob(
  secrets: Record<string, string>,
  passphrase: string
): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(secrets);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

export function decryptSecretsBlob(
  blob: string,
  passphrase: string
): Record<string, string> {
  const parsed = JSON.parse(blob) as {
    salt: string;
    iv: string;
    tag: string;
    data: string;
  };
  const salt = Buffer.from(parsed.salt, 'base64');
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const data = Buffer.from(parsed.data, 'base64');
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted) as Record<string, string>;
}

/**
 * Resolves a GitHub OAuth token either from the user's local `gh` CLI
 * or from a saved Personal Access Token.
 */
export async function resolveGitHubToken(
  authMode: 'gh-cli' | 'pat',
  patToken?: string
): Promise<string> {
  if (authMode === 'pat') {
    if (!patToken?.trim()) {
      throw new Error('GitHub Personal Access Token is missing.');
    }
    return patToken.trim();
  }

  const ghPath = resolveExecutable('gh');
  if (!ghPath) {
    throw new Error(
      'GitHub CLI (`gh`) is not installed. Install `gh` or connect with a Personal Access Token.'
    );
  }

  try {
    const { stdout } = await execFileAsync(ghPath, ['auth', 'token'], {
      timeout: 5000,
      env: { ...process.env, PATH: buildEnrichedPath() },
    });
    const token = stdout.trim();
    if (!token) {
      throw new Error('GitHub CLI is not logged in. Run `gh auth login` first.');
    }
    return token;
  } catch (err) {
    throw new Error(
      `GitHub CLI auth failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function fetchGitHubUser(token: string): Promise<GitHubUserInfo> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'Switchboard-AI',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub auth failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as GitHubUserInfo;
}

export async function findExistingSyncGist(
  token: string
): Promise<{ id: string; html_url: string } | null> {
  const res = await fetch('https://api.github.com/gists?per_page=50', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'Switchboard-AI',
    },
  });
  if (!res.ok) return null;
  const gists = (await res.json()) as Array<{
    id: string;
    html_url: string;
    files?: Record<string, unknown>;
  }>;
  const found = gists.find((g) => g.files && GIST_FILENAME in g.files);
  return found ? { id: found.id, html_url: found.html_url } : null;
}

export function buildSyncPayload(
  data: PersistedData,
  opts: { includeTasks: boolean; encryptSecrets: boolean; passphrase?: string }
): SyncPayload {
  const secrets: Record<string, string> = {};
  const sanitizedAccounts = data.accounts.map((acc) => {
    if (acc.apiKey) {
      secrets[acc.id] = acc.apiKey;
    }
    const { apiKey: _k, cooldownUntil: _cu, cooldownReason: _cr, ...rest } = acc;
    return rest;
  });

  let encryptedSecrets: string | undefined;
  if (opts.encryptSecrets && Object.keys(secrets).length > 0) {
    if (!opts.passphrase || opts.passphrase.length < 4) {
      throw new Error('Passphrase of at least 4 characters is required to encrypt API keys.');
    }
    encryptedSecrets = encryptSecretsBlob(secrets, opts.passphrase);
  }

  return {
    schemaVersion: 2,
    exportedAt: Date.now(),
    accounts: sanitizedAccounts,
    encryptedSecrets,
    routingRules: data.routingRules,
    projects: data.projects,
    threads: opts.includeTasks ? data.threads : [],
    tasks: opts.includeTasks ? data.tasks.slice(0, 60) : [],
    settings: data.settings,
  };
}

export async function pushSyncToGitHubGist(
  token: string,
  payload: SyncPayload,
  existingGistId?: string
): Promise<{ gistId: string; gistUrl: string }> {
  let gistId = existingGistId;
  if (!gistId) {
    const existing = await findExistingSyncGist(token);
    if (existing) gistId = existing.id;
  }

  const body = JSON.stringify({
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  });

  const url = gistId
    ? `https://api.github.com/gists/${encodeURIComponent(gistId)}`
    : 'https://api.github.com/gists';

  const res = await fetch(url, {
    method: gistId ? 'PATCH' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'Switchboard-AI',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Failed to push sync backup (${res.status}). Ensure your GitHub token has 'gist' scope. ${errText.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as { id: string; html_url: string };
  return { gistId: json.id, gistUrl: json.html_url };
}

export async function pullSyncFromGitHubGist(
  token: string,
  existingGistId?: string
): Promise<{ gistId: string; gistUrl: string; payload: SyncPayload }> {
  let gistId = existingGistId;
  if (!gistId) {
    const existing = await findExistingSyncGist(token);
    if (!existing) {
      throw new Error('No Switchboard sync backup found on this GitHub account yet.');
    }
    gistId = existing.id;
  }

  const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'Switchboard-AI',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch sync gist (${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    id: string;
    html_url: string;
    files?: Record<string, { content?: string; raw_url?: string }>;
  };
  const file = json.files?.[GIST_FILENAME];
  if (!file) {
    throw new Error(`Gist ${gistId} does not contain ${GIST_FILENAME}.`);
  }

  let content = file.content ?? '';
  if (!content && file.raw_url) {
    const rawRes = await fetch(file.raw_url);
    content = await rawRes.text();
  }

  const payload = JSON.parse(content) as SyncPayload;
  return { gistId: json.id, gistUrl: json.html_url, payload };
}

/**
 * Merges a remote SyncPayload into local persisted state while preserving
 * local-only API keys (unless decrypted from cloud) and local profile paths.
 */
export function mergeSyncedPayload(
  local: PersistedData,
  remote: SyncPayload,
  passphrase?: string
): { restoredAccounts: number; restoredProjects: number; restoredTasks: number } {
  let decryptedKeys: Record<string, string> = {};
  if (remote.encryptedSecrets && passphrase) {
    decryptedKeys = decryptSecretsBlob(remote.encryptedSecrets, passphrase);
  }

  const localAccById = new Map(local.accounts.map((a) => [a.id, a]));
  const mergedAccounts: AccountProfile[] = remote.accounts.map((rem) => {
    const existing = localAccById.get(rem.id);
    return {
      ...rem,
      apiKey: decryptedKeys[rem.id] ?? existing?.apiKey,
      profileDir: existing?.profileDir ?? rem.profileDir,
      cooldownUntil: existing?.cooldownUntil ?? null,
      cooldownReason: existing?.cooldownReason ?? null,
    };
  });
  // Keep any local-only accounts not yet in remote
  const remoteAccIds = new Set(remote.accounts.map((a) => a.id));
  for (const loc of local.accounts) {
    if (!remoteAccIds.has(loc.id)) {
      mergedAccounts.push(loc);
    }
  }
  local.accounts = mergedAccounts;

  if (Array.isArray(remote.routingRules) && remote.routingRules.length > 0) {
    local.routingRules = remote.routingRules;
  }

  // Merge projects by id (prefer newer updatedAt)
  const projectMap = new Map<string, ProjectWorkspace>();
  for (const p of local.projects) projectMap.set(p.id, p);
  for (const p of remote.projects ?? []) {
    const cur = projectMap.get(p.id);
    if (!cur || p.updatedAt >= cur.updatedAt) {
      projectMap.set(p.id, { ...p, path: cur?.path || p.path });
    }
  }
  local.projects = Array.from(projectMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

  // Merge threads by id
  const threadMap = new Map<string, ChatThread>();
  for (const t of local.threads) threadMap.set(t.id, t);
  for (const t of remote.threads ?? []) {
    const cur = threadMap.get(t.id);
    if (!cur || t.updatedAt >= cur.updatedAt) {
      threadMap.set(t.id, t);
    }
  }
  local.threads = Array.from(threadMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

  // Merge tasks by id (keep newest 100)
  const taskMap = new Map<string, OrchestratedTask>();
  for (const t of local.tasks) taskMap.set(t.id, t);
  for (const t of remote.tasks ?? []) {
    if (!taskMap.has(t.id)) {
      taskMap.set(t.id, t);
    }
  }
  local.tasks = Array.from(taskMap.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);

  if (remote.settings) {
    local.settings = {
      ...local.settings,
      ...remote.settings,
      defaultWorkspaceDir: local.settings.defaultWorkspaceDir || remote.settings.defaultWorkspaceDir,
    };
  }

  return {
    restoredAccounts: remote.accounts.length,
    restoredProjects: remote.projects?.length ?? 0,
    restoredTasks: remote.tasks?.length ?? 0,
  };
}
