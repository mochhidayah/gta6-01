// Keyboard and mouse input.
//
// The game reads keys by code (KeyW, Space, ...) so layouts do not
// matter. `wasPressed` is edge-triggered: true once per physical
// press, then the frame loop clears it. The mouse position is
// reported in canvas pixels, scaled from the element's box. v4 rewrote
// this file wholesale — same behaviour, new structure.
// v6: a couple of local names refreshed, behaviour identical.
const PAGE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor(canvas) {
    this.down = {}; // currently held keys, by code
    this.hit = {}; // keys pressed since the last frame
    this.mouse = { x: 0, y: 0, held: false, clicked: false };
    this.wheelDelta = 0; // accumulated wheel scroll since the last frame
    this.canvas = canvas;
    this.attach(canvas);
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.onUp(e));
    window.addEventListener('blur', () => this.clearKeys());
    window.addEventListener('mouseup', () => {
      this.mouse.held = false;
    });
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    // The wheel cycles weapons; the page must not scroll under the game.
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  onDown(event) {
    if (event.repeat) return;
    this.down[event.code] = true;
    this.hit[event.code] = true;
    if (PAGE_KEYS.has(event.code)) event.preventDefault();
  }

  onUp(event) {
    this.down[event.code] = false;
  }

  clearKeys() {
    this.down = {};
  }

  onMouseMove(event) {
    const box = this.canvas.getBoundingClientRect();
    this.mouse.x = (event.clientX - box.left) * (this.canvas.width / box.width);
    this.mouse.y = (event.clientY - box.top) * (this.canvas.height / box.height);
  }

  onMouseDown(event) {
    if (event.button !== 0) return;
    this.mouse.held = true;
    this.mouse.clicked = true;
  }

  // Wheel scroll: accumulate the delta so the frame loop can act on
  // it once, and keep the page from scrolling under the game.
  onWheel(event) {
    event.preventDefault();
    this.wheelDelta += event.deltaY;
  }

  // The wheel delta since the last frame (0 when untouched),
  // consumed on read like a key press.
  takeWheel() {
    const delta = this.wheelDelta;
    this.wheelDelta = 0;
    return delta;
  }

  // True once per physical press of the key.
  wasPressed(code) {
    if (!this.hit[code]) return false;
    this.hit[code] = false;
    return true;
  }

  // True once per mouse click.
  takeClick() {
    const tap = this.mouse.clicked;
    this.mouse.clicked = false;
    return tap;
  }

  // Call at the end of every frame.
  endFrame() {
    this.hit = {};
    this.mouse.clicked = false;
  }
}
