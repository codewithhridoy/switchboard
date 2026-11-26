import {
  AccountProfile,
  AppSettings,
  CliHealthInfo,
  CreateAccountInput,
  CreateTaskInput,
  OrchestratedTask,
  RoutingRule,
  SwitchboardState,
  TaskStreamEvent,
} from './types';

export interface SwitchboardApi {
  getPlatform: () => NodeJS.Platform;
  getState: () => Promise<SwitchboardState>;
  refreshCliHealth: () => Promise<CliHealthInfo[]>;
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
  enqueueTask: (input: CreateTaskInput) => Promise<OrchestratedTask>;
  retryTask: (taskId: string) => Promise<OrchestratedTask | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  pickFolder: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  onEvent: (listener: (event: TaskStreamEvent) => void) => () => void;
}

declare global {
  interface Window {
    switchboard?: SwitchboardApi;
  }
}
