import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { sfx } from '../audio/audio';

interface ConfirmState {
  msg: string | null;
  ok: string;
  danger: boolean;
  resolve: ((v: boolean) => void) | null;
}

const useConfirm = create<ConfirmState>(() => ({ msg: null, ok: 'OK', danger: false, resolve: null }));

/** In-page replacement for window.confirm (which artifact viewers block). */
export function askConfirm(msg: string, ok = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirm.getState().resolve?.(false);
    useConfirm.setState({ msg, ok, danger, resolve });
  });
}

export function ConfirmDialog() {
  const { msg, ok, danger, resolve } = useConfirm();
  const close = (v: boolean) => {
    sfx(v ? 'button' : 'contract', 0.5);
    resolve?.(v);
    useConfirm.setState({ msg: null, resolve: null });
  };
  return (
    <AnimatePresence>
      {msg && (
        <motion.div key="confirm" className="confirm-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => close(false)}>
          <motion.div className="panel confirm-box" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}>
            <p>{msg}</p>
            <div className="confirm-actions">
              <button className="btn ghost" onClick={() => close(false)}>
                キャンセル
              </button>
              <button className={`btn ${danger ? 'red' : ''}`} autoFocus onClick={() => close(true)}>
                {ok}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
