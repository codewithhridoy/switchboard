import { contextBridge, ipcRenderer } from 'electron';
import { SwitchboardApi } from '../shared/ipc';
import { TaskStreamEvent } from '../shared/types';

const api: SwitchboardApi = {
  getPlatform: () => process.platform,
  getState: () => ipcRenderer.invoke('switchboard:get-state'),
  refreshCliHealth: () => ipcRenderer.invoke('switchboard:refresh-cli-health'),
  addAccount: (input) => ipcRenderer.invoke('switchboard:add-account', input),
  updateAccount: (id, patch) => ipcRenderer.invoke('switchboard:update-account', id, patch),
  deleteAccount: (id) => ipcRenderer.invoke('switchboard:delete-account', id),
  clearCooldown: (id) => ipcRenderer.invoke('switchboard:clear-cooldown', id),
  testAccount: (id) => ipcRenderer.invoke('switchboard:test-account', id),
  launchCliLogin: (id) => ipcRenderer.invoke('switchboard:launch-cli-login', id),
  updateRoutingRule: (category, patch) =>
    ipcRenderer.invoke('switchboard:update-routing-rule', category, patch),
  updateSettings: (patch) => ipcRenderer.invoke('switchboard:update-settings', patch),
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
