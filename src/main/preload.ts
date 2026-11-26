import { contextBridge, ipcRenderer } from 'electron';
import { SwitchboardApi } from '../shared/ipc';
import { TaskStreamEvent } from '../shared/types';

const api: SwitchboardApi = {
  getPlatform: () => process.platform,
  getState: () => ipcRenderer.invoke('switchboard:get-state'),
  refreshCliHealth: () => ipcRenderer.invoke('switchboard:refresh-cli-health'),
  refreshUsage: () => ipcRenderer.invoke('switchboard:refresh-usage'),
  addAccount: (input) => ipcRenderer.invoke('switchboard:add-account', input),
  updateAccount: (id, patch) => ipcRenderer.invoke('switchboard:update-account', id, patch),
  deleteAccount: (id) => ipcRenderer.invoke('switchboard:delete-account', id),
  clearCooldown: (id) => ipcRenderer.invoke('switchboard:clear-cooldown', id),
  testAccount: (id) => ipcRenderer.invoke('switchboard:test-account', id),
  launchCliLogin: (id) => ipcRenderer.invoke('switchboard:launch-cli-login', id),
  updateRoutingRule: (category, patch) =>
    ipcRenderer.invoke('switchboard:update-routing-rule', category, patch),
  updateSettings: (patch) => ipcRenderer.invoke('switchboard:update-settings', patch),
  createProject: (input) => ipcRenderer.invoke('switchboard:create-project', input),
  importProject: (input) => ipcRenderer.invoke('switchboard:import-project', input),
  pushProjectToGitHub: (projectId, isPrivate) =>
    ipcRenderer.invoke('switchboard:push-project-github', projectId, isPrivate),
  deleteProject: (projectId) => ipcRenderer.invoke('switchboard:delete-project', projectId),
  createThread: (projectId, title) =>
    ipcRenderer.invoke('switchboard:create-thread', projectId, title),
  deleteThread: (threadId) => ipcRenderer.invoke('switchboard:delete-thread', threadId),
  connectGitHub: (opts) => ipcRenderer.invoke('switchboard:connect-github', opts),
  disconnectGitHub: () => ipcRenderer.invoke('switchboard:disconnect-github'),
  updateSyncSettings: (patch) => ipcRenderer.invoke('switchboard:update-sync-settings', patch),
  pushSyncNow: (passphrase) => ipcRenderer.invoke('switchboard:push-sync-now', passphrase),
  pullSyncNow: (passphrase) => ipcRenderer.invoke('switchboard:pull-sync-now', passphrase),
  enqueueTask: (input) => ipcRenderer.invoke('switchboard:enqueue-task', input),
  retryTask: (taskId) => ipcRenderer.invoke('switchboard:retry-task', taskId),
  cancelTask: (taskId) => ipcRenderer.invoke('switchboard:cancel-task', taskId),
  deleteTask: (taskId) => ipcRenderer.invoke('switchboard:delete-task', taskId),
  pickFolder: () => ipcRenderer.invoke('switchboard:pick-folder'),
  openExternal: (url) => ipcRenderer.invoke('switchboard:open-external', url),
  onEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: TaskStreamEvent) => {
      listener(payload);
    };
    ipcRenderer.on('switchboard:event', wrapped);
    return () => {
      ipcRenderer.removeListener('switchboard:event', wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('switchboard', api);
