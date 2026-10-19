import { Save } from '../core/Save';

/** BGM by 魔王魂 (CC BY 4.0). Scene tracks are fixed; the battle track can be chosen in settings. */
export const SCENE_TRACKS: Record<string, string> = {
  title: 'fantasy13',
  home: 'fantasy14',
  gacha: 'cyber44',
  result: 'cyber40',
  fever: 'neorock33',
};

export const BATTLE_TRACKS: { id: string; name: string }[] = [
  { id: 'fantasy15', name: 'ファンタジー15' },
  { id: 'fantasy12', name: 'ファンタジー12' },
  { id: 'fantasy11', name: 'ファンタジー11' },
  { id: 'cyber06', name: 'サイバー06' },
  { id: 'cyber01', name: 'サイバー01' },
];

export const ALL_TRACKS = [...new Set([...Object.values(SCENE_TRACKS), ...BATTLE_TRACKS.map((t) => t.id)])];

/** 'auto' picks a random battle track each round. */
export function battleTrack(): string {
  const pick = Save.data.settings.battleBgm;
  if (BATTLE_TRACKS.some((t) => t.id === pick)) return pick;
  return BATTLE_TRACKS[Math.floor(Math.random() * BATTLE_TRACKS.length)].id;
}

export function battleTrackLabel(): string {
  return BATTLE_TRACKS.find((t) => t.id === Save.data.settings.battleBgm)?.name ?? 'おまかせ';
}

export function nextBattleTrack(): void {
  const ids = ['auto', ...BATTLE_TRACKS.map((t) => t.id)];
  const i = ids.indexOf(Save.data.settings.battleBgm);
  Save.data.settings.battleBgm = ids[(i + 1) % ids.length];
}
