import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkoutBranch,
  formatGitHubApiError,
  getFileDiff,
  getGitWorkspaceStatus,
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
});
