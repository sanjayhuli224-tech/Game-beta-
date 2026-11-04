import * as THREE from 'three';

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.2, ...options });

function makeSedan(color, low) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const paint = material(color, { roughness: 0.34, metalness: 0.48 });
  const glass = material(0x18232d, { roughness: 0.16, metalness: 0.46 });
  const trim = material(0x171a1d, { roughness: 0.7 });
  const chrome = material(0xc8d0d5, { roughness: 0.22, metalness: 0.88 });
  const tire = material(0x101112, { roughness: 0.95 });
  const head = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd98a, emissiveIntensity: 0.65 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x7d1114, emissive: 0xa20b10, emissiveIntensity: 0.5 });
  const box = (w, h, d, mat, x, y, z, group = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = !low; group.add(m); return m;
  };
  box(1.82, 0.53, 3.75, paint, 0, 0.72, -0.02);
  box(1.73, 0.2, 1.15, paint, 0, 0.99, 1.28);
  box(1.68, 0.2, 0.92, paint, 0, 0.96, -1.42);
  box(1.48, 0.56, 1.82, glass, 0, 1.28, -0.03);
  box(1.52, 0.09, 1.86, paint, 0, 1.57, -0.03);
  for (const side of [-1, 1]) {
    box(0.055, 0.5, 0.07, paint, side * 0.77, 1.29, 0.57);
    box(0.055, 0.5, 0.07, paint, side * 0.77, 1.29, -0.62);
    box(0.055, 0.12, 0.07, paint, side * 0.77, 1.48, -0.04);
    box(0.12, 0.12, 0.18, trim, side * 0.94, 1.11, 0.82);
    box(0.04, 0.06, 0.23, chrome, side * 0.89, 0.95, 0.05);
    box(0.06, 0.1, 2.8, trim, side * 0.9, 0.53, -0.02);
    box(0.31, 0.16, 0.08, head, side * 0.58, 0.78, 1.91);
    box(0.24, 0.2, 0.08, tail, side * 0.61, 0.79, -1.91);
  }
  box(1.55, 0.17, 0.16, trim, 0, 0.53, 1.87);
  box(1.55, 0.16, 0.16, trim, 0, 0.53, -1.87);
  box(0.76, 0.2, 0.05, chrome, 0, 0.79, 1.91);
  box(0.5, 0.11, 0.035, chrome, 0, 0.55, -1.96);
  const wheels = [];
  for (const [x, z] of [[-0.88, 1.18], [0.88, 1.18], [-0.88, -1.18], [0.88, -1.18]]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.4, z); body.add(wheel);
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 20).rotateZ(Math.PI / 2), tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.235, 16).rotateZ(Math.PI / 2), chrome);
    wheel.add(rubber, rim); wheels.push(wheel);
  }
  return { root, body, wheels };
}

export class TrafficCar {
  constructor(scene, world, low, env, color = 0x2f7cf6, laneOffset = 3.1, speed = 16, startIndex = 0, direction = 1) {
    this.world = world; this.low = low; this.laneOffset = laneOffset; this.speed = speed; this.direction = direction;
    this.t = startIndex; this.spin = 0;
    const model = makeSedan(color, low); this.group = model.root; this.body = model.body; this.wheels = model.wheels;
    scene.add(this.group); this.reset();
  }
  place() {
    const i = ((Math.floor(this.t) % this.world.N) + this.world.N) % this.world.N;
    const p = this.world.pts[i], tangent = this.world.tan[i];
    const dirOffset = this.direction < 0 ? Math.PI : 0;
    this.x = p.x + tangent.z * this.laneOffset; this.z = p.z - tangent.x * this.laneOffset;
    this.h = Math.atan2(tangent.x, tangent.z) + dirOffset;
    this.y = this.world.heightAt(this.x, this.z) + 0.12;
    this.group.position.set(this.x, this.y, this.z); this.group.rotation.set(0, this.h, 0);
    for (const w of this.wheels) w.rotation.z = this.spin;
  }
  reset() { this.t = ((this.t % this.world.N) + this.world.N) % this.world.N; this.place(); }
  update(dt) {
    this.t = (this.t + this.direction * this.speed * dt / 3.8 + this.world.N) % this.world.N;
    this.spin += this.speed * dt / 0.34; this.place();
  }
}

export class PoliceCar extends TrafficCar {
  constructor(scene, world, low, env, laneOffset = 0, speed = 23, direction = 1) {
    super(scene, world, low, env, 0x14283e, laneOffset, speed, world.N - 18, direction);
    this.flash = 0;
    const white = material(0xf0f2f4, { roughness: 0.36, metalness: 0.15 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1478ed, emissive: 0x063e9b, emissiveIntensity: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0xe2232d, emissive: 0x7d0008, emissiveIntensity: 0.8 });
    const stripe = material(0x1e4f82, { roughness: 0.4, metalness: 0.25 });
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.28, 2.2), white);
      panel.position.set(side * 0.914, 0.83, -0.02); this.body.add(panel);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.075, 2.55), stripe);
      band.position.set(side * 0.93, 0.72, -0.02); this.body.add(band);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.065, 0.25), material(0x101318));
    bar.position.set(0, 1.63, -0.05); this.body.add(bar);
    this.redLamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.22), red);
    this.blueLamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.22), blue);
    this.redLamp.position.set(-0.2, 1.72, -0.05); this.blueLamp.position.set(0.2, 1.72, -0.05);
    this.body.add(this.redLamp, this.blueLamp);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.42, 6), material(0x17191b));
    antenna.position.set(0, 1.82, -0.85); antenna.rotation.z = -0.15; this.body.add(antenna);
  }
  update(dt, target) {
    if (target) {
      const nearest = this.world.nearest(target.x, target.z);
      const delta = ((nearest.i - this.t + this.world.N) % this.world.N);
      const signed = delta > this.world.N / 2 ? delta - this.world.N : delta;
      const gapMeters = signed * 3.8;
      this.speed += (Math.max(20, Math.min(37, 22 + Math.abs(gapMeters) * 0.018)) - this.speed) * Math.min(1, dt * 0.8);
      this.t = (this.t + this.direction * this.speed * dt / 3.8 + this.world.N) % this.world.N;
      const d = Math.hypot(target.x - this.x, target.z - this.z);
      this.laneOffset = d < 12 ? 2.6 : Math.sin(this.t * 0.18) * 0.45;
    } else this.t = (this.t + this.direction * this.speed * dt / 3.8 + this.world.N) % this.world.N;
    this.spin += this.speed * dt / 0.34;
    this.place();
    this.flash += dt * 13;
    this.redLamp.material.emissiveIntensity = Math.sin(this.flash) > 0 ? 2.8 : 0.12;
    this.blueLamp.material.emissiveIntensity = Math.sin(this.flash + Math.PI) > 0 ? 2.8 : 0.12;
  }
}

export class Helicopter {
  constructor(scene, world, low) {
    this.world = world; this.low = low; this.group = new THREE.Group();
    this.rotorA = new THREE.Group(); this.rotorB = new THREE.Group();
    this.build(); scene.add(this.group); this.reset();
  }
  build() {
    const hull = material(0x263646, { roughness: 0.42, metalness: 0.42 });
    const glass = material(0x7eb8d2, { roughness: 0.18, metalness: 0.42, emissive: 0x173445, emissiveIntensity: 0.16 });
    const trim = material(0x697783, { roughness: 0.3, metalness: 0.72 });
    const rotorMat = material(0x171d24, { roughness: 0.46, metalness: 0.38 });
    const mesh = (geometry, mat, x, y, z, parent = this.group) => {
      const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.castShadow = !this.low; parent.add(m); return m;
    };
    mesh(new THREE.SphereGeometry(1, 24, 16), hull, 0, 0.95, 0).scale.set(0.95, 0.68, 1.75);
    mesh(new THREE.SphereGeometry(1, 24, 16), glass, 0, 1.12, 0.88).scale.set(0.78, 0.52, 0.82);
    for (const side of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.035, 0.42, 0.72), glass, side * 0.82, 1.15, -0.38);
      mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.5, 10), trim, side * 0.65, 0.15, -0.2).rotation.z = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.5, 10), trim, side * 0.65, 0.15, -1.35).rotation.z = Math.PI / 2;
    }
    const boom = mesh(new THREE.CylinderGeometry(0.12, 0.3, 3.7, 14), hull, 0, 0.95, -2.55); boom.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.12, 0.82, 0.58), hull, 0, 1.23, -4.18);
    mesh(new THREE.BoxGeometry(1.12, 0.11, 0.38), trim, 0, 0.94, -3.72);
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.68, 10), trim, 0, 1.8, -0.05);
    this.rotorA.position.set(0, 2.13, -0.05); this.group.add(this.rotorA);
    mesh(new THREE.BoxGeometry(0.16, 0.045, 6.7), rotorMat, 0, 0, 0, this.rotorA);
    const blade2 = mesh(new THREE.BoxGeometry(0.16, 0.045, 6.7), rotorMat, 0, 0, 0, this.rotorA); blade2.rotation.y = Math.PI / 2;
    this.rotorB.position.set(-0.15, 1.2, -4.22); this.group.add(this.rotorB);
    mesh(new THREE.BoxGeometry(0.08, 0.9, 0.12), rotorMat, 0, 0, 0, this.rotorB);
    const tailBlade = mesh(new THREE.BoxGeometry(0.85, 0.08, 0.12), rotorMat, 0, 0, 0, this.rotorB); tailBlade.rotation.z = 0.15;
    const searchlight = new THREE.SpotLight(0xffedb5, 10, 65, Math.PI / 8, 0.45, 1.2);
    searchlight.position.set(0, 0.45, 1.35); searchlight.target.position.set(0, -1, 8);
    this.group.add(searchlight, searchlight.target);
    this.searchlight = searchlight;
  }
  reset(target = null) {
    const p = target || { x: 0, y: 0, z: 0, h: 0 };
    this.group.position.set(p.x - Math.sin(p.h || 0) * 13, p.y + 14, p.z - Math.cos(p.h || 0) * 13);
    this.group.rotation.set(0, p.h || 0, 0);
  }
  update(dt, target) {
    const time = performance.now() * 0.001;
    const offset = 12 + Math.sin(time * 0.42) * 2.5;
    const desired = new THREE.Vector3(
      target.x - Math.sin(target.h) * offset + Math.sin(time * 0.32) * 3,
      target.y + 13.5 + Math.sin(time * 0.8) * 1.2,
      target.z - Math.cos(target.h) * offset + Math.cos(time * 0.32) * 3
    );
    this.group.position.lerp(desired, 1 - Math.exp(-1.35 * dt));
    const heading = Math.atan2(target.x - this.group.position.x, target.z - this.group.position.z);
    const yawDelta = Math.atan2(Math.sin(heading - this.group.rotation.y), Math.cos(heading - this.group.rotation.y));
    this.group.rotation.y += yawDelta * (1 - Math.exp(-1.7 * dt));
    this.group.rotation.z = THREE.MathUtils.clamp(-yawDelta * 0.035, -0.06, 0.06);
    this.rotorA.rotation.y += dt * 48;
    this.rotorB.rotation.x += dt * 55;
    this.searchlight.target.position.set(target.x - this.group.position.x, -this.group.position.y, target.z - this.group.position.z);
  }
}

export const spawnTraffic = (scene, world, low, env, count = 8) => {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const lane = dir > 0 ? 3.1 + (i % 2) * 0.4 : -3.1 - (i % 2) * 0.4;
    const speed = 14 + (i % 5) * 2.8;
    cars.push(new TrafficCar(scene, world, low, env, 0x2d9cdb + (i * 1009) % 0x7a7a7a, lane, speed, 12 + i * 5, dir));
  }
  return cars;
};
