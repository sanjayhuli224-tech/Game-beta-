import * as THREE from 'three';
import { ROAD_HALF } from './world.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Indian-style boxy SUV (spare wheel on the tailgate, roof rails, 7-slot grille).
// Arcade physics: bicycle-model steering + throttle/brake/reverse. Forward = +Z in local space.
export class Car {
  constructor(scene, world, low, env) {
    this.world = world; this.low = low; this.env = env;
    this.group = new THREE.Group(); this.group.rotation.order = 'YXZ';
    this.body = new THREE.Group(); this.group.add(this.body);
    this.wheels = []; this.steerGroups = [];
    this.roll = 0; this.squat = 0; this.prevV = 0; this.offRoad = false;
    this.build();
    scene.add(this.group);
    this.reset();
  }

  build() {
    const E = this.env, b = this.body, low = this.low;
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, envMap: E, envMapIntensity: 1, roughness: 0.6, ...o });
    const paint = low ? std(0xa8201f, { metalness: 0.6, roughness: 0.35 })
      : new THREE.MeshPhysicalMaterial({ color: 0xa8201f, envMap: E, metalness: 0.55, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
    const glass = std(0x0d161e, { metalness: 0.9, roughness: 0.05, envMapIntensity: 1.4 });
    const plastic = std(0x151617, { roughness: 0.75 });
    const chrome = std(0xd5d8da, { metalness: 1, roughness: 0.2 });
    const tireM = std(0x0e0e0e, { roughness: 0.95 });
    const head = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2c8, emissiveIntensity: 1.2 });
    const drl = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xcfe8ff, emissiveIntensity: 1.6 });
    this.tail = new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffc04a, emissive: 0xffa010, emissiveIntensity: 0.6 });

    const box = (w, h, d, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; b.add(m); return m;
    };
    // side profile (z forward, y up) extruded across the car's width
    const prof = (poly, depth, mat, bev) => {
      const s = new THREE.Shape(); poly.forEach(([p, q], k) => (k ? s.lineTo(p, q) : s.moveTo(p, q)));
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 1, curveSegments: 1 });
      g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat); b.add(m); return m;
    };
    prof([[-2.15, 0.45], [2.15, 0.45], [2.2, 0.72], [2.1, 1.0], [0.95, 1.13], [-2.1, 1.13], [-2.2, 0.72]], 1.78, paint, 0.04);   // lower body + hood
    prof([[-1.95, 1.13], [0.95, 1.13], [0.5, 1.7], [-1.95, 1.72], [-2.0, 1.13]], 1.62, glass, 0.02);                               // greenhouse (windows + windscreen)
    box(1.72, 0.08, 2.5, paint, 0, 1.75, -0.75);                                   // roof
    for (const s of [1, -1]) {
      box(0.06, 0.74, 0.07, paint, s * 0.86, 1.42, 0.72, -0.65);                    // A-pillar
      box(0.06, 0.6, 0.1, paint, s * 0.86, 1.43, -0.45);                            // B-pillar
      box(0.06, 0.6, 0.16, paint, s * 0.86, 1.43, -1.97);                           // C-pillar
      box(0.04, 0.04, 2.3, chrome, s * 0.7, 1.82, -0.8);                            // roof rails
      box(0.1, 0.14, 0.22, plastic, s * 1.0, 1.2, 0.75);                            // mirror housing
      box(0.1, 0.03, 0.05, plastic, s * 0.94, 1.14, 0.75);                          // mirror stalk
      box(0.05, 0.14, 3.4, plastic, s * 0.91, 0.52, 0);                             // side cladding
      box(0.1, 0.06, 0.2, chrome, s * 0.9, 0.98, -0.2);                             // door handle
      box(0.16, 0.1, 0.95, plastic, s * 0.95, 0.76, 1.35); box(0.16, 0.1, 0.95, plastic, s * 0.95, 0.76, -1.35);   // wheel-arch flares
      box(0.42, 0.2, 0.1, head, s * 0.68, 0.86, 2.18);                              // headlight
      box(0.42, 0.035, 0.05, drl, s * 0.68, 0.98, 2.2);                             // DRL strip
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10).rotateX(Math.PI / 2), amber); fl.position.set(s * 0.62, 0.52, 2.22); b.add(fl);   // fog lamp
      box(0.14, 0.42, 0.08, this.tail, s * 0.8, 0.92, -2.2);                        // tail light
      box(0.05, 0.1, 0.05, amber, s * 0.92, 0.68, 2.18);                            // indicator
    }
    box(0.95, 0.3, 0.05, plastic, 0, 0.84, 2.21);                                   // grille
    for (let k = -3; k <= 3; k++) box(0.05, 0.26, 0.06, chrome, k * 0.12, 0.84, 2.235);   // 7 slots
    box(1.82, 0.2, 0.18, plastic, 0, 0.5, 2.12); box(0.9, 0.06, 0.2, chrome, 0, 0.4, 2.15);   // front bumper + skid plate
    box(1.82, 0.2, 0.18, plastic, 0, 0.5, -2.14);                                   // rear bumper
    box(0.5, 0.13, 0.03, new THREE.MeshStandardMaterial({ color: 0xf4f4f0 }), 0, 0.5, -2.245); // number plate
    const spare = new THREE.Group(); spare.position.set(0, 0.98, -2.36);
    spare.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16).rotateX(Math.PI / 2), tireM),
              new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 12).rotateX(Math.PI / 2), chrome)); b.add(spare);   // tailgate spare wheel

    // wheels: tyre + rim + 3 crossing bars so the spin is visible
    const tireG = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 18).rotateZ(Math.PI / 2), rimG = new THREE.CylinderGeometry(0.25, 0.25, 0.27, 14).rotateZ(Math.PI / 2);
    const barG = new THREE.BoxGeometry(0.275, 0.46, 0.05);
    for (const [x, z, front] of [[0.9, 1.35, 1], [-0.9, 1.35, 1], [0.9, -1.35, 0], [-0.9, -1.35, 0]]) {
      const w = new THREE.Group(); w.add(new THREE.Mesh(tireG, tireM), new THREE.Mesh(rimG, chrome));
      for (let k = 0; k < 3; k++) { const bar = new THREE.Mesh(barG, plastic); bar.rotation.x = k * Math.PI / 3; w.add(bar); }
      if (front) { const s = new THREE.Group(); s.position.set(x, 0.37, z); s.add(w); b.add(s); this.steerGroups.push(s); }
      else { w.position.set(x, 0.37, z); b.add(w); }
      this.wheels.push(w);
    }
    b.traverse((o) => { if (o.isMesh) o.castShadow = !low; });

    if (low) { // cheap blob shadow for phones (real shadow maps are desktop-only)
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      sh.position.y = 0.05; this.group.add(sh);
    }
  }

  reset() {
    const w = this.world, p = w.pts[0], t = w.tan[0];
    // start in the left lane (India drives on the left): left of +Z travel is +X = (t.z, 0, -t.x)
    this.x = p.x + t.z * 2.5; this.z = p.z - t.x * 2.5;
    this.h = Math.atan2(t.x, t.z);
    this.v = 0; this.steer = 0; this.spin = 0; this.pitch = 0; this.roll = 0; this.squat = 0; this.prevV = 0; this.offRoad = false;
    this.y = w.heightAt(this.x, this.z);
    this.apply(0);
  }

  update(dt, inp) {
    const MAXF = 38, MAXR = 9;
    let v = this.v;
    const nr = this.world.nearest(this.x, this.z);
    const offRoad = this.offRoad = nr.d > ROAD_HALF + 1.2;

    if (inp.throttle) v += (v < -0.2 ? 20 : 9 * (1 - Math.max(v, 0) / MAXF)) * dt;
    if (inp.brake) v -= (v > 0.3 ? 24 : 5) * dt;
    if (inp.handbrake) v -= Math.sign(v) * Math.min(Math.abs(v), 30 * dt);
    if (!inp.throttle && !inp.brake) v -= Math.sign(v) * Math.min(Math.abs(v), 1.5 * dt);
    v -= v * 0.04 * dt * Math.abs(v) * 0.1;           // air drag
    if (offRoad && v > 14) v -= (v - 14) * 2 * dt;     // slow on rough ground
    v = clamp(v, -MAXR, MAXF);
    this.v = v;

    const maxSteer = 0.55 / (1 + Math.abs(v) * 0.07);
    this.steer += (inp.steer * maxSteer - this.steer) * Math.min(1, dt * 8);
    this.h += (v / 2.7) * Math.tan(this.steer) * dt;   // +steer = left = heading toward +X

    this.x += Math.sin(this.h) * v * dt;
    this.z += Math.cos(this.h) * v * dt;
    const w = this.world, lim = w.HALF - 8;
    if (Math.abs(this.x - w.CX) > lim || Math.abs(this.z - w.CZ) > lim) {
      this.x = clamp(this.x, w.CX - lim, w.CX + lim); this.z = clamp(this.z, w.CZ - lim, w.CZ + lim); this.v *= 0.5;
    }
    this.spin += (this.v * dt) / 0.37;
    // body motion: lean outward in turns, nose-up under acceleration, nose-down braking
    const acc = (v - this.prevV) / Math.max(dt, 1e-3); this.prevV = v;
    this.squat += (acc - this.squat) * Math.min(1, dt * 6);
    this.roll += (this.steer * v * 0.012 - this.roll) * Math.min(1, dt * 6);
    this.apply(dt);
  }

  apply(dt) {
    const w = this.world, s = Math.sin(this.h), c = Math.cos(this.h);
    const hf = w.heightAt(this.x + s * 1.4, this.z + c * 1.4);
    const hr = w.heightAt(this.x - s * 1.4, this.z - c * 1.4);
    this.y = (hf + hr) / 2 + 0.02;
    const k = dt ? Math.min(1, dt * 10) : 1;
    this.pitch += (-Math.atan2(hf - hr, 2.8) - this.pitch) * k;
    const gr = this.group;
    gr.position.set(this.x, this.y, this.z);
    gr.rotation.set(this.pitch, this.h, 0);
    this.body.rotation.z = clamp(this.roll, -0.06, 0.06);
    this.body.rotation.x = -clamp(this.squat * 0.004, -0.05, 0.05);
    this.body.position.y = this.offRoad ? (Math.sin(this.spin * 7) + Math.sin(this.spin * 13)) * 0.012 * Math.min(1, Math.abs(this.v) / 10) : 0;
    for (const sg of this.steerGroups) sg.rotation.y = this.steer;
    for (const wh of this.wheels) wh.rotation.x = this.spin;
  }

  setBraking(on) { this.tail.emissiveIntensity = on ? 2.5 : 0.5; }
  get kmh() { return Math.abs(this.v) * 3.6; }
}
