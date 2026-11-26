import {
  AccountProfile,
  AppSettings,
  ProviderKind,
  RoutingRule,
  TaskCategory,
} from './types';

export interface ModelOption {
  id: string;
  label: string;
}

export const PROVIDER_MODELS: Record<ProviderKind, ModelOption[]> = {
  'claude-cli': [
    { id: 'sonnet', label: 'Sonnet (Latest Alias)' },
    { id: 'opus', label: 'Opus (Latest Alias)' },
    { id: 'haiku', label: 'Haiku (Latest Alias)' },
    { id: 'fable', label: 'Fable (Latest Alias)' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  'gemini-cli': [
    { id: 'auto', label: 'Auto (Gemini 2.5 Pro / 3.5 Flash)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  ],
  'codex-cli': [
    { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'o3', label: 'o3 (Reasoning)' },
    { id: 'o4-mini', label: 'o4-mini (Fast)' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  'anthropic-api': [
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  'gemini-api': [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  ],
  'openai-compatible': [
    { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 (OpenRouter)' },
    { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4 (OpenRouter)' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (OpenRouter)' },
    { id: 'openai/gpt-5', label: 'GPT-5 (OpenRouter)' },
    { id: 'openai/gpt-4.1', label: 'GPT-4.1' },
    { id: 'qwen2.5-coder:32b', label: 'Qwen 2.5 Coder 32B (Ollama)' },
    { id: 'deepseek-r1:32b', label: 'DeepSeek R1 32B (Ollama)' },
  ],
};

export interface ProviderPreset {
  id: string;
  label: string;
  subtitle: string;
  provider: ProviderKind;
  defaultModel: string;
  models: string[];
  defaultScope: 'personal' | 'team' | 'any';
  defaultTags: string[];
  requiresApiKey: boolean;
  supportsIsolatedProfile: boolean;
  defaultBaseUrl?: string;
  loginCommandHint?: string;
  defaultStrengths: Record<TaskCategory, number>;
}

export const TASK_CATEGORY_META: Record<
  TaskCategory,
  { label: string; shortLabel: string; description: string; accent: string }
> = {
  architecture: {
    label: 'Architecture & Planning',
    shortLabel: 'Architecture',
    description: 'System design, specs, complex refactors, and multi-file planning.',
    accent: '#8b5cf6',
  },
  coding: {
    label: 'Core Coding & Engineering',
    shortLabel: 'Coding',
    description: 'Implementing features, backend logic, APIs, tests, and data pipelines.',
    accent: '#3b82f6',
  },
  'frontend-ui': {
    label: 'Frontend & Visual UI',
    shortLabel: 'Frontend UI',
    description: 'Design systems, CSS layouts, animations, and interactive components.',
    accent: '#ec4899',
  },
  debugging: {
    label: 'Debugging & Root Cause',
    shortLabel: 'Debugging',
    description: 'Tracing stack traces, race conditions, flaky tests, and build errors.',
    accent: '#f59e0b',
  },
  'large-context': {
    label: 'Large Context & Codebase Audit',
    shortLabel: 'Large Context',
    description: 'Long documents, monorepo audits, logs, and huge context windows.',
    accent: '#10b981',
  },
  research: {
    label: 'Research & Synthesis',
    shortLabel: 'Research',
    description: 'Comparing approaches, summarizing papers/docs, and fact synthesis.',
    accent: '#06b6d4',
  },
  writing: {
    label: 'Writing & Communication',
    shortLabel: 'Writing',
    description: 'Docs, RFCs, emails, blog posts, READMEs, and copy refinement.',
    accent: '#f97316',
  },
  'quick-edit': {
    label: 'Quick Edits & Utility Tasks',
    shortLabel: 'Quick Edit',
    description: 'Fast renames, small helpers, formatting, and short Q&A.',
    accent: '#64748b',
  },
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'claude-personal',
    label: 'Claude Code (Personal)',
    subtitle: 'Official Claude CLI with isolated personal CLAUDE_CONFIG_DIR',
    provider: 'claude-cli',
    defaultModel: 'sonnet',
    models: PROVIDER_MODELS['claude-cli'].map((m) => m.id),
    defaultScope: 'personal',
    defaultTags: ['Claude', 'Personal', 'Subscription'],
    requiresApiKey: false,
    supportsIsolatedProfile: true,
    loginCommandHint: 'claude',
    defaultStrengths: {
      architecture: 96,
      coding: 98,
      'frontend-ui': 90,
      debugging: 97,
      'large-context': 80,
      research: 84,
      writing: 95,
      'quick-edit': 88,
    },
  },
  {
    id: 'claude-team',
    label: 'Claude Code (Team)',
    subtitle: 'Second Claude account (same Gmail supported) via isolated CLAUDE_CONFIG_DIR',
    provider: 'claude-cli',
    defaultModel: 'sonnet',
    models: PROVIDER_MODELS['claude-cli'].map((m) => m.id),
    defaultScope: 'team',
    defaultTags: ['Claude', 'Team', 'Subscription'],
    requiresApiKey: false,
    supportsIsolatedProfile: true,
    loginCommandHint: 'claude',
    defaultStrengths: {
      architecture: 97,
      coding: 98,
      'frontend-ui': 90,
      debugging: 97,
      'large-context': 82,
      research: 85,
      writing: 95,
      'quick-edit': 88,
    },
  },
  {
    id: 'gemini-pro-cli',
    label: 'Google AI Pro (Gemini CLI)',
    subtitle: 'Official Gemini CLI with isolated profile for Google AI Pro / Gemini models',
    provider: 'gemini-cli',
    defaultModel: 'gemini-2.5-pro',
    models: PROVIDER_MODELS['gemini-cli'].map((m) => m.id),
    defaultScope: 'personal',
    defaultTags: ['Google Pro', 'Gemini', 'Subscription'],
    requiresApiKey: false,
    supportsIsolatedProfile: true,
    loginCommandHint: 'gemini',
    defaultStrengths: {
      architecture: 91,
      coding: 90,
      'frontend-ui': 96,
      debugging: 89,
      'large-context': 99,
      research: 96,
      writing: 90,
      'quick-edit': 94,
    },
  },
  {
    id: 'codex-cli',
    label: 'OpenAI Codex CLI',
    subtitle: 'Official Codex CLI for ChatGPT Plus / Pro / Team subscriptions',
    provider: 'codex-cli',
    defaultModel: 'gpt-5-codex',
    models: PROVIDER_MODELS['codex-cli'].map((m) => m.id),
    defaultScope: 'any',
    defaultTags: ['OpenAI', 'Codex', 'Subscription'],
    requiresApiKey: false,
    supportsIsolatedProfile: true,
    loginCommandHint: 'codex login',
    defaultStrengths: {
      architecture: 93,
      coding: 95,
      'frontend-ui': 86,
      debugging: 95,
      'large-context': 84,
      research: 88,
      writing: 87,
      'quick-edit': 91,
    },
  },
  {
    id: 'anthropic-api',
    label: 'Anthropic API',
    subtitle: 'Direct Anthropic Messages API (pay-as-you-go, zero CLI dependency)',
    provider: 'anthropic-api',
    defaultModel: 'claude-sonnet-4-6',
    models: PROVIDER_MODELS['anthropic-api'].map((m) => m.id),
    defaultScope: 'any',
    defaultTags: ['Anthropic', 'API'],
    requiresApiKey: true,
    supportsIsolatedProfile: false,
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultStrengths: {
      architecture: 95,
      coding: 95,
      'frontend-ui': 88,
      debugging: 94,
      'large-context': 80,
      research: 85,
      writing: 95,
      'quick-edit': 89,
    },
  },
  {
    id: 'gemini-api',
    label: 'Google Gemini API',
    subtitle: 'Direct Gemini API via Google AI Studio key',
    provider: 'gemini-api',
    defaultModel: 'gemini-2.5-pro',
    models: PROVIDER_MODELS['gemini-api'].map((m) => m.id),
    defaultScope: 'any',
    defaultTags: ['Google', 'API'],
    requiresApiKey: true,
    supportsIsolatedProfile: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultStrengths: {
      architecture: 90,
      coding: 88,
      'frontend-ui': 95,
      debugging: 87,
      'large-context': 99,
      research: 95,
      writing: 89,
      'quick-edit': 95,
    },
  },
  {
    id: 'openai-compatible',
    label: 'OpenRouter / OpenAI / Ollama',
    subtitle: 'Any OpenAI-compatible API endpoint (OpenRouter, OpenAI, local Ollama)',
    provider: 'openai-compatible',
    defaultModel: 'anthropic/claude-sonnet-4',
    models: PROVIDER_MODELS['openai-compatible'].map((m) => m.id),
    defaultScope: 'any',
    defaultTags: ['API', 'Flexible'],
    requiresApiKey: true,
    supportsIsolatedProfile: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultStrengths: {
      architecture: 88,
      coding: 89,
      'frontend-ui': 88,
      debugging: 88,
      'large-context': 88,
      research: 90,
      writing: 89,
      'quick-edit': 92,
    },
  },
];

export const DEFAULT_ROUTING_RULES: RoutingRule[] = (
  Object.keys(TASK_CATEGORY_META) as TaskCategory[]
).map((category) => ({
  category,
  label: TASK_CATEGORY_META[category].label,
  description: TASK_CATEGORY_META[category].description,
  preferredAccountIds: [],
  allowFailover: true,
  allowCrossScopeFailover: true,
}));

export const DEFAULT_SETTINGS: AppSettings = {
  defaultWorkspaceDir: '',
  defaultCooldownMinutes: 45,
  autoDecomposeMultiStep: true,
  maxAttemptsPerSubtask: 4,
  handoffContextChars: 4000,
  allowCrossScopeFailoverByDefault: true,
  theme: 'system',
};

export function createStarterAccounts(profilesBaseDir: string): AccountProfile[] {
  const join = (seg: string) =>
    profilesBaseDir.endsWith('/') || profilesBaseDir.endsWith('\\')
      ? `${profilesBaseDir}${seg}`
      : `${profilesBaseDir}/${seg}`;

  return [
    {
      id: 'acc-claude-team',
      name: 'Claude Team',
      provider: 'claude-cli',
      model: 'sonnet',
      scope: 'team',
      enabled: true,
      priority: 1,
      tags: ['Claude', 'Team', 'Subscription'],
      strengths: PROVIDER_PRESETS[1].defaultStrengths,
      profileDir: join('claude-team'),
      cooldownUntil: null,
      cooldownReason: null,
      lastUsedAt: null,
      totalRuns: 0,
      totalFailovers: 0,
    },
    {
      id: 'acc-claude-personal',
      name: 'Claude Personal',
      provider: 'claude-cli',
      model: 'sonnet',
      scope: 'personal',
      enabled: true,
      priority: 2,
      tags: ['Claude', 'Personal', 'Subscription'],
      strengths: PROVIDER_PRESETS[0].defaultStrengths,
      profileDir: join('claude-personal'),
      cooldownUntil: null,
      cooldownReason: null,
      lastUsedAt: null,
      totalRuns: 0,
      totalFailovers: 0,
    },
    {
      id: 'acc-google-pro',
      name: 'Google AI Pro',
      provider: 'gemini-cli',
      model: 'gemini-2.5-pro',
      scope: 'personal',
      enabled: true,
      priority: 3,
      tags: ['Google Pro', 'Gemini', 'Subscription'],
      strengths: PROVIDER_PRESETS[2].defaultStrengths,
      profileDir: join('gemini-pro'),
      cooldownUntil: null,
      cooldownReason: null,
      lastUsedAt: null,
      totalRuns: 0,
      totalFailovers: 0,
    },
  ];
}
