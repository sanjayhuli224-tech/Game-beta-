import * as THREE from 'three';
import { createWorld } from './world.js';
import { Car } from './car.js';
import { TrafficCar, PoliceCar, Helicopter } from './npc.js';
import { Controls } from './controls.js';

const $ = (id) => document.getElementById(id);
const low = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !low, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, low ? 1.25 : 2);
renderer.setPixelRatio(pixelRatio); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SUN_DIR = new THREE.Vector3(60, 90, 40).normalize();
function makeSky() {
  const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, H);
  [[0, '#2f6fb8'], [0.22, '#5b9ad4'], [0.42, '#a6cde6'], [0.5, '#e4eef2'], [0.56, '#cfd8d2'], [1, '#7a8068']].forEach(([s, c]) => g.addColorStop(s, c));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  let seed = 7; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 18; i++) {
    const cx = rand() * W, cy = 25 + rand() * 85, rad = 14 + rand() * 26, gr = x.createRadialGradient(0, 0, 0, 0, 0, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.translate(cx, cy); x.scale(2.6, 1); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, rad, 0, 6.3); x.fill(); x.restore();
  }
  const u = Math.atan2(SUN_DIR.z, SUN_DIR.x) / (2 * Math.PI) + 0.5, v = Math.asin(SUN_DIR.y) / Math.PI + 0.5, sx = u * W, sy = (1 - v) * H;
  const glow = x.createRadialGradient(sx, sy, 0, sx, sy, 60);
  glow.addColorStop(0, 'rgba(255,252,235,1)'); glow.addColorStop(0.12, 'rgba(255,244,205,0.8)'); glow.addColorStop(1, 'rgba(255,230,170,0)');
  x.fillStyle = glow; x.fillRect(sx - 60, sy - 60, 120, 120);
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace; texture.mapping = THREE.EquirectangularReflectionMapping; return texture;
}
const sky = makeSky(); scene.background = sky;
let env = null;
try { const pm = new THREE.PMREMGenerator(renderer); env = pm.fromEquirectangular(sky).texture; pm.dispose(); } catch (e) { console.warn('env map unavailable', e); }
scene.fog = new THREE.Fog(0xd3e0e6, low ? 65 : 115, low ? 380 : 720);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1700);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a35, 1.0));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.5); sun.castShadow = !low;
if (!low) { sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 300; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; }
scene.add(sun, sun.target);
const world = createWorld(scene, low);
const car = new Car(scene, world, low, env);
const controls = new Controls();

// Spawn cars in the player's immediate view instead of distributing them around the far side of the loop.
const trafficCars = [
  new TrafficCar(scene, world, low, env, 0x1f9d55, 3.2, 17, 9),
  new TrafficCar(scene, world, low, env, 0xef4444, -3.2, 15, 17),
  new TrafficCar(scene, world, low, env, 0xf59e0b, 3.4, 19, 27),
  new TrafficCar(scene, world, low, env, 0x8b5cf6, -3.4, 16, 39),
  new TrafficCar(scene, world, low, env, 0x06b6d4, 3.1, 18, 54),
  new TrafficCar(scene, world, low, env, 0xf97316, -3.1, 17, 72)
];
const police = new PoliceCar(scene, world, low, env, -2.8, 25);
const helicopter = new Helicopter(scene, world, low);

function positionPoliceNearPlayer(dt = 0) {
  const nearest = world.nearest(car.x, car.z);
  // Keep patrol on the road just ahead of the player so the pursuit is visible in the chase view.
  const desired = (nearest.i + 5) % world.N;
  if (dt) {
    const delta = ((desired - police.t + world.N * 1.5) % world.N) - world.N / 2;
    police.t = (police.t + delta * Math.min(1, dt * 1.4) + world.N) % world.N;
  } else police.t = desired;
  police.laneOffset = -2.8;
  police.place();
}
function positionHelicopter(dt = 0, time = 0) {
  const ahead = 15 + Math.sin(time * 0.4) * 2;
  const goal = new THREE.Vector3(
    car.x + Math.sin(car.h) * ahead - Math.cos(car.h) * 4,
    car.y + 10 + Math.sin(time * 0.9) * 1.1,
    car.z + Math.cos(car.h) * ahead + Math.sin(car.h) * 4
  );
  if (dt) helicopter.group.position.lerp(goal, 1 - Math.exp(-1.6 * dt));
  else helicopter.group.position.copy(goal);
  const heading = Math.atan2(car.x - helicopter.group.position.x, car.z - helicopter.group.position.z);
  const yawDelta = Math.atan2(Math.sin(heading - helicopter.group.rotation.y), Math.cos(heading - helicopter.group.rotation.y));
  helicopter.group.rotation.y += yawDelta * (dt ? 1 - Math.exp(-2 * dt) : 1);
  helicopter.group.rotation.z = THREE.MathUtils.clamp(-yawDelta * 0.035, -0.06, 0.06);
  helicopter.rotorA.rotation.y += dt * 48;
  helicopter.rotorB.rotation.x += dt * 55;
}
positionPoliceNearPlayer(); positionHelicopter();

let paused = true, snapCam = true;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function resetNpcs() {
  trafficCars.forEach((npc) => npc.reset());
  positionPoliceNearPlayer(); positionHelicopter();
}
function setPaused(p) {
  paused = p; $('menu').classList.toggle('hidden', !p); $('playBtn').textContent = 'Resume';
  if (!p && low) { document.documentElement.requestFullscreen?.().catch(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); }
}
function restart() { car.reset(); resetNpcs(); snapCam = true; setPaused(false); }
$('playBtn').onclick = () => setPaused(false); $('pauseBtn').onclick = () => setPaused(true);
$('restartBtn').onclick = restart; $('menuRestart').onclick = restart;
controls.onPause = () => setPaused(!paused); controls.onRestart = restart;
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

let camH = 0; const camBase = new THREE.Vector3();
function followCamera(dt, time) {
  if (snapCam) camH = car.h;
  camH += Math.atan2(Math.sin(car.h - camH), Math.cos(car.h - camH)) * (snapCam ? 1 : 1 - Math.exp(-3.2 * dt));
  const sp = Math.min(car.kmh, 140), dist = 8.5 + sp * 0.018, hgt = 3.6 + sp * 0.008;
  const tx = car.x - Math.sin(camH) * dist, tz = car.z - Math.cos(camH) * dist, ty = car.y + hgt;
  const k = snapCam ? 1 : 1 - Math.exp(-5.5 * dt);
  camBase.x += (tx - camBase.x) * k; camBase.y += (ty - camBase.y) * k; camBase.z += (tz - camBase.z) * k;
  camBase.y = Math.max(camBase.y, world.heightAt(camBase.x, camBase.z) + 1.5);
  const amp = paused ? 0 : (sp / 140) * 0.025 + (car.offRoad ? 0.025 * Math.min(1, sp / 20) : 0);
  camera.position.set(camBase.x + Math.sin(time * 19) * amp, camBase.y + Math.sin(time * 13 + 1) * amp, camBase.z + Math.cos(time * 17) * amp);
  camera.lookAt(car.x + Math.sin(car.h) * 6, car.y + 1.4, car.z + Math.cos(car.h) * 6);
  const fov = 62 + sp * 0.07;
  if (Math.abs(fov - camera.fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  snapCam = false;
  sun.position.set(car.x + SUN_DIR.x * 100, car.y + SUN_DIR.y * 100, car.z + SUN_DIR.z * 100); sun.target.position.set(car.x, car.y, car.z);
}
let last = performance.now(), slow = 0, shown = -1;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!paused) {
    car.update(dt, controls); car.setBraking(controls.brake && car.v > 0.3);
    trafficCars.forEach((npc) => npc.update(dt));
    police.update(dt); positionPoliceNearPlayer(dt);
    positionHelicopter(dt, now / 1000);
    slow = dt > 0.036 ? slow + dt : Math.max(0, slow - dt);
    if (slow > 2 && pixelRatio > 0.7) { pixelRatio -= 0.15; renderer.setPixelRatio(pixelRatio); resize(); slow = 0; }
    const speed = Math.round(car.kmh); if (speed !== shown) { shown = speed; $('spd').textContent = speed; }
    $('gear').textContent = car.v < -0.3 ? 'R' : 'D';
  }
  followCamera(dt, now / 1000); world.update(car.x, car.z); renderer.render(scene, camera);
}
$('msg').textContent = 'Ready to drive.'; $('playBtn').disabled = false;
requestAnimationFrame(loop);
