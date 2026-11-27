import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkoutBranch,
  createGitHubPullRequest,
  discardFileChanges,
  getFileDiff,
  getGitWorkspaceStatus,
  pushCurrentBranch,
  stageAndCommitAll,
} from '../core/gitWorkspace';
import { SwitchboardOrchestrator } from '../core/orchestrator';
import { getRunnerForProvider } from '../core/runners/index';
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
  RoutingRule,
  TaskAttachment,
  TaskStreamEvent,
} from '../shared/types';
import { launchAccountCliLogin } from './terminalLogin';

let mainWindow: BrowserWindow | null = null;
const orchestrator = new SwitchboardOrchestrator();
let lastCliScanAt = 0;

function createWindow(): void {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Switchboard',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0d12' : '#f7f8fa',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('focus', () => {
    const now = Date.now();
    if (now - lastCliScanAt > 10_000) {
      lastCliScanAt = now;
      void orchestrator.refreshCliHealth();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    void mainWindow.loadURL('http://localhost:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

function broadcastEvent(event: TaskStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('switchboard:event', event);
    }
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('switchboard:get-state', () => orchestrator.getState());
  ipcMain.handle('switchboard:refresh-cli-health', () => orchestrator.refreshCliHealth());
  ipcMain.handle('switchboard:refresh-usage', () => {
    orchestrator.refreshUsage();
  });

  ipcMain.handle('switchboard:add-account', (_e, input: CreateAccountInput) =>
    orchestrator.addAccount(input)
  );
  ipcMain.handle(
    'switchboard:update-account',
    (_e, id: string, patch: Partial<AccountProfile>) => orchestrator.updateAccount(id, patch)
  );
  ipcMain.handle('switchboard:delete-account', (_e, id: string) =>
    orchestrator.deleteAccount(id)
  );
  ipcMain.handle('switchboard:clear-cooldown', (_e, id: string) =>
    orchestrator.clearAccountCooldown(id)
  );

  ipcMain.handle('switchboard:test-account', async (_e, id: string) => {
    const acc = orchestrator.getState().accounts.find((a) => a.id === id);
    if (!acc) return { ok: false, message: 'Account not found.', latencyMs: 0 };

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const runner = getRunnerForProvider(acc.provider);
      const res = await runner.run({
        account: acc,
        prompt: 'Reply with exactly the word READY.',
        mode: 'general',
        signal: controller.signal,
        onChunk: () => {},
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return {
          ok: true,
          message: `Connected (${res.output.slice(0, 60) || 'OK'})`,
          latencyMs,
        };
      }
      if (res.rateLimited) {
        return {
          ok: false,
          message: `Rate limited: ${res.rateLimitReason ?? res.error}`,
          latencyMs,
        };
      }
      return {
        ok: false,
        message: res.error ?? 'Connection check failed.',
        latencyMs,
      };
    } catch (err) {
      clearTimeout(timer);
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  });

  ipcMain.handle('switchboard:launch-cli-login', async (_e, id: string) => {
    const acc = orchestrator.getState().accounts.find((a) => a.id === id);
    if (!acc) {
      return { ok: false, command: '', error: 'Account not found.' };
    }
    return launchAccountCliLogin(acc);
  });

  ipcMain.handle(
    'switchboard:update-routing-rule',
    (_e, category: RoutingRule['category'], patch: Partial<RoutingRule>) => {
      orchestrator.updateRoutingRule(category, patch);
    }
  );

  ipcMain.handle('switchboard:update-settings', (_e, patch: Partial<AppSettings>) =>
    orchestrator.updateSettings(patch)
  );

  // Projects & Threads
  ipcMain.handle('switchboard:create-project', (_e, input: CreateProjectInput) =>
    orchestrator.createProject(input)
  );
  ipcMain.handle('switchboard:import-project', (_e, input: ImportProjectInput) =>
    orchestrator.importProject(input)
  );
  ipcMain.handle('switchboard:clone-repo', (_e, input: CloneRepoInput) =>
    orchestrator.cloneRepoProject(input)
  );
  ipcMain.handle('switchboard:list-github-repos', () => orchestrator.listGitHubRepos());
  ipcMain.handle(
    'switchboard:push-project-github',
    (_e, projectId: string, isPrivate: boolean) =>
      orchestrator.pushProjectToGitHub(projectId, isPrivate)
  );
  ipcMain.handle('switchboard:delete-project', (_e, projectId: string) =>
    orchestrator.deleteProject(projectId)
  );
  ipcMain.handle(
    'switchboard:create-thread',
    (_e, projectId: string | null, title?: string) =>
      orchestrator.createThread(projectId, title)
  );
  ipcMain.handle('switchboard:delete-thread', (_e, threadId: string) =>
    orchestrator.deleteThread(threadId)
  );

  // GitHub Cloud Sync
  ipcMain.handle(
    'switchboard:connect-github',
    (_e, opts: { authMode: 'gh-cli' | 'pat'; patToken?: string }) =>
      orchestrator.connectGitHub(opts)
  );
  ipcMain.handle('switchboard:disconnect-github', () => orchestrator.disconnectGitHub());
  ipcMain.handle(
    'switchboard:update-sync-settings',
    (_e, patch: Partial<Pick<GitHubSyncConfig, 'autoSync' | 'includeTasks' | 'encryptSecrets'>>) =>
      orchestrator.updateSyncSettings(patch)
  );
  ipcMain.handle('switchboard:push-sync-now', (_e, passphrase?: string) =>
    orchestrator.pushSyncNow(passphrase)
  );
  ipcMain.handle('switchboard:pull-sync-now', (_e, passphrase?: string) =>
    orchestrator.pullSyncNow(passphrase)
  );

  // Git Workspace (Diff, Branches, Commit, Push, Pull Request)
  ipcMain.handle('switchboard:git-status', (_e, cwd: string) => getGitWorkspaceStatus(cwd));
  ipcMain.handle('switchboard:git-diff', (_e, cwd: string, filePath: string) =>
    getFileDiff(cwd, filePath)
  );
  ipcMain.handle(
    'switchboard:git-checkout',
    (_e, cwd: string, branchName: string, createNew?: boolean) =>
      checkoutBranch(cwd, branchName, createNew)
  );
  ipcMain.handle('switchboard:git-discard', (_e, cwd: string, filePath: string) =>
    discardFileChanges(cwd, filePath)
  );
  ipcMain.handle('switchboard:git-commit', (_e, cwd: string, message: string) =>
    stageAndCommitAll(cwd, message)
  );
  ipcMain.handle('switchboard:git-push', async (_e, cwd: string) => {
    const token = await orchestrator.resolveOptionalGitHubToken();
    return pushCurrentBranch(cwd, token);
  });
  ipcMain.handle('switchboard:git-create-pr', async (_e, input: CreatePrInput) => {
    const token = await orchestrator.resolveOptionalGitHubToken();
    if (!token) {
      throw new Error('Connect your GitHub account in GitHub Sync (or sign into `gh`) to create Pull Requests.');
    }
    return createGitHubPullRequest(input, token);
  });

  ipcMain.handle('switchboard:enqueue-task', (_e, input: CreateTaskInput) =>
    orchestrator.enqueueTask(input)
  );
  ipcMain.handle(
    'switchboard:retry-task',
    (_e, taskId: string, opts?: { permissionMode?: CodingPermissionMode }) =>
      orchestrator.retryTask(taskId, opts)
  );
  ipcMain.handle('switchboard:cancel-task', (_e, taskId: string) =>
    orchestrator.cancelTask(taskId)
  );
  ipcMain.handle('switchboard:delete-task', (_e, taskId: string) =>
    orchestrator.deleteTask(taskId)
  );

  ipcMain.handle('switchboard:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Workspace Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('switchboard:pick-files', async (): Promise<TaskAttachment[]> => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile', 'multiSelections'],
      title: 'Attach Images or Files',
      filters: [
        {
          name: 'Images & Documents',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'txt', 'md', 'json', 'ts', 'tsx', 'js', 'py', 'go', 'rs', 'csv', 'log', 'yaml', 'yml', 'html', 'css'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const attachments: TaskAttachment[] = [];
    for (const filePath of result.filePaths) {
      try {
        const stat = fs.statSync(filePath);
        const name = path.basename(filePath);
        const mimeType = guessMimeType(name);
        const isImage = mimeType.startsWith('image/');
        let previewDataUrl: string | undefined;
        if (isImage && stat.size <= 5 * 1024 * 1024) {
          const b64 = fs.readFileSync(filePath).toString('base64');
          previewDataUrl = `data:${mimeType};base64,${b64}`;
        }
        attachments.push({
          id: `att-${crypto.randomUUID().slice(0, 8)}`,
          name,
          path: filePath,
          mimeType,
          size: stat.size,
          isImage,
          previewDataUrl,
        });
      } catch {
        // Skip unreadable file
      }
    }
    return attachments;
  });

  ipcMain.handle(
    'switchboard:save-attachment',
    async (
      _e,
      input: { name: string; mimeType: string; base64Data: string }
    ): Promise<TaskAttachment> => {
      const attachDir = path.join(os.homedir(), '.switchboard', 'attachments');
      fs.mkdirSync(attachDir, { recursive: true });
      const ext = extFromMimeOrName(input.mimeType, input.name);
      const id = `att-${crypto.randomUUID().slice(0, 8)}`;
      const safeBase =
        path
          .basename(input.name || `pasted-image.${ext}`, path.extname(input.name || ''))
          .replace(/[^a-zA-Z0-9-_]+/g, '-')
          .slice(0, 32) || 'attachment';
      const fileName = `${safeBase}-${id.slice(-4)}.${ext}`;
      const fullPath = path.join(attachDir, fileName);

      const buf = Buffer.from(input.base64Data, 'base64');
      fs.writeFileSync(fullPath, buf);

      const isImage = input.mimeType.startsWith('image/');
      return {
        id,
        name: input.name || fileName,
        path: fullPath,
        mimeType: input.mimeType || 'application/octet-stream',
        size: buf.length,
        isImage,
        previewDataUrl:
          isImage && buf.length <= 5 * 1024 * 1024
            ? `data:${input.mimeType};base64,${input.base64Data}`
            : undefined,
      };
    }
  );

  ipcMain.handle('switchboard:open-external', async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });
}

orchestrator.on('event', broadcastEvent);

app.whenReady().then(async () => {
  registerIpcHandlers();
  createWindow();
  await orchestrator.refreshCliHealth();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'json':
      return 'application/json';
    case 'md':
      return 'text/markdown';
    case 'csv':
      return 'text/csv';
    default:
      return 'text/plain';
  }
}

function extFromMimeOrName(mimeType: string, name?: string): string {
  const fromName = name ? path.extname(name).replace(/^\./, '').toLowerCase() : '';
  if (fromName) return fromName;
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'png';
  return 'txt';
}
