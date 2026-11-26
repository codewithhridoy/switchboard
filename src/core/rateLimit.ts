export interface RateLimitDetection {
  isRateLimited: boolean;
  reason?: string;
  retryAfterMs?: number;
}

const RATE_LIMIT_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\b429\b|too many requests/i, reason: 'HTTP 429 Too Many Requests' },
  { regex: /rate[_\s-]?limit(ed|ing)?(\s+exceeded|\s+reached)?/i, reason: 'Provider rate limit reached' },
  { regex: /usage\s+limit(\s+reached|\s+exceeded)?/i, reason: 'Subscription usage limit reached' },
  { regex: /quota\s+(exceeded|exhausted|limit)/i, reason: 'Account quota exhausted' },
  { regex: /resource[_\s-]?exhausted/i, reason: 'Google RESOURCE_EXHAUSTED quota error' },
  { regex: /limit\s+will\s+reset|resets?\s+(at|in)\s+/i, reason: 'Session usage window exhausted' },
  { regex: /overloaded_error|capacity\s+reached|temporarily\s+overloaded/i, reason: 'Model temporarily overloaded' },
  { regex: /credit\s+balance\s+is\s+too\s+low|insufficient_quota/i, reason: 'Account credits or quota depleted' },
  { regex: /you['’]?ve\s+hit\s+your\s+(limit|cap)|message\s+limit\s+reached/i, reason: 'Message limit reached' },
];

/**
 * Inspects provider output / error text and optional HTTP status code to detect
 * rate-limit or subscription quota exhaustion, extracting a reset delay when possible.
 */
export function detectRateLimit(
  text: string,
  httpStatus?: number,
  retryAfterHeader?: string | null
): RateLimitDetection {
  const retryFromHeader = parseRetryAfterHeader(retryAfterHeader);

  if (httpStatus === 429 || httpStatus === 529) {
    return {
      isRateLimited: true,
      reason: httpStatus === 529 ? 'Anthropic API overloaded (529)' : 'HTTP 429 Too Many Requests',
      retryAfterMs: retryFromHeader ?? parseDurationFromText(text),
    };
  }

  for (const { regex, reason } of RATE_LIMIT_PATTERNS) {
    if (regex.test(text)) {
      return {
        isRateLimited: true,
        reason,
        retryAfterMs: retryFromHeader ?? parseDurationFromText(text),
      };
    }
  }

  return { isRateLimited: false };
}

function parseRetryAfterHeader(header?: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs) && dateMs > Date.now()) {
    return dateMs - Date.now();
  }
  return undefined;
}

function parseDurationFromText(text: string): number | undefined {
  // e.g. "try again in 15 minutes", "resets in 2 hours", "retry after 45 seconds"
  const relative = text.match(
    /(?:try again|retry|reset(?:s)?)\s+(?:in|after)\s+(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)\b/i
  );
  if (relative) {
    const value = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    if (Number.isFinite(value) && value > 0) {
      if (unit.startsWith('h')) return value * 60 * 60 * 1000;
      if (unit.startsWith('m')) return value * 60 * 1000;
      return value * 1000;
    }
  }

  // e.g. "resets at 4pm" or "resets at 14:30"
  const clock = text.match(/resets?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = clock[2] ? Number(clock[2]) : 0;
    const meridiem = clock[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target.getTime() - now.getTime();
    }
  }

  return undefined;
}
