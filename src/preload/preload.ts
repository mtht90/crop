import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi } from '../shared/types';

function listen<T>(channel: string, callback: (payload: T) => void): void {
  ipcRenderer.on(channel, (_e, payload: T) => callback(payload));
}

const api: BrowserApi = {
  newTab: (url) => ipcRenderer.send('tab:new', url),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  activateTab: (id) => ipcRenderer.send('tab:activate', id),
  moveTab: (id, toIndex) => ipcRenderer.send('tab:move', id, toIndex),
  toggleMute: (id) => ipcRenderer.send('tab:mute', id),

  navigate: (input) => ipcRenderer.send('nav:go', input),
  goBack: () => ipcRenderer.send('nav:back'),
  goForward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  stop: () => ipcRenderer.send('nav:stop'),
  goHome: () => ipcRenderer.send('nav:home'),
  zoom: (direction) => ipcRenderer.send('nav:zoom', direction),

  find: (text, forward, findNext) => ipcRenderer.send('find:start', text, forward, findNext),
  stopFind: () => ipcRenderer.send('find:stop'),

  setLayout: (top, right) => ipcRenderer.send('layout', top, right),

  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  toggleBookmark: (url, title) => ipcRenderer.invoke('bookmarks:toggle', url, title),
  removeBookmark: (id) => ipcRenderer.invoke('bookmarks:remove', id),

  getHistory: (query) => ipcRenderer.invoke('history:get', query),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  getDownloads: () => ipcRenderer.invoke('downloads:get'),
  openDownload: (id) => void ipcRenderer.invoke('downloads:open', id),
  showDownloadInFolder: (id) => void ipcRenderer.invoke('downloads:show', id),
  cancelDownload: (id) => void ipcRenderer.invoke('downloads:cancel', id),

  onState: (cb) => listen('state', cb),
  onCommand: (cb) => listen('command', cb),
  onFindResult: (cb) => listen('find:result', cb),
  onBookmarksChanged: (cb) => listen('bookmarks', cb),
  onSettingsChanged: (cb) => listen('settings', cb),
  onDownloadsChanged: (cb) => listen('downloads', cb),
};

contextBridge.exposeInMainWorld('browser', api);
