import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { CreatePrInput, GitChangedFile, GitWorkspaceStatus } from '../shared/types';
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
  const remote = await detectGitHubRemote(cwd);

  const args: string[] = [];
  if (githubToken && remote.htmlUrl) {
    const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    args.push('-c', `http.extraHeader=AUTHORIZATION: basic ${basicAuth}`);
  }
  args.push('push', '-u', 'origin', branch);

  await runGit(cwd, args);
  return { branch };
}

export async function createGitHubPullRequest(
  input: CreatePrInput,
  githubToken: string
): Promise<{ url: string; number: number }> {
  const status = await getGitWorkspaceStatus(input.cwd);
  if (!status.githubFullName) {
    throw new Error('This repository does not have a GitHub `origin` remote.');
  }
  if (status.currentBranch === input.baseBranch) {
    throw new Error(
      `Current branch (${status.currentBranch}) is the same as the base branch. Switch to or create a feature branch first.`
    );
  }

  // Ensure current branch is pushed to origin before opening PR
  await pushCurrentBranch(input.cwd, githubToken);

  const res = await fetch(
    `https://api.github.com/repos/${status.githubFullName}/pulls`,
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
        base: input.baseBranch.trim() || 'main',
        draft: Boolean(input.draft),
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to create Pull Request (${res.status}): ${errText.slice(0, 260)}`);
  }

  const pr = (await res.json()) as { html_url: string; number: number };
  return { url: pr.html_url, number: pr.number };
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
