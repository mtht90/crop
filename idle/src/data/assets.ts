// Which external asset is used for what. Read by scripts/build-assets.mjs (to convert the files in
// assets-src/ into public/gen/) and by the game (to know names, frame counts, layout hints).
// Every visual in the game is one of these images — nothing is drawn with CSS/canvas shapes.

// ---------- field backgrounds (CraftPix free battle backgrounds) ----------
export interface BgSpec {
  src: string; // path under assets-src/
  ground: number; // where the walkable ground starts (fraction of image height)
  hue?: number;
  sat?: number;
  light?: number;
}
export const BGS: BgSpec[] = [
  { src: 'craftpix/forest-bg/PNG/game_background_4/game_background_4.png', ground: 0.3 },
  { src: 'craftpix/forest-bg/PNG/game_background_2/game_background_2.png', ground: 0.3 },
  { src: 'craftpix/elven-bg/PNG/game_background_4/game_background_4.png', ground: 0.4 },
  { src: 'craftpix/elven-bg/PNG/game_background_1/game_background_1.png', ground: 0.34, hue: -14, sat: 1.25 },
  { src: 'craftpix/elven-bg/PNG/game_background_3/game_background_3.png', ground: 0.4 },
  { src: 'craftpix/forest-bg/PNG/game_background_3/game_background_3.png', ground: 0.32, hue: 160, sat: 0.55, light: 1.2 },
  { src: 'craftpix/forest-bg/PNG/game_background_1/game_background_1.png', ground: 0.3 },
  { src: 'craftpix/elven-bg/PNG/game_background_2/game_background_2.png', ground: 0.42 },
  { src: 'craftpix/vampire-bg/PNG/4/dead forest.png', ground: 0.42 },
  { src: 'craftpix/vampire-bg/PNG/3/castle.png', ground: 0.42 },
  { src: 'craftpix/vampire-bg/PNG/1/terrace.png', ground: 0.42 },
  { src: 'craftpix/vampire-bg/PNG/2/throne room.png', ground: 0.44 },
];

// ---------- animated effects (CraftPix free VFX packs) → horizontal sprite sheets ----------
export interface FxSpec {
  dir: string; // folder under assets-src/ holding numbered frames
  cell: [number, number];
  hue?: number;
  sat?: number;
  light?: number;
  take?: number; // use only the first N frames
}
const SL = 'craftpix/slash-fx/';
const EX = 'craftpix/explosion-fx/PNG/';
const SP = 'craftpix/spell-fx/';
const SM = 'craftpix/smoke-fx/';
export const FX: Record<string, FxSpec> = {
  slash_fire: { dir: SL + 'Fire Slash/PNG', cell: [256, 192] },
  slash_water: { dir: SL + 'Water Slash/PNG', cell: [256, 192] },
  slash_wind: { dir: SL + 'Double Wind Slashes/PNG', cell: [256, 192] },
  slash_light: { dir: SL + 'Ultimate Slash/PNG', cell: [256, 192] },
  slash_earth: { dir: SL + 'Ultimate Slash/PNG', cell: [256, 192], hue: -18, sat: 0.75, light: 0.85 },
  slash_dark: { dir: SL + 'Poisonous Slashes/PNG', cell: [256, 192] },
  lightning: { dir: SL + 'Lightning Slash/PNG', cell: [256, 192] },
  hit: { dir: EX + 'Explosion_2', cell: [160, 160], take: 6 },
  crit: { dir: EX + 'Explosion_1', cell: [192, 192], take: 7 },
  blast: { dir: EX + 'Explosion_3', cell: [224, 224], take: 7 },
  frost: { dir: EX + 'Explosion_5', cell: [192, 192] },
  dome: { dir: EX + 'Explosion_6', cell: [192, 192] },
  spark: { dir: EX + 'Explosion_8', cell: [192, 192] },
  heal: { dir: EX + 'Explosion_10', cell: [192, 192] },
  nova_wind: { dir: EX + 'Explosion_9', cell: [224, 224] },
  nova_fire: { dir: EX + 'Explosion_9', cell: [224, 224], hue: -110, sat: 1.3 },
  nova_water: { dir: EX + 'Explosion_9', cell: [224, 224], hue: 75 },
  nova_earth: { dir: EX + 'Explosion_9', cell: [224, 224], hue: -85, sat: 0.7, light: 0.85 },
  nova_light: { dir: EX + 'Explosion_9', cell: [224, 224], hue: -70, light: 1.15 },
  nova_dark: { dir: EX + 'Explosion_9', cell: [224, 224], hue: 150 },
  smoke: { dir: SM + 'Smoke/PNG', cell: [128, 128] },
  puff: { dir: SM + 'Smoke Explosion/PNG', cell: [160, 160] },
  ring: { dir: SM + 'Poisonous Smoke/PNG', cell: [224, 168], hue: 70, sat: 1.3 },
  spell_fire: { dir: SP + 'Fire Spell/PNG', cell: [160, 90] },
  spell_water: { dir: SP + 'Water Spell/PNG', cell: [160, 90] },
  spell_wind: { dir: SP + 'Water Spell/PNG', cell: [160, 90], hue: -70 },
  spell_light: { dir: SP + 'Fire Spell/PNG', cell: [160, 90], hue: 25, light: 1.15 },
  spell_earth: { dir: SP + 'Fire Spell/PNG', cell: [160, 90], hue: 5, sat: 0.6, light: 0.85 },
  spell_dark: { dir: SP + 'Water Spell/PNG', cell: [160, 90], hue: 90 },
  arrow_fire: { dir: SP + 'Fire Arrow/PNG', cell: [150, 80] },
  arrow_water: { dir: SP + 'Water Arrow/PNG', cell: [150, 112] },
  arrow_wind: { dir: SP + 'Water Arrow/PNG', cell: [150, 112], hue: -70 },
  arrow_light: { dir: SP + 'Fire Arrow/PNG', cell: [150, 80], hue: 25, light: 1.15 },
  arrow_earth: { dir: SP + 'Fire Arrow/PNG', cell: [150, 80], hue: 5, sat: 0.6, light: 0.85 },
  arrow_dark: { dir: SP + 'Water Arrow/PNG', cell: [150, 112], hue: 90 },
  bubble: { dir: SP + 'Water Ball/PNG', cell: [160, 160] },
  coin: { dir: 'craftpix/coins/PNG/Gold', cell: [48, 48], take: 10 },
};

// ---------- items (CraftPix crystals & coins) ----------
export interface ItemSpec {
  src: string;
  size: number;
  hue?: number;
  sat?: number;
  light?: number;
}
const CR = 'craftpix/crystals/PNG/simple/';
const RV = 'ravenmore/icon-pack/128/';
export const ITEMS: Record<string, ItemSpec> = {
  el_fire: { src: CR + '1.png', size: 72 },
  el_water: { src: CR + '3.png', size: 72 },
  el_wind: { src: CR + '7.png', size: 72 },
  el_earth: { src: CR + '15.png', size: 72 },
  el_light: { src: CR + '11.png', size: 72 },
  el_dark: { src: CR + '13.png', size: 72 },
  star: { src: CR + '11.png', size: 48 },
  gem: { src: RV + 'gemBlue.png', size: 96 },
  soul: { src: RV + 'gemRed.png', size: 96 },
  coin: { src: RV + 'coin.png', size: 96 },
  orb: { src: SP + 'Water Ball/PNG/Water Ball_Frame_01.png', size: 96, hue: 95, sat: 1.2 },
};

// ---------- painted icons (Ravenmore) — override glyphs of the same name ----------
// 'p:<name>' = Fantasy Icon Pack (OpenGameArt), 'w:<n>' = Fantasy Weapon & Armor icons (itch.io)
export const PAINTED: Record<string, string> = {
  train: 'p:hammer',
  gear: 'p:upg_shield',
  gacha: 'p:gemBlue',
  more: 'p:tome',
  chest: 'p:backpack',
  scroll: 'p:scroll',
  power: 'p:upg_sword',
  heart: 'p:heart',
  crit: 'p:dagger',
  critDmg: 'p:upg_axeDouble',
  atk: 'p:sword',
  book: 'p:tome',
  blade: 'p:sword',
  archer: 'p:bow',
  mage: 'p:wand',
  guard: 'p:shield',
  map: 'p:map',
  envelope: 'p:envelope',
  potion: 'p:potionRed',
};
export function paintedSrc(key: string) {
  const [k, v] = key.split(':');
  return k === 'p' ? `ravenmore/icon-pack/128/${v}.png` : `ravenmore/weapons-armor/128px_free/icon_${v}.png`;
}

// ---------- glyph icons (game-icons.net, recolored + outlined) ----------
export const GLYPHS: Record<string, string> = {
  // equipment shapes
  sword: 'lorc/broadsword.svg',
  dagger: 'lorc/plain-dagger.svg',
  axe: 'lorc/battle-axe.svg',
  spear: 'lorc/barbed-spear.svg',
  bow: 'lorc/pocket-bow.svg',
  staff: 'lorc/wizard-staff.svg',
  armor: 'lorc/breastplate.svg',
  robe: 'lorc/robe.svg',
  shield: 'lorc/checked-shield.svg',
  helm: 'lorc/visored-helm.svg',
  ring: 'delapouite/ring.svg',
  amulet: 'lorc/gem-pendant.svg',
  feather: 'lorc/feather.svg',
  gem: 'lorc/cut-diamond.svg',
  // skill kinds
  strike: 'lorc/punch-blast.svg',
  nova: 'lorc/sunbeams.svg',
  bolt: 'lorc/lightning-helix.svg',
  heal: 'zeromancer/heart-plus.svg',
  buff: 'delapouite/upgrade.svg',
  barrier: 'lorc/magic-shield.svg',
  freeze: 'lorc/snowflake-1.svg',
  drain: 'delapouite/vampire-dracula.svg',
  meteor: 'lorc/meteor-impact.svg',
  // tabs & misc
  train: 'delapouite/weight-lifting-up.svg',
  chars: 'lorc/paw.svg',
  gear: 'lorc/battle-gear.svg',
  guardian: 'lorc/ghost.svg',
  gacha: 'lorc/crystal-ball.svg',
  more: 'lorc/scroll-unfurled.svg',
  chest: 'skoll/open-treasure-chest.svg',
  scroll: 'lorc/scroll-unfurled.svg',
  speed: 'delapouite/fast-forward-button.svg',
  power: 'lorc/crossed-swords.svg',
  heart: 'skoll/hearts.svg',
  crit: 'lorc/on-target.svg',
  critDmg: 'lorc/explosion-rays.svg',
  lock: 'lorc/padlock.svg',
  cycle: 'lorc/cycle.svg',
  book: 'lorc/open-book.svg',
  settings: 'lorc/cog.svg',
  clock: 'skoll/stopwatch.svg',
  skull: 'sbed/death-skull.svg',
  portal: 'lorc/magic-portal.svg',
  // roles
  blade: 'lorc/broadsword.svg',
  archer: 'lorc/pocket-bow.svg',
  mage: 'lorc/wizard-staff.svg',
  guard: 'lorc/checked-shield.svg',
};
export const ICON_CREAM = '#f3e3c3';
export const ICON_OUTLINE = [32, 24, 20];
export const ELEMENT_COLOR: Record<string, string> = { fire: '#ff8a5c', water: '#6cc3ff', wind: '#7fe08f', earth: '#e0b060', light: '#ffe066', dark: '#c49bff' };

// ---------- sounds (Kenney CC0) & music (OpenGameArt CC0) ----------
export const SFX: Record<string, string[]> = {
  hit: ['kenney/impact-sounds/Audio/impactPunch_medium_000.ogg', 'kenney/impact-sounds/Audio/impactPunch_medium_001.ogg', 'kenney/impact-sounds/Audio/impactPunch_medium_002.ogg'],
  crit: ['kenney/impact-sounds/Audio/impactPunch_heavy_000.ogg', 'kenney/impact-sounds/Audio/impactPunch_heavy_001.ogg'],
  shoot: ['kenney/rpg-audio/Audio/knifeSlice.ogg', 'kenney/rpg-audio/Audio/knifeSlice2.ogg'],
  coin: ['kenney/rpg-audio/Audio/handleCoins.ogg', 'kenney/rpg-audio/Audio/handleCoins2.ogg'],
  kill: ['kenney/impact-sounds/Audio/impactSoft_medium_000.ogg', 'kenney/impact-sounds/Audio/impactSoft_medium_001.ogg'],
  skill: ['kenney/interface-sounds/Audio/maximize_006.ogg'],
  boom: ['kenney/impact-sounds/Audio/impactPlank_medium_000.ogg', 'kenney/impact-sounds/Audio/impactWood_heavy_000.ogg'],
  heal: ['kenney/interface-sounds/Audio/confirmation_002.ogg'],
  hurt: ['kenney/impact-sounds/Audio/impactSoft_heavy_000.ogg', 'kenney/impact-sounds/Audio/impactSoft_heavy_001.ogg'],
  bossIntro: ['kenney/music-jingles/Audio/Hit jingles/jingles_HIT10.ogg'],
  win: ['kenney/music-jingles/Audio/Pizzicato jingles/jingles_PIZZI00.ogg'],
  lose: ['kenney/music-jingles/Audio/Pizzicato jingles/jingles_PIZZI07.ogg'],
  click: ['kenney/interface-sounds/Audio/click_002.ogg'],
  levelUp: ['kenney/interface-sounds/Audio/select_003.ogg'],
  orb: ['kenney/interface-sounds/Audio/glass_002.ogg'],
  pull: ['kenney/interface-sounds/Audio/maximize_008.ogg'],
  pullRare: ['kenney/music-jingles/Audio/Pizzicato jingles/jingles_PIZZI10.ogg'],
};
export const MUSIC: Record<string, string> = {
  field: 'music/fairy_adventure.ogg',
  boss: 'music/battle_theme_a.mp3',
};
