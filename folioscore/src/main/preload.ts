import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openFile: (): Promise<{ path: string; content: string } | null> => ipcRenderer.invoke('file:open'),
  saveFile: (path: string | null, content: string, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save', { path, content, defaultName }),
  exportFile: (kind: 'musicxml' | 'mid' | 'wav', data: string | Uint8Array, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('file:export', { kind, data, defaultName }),
  exportPdf: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('file:exportPdf', { defaultName }),
  readResource: (name: 'soundfont' | 'processor'): Promise<Uint8Array | string> => ipcRenderer.invoke('resource:read', name),
  info: (): Promise<{ version: string; test: boolean }> => ipcRenderer.invoke('app:info'),
  onMenu: (cb: (command: string) => void) => ipcRenderer.on('menu', (_e, c: string) => cb(c)),
  onOpenFile: (cb: (f: { path: string; content: string }) => void) => ipcRenderer.on('file:opened', (_e, f) => cb(f)),
  setDirty: (d: boolean) => ipcRenderer.send('state:dirty', d),
  setTitle: (t: string) => ipcRenderer.send('state:title', t),
  closeNow: () => ipcRenderer.send('app:closeNow'),
  e2eScreenshot: (name: string): Promise<string | null> => ipcRenderer.invoke('e2e:screenshot', name),
  e2eDone: (code: number) => ipcRenderer.send('e2e:done', code),
};

export type FolioApi = typeof api;
contextBridge.exposeInMainWorld('folio', api);
