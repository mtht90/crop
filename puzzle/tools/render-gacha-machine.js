(async () => {
  const { THREE, R3 } = window; const { renderer, loader, RoomEnvironment } = R3;
  const g = await loader.loadAsync('/gacha/gumball_assembled.glb');
  const src = []; g.scene.traverse((o) => { if (o.isMesh) src.push(o); });
  const m = src[0]; m.updateMatrixWorld(true);
  const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const geo = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(rot).toNonIndexed();
  const P = geo.attributes.position.array;
  let y0 = 1e9, y1 = -1e9; for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
  const H = y1 - y0, band = (y) => ((y - y0) / H) * 40;
  const SC = { x: 33.2, y: y0 + (26.7 / 40) * H, z: -1.5 }; // sphere center
  const parts = { glass: [], lid: [], crank: [], chute: [], body: [] };
  for (let t = 0; t < P.length; t += 9) {
    const cx = (P[t] + P[t + 3] + P[t + 6]) / 3, cy = (P[t + 1] + P[t + 4] + P[t + 7]) / 3, cz = (P[t + 2] + P[t + 5] + P[t + 8]) / 3;
    const h = band(cy); const d = Math.hypot(cx - SC.x, cy - SC.y, cz - SC.z);
    let k = 'body';
    if (h >= 35.2) k = 'lid';
    else if (h > 18.3 && d > 52) k = 'glass';
    else if (cz > 59.5 && h > 6.5 && h < 16.5 && cx > 10 && cx < 57) k = 'crank';
    else if (h < 6 && cz > 70) k = 'chute';
    parts[k].push(...P.slice(t, t + 9));
  }
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const mats = {
    body: new THREE.MeshStandardMaterial({ color: 0xff5c95, roughness: 0.32, metalness: 0.05 }),
    lid: new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.25, metalness: 0.65 }),
    crank: new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.2, metalness: 0.75 }),
    chute: new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: 0.2, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.07, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 3, specularIntensity: 1, side: THREE.FrontSide }),
  };
  const meshes = {};
  for (const [k, arr] of Object.entries(parts)) {
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); gg.computeVertexNormals();
    meshes[k] = new THREE.Mesh(gg, mats[k]); scene.add(meshes[k]);
  }
  console.log(Object.entries(parts).map(([k, a]) => k + ':' + a.length / 9).join(' '));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7ab0, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-120, 260, 300); scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff0f8, 1.0); rim.position.set(200, 100, -200); scene.add(rim);
  const c = new THREE.Vector3(SC.x, y0 + H * 0.5, -1.5); const r = H * 0.56;
  const yaw = window.YAW ?? 0.32, pitch = 0.14;
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 1, 5000);
  cam.position.set(c.x + Math.sin(yaw) * 900 * Math.cos(pitch), c.y + Math.sin(pitch) * 900, c.z + Math.cos(yaw) * 900 * Math.cos(pitch)); cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const show = (ks) => { for (const k in meshes) meshes[k].visible = ks.includes(k); };
  const out = {};
  show(['body', 'lid', 'crank', 'chute', 'glass']); renderer.render(scene, cam); out.mc_all = renderer.domElement.toDataURL('image/png');
  show(['body', 'lid', 'chute']); renderer.render(scene, cam); out.mc_body = renderer.domElement.toDataURL('image/png');
  show(['crank']); renderer.render(scene, cam); out.mc_crank = renderer.domElement.toDataURL('image/png');
  show(['glass']); renderer.render(scene, cam); out.mc_glass = renderer.domElement.toDataURL('image/png');
  // inside of the dome (back faces), drawn behind the capsules
  const back = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.4, transparent: true, opacity: 0.18, side: THREE.BackSide });
  meshes.glass.material = back; renderer.render(scene, cam); out.mc_back = renderer.domElement.toDataURL('image/png');
  meshes.glass.material = mats.glass;
  // projected sphere center/radius and crank pivot in pixel space (1024px)
  const proj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [Math.round((v.x + 1) * 512), Math.round((1 - v.y) * 512)]; };
  const sc = proj(SC.x, SC.y, SC.z); const se = proj(SC.x + 63, SC.y, SC.z);
  // crank pivot: centroid of crank tris
  let px = 0, py = 0, pz = 0, n = 0; const A = parts.crank; for (let i = 0; i < A.length; i += 3) { px += A[i]; py += A[i + 1]; pz += A[i + 2]; n++; }
  console.log('META', JSON.stringify({ sphere: sc, radius: Math.hypot(se[0] - sc[0], se[1] - sc[1]), crank: proj(px / n, py / n, pz / n), chute: proj(SC.x, y0 + 0.08 * H, 70) }));
  // capsules: two-tone sphere with a seam, one per rarity
  show([]);
  const capCam = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 100); capCam.position.set(2.2, 3.2, 8); capCam.lookAt(0, 0, 0);
  const capCols = { N: 0x8fd8ff, R: 0x3f8cff, SR: 0xffc21f, SSR: null };
  for (const [rk, col] of Object.entries(capCols)) {
    const grp = new THREE.Group();
    const topG = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    let topM;
    if (col == null) {
      const cols = []; const p = topG.attributes.position; const cc = new THREE.Color();
      for (let i = 0; i < p.count; i++) { cc.setHSL(((Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2)) + 1) % 1, 0.85, 0.58); cols.push(cc.r, cc.g, cc.b); }
      topG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      topM = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, clearcoat: 1 });
    } else topM = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.92 });
    const bot = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xfaf7ff, roughness: 0.2, clearcoat: 1 }));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 12, 64), new THREE.MeshStandardMaterial({ color: 0x5a4a7a, roughness: 0.5 })); seam.rotation.x = Math.PI / 2;
    grp.add(new THREE.Mesh(topG, topM), bot, seam); grp.rotation.z = 0.35;
    scene.add(grp);
    renderer.setSize(192, 192); renderer.render(scene, capCam); out['cap_' + rk] = renderer.domElement.toDataURL('image/png'); renderer.setSize(1024, 1024);
    scene.remove(grp);
  }
  return out;
})()
