import * as THREE from 'three';
import { createWorld } from './world.js';
import { Car } from './car.js';
import { TrafficCar, PoliceCar, Helicopter } from './npc.js';
import { Pedestrian } from './pedestrian.js';
import { Controls } from './controls.js';

const $ = (id) => document.getElementById(id);
const low = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !low, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, low ? 1.25 : 2);
renderer.setPixelRatio(pixelRatio); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
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
  const u = Math.atan2(SUN_DIR.z, SUN_DIR.x) / (2 * Math.PI) + 0.5, v = Math.asin(SUN_DIR.y) / Math.PI + 0.5;
  const sx = u * W, sy = (1 - v) * H, glow = x.createRadialGradient(sx, sy, 0, sx, sy, 60);
  glow.addColorStop(0, 'rgba(255,252,235,1)'); glow.addColorStop(0.12, 'rgba(255,244,205,0.8)'); glow.addColorStop(1, 'rgba(255,230,170,0)');
  x.fillStyle = glow; x.fillRect(sx - 60, sy - 60, 120, 120);
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace; texture.mapping = THREE.EquirectangularReflectionMapping; return texture;
}
const sky = makeSky(); scene.background = sky;
let env = null;
try { const pm = new THREE.PMREMGenerator(renderer); env = pm.fromEquirectangular(sky).texture; pm.dispose(); } catch (e) { console.warn('env map unavailable', e); }
scene.fog = new THREE.Fog(0xdce6e9, low ? 55 : 95, low ? 340 : 620);

const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1700);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a35, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6); sun.castShadow = !low;
if (!low) {
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
}
scene.add(sun, sun.target);

const world = createWorld(scene, low);
const car = new Car(scene, world, low, env);
const controls = new Controls();

// Indian left-driving: +2.7 m is the player's left-side lane; opposing cars use -2.7 m.
const colors = [0x2683b8, 0xc13e34, 0xe7a629, 0x55905a, 0x7d67a8, 0xc9c7bc, 0x267d77, 0x9b5b3e];
const trafficCars = [];
const trafficCount = low ? 8 : 12;
for (let i = 0; i < trafficCount; i++) {
  const direction = i % 2 === 0 ? 1 : -1;
  const lane = direction > 0 ? 2.8 : -2.8;
  // Put the first vehicles in the nearby road section; spread the rest around the loop.
  const start = i < 6 ? 4 + i * 6 : 45 + (i - 6) * 47;
  trafficCars.push(new TrafficCar(scene, world, low, env, colors[i % colors.length], lane, 13 + (i % 5) * 2.1, start, direction));
}
const police = new PoliceCar(scene, world, low, env, 2.8, 24, 1);
const helicopter = new Helicopter(scene, world, low);
const pedestrianOutfits = [0x397a5d, 0xb44a3a, 0xd49d27, 0x475f9b, 0x7d527e, 0xdfd5bd, 0x328c83, 0x9d633b];
const pedestrianCount = low ? 8 : 14;
const pedestrians = [];
for (let i = 0; i < pedestrianCount; i++) {
  const start = i < 6 ? 8 + i * 8 : 56 + (i - 6) * 31;
  pedestrians.push(new Pedestrian(scene, world, low, start, i % 2 ? -1 : 1, pedestrianOutfits[i % pedestrianOutfits.length], i % 3 === 0 ? -1 : 1));
}

let paused = true, snapCam = true;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function setPaused(p) {
  paused = p; $('menu').classList.toggle('hidden', !p); $('playBtn').textContent = 'Resume';
  if (!p && low) { document.documentElement.requestFullscreen?.().catch(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); }
}
function resetNpcs() {
  trafficCars.forEach((npc) => npc.reset());
  pedestrians.forEach((npc) => npc.place());
  police.t = (world.N - 12) % world.N; police.laneOffset = 2.8; police.reset();
  helicopter.reset(car);
}
function restart() { car.reset(); resetNpcs(); snapCam = true; setPaused(false); }
$('playBtn').onclick = () => setPaused(false); $('pauseBtn').onclick = () => setPaused(true);
$('restartBtn').onclick = restart; $('menuRestart').onclick = restart;
controls.onPause = () => setPaused(!paused); controls.onRestart = restart;
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

let camH = 0; const camBase = new THREE.Vector3();
function followCamera(dt, time) {
  if (snapCam) camH = car.h;
  camH += Math.atan2(Math.sin(car.h - camH), Math.cos(car.h - camH)) * (snapCam ? 1 : 1 - Math.exp(-3.4 * dt));
  const sp = Math.min(car.kmh, 140), dist = 8.3 + sp * 0.016, hgt = 3.5 + sp * 0.008;
  const tx = car.x - Math.sin(camH) * dist, tz = car.z - Math.cos(camH) * dist, ty = car.y + hgt;
  const k = snapCam ? 1 : 1 - Math.exp(-5.5 * dt);
  camBase.x += (tx - camBase.x) * k; camBase.y += (ty - camBase.y) * k; camBase.z += (tz - camBase.z) * k;
  camBase.y = Math.max(camBase.y, world.heightAt(camBase.x, camBase.z) + 1.5);
  const shake = paused ? 0 : (sp / 140) * 0.025 + (car.offRoad ? 0.025 * Math.min(1, sp / 20) : 0);
  camera.position.set(camBase.x + Math.sin(time * 17) * shake, camBase.y + Math.sin(time * 12 + 1) * shake, camBase.z + Math.cos(time * 15) * shake);
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
    pedestrians.forEach((npc) => npc.update(dt));
    police.update(dt, car);
    helicopter.update(dt, car);
    slow = dt > 0.036 ? slow + dt : Math.max(0, slow - dt);
    if (slow > 2 && pixelRatio > 0.7) { pixelRatio -= 0.15; renderer.setPixelRatio(pixelRatio); resize(); slow = 0; }
    const speed = Math.round(car.kmh); if (speed !== shown) { shown = speed; $('spd').textContent = speed; }
    $('gear').textContent = car.v < -0.3 ? 'R' : 'D';
  }
  followCamera(dt, now / 1000); world.update(car.x, car.z); renderer.render(scene, camera);
}

$('msg').textContent = 'Ready to drive.'; $('playBtn').disabled = false;
requestAnimationFrame(loop);
