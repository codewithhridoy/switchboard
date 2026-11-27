import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  CreatePrInput,
  GitChangedFile,
  GitHubPullRequestInfo,
  GitWorkspaceStatus,
  MergePrInput,
  MergePrResult,
} from '../shared/types';
import { detectGitHubRemote } from './projects';
import { buildEnrichedPath, resolveExecutable } from './runners/cliEnv';

const execFileAsync = promisify(execFile);

async function runGit(
  cwd: string,
  args: string[],
  extraEnv?: NodeJS.ProcessEnv
): Promise<{ stdout: string; stderr: string }> {
  const gitExe = resolveExecutable('git');
  if (!gitExe) {
    throw new Error('Git (`git`) is not installed or not on PATH.');
  }
  return execFileAsync(gitExe, args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: buildEnrichedPath(),
      GIT_TERMINAL_PROMPT: '0',
      ...(extraEnv ?? {}),
    },
  });
}

export async function getGitWorkspaceStatus(cwd: string): Promise<GitWorkspaceStatus> {
  if (!cwd || !fs.existsSync(cwd)) {
    return emptyStatus(cwd);
  }

  try {
    await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return emptyStatus(cwd);
  }

  let currentBranch = 'HEAD';
  try {
    const { stdout } = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    currentBranch = stdout.trim() || 'HEAD';
  } catch {
    // Fresh repo with no commits yet
    try {
      const { stdout } = await runGit(cwd, ['symbolic-ref', '--short', 'HEAD']);
      currentBranch = stdout.trim() || 'main';
    } catch {
      currentBranch = 'main';
    }
  }

  let branches: string[] = [];
  try {
    const { stdout } = await runGit(cwd, ['branch', '--format=%(refname:short)']);
    branches = stdout
      .split(/\r?\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  } catch {
    branches = currentBranch ? [currentBranch] : [];
  }
  if (currentBranch && !branches.includes(currentBranch)) {
    branches.unshift(currentBranch);
  }

  let ahead = 0;
  let behind = 0;
  try {
    const { stdout } = await runGit(cwd, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    const [b, a] = stdout.trim().split(/\s+/).map(Number);
    if (Number.isFinite(b)) behind = b;
    if (Number.isFinite(a)) ahead = a;
  } catch {
    // No upstream tracking branch yet
  }

  // Gather per-file line stats from git diff --numstat (both unstaged & staged)
  const statMap = new Map<string, { add: number; del: number }>();
  for (const diffArgs of [
    ['diff', '--numstat'],
    ['diff', '--cached', '--numstat'],
  ]) {
    try {
      const { stdout } = await runGit(cwd, diffArgs);
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [a, d, ...fileParts] = line.split('\t');
        const filePath = fileParts.join('\t').trim();
        if (!filePath) continue;
        const add = a === '-' ? 0 : Number(a) || 0;
        const del = d === '-' ? 0 : Number(d) || 0;
        const cur = statMap.get(filePath) ?? { add: 0, del: 0 };
        cur.add += add;
        cur.del += del;
        statMap.set(filePath, cur);
      }
    } catch {
      // Ignore numstat error on unborn HEAD
    }
  }

  const files: GitChangedFile[] = [];
  try {
    const { stdout } = await runGit(cwd, ['status', '--porcelain=v1', '-uall']);
    for (const line of stdout.split(/\r?\n/)) {
      if (!line || line.length < 4) continue;
      const x = line[0];
      const y = line[1];
      let filePath = line.slice(3).trim();
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ').pop()!.trim();
      }
      // Strip surrounding quotes git adds for special chars
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1);
      }

      let status: GitChangedFile['status'] = 'modified';
      if (x === '?' && y === '?') status = 'untracked';
      else if (x === 'A' || y === 'A') status = 'added';
      else if (x === 'D' || y === 'D') status = 'deleted';
      else if (x === 'R' || y === 'R') status = 'renamed';

      let additions = statMap.get(filePath)?.add ?? 0;
      const deletions = statMap.get(filePath)?.del ?? 0;

      if (status === 'untracked' && additions === 0) {
        try {
          const full = path.join(cwd, filePath);
          const fstat = fs.statSync(full);
          if (fstat.isFile() && fstat.size < 512 * 1024) {
            additions = fs.readFileSync(full, 'utf8').split(/\r?\n/).length;
          }
        } catch {
          // Ignore binary/unreadable file
        }
      }

      files.push({
        path: filePath,
        status,
        staged: x !== ' ' && x !== '?',
        additions,
        deletions,
      });
    }
  } catch {
    // Ignore status errors
  }

  const remote = await detectGitHubRemote(cwd);
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return {
    isGitRepo: true,
    cwd,
    currentBranch,
    branches,
    remoteUrl: remote.htmlUrl,
    githubFullName: remote.fullName,
    ahead,
    behind,
    files,
    totalAdditions,
    totalDeletions,
  };
}

export async function getFileDiff(cwd: string, filePath: string): Promise<string> {
  // Check both HEAD diff (tracked) and untracked file preview
  try {
    const { stdout } = await runGit(cwd, ['diff', 'HEAD', '--', filePath]);
    if (stdout.trim()) return stdout;
  } catch {
    // Possibly unborn HEAD; try plain diff
    try {
      const { stdout } = await runGit(cwd, ['diff', '--', filePath]);
      if (stdout.trim()) return stdout;
    } catch {
      // Fall through
    }
  }

  try {
    const { stdout } = await runGit(cwd, ['diff', '--cached', '--', filePath]);
    if (stdout.trim()) return stdout;
  } catch {
    // Fall through
  }

  // Untracked / newly created file preview as synthetic unified diff
  const fullPath = path.join(cwd, filePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const stat = fs.statSync(fullPath);
    if (stat.size > 400 * 1024) {
      return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1 @@\n+[File too large to preview (${Math.round(stat.size / 1024)} KB)]`;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const body = lines.map((l) => `+${l}`).join('\n');
    return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${body}`;
  }

  return 'No diff available for this file.';
}

export async function checkoutBranch(
  cwd: string,
  branchName: string,
  createNew = false
): Promise<void> {
  const clean = branchName.trim();
  if (!clean) throw new Error('Branch name is required.');
  if (createNew) {
    await runGit(cwd, ['checkout', '-b', clean]);
  } else {
    await runGit(cwd, ['checkout', clean]);
  }
}

export async function discardFileChanges(cwd: string, filePath: string): Promise<void> {
  try {
    await runGit(cwd, ['checkout', '--', filePath]);
  } catch {
    // Untracked file
    const full = path.join(cwd, filePath);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
    }
  }
}

export async function stageAndCommitAll(
  cwd: string,
  message: string
): Promise<{ commitHash: string }> {
  const cleanMsg = message.trim();
  if (!cleanMsg) throw new Error('Commit message is required.');
  await runGit(cwd, ['add', '-A']);
  await runGit(cwd, ['commit', '-m', cleanMsg]);
  const { stdout } = await runGit(cwd, ['rev-parse', '--short', 'HEAD']);
  return { commitHash: stdout.trim() };
}

export async function pushCurrentBranch(
  cwd: string,
  githubToken?: string
): Promise<{ branch: string }> {
  const { stdout } = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = stdout.trim();
  let rawOriginUrl = '';
  try {
    const { stdout: urlOut } = await runGit(cwd, ['remote', 'get-url', 'origin']);
    rawOriginUrl = urlOut.trim();
  } catch {
    // Ignore missing remote
  }

  const args: string[] = [];
  if (githubToken && /^https?:\/\/github\.com\//i.test(rawOriginUrl)) {
    const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    args.push(
      '-c',
      'credential.helper=',
      '-c',
      `http.extraHeader=AUTHORIZATION: basic ${basicAuth}`
    );
  }
  args.push('push', '-u', 'origin', branch);

  await runGit(cwd, args);
  return { branch };
}

export function formatGitHubApiError(statusCode: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      message?: string;
      errors?: Array<{ message?: string; code?: string; field?: string }>;
    };
    const detail = parsed.errors?.find((e) => e.message)?.message;
    if (detail) {
      return detail;
    }
    if (parsed.message) {
      return `${parsed.message} (HTTP ${statusCode})`;
    }
  } catch {
    // Not JSON
  }
  return rawBody.trim().slice(0, 260) || `GitHub API error (HTTP ${statusCode})`;
}

async function countCommitsAheadOfBase(cwd: string, baseBranch: string): Promise<number | null> {
  for (const ref of [`origin/${baseBranch}`, baseBranch]) {
    try {
      const { stdout } = await runGit(cwd, ['rev-list', '--count', `${ref}..HEAD`]);
      const n = Number(stdout.trim());
      if (Number.isFinite(n)) return n;
    } catch {
      // Try next ref
    }
  }
  return null;
}

export async function createGitHubPullRequest(
  input: CreatePrInput,
  githubToken: string
): Promise<{ url: string; number: number }> {
  let status = await getGitWorkspaceStatus(input.cwd);
  if (!status.githubFullName) {
    throw new Error('This repository does not have a GitHub `origin` remote.');
  }
  const githubFullName = status.githubFullName;

  const baseBranch = input.baseBranch.trim() || 'main';

  if (status.currentBranch === baseBranch) {
    if (input.newBranchName?.trim()) {
      await checkoutBranch(input.cwd, input.newBranchName.trim(), true);
      status = await getGitWorkspaceStatus(input.cwd);
    } else {
      throw new Error(
        `Current branch (${status.currentBranch}) is the same as the base branch (${baseBranch}). Create a feature branch first.`
      );
    }
  }

  if (input.autoCommit && status.files.length > 0) {
    const commitMessage = input.commitMessage?.trim() || input.title.trim() || `Update ${status.currentBranch}`;
    await stageAndCommitAll(input.cwd, commitMessage);
    status = await getGitWorkspaceStatus(input.cwd);
  }

  const aheadCount = await countCommitsAheadOfBase(input.cwd, baseBranch);
  if (aheadCount === 0) {
    if (status.files.length > 0) {
      throw new Error(
        `No commits between ${baseBranch} and ${status.currentBranch} yet — you have ${status.files.length} uncommitted file(s). Enable "Commit uncommitted changes first" or click Stage & Commit first.`
      );
    }
    throw new Error(
      `No commits between ${baseBranch} and ${status.currentBranch}. Make and commit changes before opening a Pull Request.`
    );
  }

  // Ensure current branch is pushed to origin before opening PR
  await pushCurrentBranch(input.cwd, githubToken);

  const res = await fetch(
    `https://api.github.com/repos/${githubFullName}/pulls`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${githubToken}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'Switchboard-AI',
      },
      body: JSON.stringify({
        title: input.title.trim(),
        body: input.body.trim(),
        head: status.currentBranch,
        base: baseBranch,
        draft: Boolean(input.draft),
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const friendly = formatGitHubApiError(res.status, errText);

    // If a PR already exists for this branch -> base, return the existing PR cleanly
    if (res.status === 422 && /pull request already exists/i.test(friendly)) {
      const owner = githubFullName.split('/')[0];
      const existingRes = await fetch(
        `https://api.github.com/repos/${githubFullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${status.currentBranch}`)}&base=${encodeURIComponent(baseBranch)}`,
        {
          headers: {
            authorization: `Bearer ${githubToken}`,
            accept: 'application/vnd.github+json',
            'user-agent': 'Switchboard-AI',
          },
        }
      ).catch(() => null);

      if (existingRes?.ok) {
        const list = (await existingRes.json()) as Array<{ html_url: string; number: number }>;
        if (list.length > 0) {
          return { url: list[0].html_url, number: list[0].number };
        }
      }
    }

    throw new Error(friendly);
  }

  const pr = (await res.json()) as { html_url: string; number: number };
  return { url: pr.html_url, number: pr.number };
}

export async function getOpenPullRequestForBranch(
  cwd: string,
  githubToken: string
): Promise<GitHubPullRequestInfo | null> {
  const status = await getGitWorkspaceStatus(cwd);
  if (!status.isGitRepo || !status.githubFullName || !status.currentBranch || status.currentBranch === 'HEAD') {
    return null;
  }

  const owner = status.githubFullName.split('/')[0];
  const headers = {
    authorization: `Bearer ${githubToken}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'Switchboard-AI',
  };

  const listRes = await fetch(
    `https://api.github.com/repos/${status.githubFullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${status.currentBranch}`)}`,
    { headers }
  );
  if (!listRes.ok) {
    return null;
  }

  const list = (await listRes.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
    state: 'open' | 'closed';
    draft?: boolean;
    head: { ref: string };
    base: { ref: string };
  }>;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  const summary = list[0];

  // Fetch full PR details for mergeable state and diff counts
  try {
    const detailRes = await fetch(
      `https://api.github.com/repos/${status.githubFullName}/pulls/${summary.number}`,
      { headers }
    );
    if (detailRes.ok) {
      const detail = (await detailRes.json()) as {
        number: number;
        title: string;
        html_url: string;
        state: 'open' | 'closed';
        draft?: boolean;
        mergeable?: boolean | null;
        mergeable_state?: string;
        changed_files?: number;
        additions?: number;
        deletions?: number;
        commits?: number;
        head: { ref: string };
        base: { ref: string };
      };
      return {
        number: detail.number,
        title: detail.title,
        url: detail.html_url,
        state: detail.state,
        draft: Boolean(detail.draft),
        headBranch: detail.head.ref,
        baseBranch: detail.base.ref,
        mergeable: detail.mergeable ?? null,
        mergeableState: detail.mergeable_state,
        changedFiles: detail.changed_files,
        additions: detail.additions,
        deletions: detail.deletions,
        commits: detail.commits,
      };
    }
  } catch {
    // Fall back to summary
  }

  return {
    number: summary.number,
    title: summary.title,
    url: summary.html_url,
    state: summary.state,
    draft: Boolean(summary.draft),
    headBranch: summary.head.ref,
    baseBranch: summary.base.ref,
    mergeable: null,
  };
}

export async function mergeGitHubPullRequest(
  input: MergePrInput,
  githubToken: string
): Promise<MergePrResult> {
  const status = await getGitWorkspaceStatus(input.cwd);
  if (!status.githubFullName) {
    throw new Error('This repository does not have a GitHub `origin` remote.');
  }

  const githubFullName = status.githubFullName;
  const headers = {
    authorization: `Bearer ${githubToken}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'Switchboard-AI',
  };

  const payload: Record<string, string> = {
    merge_method: input.mergeMethod || 'squash',
  };
  if (input.commitTitle?.trim()) {
    payload.commit_title = input.commitTitle.trim();
  }

  const res = await fetch(
    `https://api.github.com/repos/${githubFullName}/pulls/${input.prNumber}/merge`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(formatGitHubApiError(res.status, errText));
  }

  const data = (await res.json()) as { merged?: boolean; sha?: string; message?: string };
  let deletedBranch = false;
  let switchedToBase: string | undefined;

  const headBranch = input.headBranch?.trim() || status.currentBranch;
  const baseBranch = input.baseBranch?.trim() || 'main';

  // Optional best-practice cleanup: delete merged remote head branch
  if (input.deleteBranch && headBranch && headBranch !== baseBranch) {
    try {
      const delRes = await fetch(
        `https://api.github.com/repos/${githubFullName}/git/refs/heads/${encodeURIComponent(headBranch)}`,
        { method: 'DELETE', headers }
      );
      if (delRes.ok || delRes.status === 204 || delRes.status === 422) {
        deletedBranch = true;
      }
    } catch {
      // Non-fatal: repository may auto-delete head branches
    }
  }

  // Optional best-practice sync: switch local checkout back to base branch & pull latest
  if (input.syncBaseBranch && status.files.length === 0 && baseBranch) {
    try {
      await runGit(input.cwd, ['checkout', baseBranch]);
      let rawOriginUrl = '';
      try {
        const { stdout: urlOut } = await runGit(input.cwd, ['remote', 'get-url', 'origin']);
        rawOriginUrl = urlOut.trim();
      } catch {
        // ignore
      }
      const pullArgs: string[] = [];
      if (githubToken && /^https?:\/\/github\.com\//i.test(rawOriginUrl)) {
        const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
        pullArgs.push(
          '-c',
          'credential.helper=',
          '-c',
          `http.extraHeader=AUTHORIZATION: basic ${basicAuth}`
        );
      }
      pullArgs.push('pull', '--ff-only', 'origin', baseBranch);
      await runGit(input.cwd, pullArgs);
      switchedToBase = baseBranch;

      // Also prune local merged branch if user chose deleteBranch
      if (input.deleteBranch && headBranch && headBranch !== baseBranch) {
        await runGit(input.cwd, ['branch', '-d', headBranch]).catch(() => {
          // Squash merges aren't detected as merged by `-d`; leave safe or ignore
        });
      }
    } catch {
      // Non-fatal: PR is already merged on GitHub
    }
  }

  return {
    merged: data.merged !== false,
    sha: data.sha,
    message: data.message || `Pull Request #${input.prNumber} merged.`,
    deletedBranch,
    switchedToBase,
  };
}

function emptyStatus(cwd: string): GitWorkspaceStatus {
  return {
    isGitRepo: false,
    cwd,
    currentBranch: '',
    branches: [],
    ahead: 0,
    behind: 0,
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  };
}
