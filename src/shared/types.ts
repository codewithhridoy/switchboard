export type ProviderKind =
  | 'claude-cli'
  | 'agy-cli'
  | 'gemini-cli'
  | 'codex-cli'
  | 'anthropic-api'
  | 'gemini-api'
  | 'openai-compatible';

export type AccountScope = 'personal' | 'team' | 'any';

export type TaskCategory =
  | 'architecture'
  | 'coding'
  | 'frontend-ui'
  | 'debugging'
  | 'large-context'
  | 'research'
  | 'writing'
  | 'quick-edit';

export type AccountStatus = 'ready' | 'running' | 'cooldown' | 'disabled' | 'needs-setup';

export interface AccountProfile {
  id: string;
  name: string;
  provider: ProviderKind;
  model: string;
  scope: AccountScope;
  enabled: boolean;
  /** Lower number = higher priority when scores tie */
  priority: number;
  /** Tags for UI display, e.g. ["Personal", "Pro"] or ["Team", "Work"] */
  tags: string[];
  /** Capabilities this account excels at (0-100) */
  strengths: Partial<Record<TaskCategory, number>>;
  /** For CLI providers: isolated config directory (e.g. CLAUDE_CONFIG_DIR / GEMINI_CLI_HOME) */
  profileDir?: string;
  /** When true, uses the system's default CLI login (~/.claude, ~/.gemini) instead of an isolated profile dir */
  useDefaultProfile?: boolean;
  /** Optional custom executable path if CLI is not on PATH */
  cliPath?: string;
  /** Optional extra CLI arguments */
  extraArgs?: string[];
  /** For API providers */
  apiKey?: string;
  baseUrl?: string;
  /** Runtime quota / failover state */
  cooldownUntil?: number | null;
  cooldownReason?: string | null;
  lastUsedAt?: number | null;
  totalRuns: number;
  totalFailovers: number;
  /** Optional workspace path prefixes restricted to this account's scope */
  allowedWorkspacePrefixes?: string[];
}

export interface RoutingRule {
  category: TaskCategory;
  label: string;
  description: string;
  /** Ordered preferred account IDs; empty means auto-select by capability + priority */
  preferredAccountIds: string[];
  /** Whether to automatically fall back to other eligible accounts on rate limit */
  allowFailover: boolean;
  /** Whether a team-scoped workspace may fall back to personal accounts */
  allowCrossScopeFailover: boolean;
}

export type TaskStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SubtaskStatus =
  | 'pending'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ExecutionAttempt {
  attemptNumber: number;
  accountId: string;
  accountName: string;
  provider: ProviderKind;
  model: string;
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'completed' | 'rate-limited' | 'failed' | 'cancelled';
  reason?: string;
  outputPreview?: string;
}

export interface Subtask {
  id: string;
  index: number;
  title: string;
  prompt: string;
  category: TaskCategory;
  status: SubtaskStatus;
  assignedAccountId?: string;
  assignedAccountName?: string;
  assignedModel?: string;
  routingReason?: string;
  attempts: ExecutionAttempt[];
  output: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface OrchestratedTask {
  id: string;
  title: string;
  prompt: string;
  mode: 'coding' | 'general';
  workspaceDir?: string;
  workspaceScope: AccountScope;
  autoDecompose: boolean;
  forcedAccountId?: string | null;
  forcedModel?: string | null;
  category: TaskCategory;
  categoryConfidence: number;
  status: TaskStatus;
  subtasks: Subtask[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  failoverCount: number;
  summary?: string;
  error?: string;
}

export interface AppSettings {
  defaultWorkspaceDir: string;
  defaultCooldownMinutes: number;
  autoDecomposeMultiStep: boolean;
  maxAttemptsPerSubtask: number;
  handoffContextChars: number;
  allowCrossScopeFailoverByDefault: boolean;
  theme: 'system' | 'dark' | 'light';
}

export interface CliHealthInfo {
  provider: ProviderKind;
  binary: string;
  installed: boolean;
  version?: string;
  resolvedPath?: string;
  installHint: string;
}

export interface ModelChoice {
  id: string;
  label: string;
}

export interface SwitchboardState {
  accounts: AccountProfile[];
  routingRules: RoutingRule[];
  tasks: OrchestratedTask[];
  settings: AppSettings;
  cliHealth: CliHealthInfo[];
  discoveredModels: Partial<Record<ProviderKind, ModelChoice[]>>;
  queueRunning: boolean;
}

export interface TaskStreamEvent {
  type:
    | 'state-updated'
    | 'subtask-chunk'
    | 'failover-triggered'
    | 'task-completed'
    | 'task-failed';
  taskId?: string;
  subtaskId?: string;
  chunk?: string;
  stream?: 'stdout' | 'stderr' | 'system';
  fromAccountName?: string;
  toAccountName?: string;
  reason?: string;
  timestamp: number;
}

export interface CreateTaskInput {
  prompt: string;
  title?: string;
  mode: 'coding' | 'general';
  workspaceDir?: string;
  workspaceScope?: AccountScope;
  autoDecompose?: boolean;
  forcedAccountId?: string | null;
  forcedModel?: string | null;
}

export interface CreateAccountInput {
  name: string;
  provider: ProviderKind;
  model: string;
  scope: AccountScope;
  priority?: number;
  tags?: string[];
  strengths?: Partial<Record<TaskCategory, number>>;
  profileDir?: string;
  useDefaultProfile?: boolean;
  cliPath?: string;
  extraArgs?: string[];
  apiKey?: string;
  baseUrl?: string;
}
