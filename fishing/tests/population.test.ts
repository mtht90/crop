import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FishPopulation } from '../src/fishing/population';
import { Rng } from '../src/sim/rng';
import { DOCK } from '../src/world/shape';

const cond = { time: 'day', weather: 'sunny', season: 'spring' } as const;
// 桟橋の先（水深 3〜4m）
const X = DOCK.xEnd - 5;

function setup(seed = 1) {
  const pop = new FishPopulation(new THREE.Scene(), new Rng(seed), () => {});
  pop.debugPlace('largemouth', X, 0, 1, 35);
  pop.debugPlace('largemouth', X - 6, 0, 1, 35);
  const [near, far] = pop.fish.slice(-2);
  for (const a of [near, far]) a.state = 'cruise';
  return { pop, near, far };
}

const still = (x: number) => ({ x, z: 0, speed: 0, onDock: true });

describe('魚の警戒', () => {
  it('静かにしていれば逃げないが、走って近づくと逃げる', () => {
    const { pop, near } = setup();
    pop.update(0.1, still(X + 3), cond, 0);
    expect(near.state).not.toBe('flee');
    pop.update(0.1, { x: X + 3, z: 0, speed: 6, onDock: true }, cond, 0.1);
    expect(near.state).toBe('flee');
    expect(near.alarm).toBeGreaterThan(0.5);
  });

  it('真上に重いルアーを落とすと散り、少し離れた捕食魚は寄ってくる', () => {
    const { pop, near, far } = setup(2);
    pop.splash(X, 0, 0.65, 'lure_jig');
    expect(near.state).toBe('flee');
    // 6m 離れた個体は逃げずに様子を見に来ることがある（確率なので何度か試す）
    let inspected = far.state === 'inspect';
    for (let s = 3; s < 20 && !inspected; s++) {
      const t = setup(s);
      t.pop.splash(X, 0, 0.65, 'lure_jig');
      inspected = t.far.state === 'inspect';
    }
    expect(inspected).toBe(true);
  });

  it('警戒した魚はアタリの候補にならない', () => {
    const { pop, near } = setup(4);
    expect(pop.candidates(new THREE.Vector3(X, -1, 0), 5)).toContain(near);
    pop.splash(X, 0, 0.65);
    expect(pop.candidates(new THREE.Vector3(X, -1, 0), 5)).not.toContain(near);
  });

  it('釣り続けた場所はスレ、時間がたつと戻る', () => {
    const { pop } = setup(5);
    expect(pop.pressureAt(X, 0)).toBe(0);
    pop.addPressure(X, 0, 1);
    pop.addPressure(X, 0, 1);
    expect(pop.pressureAt(X, 0)).toBeGreaterThan(1.9);
    // 隣の区画にも少し影響する
    expect(pop.pressureAt(X + 8, 0)).toBeGreaterThan(0.5);
    for (let i = 0; i < 600; i++) pop.update(1, still(X + 3), cond, i);
    expect(pop.pressureAt(X, 0)).toBeLessThan(0.6);
  });

  it('同じ場所で同じルアーを投げ続けると見慣れられる', () => {
    const { pop } = setup(6);
    for (let i = 0; i < 4; i++) pop.splash(X, 0, 0.3, 'lure_minnow');
    expect(pop.lureFatigue(X, 0, 'lure_minnow')).toBeGreaterThan(3.9);
    expect(pop.lureFatigue(X, 0, 'lure_worm')).toBe(0);
  });

  it('大きい個体ほど警戒心が強い', () => {
    const pop = new FishPopulation(new THREE.Scene(), new Rng(7), () => {});
    pop.debugPlace('largemouth', X, 0, 1, 30);
    pop.debugPlace('largemouth', X, 2, 1, 60);
    const [small, big] = pop.fish;
    expect(big.wary).toBeGreaterThan(small.wary + 0.3);
  });
});
