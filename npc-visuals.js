import * as THREE from 'three';

const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.25, ...options });

function addPoliceLivery(police) {
  const body = police.body;
  if (police.beaconR) police.beaconR.visible = false;
  if (police.beaconB) police.beaconB.visible = false;
  const white = standard(0xf2f4f7, { roughness: 0.38, metalness: 0.18 });
  const dark = standard(0x101820, { roughness: 0.62 });
  const red = standard(0xd71920, { emissive: 0x450000, roughness: 0.4 });
  const blue = standard(0x1677ed, { emissive: 0x001b55, roughness: 0.4 });

  // White side panels and a reflective blue/red stripe make the chase car read clearly as a patrol vehicle.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.33, 2.45), white);
    panel.position.set(side * 0.866, 1.0, -0.03); body.add(panel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 2.5), blue);
    stripe.position.set(side * 0.89, 0.91, -0.02); body.add(stripe);
    const lowerStripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 2.5), red);
    lowerStripe.position.set(side * 0.89, 0.84, -0.02); body.add(lowerStripe);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.26), white);
    door.rotation.y = side * Math.PI / 2; door.position.set(side * 0.9, 1.14, -0.02); body.add(door);
    const label = makeLabel('POLICE', '#102f5e', '#ffffff');
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: label, transparent: true, side: THREE.DoubleSide }));
    badge.rotation.y = side * Math.PI / 2; badge.position.set(side * 0.91, 1.14, -0.02); body.add(badge);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.18), dark);
    mirror.position.set(side * 0.94, 1.22, 1.48); body.add(mirror);
  }
  // Correctly place a low-profile lightbar on the roof, not on the hood.
  const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.07, 0.3), dark);
  barBase.position.set(0, 1.66, -0.62); body.add(barBase);
  const redLens = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.25), red);
  redLens.position.set(-0.25, 1.76, -0.62); body.add(redLens);
  const blueLens = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.25), blue);
  blueLens.position.set(0.25, 1.76, -0.62); body.add(blueLens);
  police.beaconR = redLens; police.beaconB = blueLens;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.11, 0.055), standard(0x252a30, { metalness: 0.65 }));
  grille.position.set(0, 0.81, 2.17); body.add(grille);
}

function makeLabel(text, foreground, background) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = foreground; ctx.font = 'bold 100px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeHelicopter(heli) {
  const g = heli.group;
  // Replace the blocky placeholder with a rounded fuselage, glazed cockpit, tail boom and working rotors.
  g.clear();
  const hull = standard(0x263647, { metalness: 0.55, roughness: 0.38 });
  const trim = standard(0x657483, { metalness: 0.72, roughness: 0.28 });
  const glass = standard(0x72b5dc, { metalness: 0.45, roughness: 0.16, emissive: 0x102e45, emissiveIntensity: 0.22 });
  const rotorMat = standard(0x20262d, { metalness: 0.45, roughness: 0.36 });
  const mesh = (geometry, material, position, scale = null, rotation = null, parent = g) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(...position);
    if (scale) m.scale.set(...scale); if (rotation) m.rotation.set(...rotation); m.castShadow = !heli.low; parent.add(m); return m;
  };
  // Main cabin and rounded nose, forward is +Z.
  mesh(new THREE.SphereGeometry(1, 24, 16), hull, [0, 0.95, 0], [1.05, 0.72, 1.85]);
  mesh(new THREE.SphereGeometry(1, 24, 16), glass, [0, 1.12, 0.9], [0.88, 0.57, 0.88]);
  // Separate cockpit panes and subtle frame rails.
  for (const side of [-1, 1]) {
    const pane = mesh(new THREE.BoxGeometry(0.035, 0.62, 0.78), glass, [side * 0.9, 1.16, 0.56]);
    pane.rotation.z = side * -0.08;
    mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.25, 10), trim, [side * 0.68, 0.2, -0.15], null, [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.25, 10), trim, [side * 0.68, 0.2, -1.35], null, [0, 0, Math.PI / 2]);
  }
  // Tail boom and fin.
  const boom = mesh(new THREE.CylinderGeometry(0.18, 0.34, 3.8, 12), hull, [0, 1.0, -2.55]);
  boom.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.12, 0.95, 0.62), hull, [0, 1.28, -4.25]);
  mesh(new THREE.BoxGeometry(1.15, 0.12, 0.42), trim, [0, 0.95, -3.72]);
  // Rotor mast and two crossed main blades.
  mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.78, 10), trim, [0, 1.77, -0.1]);
  const rotor = new THREE.Group(); rotor.position.set(0, 2.2, -0.1); g.add(rotor);
  const blade1 = mesh(new THREE.BoxGeometry(0.16, 0.045, 6.8), rotorMat, [0, 0, 0], null, null, rotor);
  blade1.rotation.y = 0.08;
  const blade2 = mesh(new THREE.BoxGeometry(0.16, 0.045, 6.8), rotorMat, [0, 0, 0], null, null, rotor);
  blade2.rotation.y = Math.PI / 2 + 0.08;
  heli.rotorA = rotor;
  // Tail rotor: two blades on the fin, spinning in the vertical plane.
  const tailRotor = new THREE.Group(); tailRotor.position.set(-0.16, 1.25, -4.28); g.add(tailRotor);
  mesh(new THREE.BoxGeometry(0.1, 1.15, 0.12), rotorMat, [0, 0, 0], null, null, tailRotor);
  const tailBlade = mesh(new THREE.BoxGeometry(1.15, 0.1, 0.12), rotorMat, [0, 0, 0], null, null, tailRotor);
  tailBlade.rotation.z = 0.12;
  heli.rotorB = tailRotor;
  // Searchlight under the nose, plus compact red/green navigation lamps.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0b3 });
  mesh(new THREE.SphereGeometry(0.16, 12, 8), lampMat, [0, 0.37, 1.42]);
  for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(0.07, 8, 6), standard(side < 0 ? 0xff302a : 0x36d17a, { emissive: side < 0 ? 0x8c0000 : 0x005522, emissiveIntensity: 1.2 }), [side * 1.0, 1.0, -0.2]);
  heli._tailRotor = tailRotor;
}

export function improveNpcLooks({ police, helicopter }) {
  addPoliceLivery(police);
  makeHelicopter(helicopter);
  const heli = helicopter;
  heli.reset = function reset(target) {
    const p = target || this._target;
    this.x = p ? p.x - Math.sin(p.h) * 12 : 0;
    this.y = p ? p.y + 14 : 16;
    this.z = p ? p.z - Math.cos(p.h) * 12 : 0;
    this.group.position.set(this.x, this.y, this.z);
    this.vx = this.vy = this.vz = 0;
  };
  heli.update = function update(dt, target) {
    this._target = target;
    const time = performance.now() * 0.001;
    const behind = 11 + Math.sin(time * 0.7) * 2.5;
    const desired = new THREE.Vector3(
      target.x - Math.sin(target.h) * behind + Math.sin(time * 0.55) * 2.5,
      target.y + 13 + Math.sin(time * 1.1) * 1.6,
      target.z - Math.cos(target.h) * behind + Math.cos(time * 0.55) * 2.5
    );
    this.group.position.lerp(desired, 1 - Math.exp(-1.8 * dt));
    this.x = this.group.position.x; this.y = this.group.position.y; this.z = this.group.position.z;
    const heading = Math.atan2(target.x - this.x, target.z - this.z);
    this.group.rotation.y += Math.atan2(Math.sin(heading - this.group.rotation.y), Math.cos(heading - this.group.rotation.y)) * (1 - Math.exp(-2.2 * dt));
    this.group.rotation.z = Math.sin(time * 0.8) * 0.035;
    this.rotorA.rotation.y += dt * 48;
    this.rotorB.rotation.x += dt * 52;
  };
}
