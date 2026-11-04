// A screen that breaks shows a way out instead of a blank page. The last few
// errors are kept on the device (設定 can show them) to help track bugs down.
import { Component, type ReactNode } from 'react';

const LOG_KEY = 'arcane-beasts-errors';

export function logError(where: string, err: unknown) {
  try {
    const e = err instanceof Error ? `${err.name}: ${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(err);
    const list = JSON.parse(localStorage.getItem(LOG_KEY) || '[]') as string[];
    list.unshift(`${new Date().toISOString()} [${where}] ${e}`);
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* storage full or blocked */
  }
}
export const errorLog = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch {
    return [];
  }
};

/** errors outside React (timers, promises) */
export function watchGlobalErrors() {
  window.addEventListener('error', (e) => logError('window', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));
}

interface Props {
  where: string;
  onHome: () => void;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { err: Error | null; tries: number }> {
  state = { err: null as Error | null, tries: 0 };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    logError(this.props.where, err);
  }
  render() {
    const { err, tries } = this.state;
    if (!err) return this.props.children;
    return (
      <div className="screen error-screen">
        <div className="panel error-panel">
          <h2>問題が発生しました</h2>
          <p>画面の表示中にエラーが起きました。データは保存されています。</p>
          <div className="error-actions">
            {tries < 2 && (
              <button className="btn" onClick={() => this.setState({ err: null, tries: tries + 1 })}>
                もう一度表示する
              </button>
            )}
            <button
              className="btn primary"
              onClick={() => {
                this.setState({ err: null, tries: 0 });
                this.props.onHome();
              }}
            >
              ホームにもどる
            </button>
          </div>
          <code className="error-detail">{err.message}</code>
        </div>
      </div>
    );
  }
}
