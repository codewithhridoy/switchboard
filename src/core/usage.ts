import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AccountLimits,
  AccountProfile,
  AccountUsageSummary,
  ProviderKind,
  UsageBucket,
  UsageRecord,
} from '../shared/types';

export function getDefaultLimitsForProvider(provider: ProviderKind): AccountLimits {
  switch (provider) {
    case 'claude-cli':
      return {
        session5hTokens: 500_000,
        dailyTokens: 2_000_000,
        weeklyTokens: 10_000_000,
        dailyRuns: 100,
        weeklyRuns: 500,
        autoSwitchOnLimit: false,
      };
    case 'agy-cli':
    case 'gemini-cli':
      return {
        session5hTokens: 1_000_000,
        dailyTokens: 4_000_000,
        weeklyTokens: 20_000_000,
        dailyRuns: 150,
        weeklyRuns: 750,
        autoSwitchOnLimit: false,
      };
    default:
      return {
        session5hTokens: 600_000,
        dailyTokens: 2_500_000,
        weeklyTokens: 12_000_000,
        dailyRuns: 120,
        weeklyRuns: 600,
        autoSwitchOnLimit: false,
      };
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function emptyBucket(): UsageBucket {
  return { runs: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 };
}

function addToBucket(bucket: UsageBucket, rec: UsageRecord): void {
  bucket.runs += 1;
  bucket.inputTokens += rec.inputTokens;
  bucket.outputTokens += rec.outputTokens;
  bucket.cacheTokens += rec.cacheTokens;
  // Count input + output (excluding cheap cache reads from headline token budget so bars match practical quota)
  bucket.totalTokens += rec.inputTokens + rec.outputTokens;
}

/**
 * Reads local Claude Code CLI JSONL transcripts from the account's config directory
 * (`~/.claude` or isolated `CLAUDE_CONFIG_DIR`) over the past 7 days to surface
 * real token usage including sessions run outside Switchboard.
 */
export function scanClaudeProfileUsage(
  account: AccountProfile,
  sinceMs: number
): UsageRecord[] {
  if (account.provider !== 'claude-cli') return [];

  const configDir = account.useDefaultProfile
    ? path.join(os.homedir(), '.claude')
    : account.profileDir;

  if (!configDir) return [];
  const projectsRoot = path.join(configDir, 'projects');
  if (!fs.existsSync(projectsRoot)) return [];

  const records: UsageRecord[] = [];
  const seenMessageIds = new Set<string>();

  try {
    const projectDirs = fs.readdirSync(projectsRoot);
    for (const dirName of projectDirs) {
      const fullDir = path.join(projectsRoot, dirName);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let files: string[];
      try {
        files = fs.readdirSync(fullDir).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = path.join(fullDir, file);
        try {
          const fstat = fs.statSync(filePath);
          if (fstat.mtimeMs < sinceMs) continue;
          // Skip unusually massive files (>25MB) to keep UI snappy
          if (fstat.size > 25 * 1024 * 1024) continue;

          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (!line || !line.includes('"usage"')) continue;
            try {
              const obj = JSON.parse(line) as {
                timestamp?: string;
                uuid?: string;
                message?: {
                  id?: string;
                  model?: string;
                  usage?: {
                    input_tokens?: number;
                    output_tokens?: number;
                    cache_read_input_tokens?: number;
                    cache_creation_input_tokens?: number;
                  };
                };
              };
              const usage = obj.message?.usage;
              if (!usage) continue;

              const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
              if (!Number.isFinite(ts) || ts < sinceMs) continue;

              const dedupKey = obj.message?.id || obj.uuid || `${ts}-${usage.output_tokens}`;
              if (seenMessageIds.has(dedupKey)) continue;
              seenMessageIds.add(dedupKey);

              const inputTokens = Number(usage.input_tokens ?? 0);
              const outputTokens = Number(usage.output_tokens ?? 0);
              const cacheTokens =
                Number(usage.cache_read_input_tokens ?? 0) +
                Number(usage.cache_creation_input_tokens ?? 0);

              if (inputTokens + outputTokens + cacheTokens <= 0) continue;

              records.push({
                id: `cl-${dedupKey}`,
                timestamp: ts,
                accountId: account.id,
                provider: 'claude-cli',
                model: obj.message?.model || account.model,
                inputTokens,
                outputTokens,
                cacheTokens,
                durationMs: 0,
                status: 'completed',
                source: 'claude-local',
              });
            } catch {
              // Ignore malformed JSONL line
            }
          }
        } catch {
          // Ignore unreadable file
        }
      }
    }
  } catch {
    // Ignore unreadable projects root
  }

  return records;
}

export function computeUsageSummaries(
  accounts: AccountProfile[],
  switchboardLog: UsageRecord[],
  now = Date.now(),
  options: { scanLocalClaude?: boolean } = { scanLocalClaude: true }
): Record<string, AccountUsageSummary> {
  const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const sevenDaysAgo = todayMs - 6 * 24 * 60 * 60 * 1000;

  // Build 7-day calendar labels (oldest -> today)
  const dayKeys: Array<{ key: string; label: string; startMs: number; endMs: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayMs - i * 24 * 60 * 60 * 1000);
    const key = formatLocalDateKey(d);
    const label = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
    dayKeys.push({
      key,
      label,
      startMs: d.getTime(),
      endMs: d.getTime() + 24 * 60 * 60 * 1000,
    });
  }

  const summaries: Record<string, AccountUsageSummary> = {};

  for (const acc of accounts) {
    const sbRecords = switchboardLog.filter(
      (r) => r.accountId === acc.id && r.timestamp >= sevenDaysAgo
    );

    const claudeLocal =
      options.scanLocalClaude !== false && acc.provider === 'claude-cli'
        ? scanClaudeProfileUsage(acc, sevenDaysAgo)
        : [];

    // Avoid double counting Switchboard-originated Claude runs when local Claude JSONL also captured them
    const merged: UsageRecord[] = [...claudeLocal];
    for (const sb of sbRecords) {
      const hasCloseClaudeLog =
        sb.status === 'completed' &&
        claudeLocal.some((cl) => Math.abs(cl.timestamp - sb.timestamp) < 15_000);
      if (!hasCloseClaudeLog) {
        merged.push(sb);
      }
    }

    const session5h = emptyBucket();
    const daily = emptyBucket();
    const weekly = emptyBucket();
    const byModelMap = new Map<string, { tokens: number; runs: number }>();
    const seriesMap = new Map<string, { tokens: number; runs: number }>(
      dayKeys.map((d) => [d.key, { tokens: 0, runs: 0 }])
    );

    let rateLimitHits7d = 0;

    for (const rec of merged) {
      if (rec.status === 'rate-limited') {
        rateLimitHits7d += 1;
        continue;
      }
      if (rec.status !== 'completed') continue;

      addToBucket(weekly, rec);
      if (rec.timestamp >= todayMs) addToBucket(daily, rec);
      if (rec.timestamp >= fiveHoursAgo) addToBucket(session5h, rec);

      const tok = rec.inputTokens + rec.outputTokens;
      const mEntry = byModelMap.get(rec.model) ?? { tokens: 0, runs: 0 };
      mEntry.tokens += tok;
      mEntry.runs += 1;
      byModelMap.set(rec.model, mEntry);

      const recDayKey = formatLocalDateKey(new Date(rec.timestamp));
      const dayEntry = seriesMap.get(recDayKey);
      if (dayEntry) {
        dayEntry.tokens += tok;
        dayEntry.runs += 1;
      }
    }

    // Also include Switchboard rate-limit events explicitly
    for (const sb of sbRecords) {
      if (sb.status === 'rate-limited' && !merged.includes(sb)) {
        rateLimitHits7d += 1;
      }
    }

    summaries[acc.id] = {
      accountId: acc.id,
      session5h,
      daily,
      weekly,
      dailySeries: dayKeys.map((d) => ({
        date: d.key,
        label: d.label,
        tokens: seriesMap.get(d.key)?.tokens ?? 0,
        runs: seriesMap.get(d.key)?.runs ?? 0,
      })),
      byModel: Array.from(byModelMap.entries())
        .map(([model, v]) => ({ model, tokens: v.tokens, runs: v.runs }))
        .sort((a, b) => b.tokens - a.tokens),
      rateLimitHits7d,
      dataSource: acc.provider === 'claude-cli' ? 'claude-local+switchboard' : 'switchboard',
    };
  }

  return summaries;
}

export function isAccountOverConfiguredLimit(
  account: AccountProfile,
  summary?: AccountUsageSummary
): { overLimit: boolean; reason?: string } {
  const limits = account.limits;
  if (!limits || !limits.autoSwitchOnLimit || !summary) {
    return { overLimit: false };
  }
  if (limits.session5hTokens > 0 && summary.session5h.totalTokens >= limits.session5hTokens) {
    return { overLimit: true, reason: '5-hour session token cap reached' };
  }
  if (limits.dailyTokens > 0 && summary.daily.totalTokens >= limits.dailyTokens) {
    return { overLimit: true, reason: 'Daily token budget reached' };
  }
  if (limits.dailyRuns > 0 && summary.daily.runs >= limits.dailyRuns) {
    return { overLimit: true, reason: 'Daily run limit reached' };
  }
  if (limits.weeklyTokens > 0 && summary.weekly.totalTokens >= limits.weeklyTokens) {
    return { overLimit: true, reason: 'Weekly token budget reached' };
  }
  if (limits.weeklyRuns > 0 && summary.weekly.runs >= limits.weeklyRuns) {
    return { overLimit: true, reason: 'Weekly run limit reached' };
  }
  return { overLimit: false };
}

function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
