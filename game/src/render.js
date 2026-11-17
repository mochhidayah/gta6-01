// Rendering: the top-down city, cars, people, particles, lighting and
// the minimap. Everything is drawn with canvas primitives — the game
// ships no image assets at all.
import { WORLD, ROAD, SHORE, COLORS, clamp } from './config.js';
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

  // The camera eases toward the player and stays inside the world.
  updateCamera(focusX, focusY, dt) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const targetX = clamp(focusX - w / 2, 0, Math.max(0, WORLD.width - w));
    const targetY = clamp(focusY - h / 2, 0, Math.max(0, WORLD.height - h));
    const ease = Math.min(1, dt * 5);
    this.cam.x += (targetX - this.cam.x) * ease;
    this.cam.y += (targetY - this.cam.y) * ease;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
  }

  draw(game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.time += 1 / 60;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.paintGround(ctx);
    this.paintRoads(ctx);
    this.paintPark(ctx, game);
    this.paintBeach(ctx);
    this.paintBuildings(ctx, game);
    this.paintProps(ctx, game);
    this.paintStashes(ctx, game);
    this.paintBeacons(ctx, game);
    this.paintCrowd(ctx, game);
    this.paintCars(ctx, game);
    this.paintPlayer(ctx, game);
    this.paintEffects(ctx, game);
    this.paintLight(ctx);
    ctx.restore();
    this.paintMinimap(game);
    if (game.player.hurtFlash > 0) {
      ctx.fillStyle = `rgba(227,63,47,${game.player.hurtFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // --- ground and roads ---

  paintGround(ctx) {
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(this.cam.x - 20, this.cam.y - 20, this.canvas.width + 40, this.canvas.height + 40);
    // Mow stripes give the grass some texture.
    const stripe = 120;
    ctx.fillStyle = COLORS.grassShade;
    const x0 = Math.floor(this.cam.x / stripe) * stripe;
    const y0 = Math.floor(this.cam.y / stripe) * stripe;
    for (let x = x0; x < this.cam.x + this.canvas.width; x += stripe * 2) {
      for (let y = y0; y < this.cam.y + this.canvas.height; y += stripe) {
        ctx.fillRect(x, y, stripe, stripe);
      }
    }
  }

  paintRoads(ctx) {
    const x0 = this.cam.x - 80;
    const x1 = this.cam.x + this.canvas.width + 80;
    const y0 = this.cam.y - 80;
    const y1 = this.cam.y + this.canvas.height + 80;
    const half = ROAD.width / 2;
    // Asphalt.
    ctx.fillStyle = COLORS.asphalt;
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      ctx.fillRect(ax - half, 0, ROAD.width, SHORE.sandY);
    }
    for (const sy of STREETS) {
      if (sy < y0 || sy > y1) continue;
      ctx.fillRect(0, sy - half, WORLD.width, ROAD.width);
    }
    // Sidewalks.
    ctx.fillStyle = COLORS.sidewalk;
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      ctx.fillRect(ax - half - 8, 0, 8, SHORE.sandY);
      ctx.fillRect(ax + half, 0, 8, SHORE.sandY);
    }
    for (const sy of STREETS) {
      if (sy < y0 || sy > y1) continue;
      ctx.fillRect(0, sy - half - 8, WORLD.width, 8);
      ctx.fillRect(0, sy + half, WORLD.width, 8);
    }
    // Centre dashes.
    ctx.fillStyle = COLORS.laneMark;
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      for (let y = 0; y < SHORE.sandY; y += 56) ctx.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of STREETS) {
      if (sy < y0 || sy > y1) continue;
      for (let x = 0; x < WORLD.width; x += 56) ctx.fillRect(x, sy - 2, 28, 4);
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = '#e8e4da';
    for (const ax of AVENUES) {
      if (ax < x0 || ax > x1) continue;
      for (const sy of STREETS) {
        if (sy < y0 || sy > y1) continue;
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(ax + i * 10 - 3, sy - half + 4, 6, 12);
          ctx.fillRect(ax + i * 10 - 3, sy + half - 16, 6, 12);
        }
      }
    }
  }

  paintPark(ctx, game) {
    const p = game.city.park;
    ctx.fillStyle = COLORS.parkGreen;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#4a7a38';
    ctx.lineWidth = 4;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    // The pond.
    ctx.fillStyle = '#4a90b8';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w * 0.62, p.y + p.h * 0.6, 46, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PALMERA PARK', p.x + p.w / 2, p.y + 24);
  }

  paintBeach(ctx) {
    // Sand, then the boardwalk, then Coral Bay itself.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, SHORE.sandY, WORLD.width, SHORE.waterY - SHORE.sandY);
    ctx.fillStyle = '#b98d5f';
    ctx.fillRect(0, SHORE.sandY, WORLD.width, 14);
    ctx.fillStyle = '#a87c4f';
    for (let x = 0; x < WORLD.width; x += 46) ctx.fillRect(x, SHORE.sandY + 2, 3, 10);
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, SHORE.waterY, WORLD.width, WORLD.height - SHORE.waterY);
    // Animated shimmer lines on the water.
    ctx.fillStyle = COLORS.seaDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      const yy = SHORE.waterY + 26 + ((x * 7 + Math.floor(this.time * 20)) % 90);
      ctx.fillRect(x, yy, 54, 5);
    }
    ctx.fillStyle = '#ffffffcc';
    ctx.fillRect(0, SHORE.waterY - 3, WORLD.width, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CORAL BAY', 40, SHORE.waterY + 46);
  }

  // --- city furniture ---

  paintBuildings(ctx, game) {
    const viewLeft = this.cam.x - 40;
    const viewRight = this.cam.x + this.canvas.width + 40;
    const viewTop = this.cam.y - 40;
    const viewBottom = this.cam.y + this.canvas.height + 40;
    for (const b of game.city.buildings) {
      if (b.x + b.w < viewLeft || b.x > viewRight || b.y + b.h < viewTop || b.y > viewBottom) continue;
      // Drop shadow, then the roof.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.buildingLine;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Sunlit roof inset.
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop vents / AC units.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (const v of b.vents) ctx.fillRect(v.x, v.y, v.s, v.s);
      // Shop sign across the middle.
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

  paintProps(ctx, game) {
    const viewLeft = this.cam.x - 30;
    const viewRight = this.cam.x + this.canvas.width + 30;
    const viewTop = this.cam.y - 30;
    const viewBottom = this.cam.y + this.canvas.height + 30;
    for (const t of game.city.trees) {
      if (t.x < viewLeft || t.x > viewRight || t.y < viewTop || t.y > viewBottom) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f7a34';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#58a844';
      ctx.beginPath();
      ctx.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3a3a42';
    for (const l of game.city.lamps) ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = '#c0392b';
    for (const h of game.city.hydrants) ctx.fillRect(h.x - 3, h.y - 3, 6, 6);
  }

  paintStashes(ctx, game) {
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

  // Mission marker, taxi marker and the bank-robbery ring.
  paintBeacons(ctx, game) {
    const beacon = (x, y, color, label) => {
      const bob = Math.sin(this.time * 3) * 4;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(12, -8);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▼', 0, -16);
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 26 + Math.sin(this.time * 3) * 4, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (label) {
        ctx.font = 'bold 13px sans-serif';
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x - w / 2, y - 64, w, 20);
        ctx.fillStyle = '#111';
        ctx.fillText(label, x, y - 50);
      }
    };
    const target = game.missions.currentTarget();
    if (target) beacon(target.x, target.y, '#ffd23f', game.missions.currentStep().text);
    const taxi = game.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      beacon(stop.x, stop.y, '#58d068', taxi.stage === 'pickup' ? 'PICKUP' : 'DROP-OFF');
    }
    const step = game.missions.currentStep();
    if (step && step.type === 'rob') {
      const bank = game.city.landmarks.bank;
      ctx.strokeStyle = '#e33f2f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(bank.x, bank.y, 90, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- actors ---

  paintCrowd(ctx, game) {
    for (const ped of game.crowd.peds) {
      this.paintPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.state === 'down');
    }
    for (const cop of game.cops) {
      this.paintPerson(ctx, cop.x, cop.y, cop.angle, '#20242e', '#f0c8a0', cop.state === 'down', true);
    }
  }

  paintPerson(ctx, x, y, angle, shirt, skin, down, isCop = false) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      ctx.fillRect(-12, -6, 24, 12);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(15, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    // Shadow, body, head, and the direction they face.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.fillRect(8, -4, 6, 8);
    if (isCop) {
      // Badge stripe and cap.
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-8, -9, 5, 18);
      ctx.fillStyle = '#20242e';
      ctx.beginPath();
      ctx.arc(4, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  paintCars(ctx, game) {
    const ordered = [...game.traffic.cars].sort((a, b) => a.y - b.y);
    for (const car of ordered) {
      if (car !== game.playerCar) this.paintCar(ctx, car, game);
    }
    if (game.playerCar) this.paintCar(ctx, game.playerCar, game);
  }

  paintCar(ctx, car, game) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.skid > 0) {
      ctx.fillStyle = 'rgba(20,20,20,0.5)';
      ctx.fillRect(-car.w / 2, -car.h / 2 - 4, 26, 4);
      ctx.fillRect(-car.w / 2, car.h / 2, 26, 4);
    }
    // Shadow, then the body.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Hood highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(car.w / 2 - 12, -car.h / 2 + 3, 9, car.h - 6);
    // Cabin and windshield.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-6, -car.h / 2 + 3, 16, car.h - 6, 4);
    ctx.fill();
    ctx.fillStyle = '#8fc7e8';
    ctx.fillRect(7, -car.h / 2 + 4, 3, car.h - 8);
    // Wheels and headlights.
    ctx.fillStyle = '#14141a';
    ctx.fillRect(-car.w / 2 + 4, -car.h / 2 - 3, 9, 5);
    ctx.fillRect(-car.w / 2 + 4, car.h / 2 - 2, 9, 5);
    ctx.fillRect(car.w / 2 - 13, -car.h / 2 - 3, 9, 5);
    ctx.fillRect(car.w / 2 - 13, car.h / 2 - 2, 9, 5);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 5);
    ctx.fillRect(car.w / 2 - 2, car.h / 2 - 8, 3, 5);
    // Police livery, light bar and POLICE lettering.
    if (car.police) {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-car.w / 2 + 8, -car.h / 2 + 2, car.w - 16, 4);
      ctx.fillRect(-car.w / 2 + 8, car.h / 2 - 6, car.w - 16, 4);
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      const blink = Math.floor(this.time * 6) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2e2e' : '#2e6bff';
      ctx.beginPath();
      ctx.arc(-2, -car.h / 2 + 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? '#2e6bff' : '#ff2e2e';
      ctx.beginPath();
      ctx.arc(-2, car.h / 2 - 1, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.taxi) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (car.van) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ARMORED', 0, 3);
    }
    // Damage smoke.
    if (car.smoke > 0) {
      ctx.fillStyle = `rgba(120,120,120,${0.5 * car.smoke})`;
      ctx.beginPath();
      ctx.arc(-car.w / 2 + 4, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // The player's car gets a gold outline.
    if (car === game.playerCar) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 9);
      ctx.stroke();
      ctx.restore();
    }
  }

  paintPlayer(ctx, game) {
    const p = game.player;
    if (p.inCar) return;
    this.paintPerson(ctx, p.x, p.y, p.angle, '#e33f2f', '#f0c8a0', false);
    if (p.weapon === 'pistol') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#22222a';
      ctx.fillRect(10, -2, 12, 4);
      ctx.restore();
    }
    // Pulsing ring so the player is always findable.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,63,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18 + Math.sin(this.time * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- effects and light ---

  paintEffects(ctx, game) {
    for (const pt of game.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of game.tracers) {
      ctx.globalAlpha = Math.max(0, t.life / 0.15);
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const m of game.muzzles) {
      ctx.globalAlpha = Math.max(0, m.life / 0.08);
      ctx.fillStyle = '#ffdf6b';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // A warm sunset wash, stronger toward the screen edges.
  paintLight(ctx) {
    const cx = this.cam.x + this.canvas.width / 2;
    const cy = this.cam.y + this.canvas.height / 2;
    const glow = ctx.createRadialGradient(cx, cy, 200, cx, cy, 900);
    glow.addColorStop(0, 'rgba(255,170,80,0)');
    glow.addColorStop(1, 'rgba(255,120,40,0.10)');
    ctx.fillStyle = glow;
    ctx.fillRect(this.cam.x, this.cam.y, this.canvas.width, this.canvas.height);
  }

  // --- minimap ---

  paintMinimap(game) {
    const mm = this.mm;
    const mw = 190;
    const mh = 138;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    mm.clearRect(0, 0, mw, mh);
    mm.fillStyle = 'rgba(10,14,20,0.72)';
    mm.fillRect(0, 0, mw, mh);
    // Water and sand at the bottom.
    mm.fillStyle = '#2e7fa8';
    mm.fillRect(0, SHORE.waterY * sy, mw, (WORLD.height - SHORE.waterY) * sy);
    mm.fillStyle = '#e8cf9a';
    mm.fillRect(0, SHORE.sandY * sy, mw, (SHORE.waterY - SHORE.sandY) * sy);
    // Roads and the park.
    mm.fillStyle = '#8a8a92';
    for (const ax of AVENUES) mm.fillRect(ax * sx - 1, 0, 3, SHORE.sandY * sy);
    for (const sy2 of STREETS) mm.fillRect(0, sy2 * sy - 1, mw, 3);
    const park = game.city.park;
    mm.fillStyle = '#5d9448';
    mm.fillRect(park.x * sx, park.y * sy, park.w * sx, park.h * sy);
    // Mission and taxi markers.
    const target = game.missions.currentTarget();
    if (target) {
      mm.fillStyle = '#ffd23f';
      mm.beginPath();
      mm.arc(target.x * sx, target.y * sy, 4, 0, Math.PI * 2);
      mm.fill();
    }
    const taxi = game.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      mm.fillStyle = '#58d068';
      mm.beginPath();
      mm.arc(stop.x * sx, stop.y * sy, 4, 0, Math.PI * 2);
      mm.fill();
    }
    // Police blips in blue.
    mm.fillStyle = '#4a90ff';
    for (const car of game.traffic.cars) {
      if (car.police && !car.dead) {
        mm.beginPath();
        mm.arc(car.x * sx, car.y * sy, 2.5, 0, Math.PI * 2);
        mm.fill();
      }
    }
    // The player, as a white arrow.
    const pl = game.player;
    const px = pl.inCar ? game.playerCar.x : pl.x;
    const py = pl.inCar ? game.playerCar.y : pl.y;
    mm.save();
    mm.translate(px * sx, py * sy);
    mm.rotate(pl.inCar ? game.playerCar.angle : pl.angle);
    mm.fillStyle = '#fff';
    mm.beginPath();
    mm.moveTo(6, 0);
    mm.lineTo(-4, -4);
    mm.lineTo(-4, 4);
    mm.closePath();
    mm.fill();
    mm.restore();
    // Viewport box.
    mm.strokeStyle = 'rgba(255,255,255,0.7)';
    mm.lineWidth = 1;
    mm.strokeRect(this.cam.x * sx, this.cam.y * sy, this.canvas.width * sx, this.canvas.height * sy);
  }
}
