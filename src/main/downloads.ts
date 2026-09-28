import { app, shell } from 'electron';
import type { DownloadItem, Session } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DownloadInfo } from '../shared/types';

/** 同名ファイルがあれば "name (1).ext" のように番号を付ける */
function uniquePath(dir: string, filename: string): string {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_') || 'download';
  const ext = path.extname(safeName);
  const base = safeName.slice(0, safeName.length - ext.length);
  let candidate = path.join(dir, safeName);
  for (let i = 1; fs.existsSync(candidate); i++) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

export class DownloadManager {
  private readonly entries = new Map<string, { info: DownloadInfo; item: DownloadItem }>();
  private notifyTimer: NodeJS.Timeout | null = null;

  constructor(private readonly onChange: (downloads: DownloadInfo[]) => void) {}

  attach(session: Session): void {
    session.on('will-download', (_e, item) => {
      const id = randomUUID();
      const savePath = uniquePath(app.getPath('downloads'), item.getFilename());
      item.setSavePath(savePath);

      const info: DownloadInfo = {
        id,
        filename: path.basename(savePath),
        state: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        savePath,
      };
      this.entries.set(id, { info, item });

      item.on('updated', (_ev, state) => {
        info.state = state === 'interrupted' ? 'interrupted' : 'progressing';
        info.receivedBytes = item.getReceivedBytes();
        info.totalBytes = item.getTotalBytes();
        this.notify();
      });
      item.once('done', (_ev, state) => {
        info.state = state;
        info.receivedBytes = item.getReceivedBytes();
        this.notify(true);
      });
      this.notify(true);
    });
  }

  list(): DownloadInfo[] {
    return [...this.entries.values()].map((e) => ({ ...e.info })).reverse();
  }

  open(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.info.state === 'completed') shell.openPath(entry.info.savePath).catch(() => undefined);
  }

  showInFolder(id: string): void {
    const entry = this.entries.get(id);
    if (entry && fs.existsSync(entry.info.savePath)) shell.showItemInFolder(entry.info.savePath);
  }

  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.info.state === 'progressing') entry.item.cancel();
  }

  /** 進捗イベントは頻繁に来るので間引いて通知する */
  private notify(immediate = false): void {
    if (immediate) {
      if (this.notifyTimer) clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
      this.onChange(this.list());
      return;
    }
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.onChange(this.list());
    }, 250);
  }
}
