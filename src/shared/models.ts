import { EffortLevel, ModelChoice, ProviderKind } from './types';

export interface GroupedModel {
  baseId: string;
  label: string;
  /** True when the CLI encodes effort as `-low`/`-medium`/`-high`/`-xhigh` on the model ID */
  suffixEncoded: boolean;
  /** Ordered effort levels supported by this base model (empty if none) */
  efforts: EffortLevel[];
  /** Map from effort level -> exact raw model ID (for suffix-encoded models) */
  variantIds: Partial<Record<EffortLevel, string>>;
}

const EFFORT_ORDER: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
};

const SUFFIX_RE = /-(low|medium|high|xhigh|max)$/i;
const LABEL_EFFORT_RE = /\s*\((?:low|medium|high|xhigh|max)(?:\s+via\s+[^)]+)?\)\s*$/i;

export function splitModelAndEffort(modelId: string): {
  baseId: string;
  effort?: EffortLevel;
} {
  const match = modelId.match(SUFFIX_RE);
  if (!match) {
    return { baseId: modelId };
  }
  return {
    baseId: modelId.slice(0, match.index),
    effort: match[1].toLowerCase() as EffortLevel,
  };
}

function cleanBaseLabel(label: string): string {
  return label
    .replace(LABEL_EFFORT_RE, '')
    .replace(/\s*\(via\s+Agy\)\s*$/i, '')
    .trim();
}

/**
 * Deduplicates a list of provider models into unique base models, extracting
 * effort variants (low/medium/high/xhigh/max) into a separate effort list.
 */
export function groupModelsByBase(
  provider: ProviderKind,
  liveModels: ModelChoice[] | undefined,
  curatedModels: ModelChoice[]
): GroupedModel[] {
  const map = new Map<string, GroupedModel>();
  const combined = [...(liveModels ?? []), ...curatedModels];

  for (const item of combined) {
    const { baseId, effort } = splitModelAndEffort(item.id);
    const label = cleanBaseLabel(item.label) || baseId;

    let entry = map.get(baseId);
    if (!entry) {
      entry = {
        baseId,
        label,
        suffixEncoded: Boolean(effort),
        efforts: [],
        variantIds: {},
      };
      map.set(baseId, entry);
    }

    if (effort) {
      entry.suffixEncoded = true;
      if (!entry.efforts.includes(effort)) {
        entry.efforts.push(effort);
      }
      entry.variantIds[effort] = item.id;
    }
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    if (g.suffixEncoded) {
      g.efforts.sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));
    } else if (provider === 'claude-cli') {
      // Claude Code CLI supports --effort low|medium|high|xhigh|max natively
      g.efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
    }
  }

  return groups;
}

/**
 * Picks the best effort level when switching to a new base model, preserving
 * the previous effort if available or falling back to high -> medium -> first.
 */
export function pickBestEffort(
  group: GroupedModel,
  preferred?: EffortLevel
): EffortLevel | undefined {
  if (group.efforts.length === 0) return undefined;
  if (preferred && group.efforts.includes(preferred)) return preferred;
  if (group.efforts.includes('high')) return 'high';
  if (group.efforts.includes('medium')) return 'medium';
  return group.efforts[0];
}

/**
 * Resolves the concrete CLI/API model string from a grouped base model + effort.
 */
export function composeModelId(group: GroupedModel, effort?: EffortLevel): string {
  if (!group.suffixEncoded) {
    return group.baseId;
  }
  const chosen = pickBestEffort(group, effort);
  if (chosen && group.variantIds[chosen]) {
    return group.variantIds[chosen]!;
  }
  return chosen ? `${group.baseId}-${chosen}` : group.baseId;
}
