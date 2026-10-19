(async () => {
  const { THREE, R3 } = window; const { loader, GLTFExporter } = R3;
  const g = await loader.loadAsync('/gacha/gumball_assembled.glb');
  const src = []; g.scene.traverse((o) => { if (o.isMesh) src.push(o); });
  const m = src[0]; m.updateMatrixWorld(true);
  const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const geo = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(rot).toNonIndexed();
  const P = geo.attributes.position.array;
  let y0 = 1e9, y1 = -1e9; for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
  const H = y1 - y0, band = (y) => ((y - y0) / H) * 40;
  const SC = { x: 33.2, y: y0 + (26.7 / 40) * H, z: -1.5 }; const DR = 63.5;
  const parts = { glass: [], lid: [], crank: [], chute: [], body: [] };
  for (let t = 0; t < P.length; t += 9) {
    const cx = (P[t] + P[t + 3] + P[t + 6]) / 3, cy = (P[t + 1] + P[t + 4] + P[t + 7]) / 3, cz = (P[t + 2] + P[t + 5] + P[t + 8]) / 3;
    const h = band(cy); const d = Math.hypot(cx - SC.x, cy - SC.y, cz - SC.z);
    let k = 'body';
    if (h >= 35.2) k = 'lid';
    else if (h > 18.3 && d > 52) k = 'glass';
    else if (cz > 59.5 && h > 6.5 && h < 16.5 && cx > 10 && cx < 57) k = 'crank';
    else if (h < 6 && cz > 70) k = 'chute';
    for (let j = 0; j < 9; j += 3) parts[k].push((P[t + j] - SC.x) / DR, (P[t + j + 1] - SC.y) / DR, (P[t + j + 2] - SC.z) / DR);
  }
  // normalized: dome center at origin, dome radius 1
  const scene = new THREE.Scene(); const meta = {};
  for (const [k, arr] of Object.entries(parts)) {
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    if (k === 'crank') { gg.computeBoundingBox(); const c = gg.boundingBox.getCenter(new THREE.Vector3()); meta.crank = c.toArray(); gg.translate(-c.x, -c.y, -c.z); }
    gg.computeVertexNormals();
    const mesh = new THREE.Mesh(gg, new THREE.MeshStandardMaterial()); mesh.name = k;
    if (k === 'crank') mesh.position.fromArray(meta.crank);
    scene.add(mesh);
  }
  const bb = new THREE.Box3().setFromObject(scene); meta.box = [bb.min.toArray(), bb.max.toArray()];
  // chute exit: front-bottom of the chute part
  const ch = parts.chute; let zx = -1e9, ex = 0, ey = 0; for (let i = 0; i < ch.length; i += 3) if (ch[i + 2] > zx) { zx = ch[i + 2]; ex = ch[i]; ey = ch[i + 1]; }
  meta.chute = [ex, ey, zx];
  console.log('META', JSON.stringify(meta));
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  let bin = ''; const u8 = new Uint8Array(glb); for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return { machine_glb: 'data:x;base64,' + btoa(bin) };
})()
