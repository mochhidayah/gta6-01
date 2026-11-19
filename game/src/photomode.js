// Photo mode: freeze the city and frame the shot.
//
// Press C while playing and the world holds still — traffic stops,
// the HUD fades out, and the camera is yours. WASD (or the arrow
// keys) pans across Palmera Bay, the letterbox bars close in, and a
// caption names the shot. Press C again (or Escape) and the city
// wakes up where you left it.
//
// Photo mode is a toy, but it is a useful one: the screenshots in
// screenshots/ are real renders of the game, and a player who
// frames a chase at dusk gets the same tools the entry used.
// Pan speed lives in config.js (PHOTO). v4 rewrote this file
// wholesale — same behaviour, new structure.
// v6: a few internal names refreshed, behaviour identical.
import { PHOTO } from './config.js';

const TITLE_CARD = 'PALMERA BAY — PHOTO MODE';

export class PhotoMode {
  constructor() {
    this.active = false;
    this.heldView = null;
  }

  // Enter: remember the camera, hide the HUD, freeze the world.
  enter(game) {
    if (this.active) return;
    this.active = true;
    this.heldView = { x: game.renderer.cam.x, y: game.renderer.cam.y };
    game.hud.showHud(false);
    game.sounds.shutter();
    game.hud.toast('PHOTO MODE', 'WASD pans the camera — C or Esc to resume the game.', 4);
  }

  // Leave: put the camera back where it was, show the HUD again.
  exit(game) {
    if (!this.active) return;
    this.active = false;
    if (this.heldView) {
      game.renderer.cam.x = this.heldView.x;
      game.renderer.cam.y = this.heldView.y;
    }
    game.hud.showHud(true);
    game.hud.toast('BACK TO THE STREETS', 'Photo mode off — the city is moving again.', 2);
  }

  toggle(game) {
    if (this.active) this.exit(game);
    else this.enter(game);
  }

  // Pan the frozen camera with the movement keys.
  pan(dt, input, game) {
    const cam = game.renderer.cam;
    let dx = 0;
    let dy = 0;
    if (input.down.KeyA || input.down.ArrowLeft) dx -= 1;
    if (input.down.KeyD || input.down.ArrowRight) dx += 1;
    if (input.down.KeyW || input.down.ArrowUp) dy -= 1;
    if (input.down.KeyS || input.down.ArrowDown) dy += 1;
    if (dx === 0 && dy === 0) return;
    const mag = Math.hypot(dx, dy);
    cam.x += (dx / mag) * PHOTO.panSpeed * dt;
    cam.y += (dy / mag) * PHOTO.panSpeed * dt;
    cam.x = Math.max(-80, Math.min(3600 - 1280 + 80, cam.x));
    cam.y = Math.max(-80, Math.min(2600 - 800 + 80, cam.y));
  }

  // Letterbox bars and a caption over the frozen frame.
  drawFrame(ctx, canvas) {
    const bar = 54;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, bar);
    ctx.fillRect(0, canvas.height - bar, canvas.width, bar);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(TITLE_CARD, 18, 33);
    ctx.textAlign = 'right';
    ctx.fillText('C / Esc — resume', canvas.width - 18, 33);
    ctx.fillStyle = 'rgba(255,210,63,0.9)';
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('◆', canvas.width / 2, canvas.height - 22);
    ctx.restore();
  }
}
