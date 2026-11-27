import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SwitchboardOrchestrator } from '../orchestrator';
import { ProviderRunner, RunRequest, RunResult } from '../runners/types';
import { SwitchboardStore } from '../store';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('SwitchboardOrchestrator failover flow', () => {
  it('automatically fails over from Claude Team to Claude Personal on limit and routes large-context to Google Pro', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-test-'));
    tempDirs.push(tmp);

    const store = new SwitchboardStore(tmp);
    const callLog: Array<{ accountId: string; promptSnippet: string }> = [];

    const mockRunner: ProviderRunner = {
      async run(req: RunRequest): Promise<RunResult> {
        callLog.push({
          accountId: req.account.id,
          promptSnippet: req.prompt.slice(0, 120),
        });

        // Simulate Claude Team hitting its usage limit
        if (req.account.id === 'acc-claude-team') {
          req.onChunk('Started step 1...\n', 'stdout');
          return {
            ok: false,
            output: 'Started step 1...',
            rateLimited: true,
            rateLimitReason: 'Subscription usage limit reached',
            retryAfterMs: 30 * 60 * 1000,
            error: 'Usage limit reached',
          };
        }

        const out = `Completed by ${req.account.name}`;
        req.onChunk(out, 'stdout');
        return { ok: true, output: out };
      },
    };

    const orchestrator = new SwitchboardOrchestrator({
      store,
      runnerFactory: () => mockRunner,
    });

    const task = orchestrator.enqueueTask({
      mode: 'coding',
      workspaceScope: 'team',
      autoDecompose: true,
      prompt: `1. Implement the payment webhook handler in TypeScript with unit tests.
2. Audit the entire codebase across all files for dead code and large-context issues.`,
    });

    // Wait for background queue processing to finish
    await new Promise<void>((resolve) => {
      const check = () => {
        const cur = orchestrator.getState().tasks.find((t) => t.id === task.id);
        if (cur && (cur.status === 'completed' || cur.status === 'failed')) {
          resolve();
        } else {
          setTimeout(check, 20);
        }
      };
      check();
    });

    const finalState = orchestrator.getState();
    const finalTask = finalState.tasks.find((t) => t.id === task.id)!;

    expect(finalTask.status).toBe('completed');
    expect(finalTask.failoverCount).toBe(1);
    expect(finalTask.subtasks).toHaveLength(2);

    // Step 1: Coding -> tried Claude Team (rate limited), failed over to Claude Personal
    expect(finalTask.subtasks[0].attempts.map((a) => a.accountId)).toEqual([
      'acc-claude-team',
      'acc-claude-personal',
    ]);
    expect(finalTask.subtasks[0].status).toBe('completed');

    // Step 2: Large-context -> auto-routed directly to Google AI Pro
    expect(finalTask.subtasks[1].assignedAccountId).toBe('acc-google-pro');
    expect(finalTask.subtasks[1].status).toBe('completed');

    // Claude Team should now be in cooldown
    const claudeTeam = finalState.accounts.find((a) => a.id === 'acc-claude-team')!;
    expect(claudeTeam.cooldownUntil).toBeGreaterThan(Date.now());

    // Failover handoff prompt should include context from Claude Team
    expect(callLog[1].accountId).toBe('acc-claude-personal');
  });

  it('auto-creates a thread and carries Turn 1 history into a follow-up Turn 2 reply', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-thread-'));
    tempDirs.push(tmp);

    const store = new SwitchboardStore(tmp);
    const seenPrompts: string[] = [];

    const mockRunner: ProviderRunner = {
      async run(req: RunRequest): Promise<RunResult> {
        seenPrompts.push(req.prompt);
        const out = `Reply #${seenPrompts.length} from ${req.account.name}`;
        req.onChunk(out, 'stdout');
        return { ok: true, output: out };
      },
    };

    const orchestrator = new SwitchboardOrchestrator({
      store,
      runnerFactory: () => mockRunner,
    });

    const waitDone = (taskId: string) =>
      new Promise<void>((resolve) => {
        const check = () => {
          const cur = orchestrator.getState().tasks.find((t) => t.id === taskId);
          if (cur && (cur.status === 'completed' || cur.status === 'failed')) {
            resolve();
          } else {
            setTimeout(check, 15);
          }
        };
        check();
      });

    // Turn 1 (no threadId provided -> auto-creates a thread!)
    const turn1 = orchestrator.enqueueTask({
      mode: 'general',
      prompt: 'Remember the secret codename PINEAPPLE.',
      autoDecompose: false,
    });
    expect(turn1.threadId).toBeTruthy();
    await waitDone(turn1.id);

    // Turn 2 reply in the exact same thread
    const turn2 = orchestrator.enqueueTask({
      mode: 'general',
      threadId: turn1.threadId,
      prompt: 'What codename did I ask you to remember?',
      autoDecompose: false,
    });
    await waitDone(turn2.id);

    expect(seenPrompts).toHaveLength(2);
    expect(seenPrompts[1]).toContain('PINEAPPLE');
    expect(seenPrompts[1]).toContain('Reply #1');
  });
});
