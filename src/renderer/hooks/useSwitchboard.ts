import { useCallback, useEffect, useState } from 'react';
import {
  createStarterAccounts,
  DEFAULT_ROUTING_RULES,
  DEFAULT_SETTINGS,
} from '../../shared/presets';
import {
  AccountProfile,
  AppSettings,
  CreateAccountInput,
  CreateTaskInput,
  RoutingRule,
  SwitchboardState,
  TaskStreamEvent,
} from '../../shared/types';
import { applyThemePreference } from '../utils/theme';

function createBrowserPreviewState(): SwitchboardState {
  return {
    accounts: createStarterAccounts('~/.switchboard/profiles'),
    routingRules: DEFAULT_ROUTING_RULES,
    tasks: [],
    settings: DEFAULT_SETTINGS,
    cliHealth: [
      {
        provider: 'claude-cli',
        binary: 'claude',
        installed: true,
        version: 'Preview Mode',
        installHint: 'npm install -g @anthropic-ai/claude-code',
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
                      s.id !== event.subtaskId ? s : { ...s, output: s.output + event.chunk }
                    ),
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

    // Periodic tick every 15s to auto-refresh expiring cooldown timers
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
    addAccount: async (input: CreateAccountInput) => {
      if (window.switchboard) {
        await window.switchboard.addAccount(input);
        await reload();
        return;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              accounts: [
                ...prev.accounts,
                {
                  id: `acc-${Date.now()}`,
                  name: input.name,
                  provider: input.provider,
                  model: input.model,
                  scope: input.scope,
                  enabled: true,
                  priority: prev.accounts.length + 1,
                  tags: input.tags ?? [input.provider],
                  strengths: input.strengths ?? {},
                  profileDir: input.profileDir,
                  apiKey: input.apiKey,
                  baseUrl: input.baseUrl,
                  totalRuns: 0,
                  totalFailovers: 0,
                },
              ],
            }
          : prev
      );
    },
    updateAccount: async (id: string, patch: Partial<AccountProfile>) => {
      if (window.switchboard) {
        await window.switchboard.updateAccount(id, patch);
        await reload();
        return;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              accounts: prev.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
            }
          : prev
      );
    },
    deleteAccount: async (id: string) => {
      if (window.switchboard) {
        await window.switchboard.deleteAccount(id);
        await reload();
        return;
      }
      setState((prev) =>
        prev ? { ...prev, accounts: prev.accounts.filter((a) => a.id !== id) } : prev
      );
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
        return;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              routingRules: prev.routingRules.map((r) =>
                r.category === category ? { ...r, ...patch } : r
              ),
            }
          : prev
      );
    },
    updateSettings: async (patch: Partial<AppSettings>) => {
      if (patch.theme) {
        applyThemePreference(patch.theme);
      }
      if (window.switchboard) {
        await window.switchboard.updateSettings(patch);
        await reload();
        return;
      }
      setState((prev) =>
        prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev
      );
    },
    enqueueTask: async (input: CreateTaskInput) => {
      if (window.switchboard) {
        const task = await window.switchboard.enqueueTask(input);
        await reload();
        return task;
      }
      return null;
    },
    retryTask: async (taskId: string) => {
      if (window.switchboard) {
        await window.switchboard.retryTask(taskId);
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
  };

  return { state, platform, lastFailoverToast, actions };
}
