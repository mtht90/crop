import type { Vec } from './math';
import type { MatchSetup } from './session';
import type { AcceptedCommand, DeployCommand, EndReason, RejectReason } from './sim';

/**
 * オンライン対戦の通信内容（WebSocket で JSON を送る）。
 * サーバーがホストとしてシミュレーションを持ち、受理したコマンドを tick ごとに全員へ配る。
 * クライアントは同じシミュレーションを同じ順序で進める（ロックステップ）。
 */
export type ClientMessage =
  | { t: 'queue'; name: string; deck: string[] }
  | { t: 'cancel' }
  | { t: 'cmd'; cardId: string; pos: Vec; issueTick: number }
  | { t: 'resume'; token: string }
  | { t: 'ping'; at: number };

export type ServerMessage =
  | { t: 'queued' }
  | { t: 'start'; setup: MatchSetup; you: number; token: string }
  /** tick の処理を終えた。cmds はその tick の最初に受理されたコマンド（クライアントも同じ順で tryAccept する） */
  | { t: 'frame'; tick: number; cmds: DeployCommand[] }
  | { t: 'hash'; tick: number; hash: string }
  | { t: 'reject'; cmd: DeployCommand; reason: RejectReason }
  | { t: 'opponentDisconnected'; graceSeconds: number }
  | { t: 'opponentReconnected' }
  /** 再接続：これまでに受理されたコマンドと、現在の tick */
  | { t: 'resumeState'; setup: MatchSetup; you: number; log: AcceptedCommand[]; tick: number }
  | { t: 'end'; winner: number; reason: EndReason }
  | { t: 'error'; message: string }
  | { t: 'pong'; at: number };

/** 切断してから負けになるまでの秒数 */
export const RECONNECT_GRACE_SECONDS = 10;
/** 相手が見つからないとき BOT 戦に切り替えるまでの秒数 */
export const MATCHMAKING_TIMEOUT_SECONDS = 10;
