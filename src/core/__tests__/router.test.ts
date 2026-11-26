import { describe, expect, it } from 'vitest';
import { createStarterAccounts, DEFAULT_ROUTING_RULES } from '../../shared/presets';
import { detectRateLimit } from '../rateLimit';
import { selectAccountForTask } from '../router';

describe('detectRateLimit', () => {
  it('detects HTTP 429 and parses Retry-After header', () => {
    const res = detectRateLimit('Too many requests', 429, '120');
    expect(res.isRateLimited).toBe(true);
    expect(res.retryAfterMs).toBe(120_000);
  });

  it('detects Claude/Gemini CLI quota messages and relative reset duration', () => {
    const res = detectRateLimit(
      'Error: Usage limit reached for this session. Please try again in 30 minutes.'
    );
    expect(res.isRateLimited).toBe(true);
    expect(res.retryAfterMs).toBe(30 * 60 * 1000);
  });

  it('ignores normal execution output', () => {
    const res = detectRateLimit('All 42 unit tests passed cleanly.');
    expect(res.isRateLimited).toBe(false);
  });
});

describe('selectAccountForTask', () => {
  it('routes large-context tasks to Google AI Pro (Gemini) by capability score', () => {
    const accounts = createStarterAccounts('/tmp/sb-test');
    const selection = selectAccountForTask(accounts, DEFAULT_ROUTING_RULES, {
      category: 'large-context',
      workspaceScope: 'any',
    });
    expect(selection?.account.id).toBe('acc-google-pro');
  });

  it('routes coding tasks to Claude Team first and skips cooled-down accounts', () => {
    const accounts = createStarterAccounts('/tmp/sb-test');
    const first = selectAccountForTask(accounts, DEFAULT_ROUTING_RULES, {
      category: 'coding',
      workspaceScope: 'team',
    });
    expect(first?.account.id).toBe('acc-claude-team');

    // Put Claude Team into cooldown
    accounts[0].cooldownUntil = Date.now() + 60_000;
    const second = selectAccountForTask(accounts, DEFAULT_ROUTING_RULES, {
      category: 'coding',
      workspaceScope: 'team',
    });
    expect(second?.account.id).toBe('acc-claude-personal');
  });

  it('respects strict workspace isolation when cross-scope failover is disabled', () => {
    const accounts = createStarterAccounts('/tmp/sb-test');
    const rules = DEFAULT_ROUTING_RULES.map((r) =>
      r.category === 'coding' ? { ...r, allowCrossScopeFailover: false } : r
    );
    accounts[0].cooldownUntil = Date.now() + 60_000; // Claude Team unavailable

    const selection = selectAccountForTask(accounts, rules, {
      category: 'coding',
      workspaceScope: 'team',
    });
    expect(selection).toBeNull();
  });
});
