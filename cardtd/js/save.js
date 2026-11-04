/* カードTD — セーブデータ(この端末のブラウザに保存) */
(function (CTD) {
  'use strict';

  const KEY = 'cardtd.save.v1';

  function fresh() {
    const owned = {};
    for (const id of CTD.STARTER) owned[id] = (owned[id] || 0) + 1;
    return {
      gems: CTD.ECONOMY.startGems,
      owned,
      deck: CTD.STARTER.slice(),
      stages: {},          // { '1-1': { stars: 2, cleared: true } }
      seen: {},            // 図鑑で NEW を消すため
      settings: { sound: true, music: true, speed: 1 },
      stats: { wins: 0, losses: 0, packs: 0 },
      tutorialDone: false,
    };
  }

  CTD.save = {
    data: null,
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
      const f = fresh();
      if (!d || typeof d !== 'object') d = f;
      // 足りない項目を補う
      for (const k of Object.keys(f)) if (d[k] === undefined) d[k] = f[k];
      d.settings = Object.assign(f.settings, d.settings);
      d.deck = (d.deck || []).filter(id => CTD.CARDS[id]);
      if (!this.validDeck(d.deck, d.owned)) d.deck = f.deck.filter(id => (d.owned[id] || 0) > 0).slice(0, CTD.RULES.deckSize);
      this.data = d;
      return d;
    },
    write() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 保存できない環境でも遊べる */ }
    },
    reset() {
      this.data = fresh();
      this.write();
    },
    validDeck(deck, owned) {
      if (deck.length !== CTD.RULES.deckSize) return false;
      const n = {};
      for (const id of deck) {
        n[id] = (n[id] || 0) + 1;
        if (n[id] > CTD.RULES.maxCopies || n[id] > (owned[id] || 0)) return false;
      }
      return true;
    },
    unlocked(stageId) {
      const i = CTD.STAGES.findIndex(s => s.id === stageId);
      if (i <= 0) return true;
      const prev = CTD.STAGES[i - 1];
      return !!(this.data.stages[prev.id] && this.data.stages[prev.id].cleared);
    },
    totalStars() {
      return Object.values(this.data.stages).reduce((a, s) => a + (s.stars || 0), 0);
    },
  };
})(window.CTD);
