import { BrowserWindow, Menu, clipboard, dialog, shell } from 'electron';
import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron';
import { isAllowedUrl, searchUrl } from './url';
import type { SearchEngineId } from '../shared/types';

// 確認のうえ OS の既定アプリで開いてよい外部スキーム
const EXTERNAL_SCHEMES = new Set(['mailto:', 'tel:', 'sms:']);

export function openExternal(win: BrowserWindow, url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (!EXTERNAL_SCHEMES.has(protocol)) return;
  const response = dialog.showMessageBoxSync(win, {
    type: 'question',
    buttons: ['開く', 'キャンセル'],
    defaultId: 0,
    cancelId: 1,
    message: '外部アプリケーションで開きますか？',
    detail: url,
  });
  if (response === 0) shell.openExternal(url).catch(() => undefined);
}

export interface ContextMenuActions {
  openInBackground(url: string): void;
  openInForeground(url: string): void;
  openInNewWindow(url: string): void;
  reload(): void;
  viewSource(): void;
  searchEngine(): SearchEngineId;
}

export function showContextMenu(
  win: BrowserWindow,
  wc: WebContents,
  params: ContextMenuParams,
  actions: ContextMenuActions,
): void {
  const items: MenuItemConstructorOptions[] = [];
  const separator: MenuItemConstructorOptions = { type: 'separator' };

  if (params.linkURL && isAllowedUrl(params.linkURL)) {
    const link = params.linkURL;
    items.push(
      { label: 'リンクを新しいタブで開く', click: () => actions.openInBackground(link) },
      { label: 'リンクを新しいウィンドウで開く', click: () => actions.openInNewWindow(link) },
      { label: 'リンクのアドレスをコピー', click: () => clipboard.writeText(link) },
      separator,
    );
  }

  if (params.mediaType === 'image' && params.srcURL) {
    const src = params.srcURL;
    items.push(
      { label: '画像を新しいタブで開く', click: () => actions.openInBackground(src) },
      { label: '名前を付けて画像を保存', click: () => wc.downloadURL(src) },
      { label: '画像をコピー', click: () => wc.copyImageAt(params.x, params.y) },
      { label: '画像のアドレスをコピー', click: () => clipboard.writeText(src) },
      separator,
    );
  }

  const selection = params.selectionText.trim();
  if (params.isEditable) {
    const flags = params.editFlags;
    items.push(
      { label: '元に戻す', enabled: flags.canUndo, click: () => wc.undo() },
      { label: 'やり直す', enabled: flags.canRedo, click: () => wc.redo() },
      separator,
      { label: '切り取り', enabled: flags.canCut, click: () => wc.cut() },
      { label: 'コピー', enabled: flags.canCopy, click: () => wc.copy() },
      { label: '貼り付け', enabled: flags.canPaste, click: () => wc.paste() },
      { label: 'すべて選択', enabled: flags.canSelectAll, click: () => wc.selectAll() },
      separator,
    );
  } else if (selection) {
    const label = selection.length > 20 ? `${selection.slice(0, 20)}…` : selection;
    items.push(
      { label: 'コピー', click: () => wc.copy() },
      { label: `「${label}」を検索`, click: () => actions.openInForeground(searchUrl(selection, actions.searchEngine())) },
      separator,
    );
  }

  if (items.length === 0) {
    items.push(
      { label: '戻る', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: '進む', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: '再読み込み', click: () => actions.reload() },
      separator,
      { label: 'ページのソースを表示', click: () => actions.viewSource() },
      separator,
    );
  }

  items.push({ label: '検証', click: () => wc.inspectElement(params.x, params.y) });
  Menu.buildFromTemplate(items).popup({ window: win, frame: params.frame ?? undefined });
}
