import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkoutBranch,
  formatGitHubApiError,
  getFileDiff,
  getGitWorkspaceStatus,
  getOpenPullRequestForBranch,
  mergeGitHubPullRequest,
  stageAndCommitAll,
} from '../gitWorkspace';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('gitWorkspace', () => {
  it('inspects changed files, computes unified diffs, switches branches, and commits', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-git-test-'));
    tempDirs.push(dir);

    execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@switchboard.dev'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Switchboard Test'], { cwd: dir });

    fs.writeFileSync(path.join(dir, 'app.ts'), 'export const v = 1;\n', 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });

    // Create feature branch
    await checkoutBranch(dir, 'feat/demo', true);
    fs.writeFileSync(path.join(dir, 'app.ts'), 'export const v = 2;\nexport const ok = true;\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'newfile.ts'), 'export const fresh = 42;\n', 'utf8');

    const status = await getGitWorkspaceStatus(dir);
    expect(status.isGitRepo).toBe(true);
    expect(status.currentBranch).toBe('feat/demo');
    expect(status.branches).toContain('main');
    expect(status.branches).toContain('feat/demo');
    expect(status.files.map((f) => f.path).sort()).toEqual(['app.ts', 'newfile.ts']);

    const diffTracked = await getFileDiff(dir, 'app.ts');
    expect(diffTracked).toContain('-export const v = 1;');
    expect(diffTracked).toContain('+export const v = 2;');

    const diffUntracked = await getFileDiff(dir, 'newfile.ts');
    expect(diffUntracked).toContain('+export const fresh = 42;');

    const commit = await stageAndCommitAll(dir, 'feat: bump version');
    expect(commit.commitHash.length).toBeGreaterThan(4);

    const afterCommit = await getGitWorkspaceStatus(dir);
    expect(afterCommit.files).toHaveLength(0);
  });

  it('formats GitHub 422 JSON validation errors into clean human messages', () => {
    const raw = JSON.stringify({
      message: 'Validation Failed',
      errors: [
        {
          resource: 'PullRequest',
          code: 'custom',
          message: 'No commits between main and feat/p0-followups',
        },
      ],
    });
    expect(formatGitHubApiError(422, raw)).toBe(
      'No commits between main and feat/p0-followups'
    );
  });

  it('fetches open PR for current branch and merges via GitHub API', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-git-pr-'));
    tempDirs.push(dir);

    execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@switchboard.dev'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Switchboard Test'], { cwd: dir });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/octocat/demo.git'], {
      cwd: dir,
    });
    fs.writeFileSync(path.join(dir, 'index.ts'), 'export const a = 1;\n', 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
    await checkoutBranch(dir, 'feat/pr-merge', true);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/pulls?state=open')) {
        return new Response(
          JSON.stringify([
            {
              number: 7,
              title: 'Add merge flow',
              html_url: 'https://github.com/octocat/demo/pull/7',
              state: 'open',
              draft: false,
              head: { ref: 'feat/pr-merge' },
              base: { ref: 'main' },
            },
          ]),
          { status: 200 }
        );
      }
      if (url.endsWith('/pulls/7') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            number: 7,
            title: 'Add merge flow',
            html_url: 'https://github.com/octocat/demo/pull/7',
            state: 'open',
            draft: false,
            mergeable: true,
            mergeable_state: 'clean',
            changed_files: 3,
            additions: 40,
            deletions: 5,
            commits: 1,
            head: { ref: 'feat/pr-merge' },
            base: { ref: 'main' },
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/pulls/7/merge') && init?.method === 'PUT') {
        return new Response(
          JSON.stringify({ merged: true, sha: 'abc1234', message: 'Pull Request successfully merged' }),
          { status: 200 }
        );
      }
      if (url.includes('/git/refs/heads/') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response('Not Found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      const pr = await getOpenPullRequestForBranch(dir, 'fake-token');
      expect(pr).toMatchObject({
        number: 7,
        title: 'Add merge flow',
        headBranch: 'feat/pr-merge',
        baseBranch: 'main',
        mergeable: true,
        changedFiles: 3,
      });

      const merged = await mergeGitHubPullRequest(
        {
          cwd: dir,
          prNumber: 7,
          mergeMethod: 'squash',
          commitTitle: 'Add merge flow (#7)',
          deleteBranch: true,
          syncBaseBranch: false,
          headBranch: 'feat/pr-merge',
          baseBranch: 'main',
        },
        'fake-token'
      );
      expect(merged.merged).toBe(true);
      expect(merged.sha).toBe('abc1234');
      expect(merged.deletedBranch).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
