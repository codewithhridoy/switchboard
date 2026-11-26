import { describe, expect, it } from 'vitest';
import { createStarterAccounts, DEFAULT_ROUTING_RULES } from '../../shared/presets';
import { UsageRecord } from '../../shared/types';
import { selectAccountForTask } from '../router';
import { computeUsageSummaries, isAccountOverConfiguredLimit } from '../usage';

describe('computeUsageSummaries and proactive budget limits', () => {
  it('aggregates 5-hour, daily, and weekly buckets plus 7-day series', () => {
    const now = new Date('2026-11-27T15:00:00Z').getTime();
    const accounts = createStarterAccounts('/tmp/sb-usage-test');

    const log: UsageRecord[] = [
      // 1 hour ago (counts in 5h, daily, weekly)
      {
        id: 'u1',
        timestamp: now - 60 * 60 * 1000,
        accountId: 'acc-claude-team',
        provider: 'claude-cli',
        model: 'claude-opus-5-5',
        inputTokens: 10000,
        outputTokens: 5000,
        cacheTokens: 20000,
        durationMs: 2500,
        status: 'completed',
        source: 'switchboard',
      },
      // 3 days ago (counts only in weekly)
      {
        id: 'u2',
        timestamp: now - 3 * 24 * 60 * 60 * 1000,
        accountId: 'acc-claude-team',
        provider: 'claude-cli',
        model: 'claude-sonnet-5-5',
        inputTokens: 30000,
        outputTokens: 10000,
        cacheTokens: 0,
        durationMs: 3000,
        status: 'completed',
        source: 'switchboard',
      },
      // Rate-limit event
      {
        id: 'u3',
        timestamp: now - 2 * 60 * 60 * 1000,
        accountId: 'acc-claude-team',
        provider: 'claude-cli',
        model: 'claude-opus-5-5',
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        durationMs: 400,
        status: 'rate-limited',
        source: 'switchboard',
      },
    ];

    const summaries = computeUsageSummaries(accounts, log, now, { scanLocalClaude: false });
    const team = summaries['acc-claude-team'];

    expect(team.session5h.totalTokens).toBe(15000);
    expect(team.session5h.runs).toBe(1);
    expect(team.daily.totalTokens).toBe(15000);
    expect(team.weekly.totalTokens).toBe(55000);
    expect(team.weekly.runs).toBe(2);
    expect(team.rateLimitHits7d).toBe(1);
    expect(team.dailySeries).toHaveLength(7);
  });

  it('proactively routes away when an account hits its configured daily cap', () => {
    const now = Date.now();
    const accounts = createStarterAccounts('/tmp/sb-usage-test');
    accounts[0].limits = {
      session5hTokens: 500_000,
      dailyTokens: 10_000,
      weeklyTokens: 100_000,
      dailyRuns: 50,
      weeklyRuns: 200,
      autoSwitchOnLimit: true,
    };

    const log: UsageRecord[] = [
      {
        id: 'u-cap',
        timestamp: now - 10_000,
        accountId: 'acc-claude-team',
        provider: 'claude-cli',
        model: 'claude-opus-5-5',
        inputTokens: 8000,
        outputTokens: 3000,
        cacheTokens: 0,
        durationMs: 1000,
        status: 'completed',
        source: 'switchboard',
      },
    ];

    const summaries = computeUsageSummaries(accounts, log, now, { scanLocalClaude: false });
    expect(isAccountOverConfiguredLimit(accounts[0], summaries['acc-claude-team']).overLimit).toBe(
      true
    );

    const selection = selectAccountForTask(accounts, DEFAULT_ROUTING_RULES, {
      category: 'coding',
      workspaceScope: 'team',
      usageSummaries: summaries,
      now,
    });
    // Should skip Claude Team (over daily cap) and pick Claude Personal
    expect(selection?.account.id).toBe('acc-claude-personal');
  });
});
