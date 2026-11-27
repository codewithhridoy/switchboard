export type ProviderKind =
  | 'claude-cli'
  | 'agy-cli'
  | 'gemini-cli'
  | 'codex-cli'
  | 'anthropic-api'
  | 'gemini-api'
  | 'openai-compatible';

export type AccountScope = 'personal' | 'team' | 'any';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type CodingPermissionMode = 'accept-edits' | 'full-auto' | 'read-only';

export interface GitChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface GitWorkspaceStatus {
  isGitRepo: boolean;
  cwd: string;
  currentBranch: string;
  branches: string[];
  remoteUrl?: string;
  githubFullName?: string;
  ahead: number;
  behind: number;
  files: GitChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface CreatePrInput {
  cwd: string;
  title: string;
  body: string;
  baseBranch: string;
  draft?: boolean;
  /** Stage and commit uncommitted changes before pushing & creating the PR */
  autoCommit?: boolean;
  /** Optional commit message when autoCommit is true (defaults to PR title) */
  commitMessage?: string;
  /** Optional new feature branch to create if currently on baseBranch */
  newBranchName?: string;
}

export type MergeMethod = 'squash' | 'merge' | 'rebase';

export interface GitHubPullRequestInfo {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  draft: boolean;
  headBranch: string;
  baseBranch: string;
  mergeable: boolean | null;
  mergeableState?: string;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  commits?: number;
}

export interface MergePrInput {
  cwd: string;
  prNumber: number;
  mergeMethod: MergeMethod;
  commitTitle?: string;
  deleteBranch?: boolean;
  syncBaseBranch?: boolean;
  headBranch?: string;
  baseBranch?: string;
}

export interface MergePrResult {
  merged: boolean;
  sha?: string;
  message: string;
  deletedBranch?: boolean;
  switchedToBase?: string;
}

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

export interface AccountLimits {
  session5hTokens: number;
  dailyTokens: number;
  weeklyTokens: number;
  dailyRuns: number;
  weeklyRuns: number;
  /** When true, Switchboard proactively routes away once daily or weekly budget hits 100% */
  autoSwitchOnLimit: boolean;
}

export interface UsageRecord {
  id: string;
  timestamp: number;
  accountId: string;
  provider: ProviderKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  durationMs: number;
  status: 'completed' | 'rate-limited' | 'failed';
  source: 'switchboard' | 'claude-local';
}

export interface UsageBucket {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
}

export interface AccountUsageSummary {
  accountId: string;
  session5h: UsageBucket;
  daily: UsageBucket;
  weekly: UsageBucket;
  dailySeries: Array<{ date: string; label: string; tokens: number; runs: number }>;
  byModel: Array<{ model: string; tokens: number; runs: number }>;
  rateLimitHits7d: number;
  dataSource: 'claude-local+switchboard' | 'switchboard';
}

export interface AccountProfile {
  id: string;
  name: string;
  provider: ProviderKind;
  model: string;
  effort?: EffortLevel;
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
  limits?: AccountLimits;
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
  liveStatus?: string;
  systemLog?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  description?: string;
  path: string;
  scope: AccountScope;
  githubRepoUrl?: string;
  githubFullName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatThread {
  id: string;
  projectId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface GitHubSyncConfig {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  authMode?: 'gh-cli' | 'pat';
  /** Stored only when authMode === 'pat' (kept local, never synced to cloud) */
  patToken?: string;
  gistId?: string;
  gistUrl?: string;
  autoSync: boolean;
  includeTasks: boolean;
  encryptSecrets: boolean;
  lastSyncedAt?: number | null;
  lastSyncDirection?: 'push' | 'pull' | null;
  lastError?: string | null;
}

export interface TaskAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  /** Optional small data URL preview for thumbnails in UI */
  previewDataUrl?: string;
}

export interface OrchestratedTask {
  id: string;
  projectId?: string | null;
  threadId?: string | null;
  title: string;
  prompt: string;
  attachments?: TaskAttachment[];
  mode: 'coding' | 'general';
  permissionMode?: CodingPermissionMode;
  fastMode?: boolean;
  workspaceDir?: string;
  workspaceScope: AccountScope;
  autoDecompose: boolean;
  forcedAccountId?: string | null;
  forcedModel?: string | null;
  forcedEffort?: EffortLevel | null;
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
  projects: ProjectWorkspace[];
  threads: ChatThread[];
  tasks: OrchestratedTask[];
  settings: AppSettings;
  sync: GitHubSyncConfig;
  cliHealth: CliHealthInfo[];
  discoveredModels: Partial<Record<ProviderKind, ModelChoice[]>>;
  usageSummaries: Record<string, AccountUsageSummary>;
  queueRunning: boolean;
}

export interface TaskStreamEvent {
  type:
    | 'state-updated'
    | 'subtask-chunk'
    | 'subtask-status'
    | 'failover-triggered'
    | 'task-completed'
    | 'task-failed';
  taskId?: string;
  subtaskId?: string;
  chunk?: string;
  statusText?: string;
  stream?: 'stdout' | 'stderr' | 'system';
  fromAccountName?: string;
  toAccountName?: string;
  reason?: string;
  timestamp: number;
}

export interface CreateTaskInput {
  prompt: string;
  title?: string;
  attachments?: TaskAttachment[];
  projectId?: string | null;
  threadId?: string | null;
  mode: 'coding' | 'general';
  permissionMode?: CodingPermissionMode;
  fastMode?: boolean;
  workspaceDir?: string;
  workspaceScope?: AccountScope;
  autoDecompose?: boolean;
  forcedAccountId?: string | null;
  forcedModel?: string | null;
  forcedEffort?: EffortLevel | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  parentDir: string;
  scope: AccountScope;
  template: 'blank' | 'node-ts' | 'web-vite';
  initGit: boolean;
  createGitHubRepo: boolean;
  githubPrivate: boolean;
}

export interface ImportProjectInput {
  path: string;
  name?: string;
  scope: AccountScope;
}

export interface CloneRepoInput {
  repoUrl: string;
  parentDir: string;
  folderName?: string;
  branch?: string;
  scope: AccountScope;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;
  provider: ProviderKind;
  model: string;
  effort?: EffortLevel;
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
