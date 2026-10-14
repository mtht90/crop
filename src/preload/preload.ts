import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi } from '../shared/types';

function listen<T>(channel: string, callback: (payload: T) => void): void {
  ipcRenderer.on(channel, (_e, payload: T) => callback(payload));
}

const api: BrowserApi = {
  newTab: (input) => ipcRenderer.send('tab:new', input),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  activateTab: (id) => ipcRenderer.send('tab:activate', id),
  moveTab: (id, toIndex) => ipcRenderer.send('tab:move', id, toIndex),
  toggleMute: (id) => ipcRenderer.send('tab:mute', id),
  togglePin: (id) => ipcRenderer.send('tab:pin', id),

  openOverview: (launcher) => ipcRenderer.send('overview:open', launcher),
  overviewReady: () => ipcRenderer.send('overview:ready'),
  closeOverview: (tabId) => ipcRenderer.send('overview:close', tabId),

  navigate: (input) => ipcRenderer.send('nav:go', input),
  goBack: () => ipcRenderer.send('nav:back'),
  goForward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  stop: () => ipcRenderer.send('nav:stop'),
  zoom: (direction) => ipcRenderer.send('nav:zoom', direction),

  find: (text, forward, findNext) => ipcRenderer.send('find:start', text, forward, findNext),
  stopFind: () => ipcRenderer.send('find:stop'),

  setLayout: (top, right) => ipcRenderer.send('layout', top, right),

  searchHistory: (query) => ipcRenderer.invoke('history:search', query),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  getDownloads: () => ipcRenderer.invoke('downloads:get'),
  openDownload: (id) => void ipcRenderer.invoke('downloads:open', id),
  showDownloadInFolder: (id) => void ipcRenderer.invoke('downloads:show', id),
  cancelDownload: (id) => void ipcRenderer.invoke('downloads:cancel', id),

  onState: (cb) => listen('state', cb),
  onThumb: (cb) => listen('thumb', cb),
  onOverviewEnter: (cb) => listen('overview:enter', cb),
  onCommand: (cb) => listen('command', cb),
  onFindResult: (cb) => listen('find:result', cb),
  onSettingsChanged: (cb) => listen('settings', cb),
  onDownloadsChanged: (cb) => listen('downloads', cb),
};

contextBridge.exposeInMainWorld('browser', api);
