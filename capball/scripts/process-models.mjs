// KayKit / Poly Haven のモデルをゲーム用に軽量化する。
// - キャラクター: アニメーションと武器・装飾を外し、体・頭・腕・脚だけ残す
// - アニメーション: 1体分の骨格から使うクリップだけを集めた anims.glb を作る
// - 街並み: KayKit City Builder Bits の .gltf をそのまま .glb にまとめる
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, resample, quantize } from '@gltf-transform/functions';

const KEEP_PARTS = /_(Body|Head|ArmLeft|ArmRight|LegLeft|LegRight)$/;
const CHARACTERS = ['Knight', 'Barbarian', 'Mage', 'Rogue'];
// ゲームで使うクリップ（KayKit Adventurers 同梱分）
const CLIPS = ['Idle', 'Running_A', 'Cheer', 'PickUp'];
// KayKit Character Animations 1.1 から追加で使うクリップ
const EXTRA = { 'Rig_Medium_MovementAdvanced.glb': ['Crouching'] };

function disposeAnimation(a) {
  for (const s of a.listSamplers()) s.dispose();
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

/**
 * 配信サイズを小さくする（頂点の量子化・不要なキーフレームの間引き）。
 * アーティファクトでは WebAssembly が使えないので、展開に wasm が要る圧縮（meshopt・Draco）は使わない。
 */
async function shrink(doc) {
  await doc.transform(resample({ tolerance: 0.0005 }), prune(), dedup(), quantize());
}

export async function processModels(cache, out) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  fs.mkdirSync(path.join(out, 'models'), { recursive: true });

  for (const name of CHARACTERS) {
    const doc = await io.read(path.join(cache, 'kaykit', `${name}.glb`));
    const root = doc.getRoot();
    for (const a of root.listAnimations()) disposeAnimation(a);
    for (const node of root.listNodes()) {
      if (node.getMesh() && !KEEP_PARTS.test(node.getName())) { node.getMesh().dispose(); node.dispose(); }
    }
    await doc.transform(prune(), dedup(), weld());
    await shrink(doc);
    await io.write(path.join(out, 'models', `${name.toLowerCase()}.glb`), doc);
  }

  // アニメーション集: Rogue の骨格からメッシュを除き、使うクリップだけ残す
  const anim = await io.read(path.join(cache, 'kaykit', 'Rogue.glb'));
  const ar = anim.getRoot();
  for (const a of ar.listAnimations()) if (!CLIPS.includes(a.getName())) disposeAnimation(a);
  for (const node of ar.listNodes()) if (node.getMesh()) { node.getMesh().dispose(); node.dispose(); }
  for (const s of ar.listSkins()) s.dispose();
  // 追加クリップを同じ骨格名へ移植する（KayKit の骨格は同名・同構造）
  const byName = new Map(ar.listNodes().map((n) => [n.getName(), n]));
  for (const [file, names] of Object.entries(EXTRA)) {
    const src = await io.read(path.join(cache, 'kaykit', file));
    for (const a of src.getRoot().listAnimations()) {
      if (!names.includes(a.getName())) continue;
      const clipName = ar.listAnimations().some((x) => x.getName() === a.getName()) ? a.getName() + '_B' : a.getName();
      const na = anim.createAnimation(clipName);
      for (const ch of a.listChannels()) {
        const target = byName.get(ch.getTargetNode()?.getName());
        const s = ch.getSampler();
        if (!target || !s) continue;
        const input = anim.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice());
        const output = anim.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice());
        const ns = anim.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
        na.addSampler(ns).addChannel(anim.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(ns));
      }
    }
  }
  const buf = ar.listBuffers()[0];
  for (const acc of ar.listAccessors()) acc.setBuffer(buf);
  for (const b of ar.listBuffers().slice(1)) b.dispose();
  await anim.transform(prune({ keepLeaves: true, keepAttributes: true }), dedup());
  await shrink(anim);
  await io.write(path.join(out, 'models', 'anims.glb'), anim);

  // 街並み（KayKit City Builder Bits）: 個別の .gltf を 1 つの .glb にまとめる
  const cityDir = path.join(cache, 'city');
  const city = new (await import('@gltf-transform/core')).Document();
  const cityBuf = city.createBuffer();
  const cityScene = city.createScene('city');
  const { mergeDocuments } = await import('@gltf-transform/functions');
  for (const f of fs.readdirSync(cityDir).filter((f) => f.endsWith('.gltf'))) {
    const d = await io.read(path.join(cityDir, f));
    const nodes = d.getRoot().listScenes()[0].listChildren();
    const holder = d.createNode(f.replace('.gltf', ''));
    for (const n of nodes) holder.addChild(n);
    d.getRoot().listScenes()[0].addChild(holder);
    const map = mergeDocuments(city, d);
    for (const s of d.getRoot().listScenes()) for (const n of s.listChildren()) cityScene.addChild(map.get(n));
  }
  for (const s of city.getRoot().listScenes()) if (s !== cityScene) s.dispose();
  for (const acc of city.getRoot().listAccessors()) acc.setBuffer(cityBuf);
  for (const b of city.getRoot().listBuffers()) if (b !== cityBuf) b.dispose();
  await city.transform(dedup(), prune());
  await shrink(city);
  await io.write(path.join(out, 'models', 'city.glb'), city);

  // バット（Poly Haven）
  const bat = await io.read(path.join(cache, 'polyhaven', 'bat', 'baseball_bat_1k.gltf'));
  // 画面上では小さいので、木目の色テクスチャだけ残して軽くする
  // 形だけ使う（色はゲーム側でプラスチックの黄色に塗る）のでテクスチャは捨てる
  for (const m of bat.getRoot().listMaterials()) m.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
  await bat.transform(prune());
  await shrink(bat);
  await io.write(path.join(out, 'models', 'bat.glb'), bat);

  for (const f of fs.readdirSync(path.join(out, 'models'))) console.log('  →', f, `${(fs.statSync(path.join(out, 'models', f)).size / 1024).toFixed(0)}KB`);
}
