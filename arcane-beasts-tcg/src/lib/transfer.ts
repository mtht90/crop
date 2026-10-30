// 引き継ぎ: move the whole save to another device.
//   • on the website: the save goes to the server and comes back as an 8-letter
//     code (one hour, one use)
//   • where there is no server (the Artifact): a backup text to copy and paste
import { exportSave, importSave } from '../state/store';
import { onlineSupported, serverUrl } from '../online/client';

export const codeTransferSupported = onlineSupported;

/** the server's http(s) origin, from the WebSocket address the game already uses */
function apiBase() {
  return serverUrl().replace(/^ws/, 'http').replace(/\/ws$/, '');
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiBase()}${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new Error('サーバーにつながりません。通信環境を確認してください');
  }
}

/** upload this device's save; returns the code */
export async function issueCode(): Promise<{ code: string; expires: number }> {
  const res = await call('/api/save-transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: exportSave() });
  const body = (await res.json().catch(() => ({}))) as { code?: string; expires?: number; error?: string };
  if (!res.ok || !body.code) throw new Error(body.error ?? `発行できませんでした（${res.status}）`);
  return { code: body.code, expires: body.expires ?? Date.now() + 3600_000 };
}

/** fetch the save behind a code and make it this device's save */
export async function redeemCode(code: string): Promise<void> {
  const key = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (key.length !== 8) throw new Error('コードは8文字です');
  const res = await call(`/api/save-transfer/${key}`);
  const text = await res.text();
  if (!res.ok) {
    let msg = `引き継げませんでした（${res.status}）`;
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? msg;
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  if (!importSave(text)) throw new Error('受け取ったデータが壊れています');
}

/** "ABCD-EFGH" */
export const prettyCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

// ---- backup text (no server) -------------------------------------------------
const PREFIX = 'AB1:';

/** the save as one line of text: a prefix and base64 of the UTF-8 JSON */
export function backupText(): string {
  const bytes = new TextEncoder().encode(exportSave());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return PREFIX + btoa(bin);
}

export function restoreBackup(text: string): void {
  const t = text.trim();
  if (!t.startsWith(PREFIX)) throw new Error('バックアップの文字列ではありません');
  let json: string;
  try {
    const bin = atob(t.slice(PREFIX.length).replace(/\s+/g, ''));
    json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  } catch {
    throw new Error('文字列が途中で切れているか、壊れています');
  }
  if (!importSave(json)) throw new Error('セーブデータとして読み込めませんでした');
}
