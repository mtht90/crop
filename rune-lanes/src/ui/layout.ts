/** バトル画面のレイアウト（論理解像度 720×1280） */
export const TILE = 32;
export const ARENA_X = 72;
export const ARENA_Y = 22;
export const ARENA_PX_W = 18 * TILE;
export const ARENA_PX_H = 32 * TILE;
export const HUD_Y = ARENA_Y + ARENA_PX_H; // 1046

export const MANA_Y = HUD_Y + 22;
export const CARD_W = 86;
export const CARD_H = 126;
export const CARD_Y = HUD_Y + 40 + CARD_H / 2 + 6;
export const SLOT_X0 = 130;
export const SLOT_DX = 92;
export const DRAW_PILE_X = 40;
export const DISCARD_X = 680;

export function slotX(i: number): number {
  return SLOT_X0 + i * SLOT_DX;
}

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: ARENA_X + x * TILE, y: ARENA_Y + y * TILE };
}

export function toWorld(sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - ARENA_X) / TILE, y: (sy - ARENA_Y) / TILE };
}

export function isOverArena(sx: number, sy: number): boolean {
  return sx >= ARENA_X && sx <= ARENA_X + ARENA_PX_W && sy >= ARENA_Y && sy <= HUD_Y;
}
