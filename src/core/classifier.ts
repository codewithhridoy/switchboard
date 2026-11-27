import { TaskCategory } from '../shared/types';

export interface ClassificationResult {
  category: TaskCategory;
  confidence: number;
  matchedSignals: string[];
}

export interface PlannedSubtask {
  title: string;
  prompt: string;
  category: TaskCategory;
}

const CATEGORY_SIGNALS: Record<
  TaskCategory,
  Array<{ pattern: RegExp; weight: number; label: string }>
> = {
  architecture: [
    {
      pattern:
        /\b(?:architect(?:ure)?|system design|rfc|blueprint|schema design|migration plan|microservices?|monorepo structure|scalab(?:le|ility))\b/gi,
      weight: 3,
      label: 'architecture',
    },
    {
      pattern:
        /\b(?:refactor entire|redesign|trade-?offs?|roadmap|technical spec|plan how to)\b/gi,
      weight: 2.2,
      label: 'planning',
    },
  ],
  coding: [
    {
      pattern:
        /\b(?:implement|api|endpoints?|backend|service|functions?|classes|modules?|typescript|python|rust|golang|sql|unit tests?|integration tests?|test suite|webhooks?|auth(?:entication)?|crud|graphql)\b/gi,
      weight: 2.2,
      label: 'engineering',
    },
    {
      pattern: /\b(?:write code|cli|sdk|scripts?|algorithms?|handler|database|deploy(?:ment)?|pull request|create pr|complete all|finish all|all steps|all tasks|one by one|checklist)\b/gi,
      weight: 1.8,
      label: 'coding',
    },
  ],
  'frontend-ui': [
    {
      pattern:
        /\b(?:ui|ux|css|tailwind|layout|responsive|animations?|modals?|dialogs?|sidebar|dashboard|components?|react|vue|svelte|html|dark mode|theme|landing page|figma|design system|buttons?|forms?)\b/gi,
      weight: 2.8,
      label: 'frontend/ui',
    },
    {
      pattern: /\b(?:visual|polish|typography|accessibility|a11y|grid|flexbox|popover)\b/gi,
      weight: 2.2,
      label: 'visual-design',
    },
  ],
  debugging: [
    {
      pattern:
        /\b(?:debug|fix bug|errors?|exceptions?|stack trace|crash(?:es|ing)?|broken|failing tests?|race conditions?|memory leaks?|why does|not working|cors|hydration|undefined is not)\b/gi,
      weight: 3,
      label: 'debugging',
    },
    {
      pattern: /\b(?:root cause|diagnose|troubleshoot|regression|flaky)\b/gi,
      weight: 2.5,
      label: 'root-cause',
    },
  ],
  'large-context': [
    {
      pattern:
        /\b(?:entire codebase|whole repo|all files|audit|review all|long document|pdf|transcript|log file|thousands of lines|full repository|cross-cutting|dead code)\b/gi,
      weight: 3.2,
      label: 'large-context',
    },
    {
      pattern: /\b(?:inventory|compare all|comprehensive audit|codebase)\b/gi,
      weight: 2,
      label: 'broad-analysis',
    },
  ],
  research: [
    {
      pattern:
        /\b(?:research|compare|benchmark|pros and cons|evaluate|best library|alternatives|market analysis|deep dive|explain how|survey|literature)\b/gi,
      weight: 3,
      label: 'research',
    },
    {
      pattern: /\b(?:find out|investigate options|recommend|which tool|overview of)\b/gi,
      weight: 2,
      label: 'comparison',
    },
  ],
  writing: [
    {
      pattern:
        /\b(?:write an email|draft|blog posts?|articles?|readme|documentation|changelog|release notes|copywriting|rewrite|proofread|pitch|proposal|linkedin|tweet|cover letter)\b/gi,
      weight: 3,
      label: 'writing',
    },
    {
      pattern: /\b(?:tone|polish text|summarize for stakeholders|announcement|guide)\b/gi,
      weight: 2,
      label: 'communication',
    },
  ],
  'quick-edit': [
    {
      pattern:
        /\b(?:rename|typo|format|lint|small fix|one-liner|quick question|convert json|regex|shell command|snippet|translate)\b/gi,
      weight: 2.6,
      label: 'quick-edit',
    },
  ],
};

/**
 * Classifies a prompt into the best-matching TaskCategory using weighted keyword
 * matches and prompt structure heuristics.
 */
export function classifyPrompt(prompt: string, mode: 'coding' | 'general'): ClassificationResult {
  const scores: Record<TaskCategory, number> = {
    architecture: 0,
    coding: mode === 'coding' ? 0.55 : 0,
    'frontend-ui': 0,
    debugging: 0,
    'large-context': prompt.length > 6000 ? 4.5 : 0,
    research: mode === 'general' ? 0.4 : 0,
    writing: 0,
    'quick-edit': mode === 'general' && prompt.length < 90 ? 0.6 : 0,
  };

  const matched: Record<TaskCategory, string[]> = {
    architecture: [],
    coding: [],
    'frontend-ui': [],
    debugging: [],
    'large-context': prompt.length > 6000 ? ['long-prompt'] : [],
    research: [],
    writing: [],
    'quick-edit': [],
  };

  for (const category of Object.keys(CATEGORY_SIGNALS) as TaskCategory[]) {
    for (const signal of CATEGORY_SIGNALS[category]) {
      const hits = prompt.match(signal.pattern);
      if (hits && hits.length > 0) {
        const distinctCount = new Set(hits.map((h) => h.toLowerCase())).size;
        // Diminishing returns for multiple distinct keyword matches in the same category
        const bonus = signal.weight * (1 + Math.min(distinctCount - 1, 3) * 0.45);
        scores[category] += bonus;
        matched[category].push(signal.label);
      }
    }
  }

  let bestCategory: TaskCategory = mode === 'coding' ? 'coding' : 'research';
  let bestScore = -1;
  let totalScore = 0;

  for (const [cat, score] of Object.entries(scores) as Array<[TaskCategory, number]>) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  const confidence =
    totalScore <= 0
      ? 0.5
      : Math.min(0.98, Math.max(0.45, Number((bestScore / totalScore).toFixed(2))));

  return {
    category: bestCategory,
    confidence,
    matchedSignals: matched[bestCategory],
  };
}

/**
 * Decomposes a multi-step prompt (numbered list, bullet list, or clear multi-stage request)
 * into sequential subtasks, each classified with its own optimal TaskCategory.
 */
export function decomposePrompt(
  prompt: string,
  mode: 'coding' | 'general',
  autoDecompose: boolean
): PlannedSubtask[] {
  const trimmed = prompt.trim();
  const baseClassification = classifyPrompt(trimmed, mode);

  if (!autoDecompose) {
    return [
      {
        title: deriveTitle(trimmed),
        prompt: trimmed,
        category: baseClassification.category,
      },
    ];
  }

  // 1. Check explicit numbered or bulleted multi-step lists (2 to 8 items)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const listItems: string[] = [];
  const introLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(?:(?:\d+[.)]|[-*•])\s+|step\s+\d+[:.\-]\s*)(.+)$/i);
    if (match) {
      listItems.push(match[1].trim());
    } else if (listItems.length === 0) {
      introLines.push(line);
    } else {
      listItems[listItems.length - 1] += `\n${line}`;
    }
  }

  if (listItems.length >= 2 && listItems.length <= 8) {
    const contextHeader =
      introLines.length > 0 ? `Overall goal:\n${introLines.join('\n')}\n\n` : '';
    return listItems.map((item, idx) => {
      const subClass = classifyPrompt(item, mode);
      return {
        title: deriveTitle(item, `Step ${idx + 1}`),
        prompt: `${contextHeader}Execute step ${idx + 1} of ${listItems.length}:\n${item}`,
        category: subClass.category,
      };
    });
  }

  // 2. Check explicit "first ... then ... finally ..." sequential clauses
  const hasSequentialCues =
    /\b(then|after that|next,|and then|finally)\b/i.test(trimmed) && trimmed.length >= 120;

  if (hasSequentialCues) {
    const parts = trimmed
      .split(/\s*(?:\.\s+|\n+|,\s*)(?:then|after that|next|finally)\b[:,]?\s*/i)
      .map((p) => p.replace(/^first[:,]?\s*/i, '').trim())
      .filter((p) => p.length > 18);

    if (parts.length >= 2 && parts.length <= 5) {
      return parts.map((part, idx) => {
        const subClass = classifyPrompt(part, mode);
        return {
          title: deriveTitle(part, `Phase ${idx + 1}`),
          prompt: `Overall request: ${trimmed}\n\nFocus on phase ${idx + 1} of ${parts.length}:\n${part}`,
          category: subClass.category,
        };
      });
    }
  }

  return [
    {
      title: deriveTitle(trimmed),
      prompt: trimmed,
      category: baseClassification.category,
    },
  ];
}

export function deriveTitle(text: string, fallback = 'Untitled Task'): string {
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? '';
  const cleaned = firstLine.replace(/^[#*\-\d.)\s]+/, '').trim();
  if (!cleaned) return fallback;
  return cleaned.length > 68 ? `${cleaned.slice(0, 65).trimEnd()}...` : cleaned;
}
