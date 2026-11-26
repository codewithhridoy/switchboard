import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PROVIDER_PRESETS } from '../shared/presets';
import {
  AccountProfile,
  AppSettings,
  CliHealthInfo,
  CreateAccountInput,
  CreateTaskInput,
  ExecutionAttempt,
  OrchestratedTask,
  ProviderKind,
  RoutingRule,
  Subtask,
  SwitchboardState,
  TaskStreamEvent,
} from '../shared/types';
import { classifyPrompt, decomposePrompt, deriveTitle } from './classifier';
import { getNextCooldownExpiry, selectAccountForTask } from './router';
import { checkCliHealth } from './runners/cliEnv';
import { getRunnerForProvider } from './runners/index';
import { ProviderRunner } from './runners/types';
import { SwitchboardStore } from './store';

export interface OrchestratorDeps {
  store?: SwitchboardStore;
  runnerFactory?: (provider: ProviderKind) => ProviderRunner;
}

export class SwitchboardOrchestrator extends EventEmitter {
  private readonly store: SwitchboardStore;
  private readonly runnerFactory: (provider: ProviderKind) => ProviderRunner;
  private cliHealth: CliHealthInfo[] = [];
  private queueRunning = false;
  private activeAbortController: AbortController | null = null;
  private activeTaskId: string | null = null;

  constructor(deps: OrchestratorDeps = {}) {
    super();
    this.store = deps.store ?? new SwitchboardStore();
    this.runnerFactory = deps.runnerFactory ?? getRunnerForProvider;

    // Recover any interrupted running tasks from previous app close
    const data = this.store.getData();
    let recovered = false;
    for (const task of data.tasks) {
      if (task.status === 'running' || task.status === 'planning') {
        task.status = 'failed';
        task.error = 'Interrupted when Switchboard closed. Click Retry to resume.';
        recovered = true;
      }
    }
    if (recovered) {
      this.store.save();
    }
  }

  public async refreshCliHealth(): Promise<CliHealthInfo[]> {
    this.cliHealth = await checkCliHealth();
    this.emitState();
    return this.cliHealth;
  }

  public getState(): SwitchboardState {
    const data = this.store.getData();
    // Auto-clear expired cooldowns so UI always shows live status
    const now = Date.now();
    let changed = false;
    for (const acc of data.accounts) {
      if (acc.cooldownUntil && acc.cooldownUntil <= now) {
        acc.cooldownUntil = null;
        acc.cooldownReason = null;
        changed = true;
      }
    }
    if (changed) {
      this.store.save();
    }

    return {
      accounts: data.accounts,
      routingRules: data.routingRules,
      tasks: data.tasks,
      settings: data.settings,
      cliHealth: this.cliHealth,
      queueRunning: this.queueRunning,
    };
  }

  // ---------- Account Management ----------

  public addAccount(input: CreateAccountInput): AccountProfile {
    const data = this.store.getData();
    const preset = PROVIDER_PRESETS.find((p) => p.provider === input.provider);
    const id = `acc-${crypto.randomUUID().slice(0, 8)}`;

    let profileDir = input.profileDir;
    if (
      !profileDir &&
      (input.provider === 'claude-cli' ||
        input.provider === 'gemini-cli' ||
        input.provider === 'codex-cli')
    ) {
      profileDir = this.store.createProfileDir(`${input.name}-${id.slice(-4)}`);
    }

    const account: AccountProfile = {
      id,
      name: input.name.trim(),
      provider: input.provider,
      model: input.model.trim(),
      scope: input.scope,
      enabled: true,
      priority: input.priority ?? data.accounts.length + 1,
      tags: input.tags?.length ? input.tags : (preset?.defaultTags ?? [input.provider]),
      strengths: input.strengths ?? preset?.defaultStrengths ?? {},
      profileDir,
      cliPath: input.cliPath?.trim() || undefined,
      extraArgs: input.extraArgs,
      apiKey: input.apiKey?.trim() || undefined,
      baseUrl: input.baseUrl?.trim() || preset?.defaultBaseUrl,
      cooldownUntil: null,
      cooldownReason: null,
      lastUsedAt: null,
      totalRuns: 0,
      totalFailovers: 0,
    };

    data.accounts.push(account);
    this.store.save();
    this.emitState();
    return account;
  }

  public updateAccount(id: string, patch: Partial<AccountProfile>): AccountProfile | null {
    const data = this.store.getData();
    const acc = data.accounts.find((a) => a.id === id);
    if (!acc) return null;
    Object.assign(acc, patch, { id: acc.id });
    this.store.save();
    this.emitState();
    return acc;
  }

  public deleteAccount(id: string): boolean {
    const data = this.store.getData();
    const before = data.accounts.length;
    data.accounts = data.accounts.filter((a) => a.id !== id);
    if (data.accounts.length === before) return false;
    for (const rule of data.routingRules) {
      rule.preferredAccountIds = rule.preferredAccountIds.filter((aid) => aid !== id);
    }
    this.store.save();
    this.emitState();
    return true;
  }

  public clearAccountCooldown(id: string): AccountProfile | null {
    return this.updateAccount(id, { cooldownUntil: null, cooldownReason: null });
  }

  public markAccountCooldown(id: string, durationMs: number, reason: string): AccountProfile | null {
    return this.updateAccount(id, {
      cooldownUntil: Date.now() + durationMs,
      cooldownReason: reason,
    });
  }

  // ---------- Routing & Settings ----------

  public updateRoutingRule(category: RoutingRule['category'], patch: Partial<RoutingRule>): void {
    const data = this.store.getData();
    const rule = data.routingRules.find((r) => r.category === category);
    if (!rule) return;
    Object.assign(rule, patch, { category: rule.category });
    this.store.save();
    this.emitState();
  }

  public updateSettings(patch: Partial<AppSettings>): AppSettings {
    const data = this.store.getData();
    data.settings = { ...data.settings, ...patch };
    this.store.save();
    this.emitState();
    return data.settings;
  }

  // ---------- Tasks & Queue Engine ----------

  public enqueueTask(input: CreateTaskInput): OrchestratedTask {
    const data = this.store.getData();
    const autoDecompose = input.autoDecompose ?? data.settings.autoDecomposeMultiStep;
    const classification = classifyPrompt(input.prompt, input.mode);
    const planned = decomposePrompt(input.prompt, input.mode, autoDecompose);

    const subtasks: Subtask[] = planned.map((p, idx) => ({
      id: `sub-${crypto.randomUUID().slice(0, 8)}`,
      index: idx,
      title: p.title,
      prompt: p.prompt,
      category: p.category,
      status: 'pending',
      attempts: [],
      output: '',
    }));

    const task: OrchestratedTask = {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      title: input.title?.trim() || deriveTitle(input.prompt),
      prompt: input.prompt.trim(),
      mode: input.mode,
      workspaceDir:
        input.mode === 'coding'
          ? input.workspaceDir?.trim() || data.settings.defaultWorkspaceDir || process.cwd()
          : undefined,
      workspaceScope: input.workspaceScope ?? 'any',
      autoDecompose,
      forcedAccountId: input.forcedAccountId ?? null,
      category: classification.category,
      categoryConfidence: classification.confidence,
      status: 'queued',
      subtasks,
      createdAt: Date.now(),
      failoverCount: 0,
    };

    data.tasks.unshift(task);
    // Keep last 100 tasks to prevent unbounded state growth
    if (data.tasks.length > 100) {
      data.tasks = data.tasks.slice(0, 100);
    }
    this.store.save();
    this.emitState();

    void this.processQueue();
    return task;
  }

  public retryTask(taskId: string): OrchestratedTask | null {
    const data = this.store.getData();
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task || task.status === 'running') return null;

    task.status = 'queued';
    task.error = undefined;
    task.completedAt = undefined;
    for (const sub of task.subtasks) {
      if (sub.status !== 'completed') {
        sub.status = 'pending';
        sub.error = undefined;
      }
    }
    this.store.save();
    this.emitState();
    void this.processQueue();
    return task;
  }

  public cancelTask(taskId: string): boolean {
    const data = this.store.getData();
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return false;

    if (task.status === 'queued') {
      task.status = 'cancelled';
      for (const s of task.subtasks) {
        if (s.status === 'pending') s.status = 'cancelled';
      }
      this.store.save();
      this.emitState();
      return true;
    }

    if (this.activeTaskId === taskId && this.activeAbortController) {
      task.status = 'cancelled';
      this.activeAbortController.abort();
      this.store.save();
      this.emitState();
      return true;
    }

    return false;
  }

  public deleteTask(taskId: string): boolean {
    if (this.activeTaskId === taskId) {
      this.cancelTask(taskId);
    }
    const data = this.store.getData();
    const before = data.tasks.length;
    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    if (data.tasks.length === before) return false;
    this.store.save();
    this.emitState();
    return true;
  }

  public async processQueue(): Promise<void> {
    if (this.queueRunning) return;
    this.queueRunning = true;
    this.emitState();

    try {
      while (true) {
        const data = this.store.getData();
        // FIFO among queued tasks (tasks array is newest-first, so pick oldest queued)
        const nextTask = [...data.tasks].reverse().find((t) => t.status === 'queued');
        if (!nextTask) break;
        await this.executeTask(nextTask);
      }
    } finally {
      this.queueRunning = false;
      this.activeTaskId = null;
      this.activeAbortController = null;
      this.emitState();
    }
  }

  private async executeTask(task: OrchestratedTask): Promise<void> {
    const data = this.store.getData();
    this.activeTaskId = task.id;
    task.status = 'running';
    task.startedAt = task.startedAt ?? Date.now();
    this.store.save();
    this.emitState();

    const completedSummaries: string[] = [];

    for (const subtask of task.subtasks) {
      if ((task.status as string) === 'cancelled') break;
      if (subtask.status === 'completed') {
        completedSummaries.push(
          `### Step ${subtask.index + 1}: ${subtask.title}\n${truncateTail(subtask.output, 1200)}`
        );
        continue;
      }

      const ok = await this.executeSubtaskWithFailover(task, subtask, completedSummaries);
      if (!ok) {
        if ((task.status as string) !== 'cancelled') {
          task.status = 'failed';
          task.error = subtask.error ?? `Subtask "${subtask.title}" failed`;
          task.completedAt = Date.now();
          this.store.save();
          this.emitEvent({
            type: 'task-failed',
            taskId: task.id,
            subtaskId: subtask.id,
            reason: task.error,
            timestamp: Date.now(),
          });
        }
        return;
      }

      completedSummaries.push(
        `### Step ${subtask.index + 1}: ${subtask.title} (completed by ${subtask.assignedAccountName})\n${truncateTail(subtask.output, 1500)}`
      );
    }

    if ((task.status as string) !== 'cancelled') {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.summary =
        task.subtasks[task.subtasks.length - 1]?.output.slice(0, 600) ?? 'Completed.';
      this.store.save();
      this.emitEvent({
        type: 'task-completed',
        taskId: task.id,
        timestamp: Date.now(),
      });
    }
  }

  private async executeSubtaskWithFailover(
    task: OrchestratedTask,
    subtask: Subtask,
    priorStepSummaries: string[]
  ): Promise<boolean> {
    const data = this.store.getData();
    const maxAttempts = Math.max(1, data.settings.maxAttemptsPerSubtask);
    const excludeIds: string[] = [];
    let handoffNotes = '';

    for (let attemptIdx = 1; attemptIdx <= maxAttempts; attemptIdx++) {
      if ((task.status as string) === 'cancelled') {
        subtask.status = 'cancelled';
        return false;
      }

      const selection = selectAccountForTask(data.accounts, data.routingRules, {
        category: subtask.category,
        workspaceScope: task.workspaceScope,
        workspaceDir: task.workspaceDir,
        forcedAccountId: task.forcedAccountId,
        excludeAccountIds: excludeIds,
      });

      if (!selection) {
        const nextExpiry = getNextCooldownExpiry(data.accounts);
        const expiryMsg = nextExpiry
          ? ` Next account recovers around ${new Date(nextExpiry).toLocaleTimeString()}.`
          : '';
        subtask.status = 'failed';
        subtask.error = `No eligible accounts available for "${subtask.category}" (all remaining accounts are disabled, rate-limited, or need setup).${expiryMsg}`;
        this.store.save();
        this.emitState();
        return false;
      }

      const { account, reason } = selection;
      subtask.status = attemptIdx === 1 ? 'running' : 'retrying';
      subtask.startedAt = subtask.startedAt ?? Date.now();
      subtask.assignedAccountId = account.id;
      subtask.assignedAccountName = account.name;
      subtask.assignedModel = account.model;
      subtask.routingReason = reason;

      const attempt: ExecutionAttempt = {
        attemptNumber: attemptIdx,
        accountId: account.id,
        accountName: account.name,
        provider: account.provider,
        model: account.model,
        startedAt: Date.now(),
        status: 'running',
      };
      subtask.attempts.push(attempt);
      account.lastUsedAt = Date.now();
      account.totalRuns += 1;

      const headerBanner = `\n[Switchboard] Step ${subtask.index + 1}/${task.subtasks.length} → ${account.name} (${account.model}) · ${reason}\n`;
      subtask.output += headerBanner;
      this.store.save();
      this.emitEvent({
        type: 'subtask-chunk',
        taskId: task.id,
        subtaskId: subtask.id,
        chunk: headerBanner,
        stream: 'system',
        timestamp: Date.now(),
      });

      const composedPrompt = this.buildSubtaskPrompt(
        task,
        subtask,
        priorStepSummaries,
        handoffNotes,
        data.settings.handoffContextChars
      );

      this.activeAbortController = new AbortController();
      const runner = this.runnerFactory(account.provider);

      const result = await runner.run({
        account,
        prompt: composedPrompt,
        mode: task.mode,
        workspaceDir: task.workspaceDir,
        signal: this.activeAbortController.signal,
        onChunk: (chunk, stream) => {
          subtask.output += chunk;
          this.emitEvent({
            type: 'subtask-chunk',
            taskId: task.id,
            subtaskId: subtask.id,
            chunk,
            stream,
            timestamp: Date.now(),
          });
        },
      });

      attempt.endedAt = Date.now();
      attempt.outputPreview = truncateTail(result.output, 300);

      if (result.cancelled || (task.status as string) === 'cancelled') {
        attempt.status = 'cancelled';
        subtask.status = 'cancelled';
        this.store.save();
        this.emitState();
        return false;
      }

      if (result.ok) {
        attempt.status = 'completed';
        subtask.status = 'completed';
        subtask.completedAt = Date.now();
        this.store.save();
        this.emitState();
        return true;
      }

      // Check routing rule failover policy
      const rule = data.routingRules.find((r) => r.category === subtask.category);
      const canFailover = rule ? rule.allowFailover : true;

      if (result.rateLimited) {
        const cooldownMs =
          result.retryAfterMs ?? data.settings.defaultCooldownMinutes * 60 * 1000;
        account.cooldownUntil = Date.now() + cooldownMs;
        account.cooldownReason = result.rateLimitReason ?? 'Rate limit reached';
        account.totalFailovers += 1;
        attempt.status = 'rate-limited';
        attempt.reason = account.cooldownReason;
        task.failoverCount += 1;
        excludeIds.push(account.id);

        const partial = truncateTail(result.output, data.settings.handoffContextChars);
        handoffNotes = `Previous attempt on ${account.name} (${account.model}) hit a usage/rate limit (${account.cooldownReason}).${
          partial
            ? `\nPartial progress produced before the limit:\n${partial}\nContinue seamlessly from where it stopped without repeating completed work.`
            : '\nStart and complete this step cleanly.'
        }`;

        const nextPreview = selectAccountForTask(data.accounts, data.routingRules, {
          category: subtask.category,
          workspaceScope: task.workspaceScope,
          workspaceDir: task.workspaceDir,
          excludeAccountIds: excludeIds,
        });

        const failoverNotice = `\n[Switchboard Failover] ${account.name} hit limit (${account.cooldownReason}). Placed in cooldown until ${new Date(account.cooldownUntil).toLocaleTimeString()}.${
          canFailover && nextPreview
            ? ` Switching automatically to ${nextPreview.account.name} (${nextPreview.account.model})...\n`
            : ' No fallback account available.\n'
        }`;
        subtask.output += failoverNotice;
        this.store.save();

        this.emitEvent({
          type: 'failover-triggered',
          taskId: task.id,
          subtaskId: subtask.id,
          fromAccountName: account.name,
          toAccountName: nextPreview?.account.name,
          reason: account.cooldownReason,
          chunk: failoverNotice,
          stream: 'system',
          timestamp: Date.now(),
        });

        if (!canFailover) {
          subtask.status = 'failed';
          subtask.error = `${account.name} hit limit and failover is disabled for ${subtask.category}.`;
          this.store.save();
          this.emitState();
          return false;
        }
        continue;
      }

      // Non-rate-limit error (e.g., CLI not installed, auth missing, transient network error)
      attempt.status = 'failed';
      attempt.reason = result.error ?? 'Unknown error';
      excludeIds.push(account.id);

      if (canFailover && attemptIdx < maxAttempts) {
        const nextPreview = selectAccountForTask(data.accounts, data.routingRules, {
          category: subtask.category,
          workspaceScope: task.workspaceScope,
          workspaceDir: task.workspaceDir,
          excludeAccountIds: excludeIds,
        });

        if (nextPreview) {
          task.failoverCount += 1;
          account.totalFailovers += 1;
          const notice = `\n[Switchboard Failover] ${account.name} failed (${attempt.reason}). Trying ${nextPreview.account.name} (${nextPreview.account.model})...\n`;
          subtask.output += notice;
          handoffNotes = `Previous attempt on ${account.name} failed with: ${attempt.reason}. Complete the step cleanly.`;
          this.store.save();
          this.emitEvent({
            type: 'failover-triggered',
            taskId: task.id,
            subtaskId: subtask.id,
            fromAccountName: account.name,
            toAccountName: nextPreview.account.name,
            reason: attempt.reason,
            chunk: notice,
            stream: 'system',
            timestamp: Date.now(),
          });
          continue;
        }
      }

      subtask.status = 'failed';
      subtask.error = result.error ?? 'Execution failed';
      this.store.save();
      this.emitState();
      return false;
    }

    subtask.status = 'failed';
    subtask.error = `Exceeded max failover attempts (${maxAttempts}).`;
    this.store.save();
    this.emitState();
    return false;
  }

  private buildSubtaskPrompt(
    task: OrchestratedTask,
    subtask: Subtask,
    priorStepSummaries: string[],
    handoffNotes: string,
    maxChars: number
  ): string {
    const sections: string[] = [];

    if (priorStepSummaries.length > 0) {
      sections.push(
        `Context from completed previous steps:\n${truncateTail(priorStepSummaries.join('\n\n'), maxChars)}`
      );
    }

    if (handoffNotes) {
      sections.push(`Failover handoff:\n${handoffNotes}`);
    }

    if (task.mode === 'coding' && task.workspaceDir) {
      sections.push(`Working directory: ${task.workspaceDir}`);
    }

    sections.push(subtask.prompt);
    return sections.join('\n\n---\n\n');
  }

  private emitState(): void {
    this.emitEvent({ type: 'state-updated', timestamp: Date.now() });
  }

  private emitEvent(event: TaskStreamEvent): void {
    this.emit('event', event);
  }
}

function truncateTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `...[truncated]\n${text.slice(-maxChars)}`;
}
