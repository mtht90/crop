// 長老会議のAI。ブラウザ内AI(WebLLM)か、OpenAI互換の無料APIを使う。使えないときはルール判断のまま。
import { BUILDINGS } from '../sim/config';
import { councilSummary, elders } from '../sim/council';
import type { Sim } from '../sim/sim';
import type { BuildingKind, CouncilLine, Policy } from '../sim/types';

export type ProviderKind = 'rule' | 'webllm' | 'api';
export interface AISettings {
  provider: ProviderKind;
  webllmModel: string;
  api: { preset: string; baseUrl: string; apiKey: string; model: string };
}

export const API_PRESETS: Record<string, { label: string; baseUrl: string; model: string; note: string }> = {
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash-lite', note: 'Google AI Studio で無料のAPIキーを発行できます' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', note: 'console.groq.com で無料のAPIキーを発行できます' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', note: 'モデル名の末尾が :free のものは無料です' },
  custom: { label: 'その他(OpenAI互換)', baseUrl: '', model: '', note: 'OpenAI互換の /chat/completions に対応したAPI' },
};

const WEBLLM_CDN = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';
export const WEBLLM_PREFERRED = [
  'gemma-2-2b-jpn-it-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
];

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
interface Engine {
  chat: { completions: { create(o: Record<string, unknown>): Promise<{ choices: { message: { content: string | null } }[] }> } };
}

export class AIManager {
  settings: AISettings;
  status = 'ルールで判断中';
  busy = false;
  progress = '';
  private engine: Engine | null = null;
  private engineModel = '';
  private loading: Promise<Engine> | null = null;
  onStatus: () => void = () => {};

  constructor() {
    let saved: Partial<AISettings> = {};
    try {
      saved = JSON.parse(localStorage.getItem('kurashi-ai') ?? '{}');
    } catch {
      /* 無視 */
    }
    this.settings = {
      provider: 'rule',
      webllmModel: WEBLLM_PREFERRED[0],
      api: { preset: 'gemini', baseUrl: API_PRESETS.gemini.baseUrl, apiKey: '', model: API_PRESETS.gemini.model },
      ...saved,
    };
    this.updateIdleStatus();
  }

  save() {
    try {
      localStorage.setItem('kurashi-ai', JSON.stringify(this.settings));
    } catch {
      /* 無視 */
    }
    this.updateIdleStatus();
  }

  private updateIdleStatus() {
    if (this.busy) return;
    this.status =
      this.settings.provider === 'webllm'
        ? this.engine
          ? 'ブラウザ内AIが判断'
          : 'ブラウザ内AI(未読み込み)'
        : this.settings.provider === 'api'
          ? this.settings.api.apiKey
            ? `${API_PRESETS[this.settings.api.preset]?.label ?? 'API'}が判断`
            : 'APIキー未設定'
          : 'ルールで判断中';
    this.onStatus();
  }

  static webgpuAvailable() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  async listWebLLMModels(): Promise<string[]> {
    try {
      const mod = await import(/* @vite-ignore */ WEBLLM_CDN);
      const ids: string[] = mod.prebuiltAppConfig.model_list.map((m: { model_id: string }) => m.model_id);
      const pref = WEBLLM_PREFERRED.filter((id) => ids.includes(id));
      const rest = ids.filter((id) => !pref.includes(id) && /q4f16_1/.test(id) && /(Instruct|-it-)/.test(id) && !/(70B|8B|7B|9B|14B|Coder|Math)/.test(id));
      return [...pref, ...rest.slice(0, 12)];
    } catch {
      return WEBLLM_PREFERRED;
    }
  }

  /** WebLLMを読み込む(初回はモデルのダウンロードあり) */
  async loadWebLLM(): Promise<Engine> {
    const model = this.settings.webllmModel;
    if (this.engine && this.engineModel === model) return this.engine;
    if (this.loading) return this.loading;
    if (!AIManager.webgpuAvailable()) throw new Error('このブラウザはWebGPUに対応していません');
    this.loading = (async () => {
      this.status = 'ブラウザ内AIを準備中…';
      this.onStatus();
      const src = `import { WebWorkerMLCEngineHandler } from "${WEBLLM_CDN}";\nconst h = new WebWorkerMLCEngineHandler();\nself.onmessage = (m) => h.onmessage(m);`;
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
      const mod = await import(/* @vite-ignore */ WEBLLM_CDN);
      const engine: Engine = await mod.CreateWebWorkerMLCEngine(worker, model, {
        initProgressCallback: (r: { progress: number; text: string }) => {
          this.progress = `${Math.round(r.progress * 100)}% ${r.text}`;
          this.status = `AIを読み込み中 ${Math.round(r.progress * 100)}%`;
          this.onStatus();
        },
      });
      this.engine = engine;
      this.engineModel = model;
      this.progress = '';
      return engine;
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
      this.updateIdleStatus();
    }
  }

  private async chat(messages: Msg[]): Promise<string> {
    if (this.settings.provider === 'webllm') {
      const engine = await this.loadWebLLM();
      const r = await engine.chat.completions.create({ messages, temperature: 0.8, max_tokens: 500 });
      return r.choices[0]?.message.content ?? '';
    }
    const { baseUrl, apiKey, model } = this.settings.api;
    if (!apiKey || !baseUrl) throw new Error('APIキーが未設定です');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.8, max_tokens: 1500 }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`APIエラー ${res.status}`);
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  get enabled() {
    return this.settings.provider === 'webllm' || (this.settings.provider === 'api' && !!this.settings.api.apiKey);
  }

  /** 季節の長老会議。結果をルールの方針に重ねて返す。失敗したら null */
  async council(sim: Sim): Promise<{ policy: Policy; chronicle: string | null } | null> {
    if (!this.enabled || this.busy) return null;
    this.busy = true;
    this.status = '長老たちが相談中…';
    this.onStatus();
    const base = sim.s.policy;
    const summary = councilSummary(sim);
    const names = elders(sim).map((v) => v.name);
    const messages: Msg[] = [
      {
        role: 'system',
        content:
          'あなたは小さな島の村で開かれる「長老会議」を演じる語り手です。村の状況を読み、長老たちの性格に合った短い会話と、この季節の方針を決めます。出力は必ずJSONだけにしてください。',
      },
      {
        role: 'user',
        content: `村の状況:\n${JSON.stringify(summary)}\n\n次の形式のJSONだけを出力してください。\n{"weights":{"wood":0〜3,"meat":0〜3,"gold":0〜3,"build":0〜3},"nextBuild":"候補(candidates)のidのどれか、またはnull","festival":true/false,"lines":[{"speaker":"長老の名前","text":"30文字以内のせりふ"}],"chronicle":"この季節の村の様子を歴史書の一文として(60文字以内)"}\n\n・weightsは仕事の優先度です(wood=木こり, meat=羊の世話, gold=金掘り, build=建設)。\n・linesは長老(${names.join('、')})による2〜4個の会話にしてください。\n・資源が足りないもの、人口が上限に近いこと、最近の出来事を踏まえて判断してください。`,
      },
    ];
    try {
      const text = await this.chat(messages);
      const parsed = parseJson(text);
      if (!parsed) throw new Error('AIの返答を読み取れませんでした');
      const policy = validate(parsed, sim, base, names);
      const chronicle = typeof parsed.chronicle === 'string' ? parsed.chronicle.slice(0, 90) : null;
      this.busy = false;
      this.updateIdleStatus();
      return { policy, chronicle };
    } catch (e) {
      this.busy = false;
      this.status = `AI失敗:${(e as Error).message.slice(0, 40)}(ルールで判断)`;
      this.onStatus();
      return null;
    }
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

function num(v: unknown, def: number) {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : def;
}

function validate(p: Record<string, unknown>, sim: Sim, base: Policy, names: string[]): Policy {
  const w = (p.weights ?? {}) as Record<string, unknown>;
  const weights = {
    wood: num(w.wood, base.weights.wood),
    meat: num(w.meat, base.weights.meat),
    gold: sim.s.stage >= 1 ? num(w.gold, base.weights.gold) : 0,
    build: Math.max(0.8, num(w.build, base.weights.build)),
  };
  // 食料が尽きそうなときは安全のために羊の世話を最低限確保
  if (sim.s.res.meat < sim.population) weights.meat = Math.max(weights.meat, 1.5);
  let nextBuild: BuildingKind | null = base.nextBuild;
  if (typeof p.nextBuild === 'string' && p.nextBuild in BUILDINGS && sim.canBuild(p.nextBuild as BuildingKind)) nextBuild = p.nextBuild as BuildingKind;
  // 家が足りないときは家を優先
  if (sim.population >= sim.capacity - 1 && sim.canBuild('house') && !sim.s.buildings.some((b) => !b.done && b.kind === 'house')) nextBuild = 'house';
  const lines: CouncilLine[] = [];
  if (Array.isArray(p.lines)) {
    for (const l of p.lines.slice(0, 5)) {
      const sp = String((l as Record<string, unknown>)?.speaker ?? '');
      const tx = String((l as Record<string, unknown>)?.text ?? '').slice(0, 40);
      if (!tx) continue;
      lines.push({ speaker: names.includes(sp) ? sp : names[lines.length % Math.max(1, names.length)] ?? sp, text: tx });
    }
  }
  return { weights, nextBuild, festival: p.festival === true && sim.s.stage >= 2, lines: lines.length ? lines : base.lines, source: 'ai' };
}
