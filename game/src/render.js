// Rendering: the top-down city, cars, people, particles, sunset light
// and the minimap. Everything is drawn with canvas primitives — the
// game ships no image assets at all, so the whole look is code.
//
// The draw order is the depth order: grass, roads, park, shore,
// buildings, props, stashes, markers, people, cars, the player,
// effects, and finally the sunset wash over everything.
import { WORLD, ROAD, SHORE, COLORS, clamp } from './config.js';
import { AVENUES, STREETS } from './city.js';

// The rectangle of the world currently on screen, padded a little so
// objects half in frame still draw.
function visibleRect(cam, width, height, pad) {
  return {
    left: cam.x - pad,
    right: cam.x + width + pad,
    top: cam.y - pad,
    bottom: cam.y + height + pad,
  };
}

// Does a box overlap a rectangle? Used to skip off-screen drawing.
function overlaps(rect, x, y, w, h) {
  return x + w >= rect.left && x <= rect.right && y + h >= rect.top && y <= rect.bottom;
}

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
    const goalX = clamp(focusX - w / 2, 0, Math.max(0, WORLD.width - w));
    const goalY = clamp(focusY - h / 2, 0, Math.max(0, WORLD.height - h));
    const ease = Math.min(1, dt * 5);
    this.cam.x += (goalX - this.cam.x) * ease;
    this.cam.y += (goalY - this.cam.y) * ease;
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
    this.drawGrass(ctx);
    this.drawRoads(ctx);
    this.drawPark(ctx, game);
    this.drawShore(ctx);
    this.drawBuildings(ctx, game);
    this.drawProps(ctx, game);
    this.drawStashes(ctx, game);
    this.drawPickups(ctx, game);
    this.drawMarkers(ctx, game);
    this.drawRacePad(ctx, game);
    this.drawPeople(ctx, game);
    this.drawCars(ctx, game);
    this.drawPlayer(ctx, game);
    this.drawEffects(ctx, game);
    this.drawHelicopter(ctx, game);
    this.drawSpikes(ctx, game);
    this.drawSunset(ctx);
    // Night falls over the world, then the rain over that.
    game.daynight.draw(ctx, { x: this.cam.x, y: this.cam.y, w: W, h: H }, game);
    // Rain falls over the whole viewport, above the world.
    game.weather.draw(ctx, { x: this.cam.x, y: this.cam.y, w: W, h: H });
    ctx.restore();
    this.drawMinimap(game);
    if (game.player.hurtFlash > 0) {
      ctx.fillStyle = `rgba(227,63,47,${game.player.hurtFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // --- ground and roads ---

  drawGrass(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(this.cam.x - 20, this.cam.y - 20, w + 40, h + 40);
    // Mow stripes give the grass some texture: alternating bands.
    const band = 120;
    ctx.fillStyle = COLORS.grassShade;
    const startX = Math.floor(this.cam.x / band) * band;
    const startY = Math.floor(this.cam.y / band) * band;
    for (let x = startX; x < this.cam.x + w; x += band * 2) {
      for (let y = startY; y < this.cam.y + h; y += band) {
        ctx.fillRect(x, y, band, band);
      }
    }
  }

  // Avenues and streets visible right now, as {x} / {y} centre lines.
  visibleRoads() {
    const pad = 80;
    const x0 = this.cam.x - pad;
    const x1 = this.cam.x + this.canvas.width + pad;
    const y0 = this.cam.y - pad;
    const y1 = this.cam.y + this.canvas.height + pad;
    return {
      avenues: AVENUES.filter((ax) => ax >= x0 && ax <= x1),
      streets: STREETS.filter((sy) => sy >= y0 && sy <= y1),
    };
  }

  drawRoads(ctx) {
    const { avenues, streets } = this.visibleRoads();
    const half = ROAD.width / 2;
    // Asphalt first.
    ctx.fillStyle = COLORS.asphalt;
    for (const ax of avenues) ctx.fillRect(ax - half, 0, ROAD.width, SHORE.sandY);
    for (const sy of streets) ctx.fillRect(0, sy - half, WORLD.width, ROAD.width);
    // Sidewalks hug both edges of every road.
    ctx.fillStyle = COLORS.sidewalk;
    for (const ax of avenues) {
      ctx.fillRect(ax - half - 8, 0, 8, SHORE.sandY);
      ctx.fillRect(ax + half, 0, 8, SHORE.sandY);
    }
    for (const sy of streets) {
      ctx.fillRect(0, sy - half - 8, WORLD.width, 8);
      ctx.fillRect(0, sy + half, WORLD.width, 8);
    }
    // Centre dashes down every road.
    ctx.fillStyle = COLORS.laneMark;
    for (const ax of avenues) {
      for (let y = 0; y < SHORE.sandY; y += 56) ctx.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of streets) {
      for (let x = 0; x < WORLD.width; x += 56) ctx.fillRect(x, sy - 2, 28, 4);
    }
    // Crosswalks at every intersection in view.
    ctx.fillStyle = '#e8e4da';
    for (const ax of avenues) {
      for (const sy of streets) {
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(ax + i * 10 - 3, sy - half + 4, 6, 12);
          ctx.fillRect(ax + i * 10 - 3, sy + half - 16, 6, 12);
        }
      }
    }
  }

  drawPark(ctx, game) {
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

  drawShore(ctx) {
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

  drawBuildings(ctx, game) {
    const view = visibleRect(this.cam, this.canvas.width, this.canvas.height, 40);
    for (const b of game.city.buildings) {
      if (!overlaps(view, b.x, b.y, b.w, b.h)) continue;
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

  drawProps(ctx, game) {
    const view = visibleRect(this.cam, this.canvas.width, this.canvas.height, 30);
    for (const t of game.city.trees) {
      if (!overlaps(view, t.x - t.r, t.y - t.r, t.r * 2, t.r * 2)) continue;
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
    // Park benches face the paths.
    for (const bench of game.city.benches) {
      if (!overlaps(view, bench.x - 12, bench.y - 4, 24, 8)) continue;
      ctx.save();
      ctx.translate(bench.x, bench.y);
      ctx.rotate(bench.angle);
      ctx.fillStyle = '#8a6b46';
      ctx.fillRect(-11, -3, 22, 6);
      ctx.fillStyle = '#6b5236';
      ctx.fillRect(-11, 3, 22, 2);
      ctx.restore();
    }
    ctx.fillStyle = '#3a3a42';
    for (const l of game.city.lamps) ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = '#c0392b';
    for (const h of game.city.hydrants) ctx.fillRect(h.x - 3, h.y - 3, 6, 6);
    // Food stalls: striped awning and counter.
    for (const ped of game.crowd.peds) {
      if (ped.kind !== 'vendor' || ped.state === 'down') continue;
      if (!overlaps(view, ped.x - 30, ped.y - 30, 60, 60)) continue;
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle);
      ctx.fillStyle = '#8a6b46';
      ctx.fillRect(-14, -10, 28, 20);
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(-16, -12, 32, 5);
      ctx.fillStyle = '#e33f2f';
      for (let i = -2; i <= 2; i += 2) ctx.fillRect(-16 + i * 8, -12, 8, 5);
      ctx.fillStyle = '#f2c230';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SNACKS', 0, 4);
      ctx.restore();
    }
    // Stunt ramps: chevron boards across the road.
    for (const ramp of game.stunts.ramps) {
      if (!overlaps(view, ramp.x - 30, ramp.y - 30, 60, 60)) continue;
      ctx.save();
      ctx.translate(ramp.x, ramp.y);
      ctx.rotate(ramp.angle);
      ctx.fillStyle = '#f2c230';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(-14 + i * 12, -16, 6, 32);
      }
      ctx.fillStyle = '#22222a';
      ctx.fillRect(-16, -18, 32, 4);
      ctx.restore();
    }
  }

  drawStashes(ctx, game) {
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

  // Pickups on the ground: ammo crates, medkits, dropped wallets.
  // Each one pulses so a Marco on foot can spot it from a distance.
  drawPickups(ctx, game) {
    for (const item of game.pickups.items) {
      if (item.taken) continue;
      const pulse = 1 + Math.sin(this.time * 4 + item.x) * 0.12;
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.scale(pulse, pulse);
      if (item.kind === 'ammo') {
        ctx.fillStyle = '#2c2c34';
        ctx.fillRect(-10, -7, 20, 14);
        ctx.fillStyle = '#f2c230';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', 0, 3);
      } else if (item.kind === 'health') {
        ctx.fillStyle = '#e8e4da';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#58d068';
        ctx.fillRect(-2, -7, 4, 14);
        ctx.fillRect(-7, -2, 14, 4);
      } else {
        ctx.fillStyle = '#7dff8a';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 3);
      }
      ctx.restore();
    }
  }

  // The street-race start pad by the stadium, and the next
  // checkpoint flag while a race is running.
  drawRacePad(ctx, game) {
    const race = game.races;
    if (!race) return;
    const pad = race.pad;
    ctx.save();
    ctx.strokeStyle = race.state === 'armed' ? '#ffd23f' : 'rgba(255,210,63,0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RACE', pad.x, pad.y - 70);
    ctx.restore();
    const target = race.currentTarget();
    if (target) {
      const bob = Math.sin(this.time * 4) * 5;
      ctx.save();
      ctx.translate(target.x, target.y + bob);
      ctx.fillStyle = '#ff5f6d';
      ctx.beginPath();
      ctx.moveTo(0, -40);
      ctx.lineTo(14, -10);
      ctx.lineTo(-14, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏁', 0, -22);
      ctx.restore();
    }
  }

  // Mission marker, taxi marker, courier marker and the bank-robbery ring.
  drawMarkers(ctx, game) {
    const marker = (x, y, color, label) => {
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
    if (target) marker(target.x, target.y, '#ffd23f', game.missions.currentStep().text);
    const taxi = game.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      marker(stop.x, stop.y, '#58d068', taxi.stage === 'pickup' ? 'PICKUP' : 'DROP-OFF');
    }
    const courier = game.missions.courier;
    if (courier) {
      marker(courier.target.x, courier.target.y, '#7fd0ff', courier.label);
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

  drawPeople(ctx, game) {
    for (const ped of game.crowd.peds) {
      this.drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.state === 'down');
    }
    for (const member of game.gangs.members) {
      this.drawPerson(ctx, member.x, member.y, member.angle, member.color, member.skin, member.state === 'down');
    }
    for (const cop of game.cops) {
      this.drawPerson(ctx, cop.x, cop.y, cop.angle, '#20242e', '#f0c8a0', cop.state === 'down', true);
    }
  }

  drawPerson(ctx, x, y, angle, shirt, skin, down, isCop = false) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      // Lying flat, head to one side.
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

  drawCars(ctx, game) {
    const ordered = [...game.traffic.cars].sort((a, b) => a.y - b.y);
    for (const car of ordered) {
      if (car !== game.playerCar) this.drawCar(ctx, car, game);
    }
    if (game.playerCar) this.drawCar(ctx, game.playerCar, game);
  }

  drawCar(ctx, car, game) {
    const lift = car.airHeight || 0;
    ctx.save();
    ctx.translate(car.x, car.y - lift);
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
    if (car.bus) {
      // A bus is a long box with a row of windows and a route number.
      ctx.fillStyle = '#1d2733';
      for (let i = 0; i < 4; i++) ctx.fillRect(-car.w / 2 + 8 + i * 13, -car.h / 2 + 3, 9, car.h - 6);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('7', car.w / 2 - 8, 3);
    }
    if (car.bike) {
      // A bike is a sliver with a rider hunched over it.
      ctx.fillStyle = '#14141a';
      ctx.beginPath();
      ctx.arc(-car.w / 2 + 3, 0, 4, 0, Math.PI * 2);
      ctx.arc(car.w / 2 - 3, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e33f2f';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Damage smoke.
    if (car.smoke > 0) {
      ctx.fillStyle = `rgba(120,120,120,${0.5 * car.smoke})`;
      ctx.beginPath();
      ctx.arc(-car.w / 2 + 4, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // An airborne car leaves its shadow on the ground below.
    if (lift > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(car.x, car.y, 24, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // The player's car gets a gold outline.
    if (car === game.playerCar) {
      ctx.save();
      ctx.translate(car.x, car.y - lift);
      ctx.rotate(car.angle);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 9);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(ctx, game) {
    const p = game.player;
    if (p.inCar) return;
    this.drawPerson(ctx, p.x, p.y, p.angle, '#e33f2f', '#f0c8a0', false);
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

  // The police helicopter: dark body, spinning rotor, spotlight cone tracking Marco.
  drawHelicopter(ctx, game) {
    const heli = game.police && game.police.heli;
    if (!heli) return;
    const p = game.player;
    const tx = p.inCar && game.playerCar ? game.playerCar.x : p.x;
    const ty = p.inCar && game.playerCar ? game.playerCar.y : p.y;
    if (heli.watching) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,240,180,0.16)';
      ctx.beginPath();
      ctx.moveTo(heli.x, heli.y);
      ctx.lineTo(tx - 55, ty - 55);
      ctx.lineTo(tx + 55, ty + 55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,180,0.30)';
      ctx.beginPath();
      ctx.arc(tx, ty, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save(); // shadow on the ground, body floating above it
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(heli.x, heli.y, 26, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(heli.x, heli.y - 26);
    ctx.rotate(heli.angle);
    ctx.fillStyle = '#20242e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8fc7e8';
    ctx.beginPath();
    ctx.arc(10, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e6bff';
    ctx.fillRect(-16, -3, 8, 6);
    ctx.strokeStyle = 'rgba(32,36,46,0.7)'; // spinning rotor, blurred
    ctx.lineWidth = 3;
    const r = this.time * 22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(r) * 30, Math.sin(r) * 30);
    ctx.lineTo(-Math.cos(r) * 30, -Math.sin(r) * 30);
    ctx.stroke();
    ctx.restore();
  }

  // Spike strips at five stars: a dark band with steel teeth.
  drawSpikes(ctx, game) {
    const spikes = game.police ? game.police.spikes : [];
    for (const strip of spikes) {
      ctx.save();
      ctx.translate(strip.x, strip.y);
      ctx.rotate(strip.angle);
      ctx.fillStyle = '#1a1a20';
      ctx.fillRect(-40, -6, 80, 12);
      ctx.fillStyle = '#c8ccd4';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 11, -6);
        ctx.lineTo(i * 11 + 5, 0);
        ctx.lineTo(i * 11, 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- effects and light ---

  drawEffects(ctx, game) {
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
  drawSunset(ctx) {
    const cx = this.cam.x + this.canvas.width / 2;
    const cy = this.cam.y + this.canvas.height / 2;
    const glow = ctx.createRadialGradient(cx, cy, 200, cx, cy, 900);
    glow.addColorStop(0, 'rgba(255,170,80,0)');
    glow.addColorStop(1, 'rgba(255,120,40,0.10)');
    ctx.fillStyle = glow;
    ctx.fillRect(this.cam.x, this.cam.y, this.canvas.width, this.canvas.height);
  }

  // --- minimap ---

  drawMinimap(game) {
    const mm = this.mm;
    const mw = 190;
    const mh = 138;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    // A filled dot on the minimap.
    const blip = (x, y, r, color) => {
      mm.fillStyle = color;
      mm.beginPath();
      mm.arc(x * sx, y * sy, r, 0, Math.PI * 2);
      mm.fill();
    };
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
    // Mission, taxi and courier markers.
    const target = game.missions.currentTarget();
    if (target) blip(target.x, target.y, 4, '#ffd23f');
    const taxi = game.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      blip(stop.x, stop.y, 4, '#58d068');
    }
    const courier = game.missions.courier;
    if (courier) blip(courier.target.x, courier.target.y, 4, '#7fd0ff');
    // Police blips in blue; the helicopter in red.
    for (const car of game.traffic.cars) {
      if (car.police && !car.dead) blip(car.x, car.y, 2.5, '#4a90ff');
    }
    if (game.police && game.police.heli) {
      blip(game.police.heli.x, game.police.heli.y, 3.5, '#ff2e2e');
    }
    // Food stalls in green.
    for (const ped of game.crowd.peds) {
      if (ped.kind === 'vendor') blip(ped.x, ped.y, 2.5, '#58d068');
    }
    // Pickups in yellow, the race pad in red, the race target in pink.
    for (const item of game.pickups.items) {
      if (!item.taken) blip(item.x, item.y, 2, '#ffd23f');
    }
    if (game.races) {
      blip(game.races.pad.x, game.races.pad.y, 3, '#ff5f6d');
      const raceTarget = game.races.currentTarget();
      if (raceTarget) blip(raceTarget.x, raceTarget.y, 3.5, '#ff8fb0');
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
