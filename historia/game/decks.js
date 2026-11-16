// HISTORIA prebuilt decks and deck rules
(function () {
  'use strict';
  const { CARDS, TYPE_JA } = window.HE;
  const ALL = window.HISTORIA_CARDS;
  const RULES = { size: 60, maxCopies: 4 };
  const NAMES = { buyu: '天下布武', seiji: '天下人', chiryaku: '軍師の策', kagaku: '星と地図', shiso: '祈りと教え', tanken: '大航海', gekokujo: '下剋上', geijutsu: '茶の湯と美' };
  const SUPPORT_POOL = ['H01-170', 'H01-170', 'H01-166', 'H01-174', 'H01-161', 'H01-175', 'H01-176', 'H01-169', 'H01-172'];
  const GOODS_POOL = ['H01-181', 'H01-178', 'H01-183', 'H01-190', 'H01-182', 'H01-177'];
  const TYPE_TOOLS = { buyu: ['H01-187', 'H01-184'], seiji: ['H01-184', 'H01-189'], chiryaku: ['H01-187', 'H01-189'], kagaku: ['H01-184', 'H01-187'], shiso: ['H01-184', 'H01-189'], tanken: ['H01-187', 'H01-184'], gekokujo: ['H01-187', 'H01-189'], geijutsu: ['H01-189', 'H01-184'] };
  const TYPE_STADIUM = { buyu: 'H01-191', tanken: 'H01-195', gekokujo: 'H01-199', seiji: 'H01-197', chiryaku: 'H01-196', kagaku: 'H01-194', shiso: 'H01-198', geijutsu: 'H01-198' };

  function prebuilt(type) {
    const persons = ALL.filter(c => c.kind === 'person' && c.type === type);
    const list = [];
    const add = (id, n) => { for (let i = 0; i < n; i++) list.push(id); };
    // evolution lines first, then the strongest basics
    const lines = persons.filter(c => c.stage === 0 && persons.some(e => e.from === c.id));
    for (const b of lines) {
      add(b.id, 3);
      const s1 = persons.find(e => e.from === b.id); if (s1) add(s1.id, 2);
      const s2 = s1 && persons.find(e => e.from === s1.id); if (s2) add(s2.id, 2);
    }
    const singles = persons.filter(c => c.stage === 0 && !lines.includes(c)).sort((a, b) => (b.rar * 20 + b.hp) - (a.rar * 20 + a.hp));
    let i = 0; while (list.length < 22 && singles.length) { add(singles[i % singles.length].id, 1); i++; if (i > 60) break; }
    // trainers (16)
    SUPPORT_POOL.forEach(id => list.push(id));
    GOODS_POOL.slice(0, 4).forEach(id => list.push(id));
    TYPE_TOOLS[type].forEach(id => list.push(id));
    list.push(TYPE_STADIUM[type]);
    // energy to 60
    while (list.length < 60) list.push('E-' + type);
    return list.slice(0, 60);
  }
  const PREBUILT = {};
  for (const t of Object.keys(NAMES)) PREBUILT[t] = { id: 'pre-' + t, name: NAMES[t], type: t, cards: prebuilt(t) };

  function validate(cards) {
    const errs = [];
    if (cards.length !== RULES.size) errs.push(`デッキは${RULES.size}枚ちょうどにしてください（いま${cards.length}枚）。`);
    const cnt = {}; for (const id of cards) cnt[id] = (cnt[id] || 0) + 1;
    for (const [id, n] of Object.entries(cnt)) { const c = CARDS[id]; if (c && c.kind !== 'energy' && n > RULES.maxCopies) errs.push(`「${c.name}」は${RULES.maxCopies}枚までです。`); }
    if (!cards.some(id => CARDS[id] && CARDS[id].kind === 'person' && CARDS[id].stage === 0)) errs.push('たねの人物を1枚以上入れてください。');
    return errs;
  }
  window.HDECK = { PREBUILT, NAMES, RULES, validate };
})();
