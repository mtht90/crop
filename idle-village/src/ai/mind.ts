// 村の心:村人の判断・会話・名付け・建物の発案・習わしを、APIのAIにまとめて考えてもらう。
// エンジンが決めているのは本能と体の動きだけ。ここで受け取った考えを、範囲チェックしてから反映する。
import { ACTION_INFO, BUILDINGS, BUILDING_ORDER, ROLE_INFO } from '../sim/config';
import type { Sim } from '../sim/sim';
import type { Action, BuildingKind, BuildingRole, Villager } from '../sim/types';
import { clamp } from '../sim/util';

export interface MindSettings {
  enabled: boolean;
  preset: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  interval: number; // 秒
}

export const PRESETS: Record<string, { label: string; kind: 'gemini' | 'openai'; baseUrl: string; model: string; keyUrl: string; note: string }> = {
  gemini: {
    label: 'Google Gemini(おすすめ・無料枠あり)',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-flash-lite-latest',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Google AI Studio で「APIキーを作成」を押すと、無料で使えるキーがもらえます。',
  },
  groq: {
    label: 'Groq(無料枠あり)',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Groq のコンソールで無料のAPIキーを作れます。',
  },
  openrouter: {
    label: 'OpenRouter(:free モデルは無料)',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'モデル名の末尾が :free のものは無料で使えます(1日の回数に上限あり)。',
  },
  custom: { label: 'その他(OpenAI互換API)', kind: 'openai', baseUrl: '', model: '', keyUrl: '', note: 'OpenAI互換の /chat/completions に対応したAPIのURLを入れてください。' },
};

const ACTIONS = Object.keys(ACTION_INFO) as Action[];
const ROLES = Object.keys(ROLE_INFO) as BuildingRole[];
const LOOKS = ['pawn', 'warrior', 'archer', 'monk'] as const;

export interface MindLog {
  at: number; // 実時間
  ok: boolean;
  ms: number;
  note: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export class VillageMind {
  settings: MindSettings;
  busy = false;
  status = '';
  logs: MindLog[] = [];
  private lastCall = 0;
  private backoffUntil = 0;
  private callCount = 0;
  onChange: () => void = () => {};

  constructor() {
    let saved: Partial<MindSettings> = {};
    try {
      saved = JSON.parse(localStorage.getItem('kurashi-mind') ?? '{}');
    } catch {
      /* 無視 */
    }
    const p = PRESETS.gemini;
    this.settings = { enabled: true, preset: 'gemini', baseUrl: p.baseUrl, apiKey: '', model: p.model, interval: 25, ...saved };
    if (this.settings.model === 'gemini-2.5-flash-lite') this.settings.model = p.model;
    this.refreshStatus();
  }

  get ready() {
    return this.settings.enabled && !!this.settings.apiKey && !!this.settings.baseUrl && !!this.settings.model;
  }

  save() {
    try {
      localStorage.setItem('kurashi-mind', JSON.stringify(this.settings));
    } catch {
      /* 無視 */
    }
    this.backoffUntil = 0;
    this.refreshStatus();
  }

  private refreshStatus() {
    if (this.busy) return;
    if (!this.settings.apiKey) this.status = 'AI未設定:村人は本能と習慣だけで暮らしています';
    else if (!this.settings.enabled) this.status = 'AIを止めています';
    else if (Date.now() < this.backoffUntil) this.status = 'AIが混み合っているので少し待っています';
    else this.status = '村人たちが考えています';
    this.onChange();
  }

  /** 毎フレーム呼ばれる。間隔が来たら考える */
  tick(sim: Sim) {
    if (!this.ready || this.busy) return;
    const now = Date.now();
    if (now < this.backoffUntil || now - this.lastCall < this.settings.interval * 1000) return;
    if (document.visibilityState === 'hidden') return;
    this.lastCall = now;
    void this.think(sim);
  }

  thinkNow(sim: Sim) {
    if (!this.ready || this.busy) return;
    this.lastCall = Date.now();
    this.backoffUntil = 0;
    void this.think(sim);
  }

  // ───────────── API ─────────────
  private async call(prompt: string): Promise<string> {
    const { baseUrl, apiKey, model, preset } = this.settings;
    const kind = PRESETS[preset]?.kind ?? 'openai';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      if (kind === 'gemini') {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 1.0, responseMimeType: 'application/json', maxOutputTokens: 4096 },
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
        const j = await res.json();
        return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
      }
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 1.0, max_tokens: 4096 }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  /** 使えるモデルの一覧(設定画面用) */
  async listModels(): Promise<string[]> {
    const { baseUrl, apiKey, preset } = this.settings;
    const kind = PRESETS[preset]?.kind ?? 'openai';
    if (kind === 'gemini') {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
      if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
      const j = await res.json();
      return (j.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        .filter((n: string) => /gemini|gemma/.test(n) && !/(embedding|image|tts|audio|live|vision)/.test(n));
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
    const j = await res.json();
    return (j.data ?? []).map((m: { id: string }) => m.id);
  }

  /** つながるか試す */
  async test(): Promise<string> {
    const t0 = performance.now();
    const text = await this.call('次のJSONだけを返してください: {"ok": true, "message": "島の暮らしを始めましょう"}');
    const j = parseJson(text);
    return `${Math.round(performance.now() - t0)}ms・${j ? str((j as Record<string, unknown>).message, 40) || 'OK' : text.slice(0, 40)}`;
  }

  // ───────────── 考える ─────────────
  private async think(sim: Sim) {
    const s = sim.s;
    const newcomers = s.villagers.filter((v) => !v.named && !v.thinking).slice(0, 3);
    const deciders = s.villagers
      .filter((v) => v.named && sim.needsThought(v) && v.knockedOut <= 0)
      .sort((a, b) => (a.intention?.until ?? 0) - (b.intention?.until ?? 0))
      .slice(0, 4);
    const talks = s.pendingTalks
      .filter((p) => s.villagers.some((v) => v.id === p.a) && s.villagers.some((v) => v.id === p.b))
      .slice(0, 2);
    this.callCount++;
    const villageTurn = this.callCount % 4 === 1;
    if (!newcomers.length && !deciders.length && !talks.length && !villageTurn) return;

    const involved = [...newcomers, ...deciders];
    for (const v of involved) v.thinking = true;
    const takenTalks = talks.slice();
    s.pendingTalks = s.pendingTalks.filter((p) => !takenTalks.includes(p));

    this.busy = true;
    this.status = '村人たちが考えています…';
    this.onChange();
    const t0 = performance.now();
    const simAtStart = sim;
    try {
      const prompt = buildPrompt(sim, newcomers, deciders, takenTalks, villageTurn);
      const text = await this.call(prompt);
      const data = parseJson(text);
      if (!data) throw new Error('AIの返事を読み取れませんでした');
      if (simAtStart === sim) applyThoughts(sim, data, newcomers, deciders, takenTalks);
      this.log(true, performance.now() - t0, `${deciders.length}人の判断・${takenTalks.length}件の会話`);
    } catch (e) {
      // 会話の予約は戻す
      s.pendingTalks.push(...takenTalks.slice(0, 1));
      const err = e as Error;
      if (err instanceof ApiError && (err.status === 429 || err.status === 503)) {
        this.backoffUntil = Date.now() + Math.min(300000, this.settings.interval * 4000);
        this.log(false, performance.now() - t0, '混み合っています(しばらく待ちます)');
      } else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        this.backoffUntil = Date.now() + 600000;
        this.log(false, performance.now() - t0, 'APIキーが使えません。設定を確認してください');
      } else if (err instanceof ApiError && err.status === 404) {
        this.backoffUntil = Date.now() + 600000;
        this.log(false, performance.now() - t0, 'モデルが見つかりません。設定でモデルを選び直してください');
      } else {
        this.log(false, performance.now() - t0, err.name === 'AbortError' ? '時間切れ' : err.message.slice(0, 60));
      }
    } finally {
      for (const v of involved) v.thinking = false;
      this.busy = false;
      this.refreshStatus();
    }
  }

  private log(ok: boolean, ms: number, note: string) {
    this.logs.unshift({ at: Date.now(), ok, ms: Math.round(ms), note });
    if (this.logs.length > 30) this.logs.length = 30;
    if (!ok) this.status = note;
  }
}

class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`APIエラー ${status}${body ? `:${body.slice(0, 80)}` : ''}`);
    this.status = status;
  }
}

export function parseJson(text: string): Record<string, unknown> | null {
  const t = text.replace(/```(json)?/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

// ───────────── プロンプト ─────────────
function needWords(v: Villager) {
  const w: string[] = [];
  if (v.hunger > 0.7) w.push('おなかがすいている');
  if (v.energy < 0.25) w.push('疲れている');
  if (v.loneliness > 0.7) w.push('人恋しい');
  return w.join('・') || '落ち着いている';
}

function personBrief(sim: Sim, v: Villager, full: boolean) {
  const s = sim.s;
  const rel = Object.entries(v.relations)
    .map(([id, r]) => ({ o: s.villagers.find((x) => x.id === Number(id)), r }))
    .filter((x) => x.o)
    .sort((a, b) => Math.abs(b.r.score) - Math.abs(a.r.score))
    .slice(0, full ? 4 : 2)
    .map((x) => `${x.o!.name}(${x.r.label ? x.r.label + '・' : ''}${x.r.score})`);
  const partner = s.villagers.find((x) => x.id === v.partnerId);
  const o: Record<string, unknown> = {
    名前: v.name,
    年齢: Math.floor(v.age * 10),
    性別: v.female ? '女' : '男',
    姿: { pawn: '村人', child: '子ども', warrior: '戦士', archer: '弓使い', monk: '僧侶' }[v.role],
    性格: v.personality || '(まだ決まっていない)',
  };
  if (partner) o.連れ合い = partner.name;
  if (v.parents.length) o.親 = v.parents.join('と');
  if (rel.length) o.関係 = rel.join('、');
  if (full) {
    o.記憶 = v.memories.slice(0, 4);
    o.今の状態 = needWords(v);
    if (v.intention?.source === 'ai') o.直前の考え = `${ACTION_INFO[v.intention.action]}${v.intention.target ? `(${v.intention.target})` : ''}「${v.intention.thought}」`;
  }
  return o;
}

function buildPrompt(sim: Sim, newcomers: Villager[], deciders: Villager[], talks: { a: number; b: number; topic: string }[], villageTurn: boolean) {
  const s = sim.s;
  const byId = (id: number) => s.villagers.find((v) => v.id === id);
  const world = {
    島: s.islandName,
    時: `${sim.timeLabel}・${sim.isNight ? '夜' : '昼'}`,
    時代: s.era,
    人口: `${sim.population}人(住める数 ${sim.capacity})`,
    蓄え: { 木: Math.floor(s.res.wood), 肉: Math.floor(s.res.meat), 金: Math.floor(s.res.gold) },
    建物: s.buildings.map((b) => `${b.name}[${BUILDINGS[b.kind].name}/${ROLE_INFO[b.role].name}]${b.done ? '' : `(建設中${Math.round(b.progress * 100)}%)`}`),
    計画中: s.projects.map((p) => `${p.name}[${BUILDINGS[p.kind].name}/${ROLE_INFO[p.role].name}]`),
    習わし: s.customs.slice(-6),
    最近の出来事: s.chronicle.slice(-7).map((c) => c.text),
    盗賊: sim.raidActive ? '島に上陸している!' : 'いない',
    村人一覧: s.villagers.map((v) => `${v.name}(${Math.floor(v.age * 10)}歳)`).join('、'),
  };
  const looks = BUILDING_ORDER.map((k) => `${k}=${BUILDINGS[k].name}(木${BUILDINGS[k].cost.wood ?? 0}${BUILDINGS[k].cost.gold ? `・金${BUILDINGS[k].cost.gold}` : ''})`).join(' / ');
  const roles = ROLES.map((r) => `${r}=${ROLE_INFO[r].name}:${ROLE_INFO[r].desc}`).join(' / ');
  const actions = ACTIONS.map((a) => `${a}=${ACTION_INFO[a]}`).join(' / ');

  const parts: string[] = [];
  parts.push(
    `あなたは、小さな島で暮らす村人たち一人ひとりの心を演じます。村人は「空腹なら食べる・眠くなったら寝る・危険から逃げる・人恋しくなる」という本能だけはひとりでに働きますが、それ以外の「何をして生きるか」「誰と何を話すか」「何を建てて何と呼ぶか」「どんな習わしをつくるか」は、すべて村人自身が考えます。ゲーム的な正解はありません。性格・記憶・関係・村の状況から、その人らしい選択をしてください。恋も、けんかも、夢も、迷いも自由です。せりふは自然な日本語の話し言葉で、短く。`,
  );
  parts.push(`【村の今】\n${JSON.stringify(world)}`);
  parts.push(`【体でできる動作(action)】\n${actions}\n※実際にできるのはこの動作だけです。思いや目的は thought に書いてください。`);
  parts.push(`【建物の見た目(look)と材料】\n${looks}\n【建物の働き(role)】\n${roles}\n※名前と目的は自由につけられます。材料が足りなければ、建てる前に集める必要があります。`);
  if (newcomers.length)
    parts.push(
      `【新しく性格を決める人】\n${JSON.stringify(newcomers.map((v) => ({ id: v.id, 今の名前: v.name, 年齢: Math.floor(v.age * 10), 性別: v.female ? '女' : '男', 親: v.parents.join('と') || '(島に流れ着いた)' })))}\n赤ちゃん(年齢0)なら親が名前をつけてください。そうでなければ名前はそのまま。`,
    );
  if (deciders.length) parts.push(`【次に何をするか考える人】\n${JSON.stringify(deciders.map((v) => personBrief(sim, v, true)))}`);
  if (talks.length)
    parts.push(
      `【これから会話する二人】\n${JSON.stringify(
        talks
          .map((t) => {
            const a = byId(t.a);
            const b = byId(t.b);
            return a && b ? { 話しかける人: personBrief(sim, a, true), 相手: personBrief(sim, b, true), きっかけ: t.topic || '(特になし)' } : null;
          })
          .filter(Boolean),
      )}\n4〜8行の会話を書いてください。会話のあと、お互いへの気持ちがどう変わったかも決めてください。`,
    );
  if (villageTurn) parts.push('【村全体】時代の名前を変えたいとき、新しい習わしが生まれたとき、歴史に残したい出来事があるときだけ village に書いてください。');

  parts.push(`【返事の形】次のJSONだけを返してください(該当がない項目は空配列や省略でかまいません)。
{
 "people": [{"name":"名前","action":"${ACTIONS.join('|')}","target":"相手の名前や建物の名前(必要なら)","thought":"心の声(30字以内)","minutes":1〜6(その行動を続ける時間),"look":"pawn|warrior|archer|monk(生き方を変えるときだけ)","memory":"これまでに起きたことで心に残ったこと(予定は書かない・あれば30字以内)","propose":{"name":"建物の名前","look":"${BUILDING_ORDER.join('|')}","role":"${ROLES.join('|')}","purpose":"目的(30字以内)"}(建てたいものを思いついたときだけ)}],
 "newcomers": [{"id":数字,"name":"名前(カタカナ2〜4文字)","personality":"性格・好きなもの・夢など(50字以内)"}],
 "talks": [{"a":"話しかける人","b":"相手","lines":[{"speaker":"名前","text":"せりふ(40字以内)"}],"a_to_b":{"delta":-30〜30,"label":"aから見たbとの関係の呼び名(親友・恋人・夫婦・ライバル・師匠など、変わったときだけ)"},"b_to_a":{"delta":-30〜30,"label":"同様"},"memory_a":"この会話でaの心に残ったこと","memory_b":"この会話でbの心に残ったこと","promise":{"action":"二人で一緒にすること(あれば)","target":""}}],
 "village": {"era":"新しい時代の名前(変えるときだけ)","custom":"新しく生まれた習わし(あれば)","chronicle":"歴史書に残す一文(あれば)"}
}`);
  return parts.join('\n\n');
}

// ───────────── 反映 ─────────────
function applyThoughts(sim: Sim, data: Record<string, unknown>, newcomers: Villager[], deciders: Villager[], talks: { a: number; b: number; topic: string }[]) {
  const s = sim.s;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

  // 新しく来た人・生まれた子
  for (const n of arr(data.newcomers)) {
    const v = newcomers.find((x) => x.id === Number(n.id)) ?? newcomers.find((x) => x.name === n.name);
    if (!v) continue;
    const pers = str(n.personality, 60);
    if (pers) v.personality = pers;
    const name = str(n.name, 6);
    if (v.age < 0.3 && name && name !== v.name && !s.villagers.some((x) => x !== v && x.name === name)) {
      const old = v.name;
      v.name = name;
      if (v.parents.length) sim.addChronicle(`${v.parents.join('と')}は、生まれた子を「${name}」と名付けた。`, 'birth');
      for (const c of s.conversations) for (const l of c.lines) if (l.speaker === old) l.speaker = name;
    }
    v.named = true;
  }
  for (const v of newcomers) v.named = true; // 返事がなくても次に進む

  // 一人ひとりの判断
  for (const p of arr(data.people)) {
    const v = deciders.find((x) => x.name === p.name) ?? sim.byName(str(p.name, 12));
    if (!v || !s.villagers.includes(v)) continue;
    const action = (ACTIONS as string[]).includes(String(p.action)) ? (p.action as Action) : 'wander';
    const minutes = clamp(Number(p.minutes) || 2, 1, 6);
    const thought = str(p.thought, 40);
    v.intention = { action: v.role === 'child' && !['play', 'wander', 'talk', 'rest', 'gather', 'explore'].includes(action) ? 'play' : action, target: str(p.target, 20) || undefined, thought, until: s.time + minutes * 60, source: 'ai' };
    if (v.task && ['wander', 'guard', 'festival', 'play'].includes(v.task.type)) sim.releaseTask(v); // すぐ動けるように
    if (thought && !v.hidden && !v.bubble) sim.say(v, thought, 5);
    const look = String(p.look ?? '');
    if ((LOOKS as readonly string[]).includes(look) && v.role !== 'child' && look !== v.role) sim.setLook(v, look as (typeof LOOKS)[number], thought);
    const mem = str(p.memory, 40);
    if (mem) sim.remember(v, mem);
    const pr = p.propose as Record<string, unknown> | undefined;
    if (pr && typeof pr === 'object') {
      const kind = String(pr.look) as BuildingKind;
      const role = String(pr.role) as BuildingRole;
      const name = str(pr.name, 16);
      if (name && BUILDINGS[kind] && (ROLES as string[]).includes(role)) {
        sim.addProject({ name, kind, role, purpose: str(pr.purpose, 40), proposer: v.name });
      }
    }
  }

  // 会話
  for (const t of arr(data.talks)) {
    const a = sim.byName(str(t.a, 12));
    const b = sim.byName(str(t.b, 12));
    if (!a || !b || a === b) continue;
    const lines = arr(t.lines)
      .map((l) => ({ speaker: str(l.speaker, 12), text: str(l.text, 60) }))
      .filter((l) => l.text)
      .map((l) => ({ speaker: l.speaker === b.name ? b.name : l.speaker === a.name ? a.name : l.speaker.includes(b.name) ? b.name : a.name, text: l.text }))
      .slice(0, 8);
    if (!lines.length) continue;
    const pending = talks.find((p) => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id));
    sim.addConversation(a, b, pending?.topic ?? '', lines);
    const feel = (x: Villager, y: Villager, f: unknown) => {
      const o = (f ?? {}) as Record<string, unknown>;
      const r = sim.relation(x, y);
      r.score = clamp(r.score + clamp(Number(o.delta) || 0, -30, 30), -100, 100);
      const label = str(o.label, 10);
      if (label) r.label = label;
    };
    feel(a, b, t.a_to_b);
    feel(b, a, t.b_to_a);
    const ma = str(t.memory_a, 40);
    const mb = str(t.memory_b, 40);
    if (ma) sim.remember(a, ma);
    if (mb) sim.remember(b, mb);
    const pr = t.promise as Record<string, unknown> | undefined;
    if (pr && (ACTIONS as string[]).includes(String(pr.action))) {
      for (const v of [a, b]) {
        v.intention = { action: pr.action as Action, target: str(pr.target, 20) || undefined, thought: lines[lines.length - 1].text.slice(0, 30), until: s.time + 180, source: 'ai' };
      }
    }
  }
  sim.updatePartners();

  // 村全体
  const vg = (data.village ?? {}) as Record<string, unknown>;
  const era = str(vg.era, 14);
  if (era && era !== s.era) {
    s.era = era;
    sim.addChronicle(`人々はこの頃を「${era}」と呼ぶようになった。`, 'stage');
    sim.emit({ type: 'culture' });
  }
  const custom = str(vg.custom, 50);
  if (custom && !s.customs.includes(custom)) {
    s.customs.push(custom);
    if (s.customs.length > 12) s.customs.shift();
    sim.addChronicle(`村に新しい習わしが生まれた:${custom}`, 'ai');
    sim.emit({ type: 'culture' });
  }
  const chron = str(vg.chronicle, 90);
  if (chron) sim.addChronicle(chron, 'ai');
}
