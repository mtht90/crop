import { describe, expect, it } from 'vitest';
import { PlayerStore } from '../players';

describe('覇王の塔 ranking', () => {
  it('keeps each player’s best floor per tower, highest first, earlier first on a tie', () => {
    let now = 1000;
    const st = new PlayerStore(null, () => now);
    const a = st.create('アルフ', 'humans/knight').player;
    const b = st.create('ベルタ', 'humans/knight').player;
    const c = st.create('カイル', 'humans/knight').player;
    st.setTower(a, 'tower:sky:1482', 5);
    now = 2000;
    st.setTower(b, 'tower:sky:1482', 12);
    now = 3000;
    st.setTower(c, 'tower:sky:1482', 12);
    st.setTower(a, 'tower:sky:1482', 3); // lower: ignored
    st.setTower(c, 'tower:lava:1483', 1); // another tower
    expect(st.towerRanking('tower:sky:1482').map((p) => p.name)).toEqual(['ベルタ', 'アルフ']);
    expect(st.towerRanking('tower:lava:1483').map((p) => p.name)).toEqual(['カイル']);
  });
});
