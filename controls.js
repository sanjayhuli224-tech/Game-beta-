// Keyboard + multi-touch input. Exposes steer (-1..1, +1 = left), throttle, brake (0..1).
export class Controls {
  constructor() {
    this.keys = {};
    this.btn = {};
    this.onPause = () => {};
    this.onRestart = () => {};
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause();
      if (e.code === 'KeyR') this.onRestart();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.btn = {}; });
    document.querySelectorAll('[data-btn]').forEach((el) => {
      const name = el.dataset.btn;
      const set = (v) => { this.btn[name] = v; el.classList.toggle('on', v); };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => el.addEventListener(t, () => set(false)));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
  get steer() {
    const k = this.keys, b = this.btn;
    const l = k.ArrowLeft || k.KeyA || b.left, r = k.ArrowRight || k.KeyD || b.right;
    return (l ? 1 : 0) - (r ? 1 : 0);
  }
  get throttle() { return (this.keys.ArrowUp || this.keys.KeyW || this.btn.gas) ? 1 : 0; }
  get brake() { return (this.keys.ArrowDown || this.keys.KeyS || this.btn.brake) ? 1 : 0; }
  get handbrake() { return !!this.keys.Space; }
}
