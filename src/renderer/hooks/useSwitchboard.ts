import { useCallback, useEffect, useState } from 'react';
import {
  createStarterAccounts,
  DEFAULT_ROUTING_RULES,
  DEFAULT_SETTINGS,
} from '../../shared/presets';
import {
  AccountProfile,
  AppSettings,
  CloneRepoInput,
  CodingPermissionMode,
  CreateAccountInput,
  CreatePrInput,
  CreateProjectInput,
  CreateTaskInput,
  GitHubSyncConfig,
  ImportProjectInput,
  MergePrInput,
  RoutingRule,
  SwitchboardState,
  TaskStreamEvent,
} from '../../shared/types';
import { applyThemePreference } from '../utils/theme';

function createBrowserPreviewState(): SwitchboardState {
  return {
    accounts: createStarterAccounts('~/.switchboard/profiles'),
    routingRules: DEFAULT_ROUTING_RULES,
    projects: [],
    threads: [],
    tasks: [],
    settings: DEFAULT_SETTINGS,
    sync: {
      connected: false,
      autoSync: false,
      includeTasks: true,
      encryptSecrets: false,
      lastSyncedAt: null,
      lastSyncDirection: null,
      lastError: null,
    },
    cliHealth: [
      {
        provider: 'claude-cli',
        binary: 'claude',
        installed: true,
        version: 'Preview Mode',
        installHint: 'npm install -g @anthropic-ai/claude-code',
      },
      {
        provider: 'agy-cli',
        binary: 'agy',
        installed: true,
        version: 'Preview Mode',
        installHint: 'Install Google Antigravity CLI from https://antigravity.google',
      },
      {
        provider: 'gemini-cli',
        binary: 'gemini',
        installed: false,
        installHint: 'npm install -g @google/gemini-cli',
      },
      {
        provider: 'codex-cli',
        binary: 'codex',
        installed: false,
        installHint: 'npm install -g @openai/codex',
      },
    ],
    discoveredModels: {},
    usageSummaries: {},
    queueRunning: false,
  };
}

export function useSwitchboard() {
  const [state, setState] = useState<SwitchboardState | null>(null);
  const [platform, setPlatform] = useState<string>('darwin');
  const [lastFailoverToast, setLastFailoverToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (window.switchboard) {
      const next = await window.switchboard.getState();
      setState(next);
      return;
    }
    setState((prev) => prev ?? createBrowserPreviewState());
  }, []);

  useEffect(() => {
    if (window.switchboard) {
      setPlatform(window.switchboard.getPlatform());
    }
    void reload();

    if (!window.switchboard) return;

    const unsubscribe = window.switchboard.onEvent((event: TaskStreamEvent) => {
      if (event.type === 'subtask-chunk' && event.taskId && event.subtaskId && event.chunk) {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id !== event.taskId
                ? t
                : {
                    ...t,
                    subtasks: t.subtasks.map((s) =>
                      s.id !== event.subtaskId
                        ? s
                        : {
                            ...s,
                            output: s.output + event.chunk,
                            liveStatus: 'Streaming response...',
                          }
                    ),
                  }
            ),
          };
        });
        return;
      }

      if (event.type === 'subtask-status' && event.taskId && event.subtaskId && event.statusText) {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id !== event.taskId
                ? t
                : {
                    ...t,
                    subtasks: t.subtasks.map((s) =>
                      s.id !== event.subtaskId ? s : { ...s, liveStatus: event.statusText }
                    ),
                  }
            ),
          };
        });
        return;
      }

      if (event.type === 'subtask-activity' && event.taskId && event.subtaskId && event.activityStep) {
        const incoming = event.activityStep;
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id !== event.taskId
                ? t
                : {
                    ...t,
                    subtasks: t.subtasks.map((s) => {
                      if (s.id !== event.subtaskId) return s;
                      const prevLog = s.activityLog ?? [];
                      const idx = prevLog.findIndex((item) => item.id === incoming.id);
                      const nextLog =
                        idx >= 0
                          ? prevLog.map((item, i) => (i === idx ? { ...item, ...incoming, label: incoming.label || item.label } : item))
                          : [...prevLog, incoming].slice(-60);
                      return { ...s, activityLog: nextLog };
                    }),
                  }
            ),
          };
        });
        return;
      }

      if (event.type === 'failover-triggered') {
        const msg = event.toAccountName
          ? `Limit hit on ${event.fromAccountName} → switched to ${event.toAccountName}`
          : `Limit hit on ${event.fromAccountName} (${event.reason ?? 'cooldown'})`;
        setLastFailoverToast(msg);
        setTimeout(() => setLastFailoverToast((cur) => (cur === msg ? null : cur)), 6500);
      }

      void reload();
    });

    const interval = setInterval(() => {
      void reload();
    }, 15_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [reload]);

  const actions = {
    refreshCliHealth: async () => {
      if (window.switchboard) {
        await window.switchboard.refreshCliHealth();
        await reload();
      }
    },
    refreshUsage: async () => {
      if (window.switchboard) {
        await window.switchboard.refreshUsage();
        await reload();
      }
    },
    addAccount: async (input: CreateAccountInput) => {
      if (window.switchboard) {
        await window.switchboard.addAccount(input);
        await reload();
      }
    },
    updateAccount: async (id: string, patch: Partial<AccountProfile>) => {
      if (window.switchboard) {
        await window.switchboard.updateAccount(id, patch);
        await reload();
      }
    },
    deleteAccount: async (id: string) => {
      if (window.switchboard) {
        await window.switchboard.deleteAccount(id);
        await reload();
      }
    },
    clearCooldown: async (id: string) => {
      if (window.switchboard) {
        await window.switchboard.clearCooldown(id);
        await reload();
      }
    },
    testAccount: async (id: string) => {
      if (window.switchboard) {
        return window.switchboard.testAccount(id);
      }
      return { ok: true, message: 'Preview mode OK', latencyMs: 120 };
    },
    launchCliLogin: async (id: string) => {
      if (window.switchboard) {
        return window.switchboard.launchCliLogin(id);
      }
      return { ok: false, command: '', error: 'Run inside Electron desktop app to launch Terminal.' };
    },
    updateRoutingRule: async (category: RoutingRule['category'], patch: Partial<RoutingRule>) => {
      if (window.switchboard) {
        await window.switchboard.updateRoutingRule(category, patch);
        await reload();
      }
    },
    updateSettings: async (patch: Partial<AppSettings>) => {
      if (patch.theme) {
        applyThemePreference(patch.theme);
      }
      if (window.switchboard) {
        await window.switchboard.updateSettings(patch);
        await reload();
      }
    },
    // Projects & Threads
    createProject: async (input: CreateProjectInput) => {
      if (!window.switchboard) return null;
      const proj = await window.switchboard.createProject(input);
      await reload();
      return proj;
    },
    importProject: async (input: ImportProjectInput) => {
      if (!window.switchboard) return null;
      const proj = await window.switchboard.importProject(input);
      await reload();
      return proj;
    },
    cloneRepoProject: async (input: CloneRepoInput) => {
      if (!window.switchboard) return null;
      const proj = await window.switchboard.cloneRepoProject(input);
      await reload();
      return proj;
    },
    listGitHubRepos: async () => {
      if (!window.switchboard) return [];
      return window.switchboard.listGitHubRepos();
    },
    pushProjectToGitHub: async (projectId: string, isPrivate: boolean) => {
      if (!window.switchboard) return null;
      const proj = await window.switchboard.pushProjectToGitHub(projectId, isPrivate);
      await reload();
      return proj;
    },
    deleteProject: async (projectId: string) => {
      if (window.switchboard) {
        await window.switchboard.deleteProject(projectId);
        await reload();
      }
    },
    createThread: async (projectId: string | null, title?: string) => {
      if (!window.switchboard) return null;
      const thread = await window.switchboard.createThread(projectId, title);
      await reload();
      return thread;
    },
    deleteThread: async (threadId: string) => {
      if (window.switchboard) {
        await window.switchboard.deleteThread(threadId);
        await reload();
      }
    },
    // GitHub Cloud Sync
    connectGitHub: async (opts: { authMode: 'gh-cli' | 'pat'; patToken?: string }) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      const res = await window.switchboard.connectGitHub(opts);
      await reload();
      return res;
    },
    disconnectGitHub: async () => {
      if (window.switchboard) {
        await window.switchboard.disconnectGitHub();
        await reload();
      }
    },
    updateSyncSettings: async (
      patch: Partial<Pick<GitHubSyncConfig, 'autoSync' | 'includeTasks' | 'encryptSecrets'>>
    ) => {
      if (window.switchboard) {
        await window.switchboard.updateSyncSettings(patch);
        await reload();
      }
    },
    pushSyncNow: async (passphrase?: string) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      const res = await window.switchboard.pushSyncNow(passphrase);
      await reload();
      return res;
    },
    pullSyncNow: async (passphrase?: string) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      const res = await window.switchboard.pullSyncNow(passphrase);
      await reload();
      return res;
    },
    // Git Workspace
    gitStatus: async (cwd: string) => {
      if (!window.switchboard) {
        return {
          isGitRepo: false,
          cwd,
          currentBranch: '',
          branches: [],
          ahead: 0,
          behind: 0,
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
        };
      }
      return window.switchboard.gitStatus(cwd);
    },
    gitFileDiff: async (cwd: string, filePath: string) => {
      if (!window.switchboard) return '';
      return window.switchboard.gitFileDiff(cwd, filePath);
    },
    gitCheckout: async (cwd: string, branchName: string, createNew?: boolean) => {
      if (window.switchboard) {
        await window.switchboard.gitCheckout(cwd, branchName, createNew);
      }
    },
    gitDiscardFile: async (cwd: string, filePath: string) => {
      if (window.switchboard) {
        await window.switchboard.gitDiscardFile(cwd, filePath);
      }
    },
    gitCommitAll: async (cwd: string, message: string) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      return window.switchboard.gitCommitAll(cwd, message);
    },
    gitPush: async (cwd: string) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      return window.switchboard.gitPush(cwd);
    },
    gitCreatePr: async (input: CreatePrInput) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      return window.switchboard.gitCreatePr(input);
    },
    gitGetCurrentPr: async (cwd: string) => {
      if (!window.switchboard) return null;
      return window.switchboard.gitGetCurrentPr(cwd);
    },
    gitMergePr: async (input: MergePrInput) => {
      if (!window.switchboard) throw new Error('Desktop app required.');
      return window.switchboard.gitMergePr(input);
    },
    // Tasks
    enqueueTask: async (input: CreateTaskInput) => {
      if (window.switchboard) {
        const task = await window.switchboard.enqueueTask(input);
        await reload();
        return task;
      }
      return null;
    },
    retryTask: async (taskId: string, opts?: { permissionMode?: CodingPermissionMode }) => {
      if (window.switchboard) {
        await window.switchboard.retryTask(taskId, opts);
        await reload();
      }
    },
    cancelTask: async (taskId: string) => {
      if (window.switchboard) {
        await window.switchboard.cancelTask(taskId);
        await reload();
      }
    },
    deleteTask: async (taskId: string) => {
      if (window.switchboard) {
        await window.switchboard.deleteTask(taskId);
        await reload();
      }
    },
    pickFolder: async () => {
      if (window.switchboard) {
        return window.switchboard.pickFolder();
      }
      return null;
    },
    pickFiles: async () => {
      if (window.switchboard) {
        return window.switchboard.pickFiles();
      }
      return [];
    },
    saveAttachment: async (input: { name: string; mimeType: string; base64Data: string }) => {
      if (window.switchboard) {
        return window.switchboard.saveAttachment(input);
      }
      return null;
    },
    openExternal: async (url: string) => {
      if (window.switchboard) {
        await window.switchboard.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener');
      }
    },
  };

  return { state, platform, lastFailoverToast, actions };
}
