import * as THREE from 'three';

export const ROAD_HALF = 5;
const CX = 40, CZ = -170, HALF = 480, CH = 150;     // terrain centre, half-size, vegetation chunk size (m)
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const mt = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

// Merge parts into one flat-shaded geometry with baked vertex colours (+ height shading, jitter for organic shapes)
function bake(parts, H) {
  const P = [], C = [], col = new THREE.Color();
  for (const [g0, hex, m, j] of parts) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()).applyMatrix4(m), a = g.attributes.position.array;
    if (j) for (let k = 0; k < a.length; k += 3) { const s = Math.sin(a[k] * 12.9 + a[k + 1] * 78.2 + a[k + 2] * 37.7) * j; a[k] += s; a[k + 1] += s * 0.6; a[k + 2] += s * 0.8; }
    col.set(hex);
    for (let k = 0; k < a.length; k += 3) { const sh = 0.65 + 0.35 * clamp(a[k + 1] / H, 0, 1); P.push(a[k], a[k + 1], a[k + 2]); C.push(col.r * sh, col.g * sh, col.b * sh); }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  o.computeVertexNormals(); return o;
}

function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const signTex = (lines, bg, fg) => canvasTex(256, 128, (x) => {
  x.fillStyle = bg; x.fillRect(0, 0, 256, 128); x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(5, 5, 246, 118);
  x.fillStyle = fg; x.textAlign = 'center'; x.font = 'bold 30px Arial'; lines.forEach((t, k) => x.fillText(t, 128, 54 + k * 40));
});
const asphaltTex = () => canvasTex(128, 128, (x, s) => {
  x.fillStyle = '#464649'; x.fillRect(0, 0, s, s);
  const id = x.getImageData(0, 0, s, s);
  for (let i = 0; i < id.data.length; i += 4) { const v = (Math.random() - 0.5) * 36; id.data[i] += v; id.data[i + 1] += v; id.data[i + 2] += v; }
  x.putImageData(id, 0, 0);
  x.globalAlpha = 0.12; x.fillStyle = '#1c1c1e'; for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 25, 6 + Math.random() * 12, Math.random() * 3, 0, 6.3); x.fill(); }
  x.globalAlpha = 0.45; x.strokeStyle = '#2a2a2c'; x.lineWidth = 1;
  for (let k = 0; k < 3; k++) { x.beginPath(); let px = Math.random() * s, py = Math.random() * s; x.moveTo(px, py); for (let n = 0; n < 5; n++) { px += (Math.random() - 0.5) * 30; py += (Math.random() - 0.3) * 20; x.lineTo(px, py); } x.stroke(); }
}, true);

export function createWorld(scene, low) {
  // ---- Highway centre line: closed hill loop that climbs and descends ----
  const curve = new THREE.CatmullRomCurve3(
    [[0, 0, 0], [110, 8, -50], [230, 26, -130], [250, 48, -250], [150, 62, -340],
     [10, 55, -330], [-110, 38, -260], [-160, 20, -150], [-110, 6, -50]].map((p) => new THREE.Vector3(...p)), true, 'centripetal');
  const N = 400;
  const pts = curve.getSpacedPoints(N).slice(0, N);
  const tan = pts.map((p, i) => { const q = pts[(i + 1) % N]; return new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize(); });
  const cd = [0]; for (let i = 1; i <= N; i++) { const a = pts[i - 1], b = pts[i % N]; cd.push(cd[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)); }

  const noise = (x, z) => 0.55 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013) + 0.3 * Math.sin(x * 0.027 + z * 0.019) + 0.1 * Math.sin(z * 0.05 - x * 0.04)
    + 0.22 * (1 - Math.abs(Math.sin(x * 0.021 + z * 0.009) * Math.cos(z * 0.017 - x * 0.006))) - 0.11;   // last term = ridges
  const _n = { i: 0, d: 0 };
  function nearest(x, z) {
    let b = 0, bd = 1e18;
    for (let i = 0; i < N; i++) { const dx = x - pts[i].x, dz = z - pts[i].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; b = i; } }
    _n.i = b; _n.d = Math.sqrt(bd); return _n;
  }
  const hn = (n, x, z) => { const s = sstep(8, 70, n.d); return pts[n.i].y + noise(x, z) * 50 * s * s; };
  const heightAt = (x, z) => hn(nearest(x, z), x, z);
  const loc = (i, off, al = 0) => [pts[i].x + tan[i].z * off + tan[i].x * al, pts[i].z - tan[i].x * off + tan[i].z * al];

  // ---- Terrain: forest/grass patches, dusty shoulders, rock on steep slopes and high ground ----
  const seg = low ? 110 : 160;
  const tg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg).rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, base = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + CX, z = pos.getZ(i) + CZ, n = nearest(x, z), h = hn(n, x, z) - 0.3;
    pos.setXYZ(i, x, h, z);
    const rel = h - pts[n.i].y, f = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.04), nz = 0.5 + 0.5 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
    let r = 0.04 + 0.07 * f + 0.02 * nz, g = 0.17 + 0.15 * f + 0.03 * nz, b = 0.035 + 0.02 * f;
    if (n.d < 14) { const k = 1 - n.d / 14; r += 0.25 * k; g += 0.12 * k; b += 0.05 * k; }
    if (rel > 30) { const k = Math.min(1, (rel - 30) / 30); r += (0.3 - r) * k; g += (0.28 - g) * k; b += (0.24 - b) * k; }
    base.set([r, g, b], i * 3);
  }
  tg.computeVertexNormals();
  const col = new Float32Array(pos.count * 3), nor = tg.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const k = clamp((0.84 - nor.getY(i)) / 0.22, 0, 1), s = base.subarray(i * 3, i * 3 + 3);
    c.setRGB(s[0] + (0.32 - s[0]) * k, s[1] + (0.29 - s[1]) * k, s[2] + (0.25 - s[2]) * k); col.set([c.r, c.g, c.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = !low; scene.add(terrain);

  // ---- Distant Western Ghats ridges (unfogged, hazy colours = atmospheric depth) ----
  const hills = (R, b0, amp, color, ph) => {
    const g = new THREE.CylinderGeometry(R, R, 1, 96, 1, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, p.getY(i) > 0 ? b0 + amp * (0.5 + 0.5 * (Math.sin(a * 5 + ph) * 0.5 + Math.sin(a * 11 + ph * 2) * 0.3 + Math.sin(a * 23 + ph * 3) * 0.2)) : -60);
    }
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.BackSide }));
    m.position.set(CX, 0, CZ); scene.add(m);
  };
  hills(1000, 90, 130, 0x7f9bad, 0.7); hills(1300, 140, 190, 0xa6bdca, 2.1);

  // ---- Instancing helper ----
  const dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ';
  function inst(geo, mat, items, parent = scene, cull = false) {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(b.rx || 0, b.r || 0, 0); dummy.scale.set(b.sx ?? 1, b.sy ?? 1, b.sz ?? 1);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (b.c) m.setColorAt(i, b.c);
    });
    m.frustumCulled = cull; m.castShadow = m.receiveShadow = !low; parent.add(m); return m;
  }
  const unit = new THREE.BoxGeometry(1, 1, 1), lam = () => new THREE.MeshLambertMaterial();
  const boxes = (items) => inst(unit, lam(), items);
  const K = (h) => new THREE.Color(h);

  // ---- Road: textured asphalt + markings (ribbons following the centre line) ----
  const asphalt = new THREE.MeshLambertMaterial({ map: asphaltTex(), side: THREE.DoubleSide });
  function ribbon(off, w, y, skip, mat, tile) {
    const P = [], I = [], UV = []; let k = 0;
    for (let i = 0; i < N; i++) {
      if (skip && i % skip >= skip / 2) continue;
      const j = (i + 1) % N, a = pts[i], b = pts[j], ta = tan[i], tb = tan[j], lo = off - w / 2, hi = off + w / 2;
      P.push(a.x + ta.z * lo, a.y + y, a.z - ta.x * lo, a.x + ta.z * hi, a.y + y, a.z - ta.x * hi,
             b.x + tb.z * lo, b.y + y, b.z - tb.x * lo, b.x + tb.z * hi, b.y + y, b.z - tb.x * hi);
      if (tile) { const v0 = cd[i] / 5, v1 = cd[i + 1] / 5; UV.push(0, v0, 2, v0, 0, v1, 2, v1); }
      I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); k += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (tile) g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = !low; scene.add(m);
  }
  const paintMat = (color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const white = paintMat(0xf2f2f2), black = paintMat(0x111111);
  ribbon(0, ROAD_HALF * 2, 0.02, 0, asphalt, true);
  ribbon(0, 0.18, 0.06, 8, white);             // dashed centre line
  ribbon(4.5, 0.15, 0.06, 0, white);           // edge lines
  ribbon(-4.5, 0.15, 0.06, 0, white);
  for (const s of [5.4, -5.4]) { ribbon(s, 0.5, 0.05, 0, black); ribbon(s, 0.5, 0.06, 6, white); }   // black/white kerb stones

  // ---- Road reflectors (cat's-eyes), guardrails on drop-off sides, signs ----
  const studs = [], rails = [], posts = [], rpost = [];
  const steel = K(0xaab1b6), dark = K(0x3a3d40);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a = pts[i], b = pts[j], t = tan[i], r = Math.atan2(t.x, t.z);
    if (i % 3 === 0) for (const s of [4, -4]) { const [x, z] = loc(i, s); studs.push({ x, y: a.y + 0.09, z, r, sx: 0.16, sy: 0.07, sz: 0.16 }); }
    for (const side of [-1, 1]) {
      const [vx, vz] = loc(i, side * 45); if (noise(vx, vz) > -0.1) continue;     // only where terrain drops away
      const o = side * (ROAD_HALF + 0.9), hd = Math.hypot(b.x - a.x, b.z - a.z);
      rails.push({ x: (a.x + b.x) / 2 + t.z * o, y: (a.y + b.y) / 2 + 0.55, z: (a.z + b.z) / 2 - t.x * o, r, rx: -Math.atan2(b.y - a.y, hd), sx: 0.1, sy: 0.3, sz: hd + 0.1, c: steel });
      const [px, pz] = loc(i, o); posts.push({ x: px, y: a.y + 0.2, z: pz, sx: 0.12, sy: 0.9, sz: 0.12, c: dark });
      if (i % 2 === 0) rpost.push({ x: px, y: a.y + 0.72, z: pz, r, sx: 0.16, sy: 0.09, sz: 0.16 });
    }
  }
  inst(unit, new THREE.MeshBasicMaterial({ color: 0xffd23a }), studs);
  if (rails.length) { boxes(rails); boxes(posts); inst(unit, new THREE.MeshBasicMaterial({ color: 0xff3b1e }), rpost); }

  const infoTex = [signTex(['MYSURU', '85 km'], '#0c6b3c', '#fff'), signTex(['GHAT SECTION', 'DRIVE SLOW'], '#f2c200', '#111'),
                   signTex(['VILLAGE', 'AHEAD 30'], '#0c6b3c', '#fff'), signTex(['SHARP CURVES', 'NEXT 3 km'], '#f2c200', '#111')];
  const stripeTex = canvasTex(128, 96, (x, w, h) => { x.fillStyle = '#f2c200'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; for (let k = -h; k < w; k += 36) { x.beginPath(); x.moveTo(k, h); x.lineTo(k + 18, h); x.lineTo(k + 18 + h, 0); x.lineTo(k + h, 0); x.fill(); } x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); });
  const signGroups = [[], [], [], []], chev = [], signPosts = [];
  const faceBack = (i) => Math.atan2(-tan[i].x, -tan[i].z);   // sign normal points back at oncoming traffic
  for (let i = 20, n = 0; i < N; i += 36, n++) {
    const side = n % 2 ? -1 : 1, off = side * (ROAD_HALF + 3), [x, z] = loc(i, off), y = pts[i].y;
    signGroups[n % 4].push({ x, y: y + 3.4, z, r: faceBack(i) });
    for (const al of [-1.2, 1.2]) { const [px, pz] = loc(i, off, al); signPosts.push({ x: px, y: y + 1.6, z: pz, sx: 0.1, sy: 3.2, sz: 0.1, c: K(0x777b7e) }); }
  }
  for (let i = 0; i < N; i += 6) {
    if (Math.acos(clamp(tan[i].dot(tan[(i + 12) % N]), -1, 1)) < 0.5) continue;
    for (const side of [-1, 1]) { const off = side * (ROAD_HALF + 2.2), [x, z] = loc(i, off), y = pts[i].y;
      chev.push({ x, y: y + 1.9, z, r: faceBack(i) }); signPosts.push({ x, y: y + 0.9, z, sx: 0.08, sy: 1.8, sz: 0.08, c: K(0x777b7e) }); }
  }
  const sm = (map, w, h, items) => items.length && inst(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }), items);
  signGroups.forEach((g, k) => sm(infoTex[k], 3.2, 1.6, g)); sm(stripeTex, 1.3, 1, chev);
  if (signPosts.length) boxes(signPosts);

  // ---- Village near the start: shops, houses with gabled tile roofs, windows, doors, balconies, temple ----
  const R = rng(11), pal = [0xf2c14e, 0x3fb8af, 0xe86a92, 0xf4f1de, 0xe07a5f, 0x81b29a, 0x7aa7d9, 0xd9a066];
  const roofCol = [0xb5532e, 0xa84a2a, 0x8a8f94, 0xc0622f];
  const B = [], details = [], roofs = [];
  const gs = new THREE.Shape(); gs.moveTo(-0.5, 0); gs.lineTo(0.5, 0); gs.lineTo(0, 1); gs.closePath();
  const gable = new THREE.ExtrudeGeometry(gs, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  const pick = (a) => a[(R() * a.length) | 0];
  const building = (i, side, dx, h, dz, color) => {
    const t = tan[i], off = side * (ROAD_HALF + 3 + dx / 2), [x, z] = loc(i, off), gy = heightAt(x, z), r = Math.atan2(t.x, t.z);
    B.push({ x, y: gy + h / 2 - 0.5, z, r, sx: dx, sy: h + 1, sz: dz, c: K(color) });
    if (R() < 0.65) roofs.push({ x, y: gy + h, z, r, sx: dx + 0.8, sy: 1.3 + R() * 0.8, sz: dz + 0.8, c: K(pick(roofCol)) });
    else B.push({ x, y: gy + h + 0.15, z, r, sx: dx + 0.4, sy: 0.3, sz: dz + 0.4, c: K(0x8d8a84) });   // flat concrete roof
    const face = off - side * dx / 2, d = (o, al, y, sx, sy, sz, c) => { const [fx, fz] = loc(i, o, al); details.push({ x: fx, y: gy + y, z: fz, r, sx, sy, sz, c: K(c) }); };
    d(face - side * 0.04, -dz * 0.25, 1.0, 0.12, 2.0, 1.0, pick([0x5b3a1e, 0x1f4e79, 0x2f6b4a]));  // door
    d(face - side * 0.04, dz * 0.22, 1.7, 0.12, 1.0, 0.9, 0x1d2b36);                                 // window
    if (h > 5) {
      d(face - side * 0.04, -dz * 0.25, 4.6, 0.12, 1.0, 0.9, 0x1d2b36); d(face - side * 0.04, dz * 0.25, 4.6, 0.12, 1.0, 0.9, 0x1d2b36);
      d(face - side * 0.6, 0, 3.3, 1.2, 0.15, dz * 0.6, 0x8d8a84); d(face - side * 1.15, 0, 3.85, 0.06, 0.7, dz * 0.6, 0x2f4f3a);   // balcony + railing
    } else d(face - side * 0.7, 0, 2.7, 1.5, 0.1, dz, pick(pal));                                     // shop awning
  };
  for (let i = 6; i < 75; i += 5) for (const s of [-1, 1]) if (R() < 0.88) building(i, s, 5 + R() * 2, R() < 0.45 ? 6.4 : 3.4, 5 + R() * 3, pick(pal));
  { // temple: sandstone base with stacked saffron tiers
    const i = 82, [x, z] = loc(i, 22), gy = heightAt(x, z), r = Math.atan2(tan[i].x, tan[i].z), sand = K(0xe8d2a6), saf = K(0xff8a1f);
    B.push({ x, y: gy + 2, z, r, sx: 12, sy: 5, sz: 12, c: sand });
    [[8, 3], [6, 3], [4.2, 3], [2.6, 3]].forEach(([s, h], k) => B.push({ x, y: gy + 6 + k * 3, z, r, sx: s, sy: h, sz: s, c: k % 2 ? sand : saf }));
  }
  boxes(B); boxes(details); inst(gable, lam(), roofs);

  // ---- Vegetation: varied trees (broadleaf + coconut palm), bushes, rocks, grass — in culled chunks ----
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d), cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s);
  const crown = [[ico(2.4, 1), 0x2f6a2a, mt(0, 5.6, 0, 0, 0, 0, 1.15, 0.9, 1.15), 0.35], [ico(1.9, 1), 0x3a7a30, mt(1.6, 4.8, 0.7), 0.3], [ico(1.8, 1), 0x2a5f27, mt(-1.4, 5.0, -0.8), 0.3]];
  if (!low) crown.push([ico(1.5, 1), 0x377533, mt(0.2, 7.2, 0.3), 0.25]);
  const frond = new THREE.BoxGeometry(0.55, 0.05, 4.2).translate(0, 0, 2.1);
  const palmParts = [[cyl(0.16, 0.26, 9, 6), 0x6b5a3e, mt(0, 4.5, 0), 0.03]];
  for (let k = 0; k < 8; k++) palmParts.push([frond, 0x3f7d2c, mt(0, 9, 0, 0.55, k * Math.PI / 4), 0.1]);
  const grassBlade = new THREE.ConeGeometry(0.09, 0.9, 3, 1, true), tuft = [];
  for (let k = 0; k < 5; k++) tuft.push([grassBlade, 0x6a8f3a, mt(Math.sin(k * 2.4) * 0.18, 0.45, Math.cos(k * 2.4) * 0.18, Math.sin(k * 1.7) * 0.35, k, Math.cos(k) * 0.35), 0]);
  const geos = {
    broad: bake([[cyl(0.22, 0.38, 4.5, 6), 0x5a3d26, mt(0, 2.25, 0), 0.02], ...crown], 8),
    palm: bake(palmParts, 11),
    bush: bake([[ico(0.9, 0), 0x35692a, mt(0, 0.6, 0, 0, 0, 0, 1, 0.8, 1), 0.15], [ico(0.7, 0), 0x3f7a30, mt(0.7, 0.45, 0.3), 0.12]], 1.4),
    rock: bake([[ico(1, 0), 0x77746d, mt(0, 0.4, 0, 0, 0, 0, 1.2, 0.7, 1), 0.25]], 1.2),
    grass: bake(tuft, 0.9),
  };
  const vegMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const R2 = rng(5), chunks = new Map();
  const addTo = (type, it) => {
    const ix = Math.floor((it.x - CX + HALF) / CH), iz = Math.floor((it.z - CZ + HALF) / CH), k = ix + ',' + iz;
    let ch = chunks.get(k); if (!ch) { ch = { x: CX - HALF + (ix + 0.5) * CH, z: CZ - HALF + (iz + 0.5) * CH, items: {} }; chunks.set(k, ch); }
    (ch.items[type] = ch.items[type] || []).push(it);
  };
  function scatter(type, count, minOff, maxOff, scale) {
    let n = 0;
    for (let a = 0; a < count * 4 && n < count; a++) {
      const i = (R2() * N) | 0, side = R2() < 0.5 ? -1 : 1, off = side * (minOff + R2() * (maxOff - minOff));
      if (type !== 'grass' && (i < 90 || i > 395) && Math.abs(off) < 26) continue;      // keep the village clear
      const [x, z] = loc(i, off);
      if (Math.abs(x - CX) > HALF - 20 || Math.abs(z - CZ) > HALF - 20) continue;
      const q = nearest(x, z); if (q.d < minOff - 0.5) continue;
      const t = type === 'tree' ? (pts[q.i].y < 26 && R2() < 0.5 ? 'palm' : 'broad') : type, s = scale();
      addTo(t, { x, y: hn(q, x, z) - 0.3, z, r: R2() * 6.28, sx: s, sy: s * (0.9 + R2() * 0.3), sz: s, c: new THREE.Color(0.85 + R2() * 0.3, 0.9 + R2() * 0.25, 0.8 + R2() * 0.2) });
      n++;
    }
  }
  scatter('tree', low ? 380 : 1000, 12, 110, () => 0.8 + R2() * 1.2);
  scatter('bush', low ? 450 : 1300, 7, 45, () => 0.7 + R2() * 0.9);
  scatter('rock', low ? 110 : 280, 6.6, 70, () => 0.6 + R2() * 1.3);
  scatter('grass', low ? 900 : 2600, 6.2, 24, () => 0.8 + R2() * 0.7);
  for (const ch of chunks.values()) {
    ch.group = new THREE.Group(); scene.add(ch.group);
    for (const type in ch.items) { const m = inst(geos[type], vegMat, ch.items[type], ch.group, true); m.castShadow = !low && (type === 'broad' || type === 'palm'); m.receiveShadow = false; }
  }
  const drawDist = low ? 260 : 480;
  const update = (x, z) => { for (const ch of chunks.values()) ch.group.visible = Math.hypot(x - ch.x, z - ch.z) < drawDist + CH * 0.75; };

  return { pts, tan, N, nearest, heightAt, update, CX, CZ, HALF };
}
