/* Lynq stickers: an original round blue mascot, drawn as inline SVG. */
(() => {
  'use strict';

  const EYES = {
    dot: '<circle cx="47" cy="58" r="5.2" fill="#14254d"/><circle cx="73" cy="58" r="5.2" fill="#14254d"/><circle cx="48.6" cy="56.2" r="1.7" fill="#fff"/><circle cx="74.6" cy="56.2" r="1.7" fill="#fff"/>',
    happy: '<path d="M41 59q6-7 12 0M67 59q6-7 12 0" fill="none" stroke="#14254d" stroke-width="3.6" stroke-linecap="round"/>',
    closed: '<path d="M41 57q6 6 12 0M67 57q6 6 12 0" fill="none" stroke="#14254d" stroke-width="3.6" stroke-linecap="round"/>',
    big: '<ellipse cx="47" cy="57" rx="7" ry="8.4" fill="#14254d"/><ellipse cx="73" cy="57" rx="7" ry="8.4" fill="#14254d"/><circle cx="49.4" cy="54" r="2.8" fill="#fff"/><circle cx="75.4" cy="54" r="2.8" fill="#fff"/>',
    heart: '<path d="M47 64l-7-7a4.2 4.2 0 017-4.6 4.2 4.2 0 017 4.6z" fill="#3f73f6"/><path d="M73 64l-7-7a4.2 4.2 0 017-4.6 4.2 4.2 0 017 4.6z" fill="#3f73f6"/>',
    squint: '<path d="M41 54l10 4-10 4M79 54l-10 4 10 4" fill="none" stroke="#14254d" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
    sad: '<path d="M41 55q6 3 12 0M67 55q6 3 12 0" fill="none" stroke="#14254d" stroke-width="3.4" stroke-linecap="round"/><circle cx="47" cy="61" r="4.4" fill="#14254d"/><circle cx="73" cy="61" r="4.4" fill="#14254d"/>',
    star: '<path d="M47 50l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8zM73 50l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="#ffd34d" stroke="#14254d" stroke-width="1.6" stroke-linejoin="round"/>',
  };
  const MOUTHS = {
    smile: '<path d="M54 69q6 6 12 0" fill="none" stroke="#14254d" stroke-width="3.2" stroke-linecap="round"/>',
    open: '<path d="M52 68q8 12 16 0z" fill="#14254d"/><path d="M55 72q5 4 10 0" fill="#7fb0ff"/>',
    o: '<ellipse cx="60" cy="72" rx="4.6" ry="5.6" fill="#14254d"/>',
    wave: '<path d="M53 72q3.5-4 7 0t7 0" fill="none" stroke="#14254d" stroke-width="3.2" stroke-linecap="round"/>',
    flat: '<path d="M55 71h10" stroke="#14254d" stroke-width="3.2" stroke-linecap="round"/>',
    cat: '<path d="M53 69q3.5 4 7 0q3.5 4 7 0" fill="none" stroke="#14254d" stroke-width="3.2" stroke-linecap="round"/>',
  };

  const EXTRAS = {
    wave: '<g class="st-arm"><ellipse cx="98" cy="50" rx="8" ry="10" fill="url(#stb)" stroke="#2b56c9" stroke-width="2.4"/></g><path d="M104 30q5 3 6 9M108 24q7 5 8 14" fill="none" stroke="#5c9dff" stroke-width="2.6" stroke-linecap="round"/>',
    ok: '<g class="st-pop"><circle cx="100" cy="36" r="13" fill="none" stroke="#3f73f6" stroke-width="5"/></g>',
    bow: '<path d="M16 40q-4 6 0 12M104 40q4 6 0 12" fill="none" stroke="#5c9dff" stroke-width="2.6" stroke-linecap="round"/>',
    sparkle: '<g class="st-twinkle"><path d="M20 30l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4zM100 22l2 4.8 4.8 2-4.8 2-2 4.8-2-4.8-4.8-2 4.8-2z" fill="#ffd34d"/><circle cx="104" cy="52" r="2.6" fill="#5c9dff"/><circle cx="14" cy="58" r="2.2" fill="#5c9dff"/></g>',
    hearts: '<g class="st-float"><path d="M98 34l-8-8a4.8 4.8 0 018-5.3 4.8 4.8 0 018 5.3z" fill="#5c9dff"/><path d="M22 28l-6-6a3.6 3.6 0 016-4 3.6 3.6 0 016 4z" fill="#3f73f6"/></g>',
    lol: '<g class="st-shake"><text x="88" y="34" font-size="15" font-weight="800" fill="#3f73f6" font-family="sans-serif">w</text><text x="100" y="24" font-size="12" font-weight="800" fill="#5c9dff" font-family="sans-serif">w</text></g>',
    tears: '<g class="st-drip"><path d="M41 66q-3 8 0 12q3-4 0-12zM79 66q-3 8 0 12q3-4 0-12z" fill="#7fc4ff"/></g>',
    sweat: '<g class="st-drip"><path d="M92 36q-5 8-2 12q5 2 6-3q0-4-4-9z" fill="#7fc4ff" stroke="#3f73f6" stroke-width="1.4"/></g>',
    wow: '<g class="st-pop"><path d="M100 18v14M100 38v3" stroke="#3f73f6" stroke-width="5" stroke-linecap="round"/><path d="M88 26l4 8M112 26l-4 8" stroke="#5c9dff" stroke-width="3" stroke-linecap="round"/></g>',
    zzz: '<g class="st-float"><text x="86" y="36" font-size="14" font-weight="800" fill="#5c9dff" font-family="sans-serif">z</text><text x="96" y="26" font-size="18" font-weight="800" fill="#3f73f6" font-family="sans-serif">Z</text></g><path d="M20 26a9 9 0 1013 11 7 7 0 01-13-11z" fill="#ffd34d"/>',
    gj: '<g class="st-twinkle"><path d="M100 14l4 8.4 9.2 1.3-6.6 6.5 1.6 9.1-8.2-4.3-8.2 4.3 1.6-9.1-6.6-6.5 9.2-1.3z" fill="#ffd34d" stroke="#2b56c9" stroke-width="1.8" stroke-linejoin="round"/></g>',
    please: '<g class="st-pray"><path d="M52 92q8-16 8-22q0 6 8 22z" fill="url(#stb)" stroke="#2b56c9" stroke-width="2.4" stroke-linejoin="round"/></g><path d="M18 34l3 5M102 34l-3 5" stroke="#5c9dff" stroke-width="2.6" stroke-linecap="round"/>',
  };

  const DEFS = {
    hi: { eyes: 'dot', mouth: 'open', extra: 'wave', label: 'やっほー', anim: 'hop' },
    ok: { eyes: 'happy', mouth: 'smile', extra: 'ok', label: 'りょうかい', anim: 'nod' },
    thanks: { eyes: 'closed', mouth: 'cat', extra: 'bow', label: 'ありがとう', anim: 'bow' },
    yay: { eyes: 'happy', mouth: 'open', extra: 'sparkle', label: 'わーい', anim: 'jump' },
    love: { eyes: 'heart', mouth: 'smile', extra: 'hearts', label: 'すき', anim: 'beat' },
    lol: { eyes: 'squint', mouth: 'open', extra: 'lol', label: 'わらった', anim: 'shake' },
    cry: { eyes: 'sad', mouth: 'wave', extra: 'tears', label: 'えーん', anim: 'sob' },
    sorry: { eyes: 'sad', mouth: 'flat', extra: 'sweat', label: 'ごめんね', anim: 'bow' },
    wow: { eyes: 'big', mouth: 'o', extra: 'wow', label: 'えっ！？', anim: 'pop' },
    sleep: { eyes: 'closed', mouth: 'flat', extra: 'zzz', label: 'おやすみ', anim: 'breathe' },
    gj: { eyes: 'star', mouth: 'open', extra: 'gj', label: 'えらい！', anim: 'jump' },
    please: { eyes: 'big', mouth: 'cat', extra: 'please', label: 'おねがい', anim: 'nod' },
  };

  let seq = 0;
  function svg(id) {
    const d = DEFS[id];
    if (!d) return '';
    const g = `stb${++seq}`;
    const body = `<path class="st-body" d="M60 20c22 0 38 15 38 38 0 22-14 36-38 36S22 80 22 58c0-23 16-38 38-38z" fill="url(#${g})" stroke="#2b56c9" stroke-width="2.6"/>`
      + '<path d="M38 32q8-7 18-8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>'
      + '<ellipse cx="38" cy="70" rx="6" ry="3.6" fill="#a9c8ff" opacity=".9"/><ellipse cx="82" cy="70" rx="6" ry="3.6" fill="#a9c8ff" opacity=".9"/>';
    const label = `<g class="st-label"><rect x="18" y="96" width="84" height="20" rx="10" fill="#fff" stroke="#3f73f6" stroke-width="2.2"/><text x="60" y="110.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="#2b56c9" font-family="-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif">${d.label}</text></g>`;
    return `<svg class="sticker-svg st-${d.anim}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${d.label}">`
      + `<defs><radialGradient id="${g}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#cfe2ff"/><stop offset=".55" stop-color="#7fb0ff"/><stop offset="1" stop-color="#4f84ff"/></radialGradient></defs>`
      + `<g class="st-figure">${body}${EYES[d.eyes]}${MOUTHS[d.mouth]}${EXTRAS[d.extra].replace(/url\(#stb\)/g, `url(#${g})`)}</g>${label}</svg>`;
  }

  window.LynqStickers = { ids: Object.keys(DEFS), svg, label: (id) => DEFS[id]?.label || 'スタンプ' };
})();
