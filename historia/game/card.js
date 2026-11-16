// HISTORIA card renderer (layered metal TCG frame, see design/historia-cards.html)
(function () {
  'use strict';
  const { CARDS, TYPE_JA, KIND_JA, attackText, trainerText } = window.HE;
  const KCOL = { support: 'k-support', goods: 'k-goods', tool: 'k-tool', stadium: 'k-stadium' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const ic = (t, cls) => `<span class="ic ${cls || ''}" style="--c:var(--t-${t});--i:var(--i-${t})"></span>`;
  const icK = (k) => `<span class="ic" style="--c:var(--${KCOL[k]});--i:var(--i-${k})"></span>`;
  const frame = (extra) => `<img class="L" src="parts/base.png" alt="">${extra || ''}<img class="L" src="parts/art-ring.png" alt=""><img class="L" src="parts/stat-l.png" alt=""><img class="L" src="parts/stat-r.png" alt=""><div class="tint"></div><div class="tint2"></div><img class="L" src="parts/title.png" alt="">`;

  function person(c, o) {
    const atks = c.atks.map(a => `<div class="atk"><span class="cost">${a.cost.map(t => ic(t)).join('')}</span><span class="an">${esc(a.name)}</span><span class="ad">${a.dmg || ''}</span></div>${attackText(a) ? `<div class="atk-t">${attackText(a)}</div>` : ''}`).join('');
    const evo = c.from && CARDS[c.from] ? `<span class="evo"><img src="art/${CARDS[c.from].art}" alt="" loading="lazy"></span>` : '';
    return `<div class="card r${c.rar}${o.cls || ''}" style="--tc:var(--t-${c.type})" data-id="${c.id}">
      ${frame(`<div class="art"><img src="art/${c.art}" alt="${esc(c.name)}" loading="lazy"></div>${c.rar >= 4 ? '<div class="shine"></div>' : ''}`)}
      <span class="stage">${['たね', '1進化', '2進化'][c.stage]}</span>${evo}
      <div class="name">${esc(c.name)}</div>
      <div class="hp"><div><small>HP</small>${c.hp}</div></div>
      <div class="tyb"><i style="--c:var(--t-${c.type});--i:var(--i-${c.type})"></i></div>
      <div class="body">${atks}
        <div class="stats"><div>弱点 ${ic(c.weak)}×2</div><div>抵抗力 —</div><div>にげる ${c.ret ? Array(c.ret).fill(ic('mushoku')).join('') : '—'}</div></div>
        <div class="flav">${esc(c.years.replace('-', '–'))}。${esc(c.flav.replace(/^[^。]*–[^。]*。/, ''))}</div></div>
      <img class="rank" src="parts/rank${Math.max(1, c.rar)}.png" alt="★${c.rar}">
      <div class="foot"><span>${c.id}</span><span>画：${esc(c.artist)} ・ ${esc(c.lic)}</span></div></div>`;
  }
  function trainer(c, o) {
    const rule = { support: 'サポートは自分の番に1回だけ使える。', goods: 'グッズは自分の番に何枚でも使える。', tool: 'どうぐは人物1人に1枚だけつけられる。', stadium: 'スタジアムは場に1枚。新しく出すと前のものはトラッシュ。' }[c.kind];
    return `<div class="card tr r${c.rar}${o.cls || ''}" style="--tc:var(--${KCOL[c.kind]})" data-id="${c.id}">
      ${frame(`<div class="art"><img src="art/${c.art}" alt="${esc(c.name)}" loading="lazy"></div>${c.rar >= 4 ? '<div class="shine"></div>' : ''}`)}
      <span class="kind">${KIND_JA[c.kind]}</span><div class="name">${esc(c.name)}</div>
      <div class="tyb tl"><i style="--c:var(--${KCOL[c.kind]});--i:var(--i-${c.kind})"></i></div>
      <div class="tyb"><i style="--c:var(--${KCOL[c.kind]});--i:var(--i-${c.kind})"></i></div>
      <div class="body"><div class="tr-t">${trainerText(c)}</div><div class="stats one"><div>${rule}</div></div><div class="flav">${esc(c.flav)}</div></div>
      <img class="rank" src="parts/rank${Math.max(1, c.rar)}.png" alt="★${c.rar}">
      <div class="foot"><span>${c.id}</span><span>画：${esc(c.artist)} ・ ${esc(c.lic)}</span></div></div>`;
  }
  function energy(c, o) {
    return `<div class="card en${o.cls || ''}" style="--tc:var(--t-${c.type})" data-id="${c.id}">
      ${frame(`<div class="enart" style="--c:var(--t-${c.type})"><i style="--i:var(--i-${c.type})"></i></div>`)}
      <span class="kind">基本エネルギー</span><div class="name">${esc(c.name)}</div>
      <div class="tyb tl"><i style="--c:var(--t-${c.type});--i:var(--i-${c.type})"></i></div><div class="tyb"><i style="--c:var(--t-${c.type});--i:var(--i-${c.type})"></i></div>
      <div class="body"><div class="tr-t" style="text-align:center">${TYPE_JA[c.type]}のワザに使う基本エネルギー。<br>デッキに何枚でも入れられる。</div></div>
      <div class="foot"><span>${c.id}</span><span>印：game-icons.net ・ CC BY 3.0</span></div></div>`;
  }
  function cardHTML(id, o) {
    o = o || {}; const c = CARDS[id]; if (!c) return '';
    if (c.kind === 'person') return person(c, o);
    if (c.kind === 'energy') return energy(c, o);
    return trainer(c, o);
  }
  const backHTML = (cls) => `<div class="cardback ${cls || ''}"></div>`;
  window.HCARD = { cardHTML, backHTML, ic, icK, esc };
})();
