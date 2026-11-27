import { describe, expect, it } from 'vitest';
import { normalizeRepoCloneUrl } from '../projects';

describe('normalizeRepoCloneUrl', () => {
  it('expands owner/repo shorthand to GitHub HTTPS URL', () => {
    expect(normalizeRepoCloneUrl('codewithhridoy/switchboard')).toEqual({
      cloneUrl: 'https://github.com/codewithhridoy/switchboard.git',
      defaultFolderName: 'switchboard',
      isGitHubHttps: true,
    });
  });

  it('parses HTTPS .git URLs cleanly', () => {
    expect(normalizeRepoCloneUrl('https://github.com/org/my-service.git')).toEqual({
      cloneUrl: 'https://github.com/org/my-service.git',
      defaultFolderName: 'my-service',
      isGitHubHttps: true,
    });
  });

  it('parses SSH URLs cleanly without marking as HTTPS', () => {
    expect(normalizeRepoCloneUrl('git@github.com:org/internal-app.git')).toEqual({
      cloneUrl: 'git@github.com:org/internal-app.git',
      defaultFolderName: 'internal-app',
      isGitHubHttps: false,
    });
  });
});
