import type { WebContents } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { dominantColor } from './color';
import { pageKey } from './frecency';

const THUMB_WIDTH = 720;
const SNAPSHOT_MAX_WIDTH = 1600;
const MAX_FILES = 400;

export interface Capture {
  /** プレビュー用の縮小 JPEG */
  thumb: Buffer;
  /** 画面全体の JPEG (オーバービューへの移行アニメーション用) */
  snapshot: Buffer | null;
  /** スクリーンショットから求めた代表色 */
  color: string | null;
}

/**
 * 表示中のタブを撮影する。
 * 画面に表示されていない WebContentsView は撮影できない (失敗する) ので、
 * 呼び出し側はアクティブなタブに対してのみ使うこと。
 */
export async function capture(wc: WebContents, withSnapshot: boolean): Promise<Capture | null> {
  if (wc.isDestroyed()) return null;
  let image: Electron.NativeImage;
  try {
    image = await wc.capturePage();
  } catch {
    return null;
  }
  if (image.isEmpty()) return null;
  const size = image.getSize();

  const small = image.resize({ width: 48 });
  const smallSize = small.getSize();
  const color = dominantColor(small.toBitmap(), smallSize.width, smallSize.height);

  const thumb = image.resize({ width: Math.min(THUMB_WIDTH, size.width), quality: 'good' }).toJPEG(80);
  const snapshot = withSnapshot
    ? (size.width > SNAPSHOT_MAX_WIDTH ? image.resize({ width: SNAPSHOT_MAX_WIDTH, quality: 'good' }) : image).toJPEG(88)
    : null;
  return { thumb, snapshot, color };
}

/** プレビュー画像をページごとにディスクへ保存し、再起動後も使えるようにする */
export class ThumbnailDisk {
  private readonly dir: string;

  constructor(userData: string) {
    this.dir = path.join(userData, 'thumbs');
    fs.mkdirSync(this.dir, { recursive: true });
    this.prune();
  }

  private fileFor(url: string): string | null {
    const key = pageKey(url);
    if (!key) return null;
    return path.join(this.dir, `${createHash('sha1').update(key).digest('hex')}.jpg`);
  }

  save(url: string, jpeg: Buffer): void {
    const file = this.fileFor(url);
    if (file) fs.promises.writeFile(file, jpeg).catch(() => undefined);
  }

  load(url: string): Buffer | null {
    const file = this.fileFor(url);
    if (!file) return null;
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  }

  /** 古いものから削除して件数を抑える */
  private prune(): void {
    try {
      const files = fs
        .readdirSync(this.dir)
        .map((name) => ({ name, mtime: fs.statSync(path.join(this.dir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const f of files.slice(MAX_FILES)) fs.unlinkSync(path.join(this.dir, f.name));
    } catch {
      // 無視
    }
  }
}
