import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSyncPayload,
  decryptSecretsBlob,
  encryptSecretsBlob,
  mergeSyncedPayload,
} from '../githubSync';
import { SwitchboardStore } from '../store';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('GitHub Sync encryption and merge', () => {
  it('encrypts and decrypts API secrets with AES-256-GCM', () => {
    const secrets = { 'acc-api': 'sk-test-secret-12345' };
    const blob = encryptSecretsBlob(secrets, 'my-strong-pass');
    expect(blob).not.toContain('sk-test-secret-12345');
    expect(decryptSecretsBlob(blob, 'my-strong-pass')).toEqual(secrets);
    expect(() => decryptSecretsBlob(blob, 'wrong-pass')).toThrow();
  });

  it('strips API keys by default and merges projects, threads, and accounts cleanly', () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-sync-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-sync-b-'));
    tempDirs.push(dirA, dirB);

    const storeA = new SwitchboardStore(dirA);
    const dataA = storeA.getData();
    dataA.accounts.push({
      id: 'acc-openrouter',
      name: 'OpenRouter',
      provider: 'openai-compatible',
      model: 'anthropic/claude-sonnet-5.5',
      scope: 'any',
      enabled: true,
      priority: 4,
      tags: ['API'],
      strengths: {},
      apiKey: 'sk-or-secret-xyz',
      baseUrl: 'https://openrouter.ai/api/v1',
      totalRuns: 2,
      totalFailovers: 0,
    });
    dataA.projects.push({
      id: 'proj-demo',
      name: 'Demo App',
      path: '/Users/demo/demo-app',
      scope: 'personal',
      githubRepoUrl: 'https://github.com/demo/demo-app',
      createdAt: 1000,
      updatedAt: 2000,
    });
    dataA.threads.push({
      id: 'thr-1',
      projectId: 'proj-demo',
      title: 'Auth refactor',
      createdAt: 1000,
      updatedAt: 2000,
    });

    const payload = buildSyncPayload(dataA, {
      includeTasks: true,
      encryptSecrets: false,
    });

    // API key must NOT appear anywhere in unencrypted payload
    expect(JSON.stringify(payload)).not.toContain('sk-or-secret-xyz');
    expect(payload.projects).toHaveLength(1);
    expect(payload.threads).toHaveLength(1);

    // Restore into a fresh machine storeB
    const storeB = new SwitchboardStore(dirB);
    const stats = mergeSyncedPayload(storeB.getData(), payload);
    expect(stats.restoredProjects).toBe(1);
    expect(storeB.getData().projects[0].name).toBe('Demo App');
    expect(storeB.getData().threads[0].title).toBe('Auth refactor');
    expect(storeB.getData().accounts.some((a) => a.id === 'acc-openrouter')).toBe(true);
  });
});
