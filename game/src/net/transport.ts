import type { NetMessage } from './protocol';

/**
 * A bidirectional message pipe to the other player. The game only talks to
 * this interface; swapping the bot for a real network peer (WebRTC data
 * channel, WebSocket relay) means writing another class like `BotTransport`.
 */
export interface Transport {
  send(msg: NetMessage): void;
  onMessage(handler: (msg: NetMessage) => void): void;
  /** Called by the game once per simulation tick (lets simulated peers act). */
  tick?(frame: number): void;
  close(): void;
}
