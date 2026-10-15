// Folio のモーション基盤
// - バネの物理シミュレーションから CSS の linear() イージングを作る (コンポジタ上で滑らかに動く)
// - 位置・大きさの変化は FLIP (First, Last, Invert, Play) で transform だけを使って補間する
// - OS の「視差効果を減らす」設定では、動きを短いフェードに置き換える

export interface Spring {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** 用途ごとのバネ。どれも過剰に跳ねず、わずかに「着地」する感触にしている */
export const SPRINGS = {
  /** 選択リングやタブのハイライトが滑る */
  glide: { stiffness: 420, damping: 34 },
  /** ページ ⇄ タイルの変形 */
  morph: { stiffness: 230, damping: 26 },
  /** 並べ替え・サイズ変更 */
  reflow: { stiffness: 300, damping: 30 },
  /** 出現 */
  pop: { stiffness: 520, damping: 32 },
} satisfies Record<string, Spring>;

export type SpringName = keyof typeof SPRINGS;

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

interface Curve {
  easing: string;
  duration: number;
}

const curveCache = new Map<string, Curve>();

/** 0 → 1 へのバネの動きをシミュレーションし、linear() イージングと所要時間を返す */
export function springCurve(spring: Spring): Curve {
  const key = `${spring.stiffness}/${spring.damping}/${spring.mass ?? 1}`;
  const cached = curveCache.get(key);
  if (cached) return cached;

  const mass = spring.mass ?? 1;
  const dt = 1 / 600;
  let x = 0;
  let v = 0;
  let t = 0;
  const samples: Array<[number, number]> = [[0, 0]];
  // 静止するまで (最大 2 秒) 進める
  while (t < 2) {
    const a = (-spring.stiffness * (x - 1) - spring.damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    samples.push([t, x]);
    if (Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.02) break;
  }
  const duration = t * 1000;
  // 等間隔に 48 点ほど抜き出す
  const step = Math.max(1, Math.floor(samples.length / 48));
  const points: string[] = [];
  for (let i = 0; i < samples.length; i += step) {
    const [st, sx] = samples[i];
    points.push(`${sx.toFixed(4)} ${((st / t) * 100).toFixed(2)}%`);
  }
  points.push('1 100%');
  const curve = { easing: `linear(${points.join(', ')})`, duration };
  curveCache.set(key, curve);
  return curve;
}

/** CSS のトランジションからも同じバネを使えるよう、カスタムプロパティとして公開する */
export function installSpringVariables(): void {
  const root = document.documentElement.style;
  for (const [name, spring] of Object.entries(SPRINGS)) {
    const curve = springCurve(spring);
    root.setProperty(`--ease-${name}`, curve.easing);
    root.setProperty(`--dur-${name}`, `${Math.round(curve.duration)}ms`);
  }
}

export interface AnimateOptions {
  delay?: number;
  fill?: FillMode;
  /** 動きを減らす設定のときの代替 (既定: 120ms の短いアニメーション) */
  reducedDuration?: number;
}

/** バネで要素をアニメーションする (Web Animations API) */
export function animate(
  el: Element,
  keyframes: Keyframe[],
  spring: SpringName | Spring,
  opts: AnimateOptions = {},
): Animation {
  const curve = springCurve(typeof spring === 'string' ? SPRINGS[spring] : spring);
  if (reducedMotion.matches) {
    return el.animate(keyframes, {
      duration: opts.reducedDuration ?? 120,
      easing: 'ease-out',
      fill: opts.fill ?? 'none',
    });
  }
  return el.animate(keyframes, {
    duration: curve.duration,
    easing: curve.easing,
    delay: opts.delay ?? 0,
    fill: opts.fill ?? (opts.delay ? 'backwards' : 'none'),
  });
}

/** 時間指定の普通のアニメーション (フェードなど) */
export function fade(el: Element, keyframes: Keyframe[], duration: number, delay = 0): Animation {
  return el.animate(keyframes, {
    duration: reducedMotion.matches ? Math.min(duration, 120) : duration,
    delay: reducedMotion.matches ? 0 : delay,
    easing: 'cubic-bezier(.2, .7, .2, 1)',
    fill: delay ? 'backwards' : 'none',
  });
}

export function cancelAnimations(el: Element): void {
  for (const a of el.getAnimations()) a.cancel();
}

// ----------------------------------------------------------------------
// FLIP
// ----------------------------------------------------------------------

export function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

/** 要素を from の位置・大きさから、現在のレイアウト位置まで動かす */
export function flipFrom(el: HTMLElement, from: DOMRect, spring: SpringName = 'reflow', delay = 0): void {
  const to = el.getBoundingClientRect();
  if (to.width === 0 || to.height === 0) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return;
  if (reducedMotion.matches) {
    fade(el, [{ opacity: 0.4 }, { opacity: 1 }], 140);
    return;
  }
  animate(
    el,
    [
      { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: '0 0', transform: 'none' },
    ],
    spring,
    { delay },
  );
}

/**
 * 要素群の並びが変わる処理 (mutate) を、滑らかな移動として見せる。
 * - 残った要素: 元の位置から新しい位置へ移動
 * - 新しく現れた要素: 小さく・透明な状態から出現 (enter)
 * - 消えた要素: その場で縮みながら消える残像 (ghost) を残す
 */
export function flipGroup<K>(
  collect: () => Map<K, HTMLElement>,
  mutate: () => void,
  opts: {
    ghostLayer?: HTMLElement;
    enter?: (el: HTMLElement, key: K) => void;
    spring?: SpringName;
    /** 前回の位置が無い要素について、代わりに使う位置 (まとまりから出てきた場合など) */
    fallbackFrom?: (key: K, before: Map<K, DOMRect>) => DOMRect | undefined;
    /** 消える要素の行き先 (まとまりへ吸い込まれる場合など)。無ければその場で消える */
    ghostTarget?: (key: K, after: Map<K, HTMLElement>) => DOMRect | undefined;
  } = {},
): void {
  const before = collect();
  const rects = new Map<K, DOMRect>();
  for (const [key, el] of before) {
    if (el.isConnected && el.offsetParent !== null) rects.set(key, el.getBoundingClientRect());
  }
  // 消える要素の残像を用意してから DOM を更新する
  const ghosts: Array<{ el: HTMLElement; rect: DOMRect; key: K }> = [];

  mutate();

  const after = collect();
  for (const el of after.values()) cancelAnimations(el);
  for (const [key, el] of before) {
    const stillThere = after.get(key);
    if (stillThere && stillThere.offsetParent !== null) continue;
    const rect = rects.get(key);
    if (rect && opts.ghostLayer) ghosts.push({ el, rect, key });
  }
  for (const [key, el] of after) {
    if (el.offsetParent === null) continue;
    const from = rects.get(key) ?? opts.fallbackFrom?.(key, rects);
    if (from) flipFrom(el, from, opts.spring ?? 'reflow');
    else opts.enter?.(el, key);
  }
  for (const g of ghosts) spawnGhost(g.el, g.rect, opts.ghostLayer!, opts.ghostTarget?.(g.key, after));
}

/** 消えた要素のコピーをその場に置き、縮みながらフェードアウトさせる */
export function spawnGhost(source: HTMLElement, rect: DOMRect, layer: HTMLElement, target?: DOMRect): void {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.removeAttribute('data-sel');
  ghost.removeAttribute('hidden');
  ghost.classList.add('ghost');
  const layerRect = layer.getBoundingClientRect();
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${rect.left - layerRect.left + layer.scrollLeft}px`,
    top: `${rect.top - layerRect.top + layer.scrollTop}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
  });
  layer.appendChild(ghost);
  let anim: Animation;
  if (target && !reducedMotion.matches) {
    // 行き先 (まとまり) へ縮みながら吸い込まれる
    const dx = target.left - rect.left;
    const dy = target.top - rect.top;
    const s = Math.min(target.width / rect.width, target.height / rect.height);
    ghost.style.transformOrigin = '0 0';
    anim = animate(
      ghost,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      ],
      'reflow',
      { fill: 'forwards' },
    );
  } else {
    anim = fade(
      ghost,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.92)' },
      ],
      180,
    );
  }
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
}

/** 出現のアニメーション */
export function popIn(el: HTMLElement, delay = 0): void {
  if (reducedMotion.matches) {
    fade(el, [{ opacity: 0 }, { opacity: 1 }], 120);
    return;
  }
  animate(
    el,
    [
      { opacity: 0, transform: 'scale(0.94)' },
      { opacity: 1, transform: 'none' },
    ],
    'pop',
    { delay },
  );
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
