import {
  AccountProfile,
  AppSettings,
  ChatThread,
  CliHealthInfo,
  CloneRepoInput,
  CreateAccountInput,
  CreateProjectInput,
  CreateTaskInput,
  GitHubRepoSummary,
  GitHubSyncConfig,
  ImportProjectInput,
  OrchestratedTask,
  ProjectWorkspace,
  RoutingRule,
  SwitchboardState,
  TaskAttachment,
  TaskStreamEvent,
} from './types';

export interface SwitchboardApi {
  getPlatform: () => NodeJS.Platform;
  getState: () => Promise<SwitchboardState>;
  refreshCliHealth: () => Promise<CliHealthInfo[]>;
  refreshUsage: () => Promise<void>;
  addAccount: (input: CreateAccountInput) => Promise<AccountProfile>;
  updateAccount: (id: string, patch: Partial<AccountProfile>) => Promise<AccountProfile | null>;
  deleteAccount: (id: string) => Promise<boolean>;
  clearCooldown: (id: string) => Promise<AccountProfile | null>;
  testAccount: (id: string) => Promise<{ ok: boolean; message: string; latencyMs: number }>;
  launchCliLogin: (id: string) => Promise<{ ok: boolean; command: string; error?: string }>;
  updateRoutingRule: (
    category: RoutingRule['category'],
    patch: Partial<RoutingRule>
  ) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  // Projects & Multi-Turn Threads
  createProject: (input: CreateProjectInput) => Promise<ProjectWorkspace>;
  importProject: (input: ImportProjectInput) => Promise<ProjectWorkspace>;
  cloneRepoProject: (input: CloneRepoInput) => Promise<ProjectWorkspace>;
  listGitHubRepos: () => Promise<GitHubRepoSummary[]>;
  pushProjectToGitHub: (projectId: string, isPrivate: boolean) => Promise<ProjectWorkspace>;
  deleteProject: (projectId: string) => Promise<boolean>;
  createThread: (projectId: string | null, title?: string) => Promise<ChatThread>;
  deleteThread: (threadId: string) => Promise<boolean>;
  // GitHub Cloud Sync
  connectGitHub: (opts: {
    authMode: 'gh-cli' | 'pat';
    patToken?: string;
  }) => Promise<GitHubSyncConfig>;
  disconnectGitHub: () => Promise<GitHubSyncConfig>;
  updateSyncSettings: (
    patch: Partial<Pick<GitHubSyncConfig, 'autoSync' | 'includeTasks' | 'encryptSecrets'>>
  ) => Promise<GitHubSyncConfig>;
  pushSyncNow: (passphrase?: string) => Promise<{ gistUrl: string; syncedAt: number }>;
  pullSyncNow: (passphrase?: string) => Promise<{
    restoredAccounts: number;
    restoredProjects: number;
    restoredTasks: number;
  }>;
  // Tasks
  enqueueTask: (input: CreateTaskInput) => Promise<OrchestratedTask>;
  retryTask: (taskId: string) => Promise<OrchestratedTask | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  pickFolder: () => Promise<string | null>;
  pickFiles: () => Promise<TaskAttachment[]>;
  saveAttachment: (input: {
    name: string;
    mimeType: string;
    base64Data: string;
  }) => Promise<TaskAttachment>;
  openExternal: (url: string) => Promise<void>;
  onEvent: (listener: (event: TaskStreamEvent) => void) => () => void;
}

declare global {
  interface Window {
    switchboard?: SwitchboardApi;
  }
}
