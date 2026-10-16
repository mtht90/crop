// Claude API でエンティティを大量生成し、DBを1万件規模へ増やすツール
//
//   npm install                      (@anthropic-ai/sdk を入れる)
//   export ANTHROPIC_API_KEY=...
//   node tools/generate.mjs --domain P --theme "Jリーグの選手" --count 150
//   node tools/generate.mjs --all            (下の THEMES を順に全部生成。既にあるテーマはスキップ)
//   node tools/generate.mjs --all --dry-run  (何が生成されるかだけ表示)
//
// 生成結果は data/entities/gen_*.txt に書かれる。未知タグは除去、既存と重複する名前は捨てる。
// 生成データは事実誤りを含みうるので、git diff で目視確認してからコミットすること。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, parseQuestions, parseEntities } from '../lib/compile.mjs';
import { normName } from '../public/engine.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'data');
const MODEL = process.env.GEN_MODEL || 'claude-opus-5-5';

// 1万件超えを目指すテーマ一覧  [ドメイン, テーマ, 件数]
const THEMES = [
  ['P', '日本の俳優・女優（現役、幅広い世代）', 300],
  ['P', '日本のアイドル（グループのメンバー個人を含む）', 250],
  ['P', '日本の歌手・バンド・アーティスト', 300],
  ['P', '日本のお笑い芸人・タレント', 300],
  ['P', '日本のプロ野球選手（現役・OB）', 250],
  ['P', 'サッカー選手（日本人・海外のスター）', 200],
  ['P', '日本と世界のその他スポーツ選手（陸上・水泳・格闘技・相撲・フィギュア等）', 250],
  ['P', 'YouTuber・VTuberの中の人以外の配信者・インフルエンサー', 150],
  ['P', '声優', 200],
  ['P', '日本の歴史上の人物（古代〜昭和）', 300],
  ['P', '世界の歴史上の人物', 300],
  ['P', 'ハリウッド俳優・海外ミュージシャン', 300],
  ['P', '政治家・経営者・科学者・作家（日本と世界）', 300],
  ['P', 'K-POP・アジアの芸能人', 150],
  ['C', '週刊少年ジャンプ作品のキャラクター', 400],
  ['C', 'その他の人気マンガ・アニメのキャラクター', 500],
  ['C', 'ポケモン（人気のポケモン個体名）', 300],
  ['C', 'ゲームのキャラクター（任天堂・スクエニ・カプコン・セガ等）', 400],
  ['C', 'ディズニー・ピクサー・海外アニメのキャラクター', 250],
  ['C', 'アメコミ・海外映画・海外ドラマ・小説のキャラクター', 250],
  ['C', '特撮・戦隊・ライダー・ウルトラマン・怪獣', 150],
  ['C', '企業マスコット・ゆるキャラ・サンリオ等', 200],
  ['C', '妖怪・神話・伝説・昔話の登場人物', 200],
  ['C', 'VTuber', 100],
  ['A', '哺乳類', 250],
  ['A', '鳥', 150],
  ['A', '魚・海の生き物', 200],
  ['A', '昆虫・虫', 150],
  ['A', '爬虫類・両生類・恐竜・絶滅動物', 120],
  ['L', '花・木・植物', 150],
  ['F', '料理（和洋中・世界の料理）', 300],
  ['F', 'お菓子・スイーツ・駄菓子', 200],
  ['F', '飲み物・お酒', 100],
  ['F', '果物・野菜・食材', 150],
  ['F', 'ファストフード・チェーン店の定番商品・コンビニ商品のジャンル', 100],
  ['O', '家電・電子機器', 150],
  ['O', '日用品・家具・文房具', 250],
  ['O', '乗り物', 120],
  ['O', '楽器・スポーツ用品・おもちゃ', 200],
  ['O', '道具・武器・その他の物', 150],
  ['S', '日本の都道府県・市町村・観光地', 250],
  ['S', '世界の国と都市', 250],
  ['S', '世界と日本の有名な建物・世界遺産・自然', 200],
];

const DOMAIN_NAME = { P: '実在の人物', C: '架空のキャラクター', A: '動物', L: '植物', F: '食べ物・飲み物', O: '物', S: '場所' };

function args() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { domain: get('--domain'), theme: get('--theme'), count: +(get('--count') || 150), all: a.includes('--all'), dry: a.includes('--dry-run') };
}

function slug(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export function buildPrompt(spec, domain, theme, count, existing) {
  const qs = spec.questions.filter((q) => !q.tag.startsWith('D:') && (!q.scope || q.scope.includes(domain)));
  const tagList = qs.map((q) => `${q.tag}: ${q.text}`).join('\n');
  const groups = spec.groups.map((g) => g.tags.join(' / ')).join('\n');
  const implies = [...spec.implies.entries()].map(([k, v]) => `${k} → ${v.join(' ')}`).join('\n');
  const extra = [...spec.extraTags].join(' ');
  return `あなたはアキネーター風ゲームの知識ベースを作る編集者です。
ドメイン「${DOMAIN_NAME[domain]}」のうち、テーマ「${theme}」に当てはまる、日本のプレイヤーが思い浮かべそうな有名なものを${count}件、下の書式で出力してください。

## 書式（1行1件、説明・見出し・空行・コードブロックは一切不要）
名前/別名/別名 | タグ タグ ?タグ -タグ
- 名前は日本で一般的な表記。別名(フルネーム・略称・英語名)があれば / で続ける
- タグ: 当てはまる特徴。?タグ: 場合による/微妙。-タグ: 明確に違うのに誤解されやすいもの
- 超有名なもの（日本人の大半が知っている）には * を付ける
- 下の「使えるタグ」以外は絶対に使わない
- 当てはまるタグは漏れなく付ける（付けないタグは「たぶん違う」と扱われる）。1件あたり5〜15個が目安
- 事実に自信がないもの・マイナーすぎるものは出力しない。知名度が高い順に
- 現在は2026年。存命か亡くなっているか（実在の人物は dead タグ）に注意

## 使えるタグ（タグ: 意味）
${tagList}
${extra ? `\n補助タグ（国コード等）: ${extra}\n` : ''}
## 排他グループ（同じ行のタグは同時に付けない）
${groups}

## 自動で付くタグ（左を付ければ右は書かなくてよい）
${implies}

## 既に登録済み（出力しない）
${existing.join('、') || '（なし）'}

## 例
${domain === 'P' ? '大谷翔平 | m jp era21 active mlb tv *\n夏目漱石 | m jp era19 era20 writer textbook banknote beard dead *' : ''}${domain === 'C' ? 'ピカチュウ | pokemon beast mouse yellow small tail superpower classic *\n竈門炭治郎/炭治郎 | m kimetsu human protagonist sword hero redhair recent *' : ''}${domain === 'A' ? 'ライオン | cat africa fourlegs tail carnivore big dangerous zoo yellow tropical *' : ''}${domain === 'L' ? '桜/サクラ | tree flower spring pink *' : ''}${domain === 'F' ? 'たこ焼き | dish japanese seafood hot round yatai' : ''}${domain === 'O' ? 'スマートフォン/スマホ | electric screen handheld home daily modern *' : ''}${domain === 'S' ? '東京タワー | tower tokyo tourist red *' : ''}
`;
}

async function generate(client, spec, domain, theme, count, existing) {
  const prompt = buildPrompt(spec, domain, theme, count, existing);
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort: 'high' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('refused: ' + JSON.stringify(msg.stop_details));
  if (msg.stop_reason === 'max_tokens') console.warn('  (max_tokens に到達。末尾は切れている可能性あり)');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/** 生成テキストを検証して、書き込むべき行だけ返す */
export function sanitize(text, spec, domain, knownNames) {
  const out = [];
  const known = spec.known;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^[-*・\d.\s]+(?=[^\s|])/, '').trim();
    if (!line.includes('|') || line.startsWith('#') || line.startsWith('```')) continue;
    const [namePart, tagPart] = line.split('|');
    const names = namePart.split('/').map((s) => s.trim()).filter(Boolean);
    if (!names.length || names[0].length > 40) continue;
    if (names.some((n) => knownNames.has(normName(n)))) continue;
    const tags = tagPart.trim().split(/\s+/).filter((w) => {
      const t = spec.aliases.get(w.replace(/^[?-]/, '')) || w.replace(/^[?-]/, '');
      return t === 'famous' || known.has(t);
    });
    if (tags.length < 3) continue;
    // パースできるか最終確認
    try {
      parseEntities(`@${domain}\n${names.join('/')} | ${tags.join(' ')}`, spec, 'gen', () => {});
    } catch {
      continue;
    }
    for (const n of names) knownNames.add(normName(n));
    out.push(`${names.join('/')} | ${tags.join(' ')}`);
  }
  return out;
}

async function main() {
  const opt = args();
  const jobs = opt.all ? THEMES : opt.domain && opt.theme ? [[opt.domain, opt.theme, opt.count]] : null;
  if (!jobs) {
    console.log('usage: node tools/generate.mjs --domain P --theme "テーマ" [--count 150]\n       node tools/generate.mjs --all [--dry-run]');
    process.exit(1);
  }
  const spec = parseQuestions(fs.readFileSync(path.join(DATA, 'questions.txt'), 'utf8'));
  spec.known = new Set([...spec.questions.map((q) => q.tag), ...spec.groups.flatMap((g) => g.tags), ...[...spec.implies.values()].flat(), ...spec.implies.keys(), ...spec.extraTags]);

  let client = null;
  if (!opt.dry) {
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch {
      console.error('@anthropic-ai/sdk が見つかりません。akinator/ で npm install を実行してください。');
      process.exit(1);
    }
    client = new Anthropic();
  }

  for (const [domain, theme, count] of jobs) {
    const file = path.join(DATA, 'entities', `gen_${domain}_${slug(theme)}.txt`);
    if (opt.all && fs.existsSync(file)) {
      console.log(`skip (exists): ${theme}`);
      continue;
    }
    const db = compile(DATA);
    const knownNames = new Set(db.entities.flatMap((e) => [e.n, ...e.a]).map(normName));
    const existing = db.entities.filter((e) => e.d === domain).map((e) => e.n);
    console.log(`[${domain}] ${theme} ×${count}  (既存 ${existing.length}件)`);
    if (opt.dry) continue;

    // 大きい件数は分割して頼む（1回 ~150件）
    const lines = [];
    for (let left = count; left > 0; left -= 150) {
      const n = Math.min(150, left);
      const text = await generate(client, spec, domain, theme, n, [...existing, ...lines.map((l) => l.split('|')[0].split('/')[0].trim())]);
      const got = sanitize(text, spec, domain, knownNames);
      console.log(`  +${got.length}`);
      lines.push(...got);
      if (!got.length) break;
    }
    fs.writeFileSync(file, `# 自動生成: ${theme} (${MODEL}) — 要レビュー\n@${domain}\n${lines.join('\n')}\n`);
    console.log(`  → ${path.relative(root, file)} (${lines.length}件)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
