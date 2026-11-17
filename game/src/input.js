// Keyboard and mouse input.
//
// The game reads keys by code (KeyW, Space, ...) so layouts do not matter.
// `wasPressed` is edge-triggered: true once per physical press, then the
// frame loop clears it. The mouse position is reported in canvas pixels.
export class Input {
  constructor(canvas) {
    this.down = {}; // currently held keys, by code
    this.struck = {}; // keys pressed since the last frame
    this.mouse = { x: 0, y: 0, held: false, clicked: false };
    this.canvas = canvas;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.down[event.code] = true;
      this.struck[event.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.down[event.code] = false;
    });
    window.addEventListener('blur', () => {
      this.down = {};
    });
    canvas.addEventListener('mousemove', (event) => {
      const box = canvas.getBoundingClientRect();
      this.mouse.x = (event.clientX - box.left) * (canvas.width / box.width);
      this.mouse.y = (event.clientY - box.top) * (canvas.height / box.height);
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouse.held = true;
        this.mouse.clicked = true;
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouse.held = false;
    });
  }

  // True once per physical press of the key.
  wasPressed(code) {
    if (this.struck[code]) {
      this.struck[code] = false;
      return true;
    }
    return false;
  }

  // True once per mouse click.
  takeClick() {
    const clicked = this.mouse.clicked;
    this.mouse.clicked = false;
    return clicked;
  }

  // Call at the end of every frame.
  endFrame() {
    this.struck = {};
    this.mouse.clicked = false;
  }
}
