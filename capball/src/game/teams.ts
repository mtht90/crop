import type { ModelName } from '../core/assets';
import { TEAMS, type Player, type PitchSlot, type Pos, type Team } from './data';

/**
 * リーグで戦うチーム。最初の2チームは手作り、残りは強さ（rank 1〜5）から能力を決めて作る。
 * どのチームも、守るときに使うキャップ（capId）が決まっている。
 */
export interface LeagueTeam extends Team {
  rank: number;
  capId: string;
}

interface Spec {
  id: string;
  name: string;
  short: string;
  color: string;
  primary: string;
  accent: string;
  dark: string;
  rank: number;
  capId: string;
  names: string[]; // 1〜5番 + 控え投手
  ace: [PitchSlot, number][];
}

const MODELS: ModelName[] = ['rogue', 'knight', 'barbarian', 'mage', 'knight'];
const POSS: Pos[] = ['IF1', 'IF2', 'DH', 'C', 'P'];

const SPECS: Spec[] = [
  { id: 'matcha', name: '茶畑マッチャーズ', short: 'マッチャ', color: '#3f9a4c', primary: '#f1f5ea', accent: '#2f7a3a', dark: '#1f3b22', rank: 1, capId: 'yamabuki', names: ['茶山 ミドリ', '若葉 イツキ', '緑川 ゴロウ', '玉露 ケン', '抹茶 ハルト', '新芽 トワ'], ace: [['slider', 3], ['curve', 3], ['knuckle', 2]] },
  { id: 'mugi', name: '麦わらバーリーズ', short: 'ムギワラ', color: '#b07a36', primary: '#fbf1dc', accent: '#9a6224', dark: '#3e2914', rank: 1, capId: 'mugi', names: ['麦田 タロウ', '穂波 ユウ', '稲垣 リキ', '香ばし ジン', '大麦 ショウ', '小麦 アオ'], ace: [['curve', 4], ['drop', 2]] },
  { id: 'lemon', name: 'レモネード・ゼスト', short: 'レモン', color: '#e7c11c', primary: '#fffbe2', accent: '#c9a300', dark: '#4a3d00', rank: 2, capId: 'lemon', names: ['柑野 スバル', '酢橘 ミオ', '檸檬 ガイ', '黄瀬 トオル', '果汁 レイ', '皮川 ナツ'], ace: [['slider', 4], ['rise', 4], ['drop', 3]] },
  { id: 'aqua', name: 'アクアランナーズ', short: 'アクア', color: '#1d6fd1', primary: '#eef6ff', accent: '#1554a6', dark: '#0c2a54', rank: 3, capId: 'aqualan', names: ['水野 ハヤテ', '汐見 カイ', '大波 ドウ', '浜辺 シン', '潮田 ルイ', '雫 セナ'], ace: [['slider', 6], ['curve', 5], ['rise', 4]] },
  { id: 'bolt', name: 'ボルト・コーラーズ', short: 'ボルト', color: '#2a2a30', primary: '#2a2a30', accent: '#f2c230', dark: '#111114', rank: 4, capId: 'bolt', names: ['雷堂 キョウ', '黒崎 ジョウ', '轟 ガンテツ', '稲妻 リョウ', '電光 ライ', '黒炭 ヨル'], ace: [['slider', 6], ['rise', 5], ['drop', 6]] },
  { id: 'gorilla', name: 'ゴリラチャージャーズ', short: 'ゴリラ', color: '#5fbf3a', primary: '#e9ecef', accent: '#3f9a24', dark: '#1d2b14', rank: 5, capId: 'gorilla', names: ['剛腕 タイガ', '握力 マサル', '筋金 ドン', '鉄腕 ゴウキ', '豪速 リュウ', '猛打 ケイ'], ace: [['slider', 7], ['curve', 5], ['rise', 6], ['drop', 7]] },
  { id: 'golden', name: 'ゴールデンキャッパーズ', short: 'ゴールド', color: '#e8b923', primary: '#fff8dc', accent: '#c99600', dark: '#3a2c00', rank: 5, capId: 'golden', names: ['金城 ヒカリ', '黄金井 ショウ', '王者 バン', '冠 ミカド', '栄光 アキラ', '輝 ツカサ'], ace: [['slider', 6], ['curve', 6], ['rise', 7], ['drop', 6], ['knuckle', 5]] },
];

function build(sp: Spec): LeagueTeam {
  const r = sp.rank;
  const lv = (base: number, k = 1) => Math.round(Math.min(98, base + (r - 3) * 7 * k));
  const players: Player[] = sp.names.slice(0, 5).map((name, i) => {
    const pos = POSS[i];
    const base: Player = {
      name,
      number: [4, 6, 7, 2, 1][i],
      pos,
      model: MODELS[i],
      bats: i === 1 ? 'L' : 'R',
      meet: lv([76, 70, 56, 60, 40][i]),
      power: lv([44, 60, 90, 60, 36][i]),
      field: lv([74, 76, 30, 70, 62][i]),
      speed: lv([84, 72, 30, 44, 56][i]),
    };
    if (pos === 'P') Object.assign(base, { velo: lv(88, 0.9), control: lv(66), stamina: lv(72), pitches: sp.ace });
    return base;
  });
  const reliever: Player = { name: sp.names[5], number: 11, pos: 'P', model: 'rogue', bats: 'R', meet: 30, power: 28, field: 58, speed: 52, velo: lv(84, 0.9), control: lv(70), stamina: lv(58), pitches: sp.ace.slice(0, 2) };
  return {
    id: sp.id,
    name: sp.name,
    short: sp.short,
    color: sp.color,
    uniform: { key: `${sp.id}-h`, primary: sp.primary, accent: sp.accent, pants: '#f2f2ee', shoes: sp.dark, cap: sp.accent, brim: sp.dark },
    awayUniform: { key: `${sp.id}-a`, primary: sp.color, accent: sp.dark, pants: '#eeeeea', shoes: sp.dark, cap: sp.color, brim: sp.dark },
    players,
    bench: [reliever],
    rank: r,
    capId: sp.capId,
  };
}

export const LEAGUE_TEAMS: LeagueTeam[] = [
  { ...TEAMS[0], rank: 3, capId: 'spark' },
  { ...TEAMS[1], rank: 3, capId: 'kirari' },
  ...SPECS.map(build),
];

export const teamById = (id: string) => LEAGUE_TEAMS.find((t) => t.id === id) ?? LEAGUE_TEAMS[0];

/** チームの強さの目安（打撃・投手の平均） */
export function teamPower(t: Team) {
  const bats = t.players.reduce((a, p) => a + p.meet * 0.5 + p.power * 0.5, 0) / t.players.length;
  const ace = t.players.find((p) => p.pos === 'P')!;
  const pit = ((ace.velo ?? 85) - 60) * 1.2 + (ace.control ?? 60) * 0.5;
  return bats * 0.5 + pit * 0.5;
}
