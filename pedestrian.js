import * as THREE from 'three';

const mat = (color, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness });

// Simple procedural pedestrians for roadside walks; no external model or texture downloads.
export class Pedestrian {
  constructor(scene, world, low, startIndex, side = 1, outfit = 0x3f7f5f, direction = 1) {
    this.world = world; this.low = low; this.t = startIndex; this.side = side; this.direction = direction;
    this.offset = 7.2 + ((startIndex % 3) * 0.35); this.speed = 1.15 + (startIndex % 4) * 0.12; this.phase = startIndex * 1.7;
    this.group = new THREE.Group(); this.limbs = [];
    this.build(outfit); scene.add(this.group); this.place();
  }
  build(outfit) {
    const skin = mat(0x9a6547), shirt = mat(outfit), pants = mat(0x303844), shoes = mat(0x202020), hair = mat(0x171513);
    const sphere = (r, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = !this.low; this.group.add(m); return m;
    };
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.43, 3, 8), shirt); torso.position.y = 1.02; torso.castShadow = !this.low; this.group.add(torso);
    sphere(0.145, skin, 0, 1.48, 0, 0.92, 1.05, 0.92);
    sphere(0.148, hair, 0, 1.57, -0.015, 0.95, 0.55, 0.97);
    // Neck and a subtle face facing the direction of travel.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 8), skin); neck.position.y = 1.34; this.group.add(neck);
    sphere(0.018, mat(0x201b18), -0.045, 1.49, 0.128, 0.8, 0.8, 0.7);
    sphere(0.018, mat(0x201b18), 0.045, 1.49, 0.128, 0.8, 0.8, 0.7);
    const makeLimb = (x, y, length, radius, material, isArm) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); this.group.add(pivot);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius, length, 8), material);
      limb.position.y = -length * 0.47; limb.castShadow = !this.low; pivot.add(limb);
      sphereAtEnd(pivot, isArm ? skin : shoes, length, radius * (isArm ? 0.9 : 0.7));
      this.limbs.push(pivot); return pivot;
    };
    const sphereAtEnd = (parent, material, length, radius) => {
      const end = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material); end.position.set(0, -length * 0.92, 0.035); parent.add(end);
    };
    makeLimb(-0.115, 0.78, 0.43, 0.075, shirt, true); makeLimb(0.115, 0.78, 0.43, 0.075, shirt, true);
    makeLimb(-0.105, 0.72, 0.48, 0.09, pants, false); makeLimb(0.105, 0.72, 0.48, 0.09, pants, false);
  }
  place() {
    const N = this.world.N, i = ((Math.floor(this.t) % N) + N) % N;
    const p = this.world.pts[i], tangent = this.world.tan[i];
    const off = this.side * this.offset;
    this.x = p.x + tangent.z * off; this.z = p.z - tangent.x * off;
    this.y = this.world.heightAt(this.x, this.z);
    this.h = Math.atan2(tangent.x, tangent.z) + (this.direction < 0 ? Math.PI : 0);
    this.group.position.set(this.x, this.y, this.z); this.group.rotation.set(0, this.h, 0);
  }
  update(dt) {
    this.t = (this.t + this.direction * this.speed * dt / 3.8 + this.world.N) % this.world.N;
    this.phase += dt * 7;
    this.limbs.forEach((limb, i) => { limb.rotation.x = Math.sin(this.phase + (i % 2) * Math.PI) * 0.42; });
    this.group.position.y = this.y + Math.abs(Math.sin(this.phase * 2)) * 0.025;
    this.place();
  }
}
