import {
  AccountProfile,
  AccountScope,
  AccountStatus,
  RoutingRule,
  TaskCategory,
} from '../shared/types';

export interface RouteSelection {
  account: AccountProfile;
  reason: string;
  score: number;
  alternatives: AccountProfile[];
}

export interface RouteOptions {
  category: TaskCategory;
  workspaceScope: AccountScope;
  workspaceDir?: string;
  forcedAccountId?: string | null;
  excludeAccountIds?: string[];
  now?: number;
}

export function getAccountStatus(account: AccountProfile, now = Date.now()): AccountStatus {
  if (!account.enabled) return 'disabled';
  if (account.cooldownUntil && account.cooldownUntil > now) return 'cooldown';
  if (
    (account.provider === 'anthropic-api' ||
      account.provider === 'gemini-api' ||
      account.provider === 'openai-compatible') &&
    !account.apiKey &&
    !(account.baseUrl && /localhost|127\.0\.0\.1/.test(account.baseUrl))
  ) {
    return 'needs-setup';
  }
  return 'ready';
}

export function isAccountEligible(
  account: AccountProfile,
  opts: {
    workspaceScope: AccountScope;
    workspaceDir?: string;
    allowCrossScope: boolean;
    excludeAccountIds?: string[];
    now?: number;
  }
): { eligible: boolean; reason?: string } {
  const now = opts.now ?? Date.now();
  if (opts.excludeAccountIds?.includes(account.id)) {
    return { eligible: false, reason: 'Already attempted for this subtask' };
  }

  const status = getAccountStatus(account, now);
  if (status !== 'ready') {
    return { eligible: false, reason: `Account status is ${status}` };
  }

  if (
    !opts.allowCrossScope &&
    opts.workspaceScope !== 'any' &&
    account.scope !== 'any' &&
    account.scope !== opts.workspaceScope
  ) {
    return {
      eligible: false,
      reason: `Scope mismatch (${account.scope} vs ${opts.workspaceScope})`,
    };
  }

  if (
    opts.workspaceDir &&
    account.allowedWorkspacePrefixes &&
    account.allowedWorkspacePrefixes.length > 0
  ) {
    const normalized = opts.workspaceDir.toLowerCase();
    const matched = account.allowedWorkspacePrefixes.some((prefix) =>
      normalized.startsWith(prefix.toLowerCase())
    );
    if (!matched) {
      return { eligible: false, reason: 'Workspace outside allowed prefixes' };
    }
  }

  return { eligible: true };
}

/**
 * Selects the optimal active account for a task category, respecting explicit routing rules,
 * workspace scope isolation, cooldowns, capability scores, and priority order.
 */
export function selectAccountForTask(
  accounts: AccountProfile[],
  routingRules: RoutingRule[],
  options: RouteOptions
): RouteSelection | null {
  const now = options.now ?? Date.now();
  const exclude = options.excludeAccountIds ?? [];
  const rule = routingRules.find((r) => r.category === options.category);
  const allowCrossScope = rule?.allowCrossScopeFailover ?? true;

  // 1. Honor explicit forced account if eligible (and not yet excluded by a failover)
  if (options.forcedAccountId && !exclude.includes(options.forcedAccountId)) {
    const forced = accounts.find((a) => a.id === options.forcedAccountId);
    if (forced && getAccountStatus(forced, now) === 'ready') {
      return {
        account: forced,
        reason: `Pinned manually by user (${forced.model})`,
        score: 1000,
        alternatives: [],
      };
    }
  }

  // 2. First pass: prefer accounts matching workspace scope strictly; second pass allows cross-scope if permitted
  const evaluatePool = (strictScope: boolean) => {
    const candidates = accounts.filter((acc) => {
      const check = isAccountEligible(acc, {
        workspaceScope: options.workspaceScope,
        workspaceDir: options.workspaceDir,
        allowCrossScope: !strictScope && allowCrossScope,
        excludeAccountIds: exclude,
        now,
      });
      return check.eligible;
    });

    const preferredIds = rule?.preferredAccountIds ?? [];

    const scored = candidates.map((acc) => {
      const preferredIdx = preferredIds.indexOf(acc.id);
      const preferenceBonus = preferredIdx >= 0 ? 500 - preferredIdx * 25 : 0;
      const capabilityScore = acc.strengths[options.category] ?? 75;
      const scopeBonus =
        options.workspaceScope !== 'any' && acc.scope === options.workspaceScope ? 20 : 0;
      // Small priority tiebreaker (priority 1 gets +10, priority 2 gets +8, etc.)
      const priorityBonus = Math.max(0, 12 - acc.priority * 2);
      const totalScore = preferenceBonus + capabilityScore + scopeBonus + priorityBonus;

      const reasonParts: string[] = [];
      if (preferredIdx >= 0) {
        reasonParts.push(`Rule #${preferredIdx + 1} for ${options.category}`);
      } else {
        reasonParts.push(`Best fit for ${options.category} (${capabilityScore}/100)`);
      }
      if (scopeBonus > 0) {
        reasonParts.push(`matches ${options.workspaceScope} scope`);
      }
      if (exclude.length > 0) {
        reasonParts.push('automatic failover');
      }

      return {
        account: acc,
        score: totalScore,
        reason: reasonParts.join(' · '),
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.account.priority - b.account.priority;
    });

    return scored;
  };

  let ranked = evaluatePool(true);
  if (ranked.length === 0 && allowCrossScope) {
    ranked = evaluatePool(false);
  }

  if (ranked.length === 0) return null;

  return {
    account: ranked[0].account,
    reason: ranked[0].reason,
    score: ranked[0].score,
    alternatives: ranked.slice(1).map((item) => item.account),
  };
}

/**
 * Returns the earliest timestamp when any cooled-down account will become ready again.
 */
export function getNextCooldownExpiry(accounts: AccountProfile[], now = Date.now()): number | null {
  const expiries = accounts
    .filter((a) => a.enabled && a.cooldownUntil && a.cooldownUntil > now)
    .map((a) => a.cooldownUntil as number);

  if (expiries.length === 0) return null;
  return Math.min(...expiries);
}
