// Rendering: the top-down city, cars, people, particles, lighting and minimap.
// Everything is drawn with canvas primitives — no image assets at all.
import { WORLD, ROAD_W, AVE_GAP, ST_GAP, BEACH_Y, WATER_Y, PALETTE, clamp } from './config.js';
import { AVENUES, STREETS } from './city.js';

export class Renderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mm = minimapCanvas.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.shake = 0;
    this.time = 0;
  }

  // Camera follows the player, clamped to the world.
  updateCamera(focusX, focusY, dt) {
    const w = this.canvas.width, h = this.canvas.height;
    const tx = clamp(focusX - w / 2, 0, Math.max(0, WORLD.w - w));
    const ty = clamp(focusY - h / 2, 0, Math.max(0, WORLD.h - h));
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 5);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
  }

  draw(game) {
    const ctx = this.ctx;
    const { width: W, height: H } = this.canvas;
    this.time += 1 / 60;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.drawGround(ctx, game);
    this.drawRoads(ctx, game);
    this.drawPark(ctx, game);
    this.drawBeach(ctx, game);
    this.drawBuildings(ctx, game);
    this.drawProps(ctx, game);
    this.drawPackages(ctx, game);
    this.drawMarkers(ctx, game);
    this.drawPeds(ctx, game);
    this.drawCars(ctx, game);
    this.drawPlayer(ctx, game);
    this.drawParticles(ctx, game);
    this.drawLighting(ctx, game);
    ctx.restore();
    this.drawMinimap(game);
    if (game.player.hurtFlash > 0) {
      ctx.fillStyle = `rgba(227,63,47,${game.player.hurtFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawGround(ctx, game) {
    // Grass base for the whole map.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(this.cam.x - 20, this.cam.y - 20, this.canvas.width + 40, this.canvas.height + 40);
    // Mow stripes for texture.
    ctx.fillStyle = PALETTE.grassDark;
    const stripe = 120;
    const x0 = Math.floor(this.cam.x / stripe) * stripe;
    const y0 = Math.floor(this.cam.y / stripe) * stripe;
    for (let x = x0; x < this.cam.x + this.canvas.width; x += stripe * 2) {
      for (let y = y0; y < this.cam.y + this.canvas.height; y += stripe) {
        ctx.fillRect(x, y, stripe, stripe);
      }
    }
  }

  drawRoads(ctx, game) {
    const x0 = this.cam.x - 80, x1 = this.cam.x + this.canvas.width + 80;
    const y0 = this.cam.y - 80, y1 = this.cam.y + this.canvas.height + 80;
    ctx.fillStyle = PALETTE.asphalt;
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
    }
    for (const sy of STREETS) {
      if (sy < y0 || sy > y1) continue;
      ctx.fillRect(0, sy - ROAD_W / 2, WORLD.w, ROAD_W);
    }
    // Sidewalks.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      ctx.fillRect(ax - ROAD_W / 2 - 8, 0, 8, BEACH_Y);
      ctx.fillRect(ax + ROAD_W / 2, 0, 8, BEACH_Y);
    }
    for (const sy of STREETS) {
      if (sy < y0 || sy > y1) continue;
      ctx.fillRect(0, sy - ROAD_W / 2 - 8, WORLD.w, 8);
      ctx.fillRect(0, sy + ROAD_W / 2, WORLD.w, 8);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      for (let y = 0; y < BEACH_Y; y += 56) ctx.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of STREETS) {
      if (sy < y0 || sy > y1) continue;
      for (let x = 0; x < WORLD.w; x += 56) ctx.fillRect(x, sy - 2, 28, 4);
    }
    // Crosswalks at intersections.
    ctx.fillStyle = '#e8e4da';
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      for (const sy of STREETS) {
        if (sy < y0 || sy > y1) continue;
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(ax + i * 10 - 3, sy - ROAD_W / 2 + 4, 6, 12);
          ctx.fillRect(ax + i * 10 - 3, sy + ROAD_W / 2 - 16, 6, 12);
        }
      }
    }
  }

  drawPark(ctx, game) {
    const p = game.city.park;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#4a7a38';
    ctx.lineWidth = 4;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    // Pond.
    ctx.fillStyle = '#4a90b8';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w * 0.62, p.y + p.h * 0.6, 46, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PALMERA PARK', p.x + p.w / 2, p.y + 24);
  }

  drawBeach(ctx, game) {
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH_Y, WORLD.w, WATER_Y - BEACH_Y);
    // Boardwalk strip.
    ctx.fillStyle = '#b98d5f';
    ctx.fillRect(0, BEACH_Y, WORLD.w, 14);
    ctx.fillStyle = '#a87c4f';
    for (let x = 0; x < WORLD.w; x += 46) ctx.fillRect(x, BEACH_Y + 2, 3, 10);
    // Water with animated shimmer.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WATER_Y, WORLD.w, WORLD.h - WATER_Y);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.w; x += 90) {
      const yy = WATER_Y + 26 + ((x * 7 + Math.floor(this.time * 20)) % 90);
      ctx.fillRect(x, yy, 54, 5);
    }
    ctx.fillStyle = '#ffffffcc';
    ctx.fillRect(0, WATER_Y - 3, WORLD.w, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CORAL BAY', 40, WATER_Y + 46);
  }

  drawBuildings(ctx, game) {
    for (const b of game.city.buildings) {
      if (b.x + b.w < this.cam.x - 40 || b.x > this.cam.x + this.canvas.width + 40 ||
          b.y + b.h < this.cam.y - 40 || b.y > this.cam.y + this.canvas.height + 40) continue;
      // Drop shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Roof inset.
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop vents.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (const v of b.vents) ctx.fillRect(v.x, v.y, v.s, v.s);
      // Shop sign.
      if (b.sign) {
        ctx.fillStyle = '#22222a';
        ctx.fillRect(b.x + b.w / 2 - 26, b.y + b.h / 2 - 10, 52, 20);
        ctx.fillStyle = '#ffe9a8';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }

  drawProps(ctx, game) {
    for (const t of game.city.trees) {
      if (t.x < this.cam.x - 30 || t.x > this.cam.x + this.canvas.width + 30 ||
          t.y < this.cam.y - 30 || t.y > this.cam.y + this.canvas.height + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f7a34';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#58a844';
      ctx.beginPath(); ctx.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3a3a42';
    for (const l of game.city.lamps) ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = '#c0392b';
    for (const h of game.city.hydrants) ctx.fillRect(h.x - 3, h.y - 3, 6, 6);
  }

  drawPackages(ctx, game) {
    for (const pkg of game.missions.packages) {
      if (pkg.found) continue;
      const pulse = 1 + Math.sin(this.time * 4) * 0.15;
      ctx.save();
      ctx.translate(pkg.x, pkg.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = '#2c2c34';
      ctx.fillRect(-9, -1, 18, 2);
      ctx.restore();
    }
  }

  drawMarkers(ctx, game) {
    const target = game.missions.currentTarget();
    const taxi = game.missions.taxi;
    const drawBeacon = (x, y, color, label) => {
      const bob = Math.sin(this.time * 3) * 4;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, -34); ctx.lineTo(12, -8); ctx.lineTo(-12, -8); ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▼', 0, -16);
      ctx.restore();
      // Ground ring.
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 26 + Math.sin(this.time * 3) * 4, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (label) {
        ctx.fillStyle = '#111';
        ctx.font = 'bold 13px sans-serif';
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x - w / 2, y - 64, w, 20);
        ctx.fillStyle = '#111';
        ctx.fillText(label, x, y - 50);
      }
    };
    if (target) drawBeacon(target.x, target.y, '#ffd23f', game.missions.currentStep().text);
    if (taxi) {
      const t = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      drawBeacon(t.x, t.y, '#58d068', taxi.stage === 'pickup' ? 'PICKUP' : 'DROP-OFF');
    }
    // Robbery hold ring.
    const step = game.missions.currentStep();
    if (step && step.type === 'rob') {
      const t = game.city.landmarks.bank;
      ctx.strokeStyle = '#e33f2f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 90, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawPeds(ctx, game) {
    for (const ped of game.crowd.peds) this.drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.state === 'down');
    for (const cop of game.cops) this.drawPerson(ctx, cop.x, cop.y, cop.angle, '#20242e', '#f0c8a0', cop.state === 'down', true);
  }

  drawPerson(ctx, x, y, angle, shirt, skin, down, isCop = false) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      ctx.fillRect(-12, -6, 24, 12);
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(15, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 2, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    // Body.
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(4, 0, 6, 0, Math.PI * 2); ctx.fill();
    // Facing nub.
    ctx.fillStyle = shirt;
    ctx.fillRect(8, -4, 6, 8);
    if (isCop) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-8, -9, 5, 18);
      ctx.fillStyle = '#20242e';
      ctx.beginPath(); ctx.arc(4, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawCars(ctx, game) {
    // Parked / traffic / police, then the player's car on top.
    const cars = [...game.traffic.cars].sort((a, b) => a.y - b.y);
    for (const c of cars) if (c !== game.playerCar) this.drawCar(ctx, c, game);
    if (game.playerCar) this.drawCar(ctx, game.playerCar, game);
  }

  drawCar(ctx, c, game) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // Skid marks behind.
    if (c.skid > 0) {
      ctx.fillStyle = 'rgba(20,20,20,0.5)';
      ctx.fillRect(-c.w / 2, -c.h / 2 - 4, 26, 4);
      ctx.fillRect(-c.w / 2, c.h / 2, 26, 4);
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 4, c.w, c.h);
    // Body.
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Hood / trunk shading.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(c.w / 2 - 12, -c.h / 2 + 3, 9, c.h - 6);
    // Cabin + windshield.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-6, -c.h / 2 + 3, 16, c.h - 6, 4);
    ctx.fill();
    ctx.fillStyle = '#8fc7e8';
    ctx.fillRect(7, -c.h / 2 + 4, 3, c.h - 8);
    // Wheels.
    ctx.fillStyle = '#14141a';
    ctx.fillRect(-c.w / 2 + 4, -c.h / 2 - 3, 9, 5);
    ctx.fillRect(-c.w / 2 + 4, c.h / 2 - 2, 9, 5);
    ctx.fillRect(c.w / 2 - 13, -c.h / 2 - 3, 9, 5);
    ctx.fillRect(c.w / 2 - 13, c.h / 2 - 2, 9, 5);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(c.w / 2 - 2, -c.h / 2 + 3, 3, 5);
    ctx.fillRect(c.w / 2 - 2, c.h / 2 - 8, 3, 5);
    // Police livery + light bar.
    if (c.police) {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-c.w / 2 + 8, -c.h / 2 + 2, c.w - 16, 4);
      ctx.fillRect(-c.w / 2 + 8, c.h / 2 - 6, c.w - 16, 4);
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      const blink = Math.floor(this.time * 6) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2e2e' : '#2e6bff';
      ctx.beginPath(); ctx.arc(-2, -c.h / 2 + 1, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#2e6bff' : '#ff2e2e';
      ctx.beginPath(); ctx.arc(-2, c.h / 2 - 1, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (c.taxi) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (c.van) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ARMORED', 0, 3);
    }
    // Damage smoke.
    if (c.smoke > 0) {
      ctx.fillStyle = `rgba(120,120,120,${0.5 * c.smoke})`;
      ctx.beginPath(); ctx.arc(-c.w / 2 + 4, 0, 8 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Player-car outline.
    if (c === game.playerCar) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-c.w / 2 - 3, -c.h / 2 - 3, c.w + 6, c.h + 6, 9); ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(ctx, game) {
    const p = game.player;
    if (p.inCar) return;
    this.drawPerson(ctx, p.x, p.y, p.angle, '#e33f2f', '#f0c8a0', false);
    // Pistol in hand.
    if (p.weapon === 'pistol') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#22222a';
      ctx.fillRect(10, -2, 12, 4);
      ctx.restore();
    }
    // Player ring.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,63,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 18 + Math.sin(this.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawParticles(ctx, game) {
    for (const pt of game.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of game.tracers) {
      ctx.globalAlpha = Math.max(0, t.life / 0.15);
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const m of game.muzzles) {
      ctx.globalAlpha = Math.max(0, m.life / 0.08);
      ctx.fillStyle = '#ffdf6b';
      ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Warm sunset wash + vignette, stronger at the map edges.
  drawLighting(ctx, game) {
    const g = ctx.createRadialGradient(
      this.cam.x + this.canvas.width / 2, this.cam.y + this.canvas.height / 2, 200,
      this.cam.x + this.canvas.width / 2, this.cam.y + this.canvas.height / 2, 900);
    g.addColorStop(0, 'rgba(255,170,80,0)');
    g.addColorStop(1, 'rgba(255,120,40,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(this.cam.x, this.cam.y, this.canvas.width, this.canvas.height);
  }

  drawMinimap(game) {
    const mm = this.mm;
    const mw = 190, mh = 138;
    const sx = mw / WORLD.w, sy = mh / WORLD.h;
    mm.clearRect(0, 0, mw, mh);
    mm.fillStyle = 'rgba(10,14,20,0.72)';
    mm.fillRect(0, 0, mw, mh);
    // Water + sand.
    mm.fillStyle = '#2e7fa8';
    mm.fillRect(0, WATER_Y * sy, mw, (WORLD.h - WATER_Y) * sy);
    mm.fillStyle = '#e8cf9a';
    mm.fillRect(0, BEACH_Y * sy, mw, (WATER_Y - BEACH_Y) * sy);
    // Roads.
    mm.fillStyle = '#8a8a92';
    for (const ax of AVENUES) mm.fillRect(ax * sx - 1, 0, 3, BEACH_Y * sy);
    for (const sy2 of STREETS) mm.fillRect(0, sy2 * sy - 1, mw, 3);
    // Park.
    const p = game.city.park;
    mm.fillStyle = '#5d9448';
    mm.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy);
    // Mission / taxi marker.
    const target = game.missions.currentTarget();
    if (target) {
      mm.fillStyle = '#ffd23f';
      mm.beginPath(); mm.arc(target.x * sx, target.y * sy, 4, 0, Math.PI * 2); mm.fill();
    }
    const taxi = game.missions.taxi;
    if (taxi) {
      const t = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      mm.fillStyle = '#58d068';
      mm.beginPath(); mm.arc(t.x * sx, t.y * sy, 4, 0, Math.PI * 2); mm.fill();
    }
    // Police blips.
    mm.fillStyle = '#4a90ff';
    for (const c of game.traffic.cars) {
      if (c.police && !c.dead) { mm.beginPath(); mm.arc(c.x * sx, c.y * sy, 2.5, 0, Math.PI * 2); mm.fill(); }
    }
    // Player arrow.
    const pl = game.player;
    const px = pl.inCar ? game.playerCar.x : pl.x;
    const py = pl.inCar ? game.playerCar.y : pl.y;
    mm.save();
    mm.translate(px * sx, py * sy);
    mm.rotate(pl.inCar ? game.playerCar.angle : pl.angle);
    mm.fillStyle = '#fff';
    mm.beginPath(); mm.moveTo(6, 0); mm.lineTo(-4, -4); mm.lineTo(-4, 4); mm.closePath(); mm.fill();
    mm.restore();
    // Viewport box.
    mm.strokeStyle = 'rgba(255,255,255,0.7)';
    mm.lineWidth = 1;
    mm.strokeRect(this.cam.x * sx, this.cam.y * sy, this.canvas.width * sx, this.canvas.height * sy);
  }
}
