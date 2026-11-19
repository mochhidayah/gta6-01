// Rendering: the top-down city, cars, people, particles, sunset light
// and the minimap. Everything is drawn with canvas primitives — the
// world ships no image assets at all, so the whole look is code.
//
// The paint order is the depth order: grass, roads, park, shore,
// buildings, props, stashes, markers, people, cars, the player,
// effects, and finally the sunset wash over everything. v5 rewrote
// this file wholesale — new method names and structure, same pixels —
// and kept the v4 hooks: side-job markers on the world and minimap,
// and the cutscene title card.
import { WORLD, ROAD, SHORE, COLORS, clamp } from './config.js';
import { AVENUES, STREETS } from './city.js';

// The rectangle of the world currently on screen, padded a little so
// objects half in frame still paint.
function screenRect(cam, width, height, pad) {
  return {
    left: cam.x - pad,
    right: cam.x + width + pad,
    top: cam.y - pad,
    bottom: cam.y + height + pad,
  };
}

// Does a box overlap a rectangle? Used to skip off-screen painting.
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
    this.tick = 0;
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

  draw(world) {
    const pen = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.tick += 1 / 60;
    pen.save();
    if (this.shake > 0) {
      pen.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    pen.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.drawGround(pen);
    this.drawRoads(pen);
    this.drawPark(pen, world);
    this.drawShore(pen);
    this.drawBuildings(pen, world);
    this.drawProps(pen, world);
    this.drawStashes(pen, world);
    this.drawPickups(pen, world);
    this.drawMarkers(pen, world);
    if (world.sidejobs) world.sidejobs.draw(pen, this.cam);
    this.drawRacePad(pen, world);
    this.drawPeople(pen, world);
    this.drawCars(pen, world);
    this.drawPlayer(pen, world);
    this.drawEffects(pen, world);
    this.drawHelicopter(pen, world);
    this.drawSpikes(pen, world);
    this.drawSunset(pen);
    // Night falls over the world, then the rain over that.
    world.daynight.draw(pen, { x: this.cam.x, y: this.cam.y, w: W, h: H }, world);
    // Rain falls over the whole viewport, above the world.
    world.weather.draw(pen, { x: this.cam.x, y: this.cam.y, w: W, h: H });
    pen.restore();
    this.drawMinimap(world);
    if (world.player.hurtFlash > 0) {
      pen.fillStyle = `rgba(227,63,47,${world.player.hurtFlash * 0.45})`;
      pen.fillRect(0, 0, W, H);
    }
    if (world.cutscenes) world.cutscenes.drawTitle(pen, W, H);
  }

  // --- ground and roads ---

  drawGround(pen) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    pen.fillStyle = COLORS.grass;
    pen.fillRect(this.cam.x - 20, this.cam.y - 20, w + 40, h + 40);
    // Mow stripes give the grass some texture: alternating bands.
    const band = 120;
    pen.fillStyle = COLORS.grassShade;
    const startX = Math.floor(this.cam.x / band) * band;
    const startY = Math.floor(this.cam.y / band) * band;
    for (let x = startX; x < this.cam.x + w; x += band * 2) {
      for (let y = startY; y < this.cam.y + h; y += band) {
        pen.fillRect(x, y, band, band);
      }
    }
  }

  // Avenues and streets visible right now, as {x} / {y} centre lines.
  roadsInView() {
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

  drawRoads(pen) {
    const { avenues, streets } = this.roadsInView();
    const half = ROAD.width / 2;
    // Asphalt first.
    pen.fillStyle = COLORS.asphalt;
    for (const ax of avenues) pen.fillRect(ax - half, 0, ROAD.width, SHORE.sandY);
    for (const sy of streets) pen.fillRect(0, sy - half, WORLD.width, ROAD.width);
    // Sidewalks hug both edges of every road.
    pen.fillStyle = COLORS.sidewalk;
    for (const ax of avenues) {
      pen.fillRect(ax - half - 8, 0, 8, SHORE.sandY);
      pen.fillRect(ax + half, 0, 8, SHORE.sandY);
    }
    for (const sy of streets) {
      pen.fillRect(0, sy - half - 8, WORLD.width, 8);
      pen.fillRect(0, sy + half, WORLD.width, 8);
    }
    // Centre dashes down every road.
    pen.fillStyle = COLORS.laneMark;
    for (const ax of avenues) {
      for (let y = 0; y < SHORE.sandY; y += 56) pen.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of streets) {
      for (let x = 0; x < WORLD.width; x += 56) pen.fillRect(x, sy - 2, 28, 4);
    }
    // Crosswalks at every intersection in view.
    pen.fillStyle = '#e8e4da';
    for (const ax of avenues) {
      for (const sy of streets) {
        for (let i = -3; i <= 3; i++) {
          pen.fillRect(ax + i * 10 - 3, sy - half + 4, 6, 12);
          pen.fillRect(ax + i * 10 - 3, sy + half - 16, 6, 12);
        }
      }
    }
  }

  drawPark(pen, world) {
    const p = world.city.park;
    pen.fillStyle = COLORS.parkGreen;
    pen.fillRect(p.x, p.y, p.w, p.h);
    pen.strokeStyle = '#4a7a38';
    pen.lineWidth = 4;
    pen.strokeRect(p.x, p.y, p.w, p.h);
    // The pond.
    pen.fillStyle = '#4a90b8';
    pen.beginPath();
    pen.ellipse(p.x + p.w * 0.62, p.y + p.h * 0.6, 46, 30, 0, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = '#fff';
    pen.font = 'bold 15px sans-serif';
    pen.textAlign = 'center';
    pen.fillText('PALMERA PARK', p.x + p.w / 2, p.y + 24);
  }

  drawShore(pen) {
    // Sand, then the boardwalk, then Coral Bay itself.
    pen.fillStyle = COLORS.sand;
    pen.fillRect(0, SHORE.sandY, WORLD.width, SHORE.waterY - SHORE.sandY);
    pen.fillStyle = '#b98d5f';
    pen.fillRect(0, SHORE.sandY, WORLD.width, 14);
    pen.fillStyle = '#a87c4f';
    for (let x = 0; x < WORLD.width; x += 46) pen.fillRect(x, SHORE.sandY + 2, 3, 10);
    pen.fillStyle = COLORS.sea;
    pen.fillRect(0, SHORE.waterY, WORLD.width, WORLD.height - SHORE.waterY);
    // Animated shimmer lines on the water.
    pen.fillStyle = COLORS.seaDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      const yy = SHORE.waterY + 26 + ((x * 7 + Math.floor(this.tick * 20)) % 90);
      pen.fillRect(x, yy, 54, 5);
    }
    pen.fillStyle = '#ffffffcc';
    pen.fillRect(0, SHORE.waterY - 3, WORLD.width, 5);
    pen.fillStyle = '#fff';
    pen.font = 'bold 16px sans-serif';
    pen.textAlign = 'left';
    pen.fillText('CORAL BAY', 40, SHORE.waterY + 46);
  }

  // --- city furniture ---

  drawBuildings(pen, world) {
    const frame = screenRect(this.cam, this.canvas.width, this.canvas.height, 40);
    for (const b of world.city.buildings) {
      if (!overlaps(frame, b.x, b.y, b.w, b.h)) continue;
      // Drop shadow, then the roof.
      pen.fillStyle = 'rgba(0,0,0,0.25)';
      pen.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      pen.fillStyle = b.color;
      pen.fillRect(b.x, b.y, b.w, b.h);
      pen.strokeStyle = COLORS.buildingLine;
      pen.lineWidth = 2;
      pen.strokeRect(b.x, b.y, b.w, b.h);
      // Sunlit roof inset.
      pen.fillStyle = 'rgba(255,255,255,0.14)';
      pen.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop vents / AC units.
      pen.fillStyle = 'rgba(0,0,0,0.3)';
      for (const v of b.vents) pen.fillRect(v.x, v.y, v.s, v.s);
      // Shop sign across the middle.
      if (b.sign) {
        pen.fillStyle = '#22222a';
        pen.fillRect(b.x + b.w / 2 - 26, b.y + b.h / 2 - 10, 52, 20);
        pen.fillStyle = '#ffe9a8';
        pen.font = 'bold 11px sans-serif';
        pen.textAlign = 'center';
        pen.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }

  drawProps(pen, world) {
    const frame = screenRect(this.cam, this.canvas.width, this.canvas.height, 30);
    for (const t of world.city.trees) {
      if (!overlaps(frame, t.x - t.r, t.y - t.r, t.r * 2, t.r * 2)) continue;
      pen.fillStyle = 'rgba(0,0,0,0.2)';
      pen.beginPath();
      pen.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = '#3f7a34';
      pen.beginPath();
      pen.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = '#58a844';
      pen.beginPath();
      pen.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, Math.PI * 2);
      pen.fill();
    }
    // Park benches face the paths.
    for (const bench of world.city.benches) {
      if (!overlaps(frame, bench.x - 12, bench.y - 4, 24, 8)) continue;
      pen.save();
      pen.translate(bench.x, bench.y);
      pen.rotate(bench.angle);
      pen.fillStyle = '#8a6b46';
      pen.fillRect(-11, -3, 22, 6);
      pen.fillStyle = '#6b5236';
      pen.fillRect(-11, 3, 22, 2);
      pen.restore();
    }
    pen.fillStyle = '#3a3a42';
    for (const l of world.city.lamps) pen.fillRect(l.x - 2, l.y - 2, 4, 4);
    pen.fillStyle = '#c0392b';
    for (const h of world.city.hydrants) pen.fillRect(h.x - 3, h.y - 3, 6, 6);
    // Food stalls: striped awning and counter.
    for (const ped of world.crowd.peds) {
      if (ped.kind !== 'vendor' || ped.state === 'down') continue;
      if (!overlaps(frame, ped.x - 30, ped.y - 30, 60, 60)) continue;
      pen.save();
      pen.translate(ped.x, ped.y);
      pen.rotate(ped.angle);
      pen.fillStyle = '#8a6b46';
      pen.fillRect(-14, -10, 28, 20);
      pen.fillStyle = '#e8e4da';
      pen.fillRect(-16, -12, 32, 5);
      pen.fillStyle = '#e33f2f';
      for (let i = -2; i <= 2; i += 2) pen.fillRect(-16 + i * 8, -12, 8, 5);
      pen.fillStyle = '#f2c230';
      pen.font = 'bold 8px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('SNACKS', 0, 4);
      pen.restore();
    }
    // Stunt ramps: chevron boards across the road.
    for (const ramp of world.stunts.ramps) {
      if (!overlaps(frame, ramp.x - 30, ramp.y - 30, 60, 60)) continue;
      pen.save();
      pen.translate(ramp.x, ramp.y);
      pen.rotate(ramp.angle);
      pen.fillStyle = '#f2c230';
      for (let i = -1; i <= 1; i++) {
        pen.fillRect(-14 + i * 12, -16, 6, 32);
      }
      pen.fillStyle = '#22222a';
      pen.fillRect(-16, -18, 32, 4);
      pen.restore();
    }
  }

  drawStashes(pen, world) {
    for (const pkg of world.missions.packages) {
      if (pkg.found) continue;
      const pulse = 1 + Math.sin(this.tick * 4) * 0.15;
      pen.save();
      pen.translate(pkg.x, pkg.y);
      pen.scale(pulse, pulse);
      pen.fillStyle = '#f2c230';
      pen.fillRect(-9, -6, 18, 12);
      pen.fillStyle = '#2c2c34';
      pen.fillRect(-9, -1, 18, 2);
      pen.restore();
    }
  }

  // Pickups on the ground: ammo crates, medkits, dropped wallets.
  // Each one pulses so a Marco on foot can spot it from a distance.
  drawPickups(pen, world) {
    for (const item of world.pickups.items) {
      if (item.taken) continue;
      const pulse = 1 + Math.sin(this.tick * 4 + item.x) * 0.12;
      pen.save();
      pen.translate(item.x, item.y);
      pen.scale(pulse, pulse);
      if (item.kind === 'ammo') {
        pen.fillStyle = '#2c2c34';
        pen.fillRect(-10, -7, 20, 14);
        pen.fillStyle = '#f2c230';
        pen.font = 'bold 8px sans-serif';
        pen.textAlign = 'center';
        pen.fillText('AMMO', 0, 3);
      } else if (item.kind === 'health') {
        pen.fillStyle = '#e8e4da';
        pen.fillRect(-9, -9, 18, 18);
        pen.fillStyle = '#58d068';
        pen.fillRect(-2, -7, 4, 14);
        pen.fillRect(-7, -2, 14, 4);
      } else {
        pen.fillStyle = '#7dff8a';
        pen.beginPath();
        pen.arc(0, 0, 9, 0, Math.PI * 2);
        pen.fill();
        pen.fillStyle = '#111';
        pen.font = 'bold 10px sans-serif';
        pen.textAlign = 'center';
        pen.fillText('$', 0, 3);
      }
      pen.restore();
    }
  }

  // The street-race start pad by the stadium, and the next
  // checkpoint flag while a race is running.
  drawRacePad(pen, world) {
    const race = world.races;
    if (!race) return;
    const pad = race.pad;
    pen.save();
    pen.strokeStyle = race.state === 'armed' ? '#ffd23f' : 'rgba(255,210,63,0.5)';
    pen.lineWidth = 3;
    pen.setLineDash([10, 8]);
    pen.beginPath();
    pen.arc(pad.x, pad.y, 60, 0, Math.PI * 2);
    pen.stroke();
    pen.setLineDash([]);
    pen.fillStyle = '#ffd23f';
    pen.font = 'bold 12px sans-serif';
    pen.textAlign = 'center';
    pen.fillText('RACE', pad.x, pad.y - 70);
    pen.restore();
    const target = race.currentTarget();
    if (target) {
      const bob = Math.sin(this.tick * 4) * 5;
      pen.save();
      pen.translate(target.x, target.y + bob);
      pen.fillStyle = '#ff5f6d';
      pen.beginPath();
      pen.moveTo(0, -40);
      pen.lineTo(14, -10);
      pen.lineTo(-14, -10);
      pen.closePath();
      pen.fill();
      pen.fillStyle = '#fff';
      pen.font = 'bold 11px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('🏁', 0, -22);
      pen.restore();
    }
  }

  // Mission marker, taxi marker, courier marker and the bank-robbery ring.
  drawMarkers(pen, world) {
    const pin = (x, y, color, label) => {
      const bob = Math.sin(this.tick * 3) * 4;
      pen.save();
      pen.translate(x, y + bob);
      pen.fillStyle = color;
      pen.globalAlpha = 0.85;
      pen.beginPath();
      pen.moveTo(0, -34);
      pen.lineTo(12, -8);
      pen.lineTo(-12, -8);
      pen.closePath();
      pen.fill();
      pen.globalAlpha = 1;
      pen.fillStyle = '#fff';
      pen.font = 'bold 12px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('▼', 0, -16);
      pen.restore();
      pen.strokeStyle = color;
      pen.lineWidth = 3;
      pen.beginPath();
      pen.ellipse(x, y, 26 + Math.sin(this.tick * 3) * 4, 12, 0, 0, Math.PI * 2);
      pen.stroke();
      if (label) {
        pen.font = 'bold 13px sans-serif';
        const w = pen.measureText(label).width + 12;
        pen.fillStyle = 'rgba(255,255,255,0.9)';
        pen.fillRect(x - w / 2, y - 64, w, 20);
        pen.fillStyle = '#111';
        pen.fillText(label, x, y - 50);
      }
    };
    const target = world.missions.currentTarget();
    if (target) pin(target.x, target.y, '#ffd23f', world.missions.currentStep().text);
    const taxi = world.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      pin(stop.x, stop.y, '#58d068', taxi.stage === 'pickup' ? 'PICKUP' : 'DROP-OFF');
    }
    const courier = world.missions.courier;
    if (courier) {
      pin(courier.target.x, courier.target.y, '#7fd0ff', courier.label);
    }
    const step = world.missions.currentStep();
    if (step && step.type === 'rob') {
      const bank = world.city.landmarks.bank;
      pen.strokeStyle = '#e33f2f';
      pen.lineWidth = 4;
      pen.beginPath();
      pen.arc(bank.x, bank.y, 90, 0, Math.PI * 2);
      pen.stroke();
    }
  }

  // --- actors ---

  drawPeople(pen, world) {
    for (const ped of world.crowd.peds) {
      this.drawPerson(pen, ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.state === 'down');
    }
    for (const member of world.gangs.members) {
      this.drawPerson(pen, member.x, member.y, member.angle, member.color, member.skin, member.state === 'down');
    }
    for (const cop of world.cops) {
      this.drawPerson(pen, cop.x, cop.y, cop.angle, '#20242e', '#f0c8a0', cop.state === 'down', true);
    }
  }

  drawPerson(pen, x, y, angle, shirt, skin, down, isCop = false) {
    pen.save();
    pen.translate(x, y);
    if (down) {
      // Lying flat, head to one side.
      pen.rotate(angle + Math.PI / 2);
      pen.fillStyle = shirt;
      pen.fillRect(-12, -6, 24, 12);
      pen.fillStyle = skin;
      pen.beginPath();
      pen.arc(15, 0, 6, 0, Math.PI * 2);
      pen.fill();
      pen.restore();
      return;
    }
    pen.rotate(angle);
    // Shadow, body, head, and the direction they face.
    pen.fillStyle = 'rgba(0,0,0,0.25)';
    pen.beginPath();
    pen.ellipse(0, 2, 12, 9, 0, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = shirt;
    pen.beginPath();
    pen.arc(0, 0, 10, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = skin;
    pen.beginPath();
    pen.arc(4, 0, 6, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = shirt;
    pen.fillRect(8, -4, 6, 8);
    if (isCop) {
      // Badge stripe and cap.
      pen.fillStyle = '#ffd23f';
      pen.fillRect(-8, -9, 5, 18);
      pen.fillStyle = '#20242e';
      pen.beginPath();
      pen.arc(4, 0, 7, 0, Math.PI * 2);
      pen.fill();
    }
    pen.restore();
  }

  drawCars(pen, world) {
    const ordered = [...world.traffic.cars].sort((a, b) => a.y - b.y);
    for (const car of ordered) {
      if (car !== world.playerCar) this.drawCar(pen, car, world);
    }
    if (world.playerCar) this.drawCar(pen, world.playerCar, world);
  }

  drawCar(pen, car, world) {
    const lift = car.airHeight || 0;
    pen.save();
    pen.translate(car.x, car.y - lift);
    pen.rotate(car.angle);
    if (car.skid > 0) {
      pen.fillStyle = 'rgba(20,20,20,0.5)';
      pen.fillRect(-car.w / 2, -car.h / 2 - 4, 26, 4);
      pen.fillRect(-car.w / 2, car.h / 2, 26, 4);
    }
    // Shadow, then the body.
    pen.fillStyle = 'rgba(0,0,0,0.3)';
    pen.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
    pen.fillStyle = car.color;
    pen.beginPath();
    pen.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 7);
    pen.fill();
    pen.strokeStyle = 'rgba(0,0,0,0.45)';
    pen.lineWidth = 1.5;
    pen.stroke();
    // Hood highlight.
    pen.fillStyle = 'rgba(255,255,255,0.18)';
    pen.fillRect(car.w / 2 - 12, -car.h / 2 + 3, 9, car.h - 6);
    // Cabin and windshield.
    pen.fillStyle = '#1d2733';
    pen.beginPath();
    pen.roundRect(-6, -car.h / 2 + 3, 16, car.h - 6, 4);
    pen.fill();
    pen.fillStyle = '#8fc7e8';
    pen.fillRect(7, -car.h / 2 + 4, 3, car.h - 8);
    // Wheels and headlights.
    pen.fillStyle = '#14141a';
    pen.fillRect(-car.w / 2 + 4, -car.h / 2 - 3, 9, 5);
    pen.fillRect(-car.w / 2 + 4, car.h / 2 - 2, 9, 5);
    pen.fillRect(car.w / 2 - 13, -car.h / 2 - 3, 9, 5);
    pen.fillRect(car.w / 2 - 13, car.h / 2 - 2, 9, 5);
    pen.fillStyle = '#ffe9a8';
    pen.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 5);
    pen.fillRect(car.w / 2 - 2, car.h / 2 - 8, 3, 5);
    // Police livery, light bar and POLICE lettering.
    if (car.police) {
      pen.fillStyle = '#f5f5f5';
      pen.fillRect(-car.w / 2 + 8, -car.h / 2 + 2, car.w - 16, 4);
      pen.fillRect(-car.w / 2 + 8, car.h / 2 - 6, car.w - 16, 4);
      pen.fillStyle = '#ffd23f';
      pen.font = 'bold 8px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('POLICE', 0, 3);
      const blink = Math.floor(this.tick * 6) % 2 === 0;
      pen.fillStyle = blink ? '#ff2e2e' : '#2e6bff';
      pen.beginPath();
      pen.arc(-2, -car.h / 2 + 1, 4, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = blink ? '#2e6bff' : '#ff2e2e';
      pen.beginPath();
      pen.arc(-2, car.h / 2 - 1, 4, 0, Math.PI * 2);
      pen.fill();
    }
    if (car.taxi) {
      pen.fillStyle = '#111';
      pen.font = 'bold 8px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('TAXI', 0, 3);
    }
    if (car.van) {
      pen.fillStyle = '#ffd23f';
      pen.font = 'bold 8px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('ARMORED', 0, 3);
    }
    if (car.bus) {
      // A bus is a long box with a row of windows and a route number.
      pen.fillStyle = '#1d2733';
      for (let i = 0; i < 4; i++) pen.fillRect(-car.w / 2 + 8 + i * 13, -car.h / 2 + 3, 9, car.h - 6);
      pen.fillStyle = '#fff';
      pen.font = 'bold 9px sans-serif';
      pen.textAlign = 'center';
      pen.fillText('7', car.w / 2 - 8, 3);
    }
    if (car.bike) {
      // A bike is a sliver with a rider hunched over it.
      pen.fillStyle = '#14141a';
      pen.beginPath();
      pen.arc(-car.w / 2 + 3, 0, 4, 0, Math.PI * 2);
      pen.arc(car.w / 2 - 3, 0, 4, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = '#e33f2f';
      pen.beginPath();
      pen.arc(0, 0, 5, 0, Math.PI * 2);
      pen.fill();
    }
    // Damage smoke.
    if (car.smoke > 0) {
      pen.fillStyle = `rgba(120,120,120,${0.5 * car.smoke})`;
      pen.beginPath();
      pen.arc(-car.w / 2 + 4, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
      pen.fill();
    }
    pen.restore();
    // An airborne car leaves its shadow on the ground below.
    if (lift > 0) {
      pen.save();
      pen.fillStyle = 'rgba(0,0,0,0.3)';
      pen.beginPath();
      pen.ellipse(car.x, car.y, 24, 12, 0, 0, Math.PI * 2);
      pen.fill();
      pen.restore();
    }
    // The player's car gets a gold outline.
    if (car === world.playerCar) {
      pen.save();
      pen.translate(car.x, car.y - lift);
      pen.rotate(car.angle);
      pen.strokeStyle = 'rgba(255,210,63,0.9)';
      pen.lineWidth = 2;
      pen.beginPath();
      pen.roundRect(-car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 9);
      pen.stroke();
      pen.restore();
    }
  }

  drawPlayer(pen, world) {
    const p = world.player;
    if (p.inCar) return;
    this.drawPerson(pen, p.x, p.y, p.angle, '#e33f2f', '#f0c8a0', false);
    if (p.weapon === 'pistol') {
      pen.save();
      pen.translate(p.x, p.y);
      pen.rotate(p.angle);
      pen.fillStyle = '#22222a';
      pen.fillRect(10, -2, 12, 4);
      pen.restore();
    }
    // Pulsing ring so the player is always findable.
    pen.save();
    pen.strokeStyle = 'rgba(255,210,63,0.95)';
    pen.lineWidth = 2;
    pen.beginPath();
    pen.arc(p.x, p.y, 18 + Math.sin(this.tick * 4) * 2, 0, Math.PI * 2);
    pen.stroke();
    pen.restore();
  }

  // The police helicopter: dark body, spinning rotor, spotlight cone tracking Marco.
  drawHelicopter(pen, world) {
    const heli = world.police && world.police.heli;
    if (!heli) return;
    const p = world.player;
    const tx = p.inCar && world.playerCar ? world.playerCar.x : p.x;
    const ty = p.inCar && world.playerCar ? world.playerCar.y : p.y;
    if (heli.watching) {
      pen.save();
      pen.fillStyle = 'rgba(255,240,180,0.16)';
      pen.beginPath();
      pen.moveTo(heli.x, heli.y);
      pen.lineTo(tx - 55, ty - 55);
      pen.lineTo(tx + 55, ty + 55);
      pen.closePath();
      pen.fill();
      pen.fillStyle = 'rgba(255,240,180,0.30)';
      pen.beginPath();
      pen.arc(tx, ty, 42, 0, Math.PI * 2);
      pen.fill();
      pen.restore();
    }
    pen.save(); // shadow on the ground, body floating above it
    pen.fillStyle = 'rgba(0,0,0,0.3)';
    pen.beginPath();
    pen.ellipse(heli.x, heli.y, 26, 13, 0, 0, Math.PI * 2);
    pen.fill();
    pen.restore();
    pen.save();
    pen.translate(heli.x, heli.y - 26);
    pen.rotate(heli.angle);
    pen.fillStyle = '#20242e';
    pen.beginPath();
    pen.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = '#8fc7e8';
    pen.beginPath();
    pen.arc(10, 0, 5, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = '#2e6bff';
    pen.fillRect(-16, -3, 8, 6);
    pen.strokeStyle = 'rgba(32,36,46,0.7)'; // spinning rotor, blurred
    pen.lineWidth = 3;
    const r = this.tick * 22;
    pen.beginPath();
    pen.moveTo(Math.cos(r) * 30, Math.sin(r) * 30);
    pen.lineTo(-Math.cos(r) * 30, -Math.sin(r) * 30);
    pen.stroke();
    pen.restore();
  }

  // Spike strips at five stars: a dark band with steel teeth.
  drawSpikes(pen, world) {
    const spikes = world.police ? world.police.spikes : [];
    for (const strip of spikes) {
      pen.save();
      pen.translate(strip.x, strip.y);
      pen.rotate(strip.angle);
      pen.fillStyle = '#1a1a20';
      pen.fillRect(-40, -6, 80, 12);
      pen.fillStyle = '#c8ccd4';
      for (let i = -3; i <= 3; i++) {
        pen.beginPath();
        pen.moveTo(i * 11, -6);
        pen.lineTo(i * 11 + 5, 0);
        pen.lineTo(i * 11, 6);
        pen.closePath();
        pen.fill();
      }
      pen.restore();
    }
  }

  // --- effects and light ---

  drawEffects(pen, world) {
    for (const pt of world.particles) {
      pen.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      pen.fillStyle = pt.color;
      pen.beginPath();
      pen.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      pen.fill();
    }
    pen.globalAlpha = 1;
    for (const t of world.tracers) {
      pen.globalAlpha = Math.max(0, t.life / 0.15);
      pen.strokeStyle = '#ffe9a8';
      pen.lineWidth = 2;
      pen.beginPath();
      pen.moveTo(t.x1, t.y1);
      pen.lineTo(t.x2, t.y2);
      pen.stroke();
    }
    pen.globalAlpha = 1;
    for (const m of world.muzzles) {
      pen.globalAlpha = Math.max(0, m.life / 0.08);
      pen.fillStyle = '#ffdf6b';
      pen.beginPath();
      pen.arc(m.x, m.y, 9, 0, Math.PI * 2);
      pen.fill();
    }
    pen.globalAlpha = 1;
  }

  // A warm sunset wash, stronger toward the screen edges.
  drawSunset(pen) {
    const cx = this.cam.x + this.canvas.width / 2;
    const cy = this.cam.y + this.canvas.height / 2;
    const glow = pen.createRadialGradient(cx, cy, 200, cx, cy, 900);
    glow.addColorStop(0, 'rgba(255,170,80,0)');
    glow.addColorStop(1, 'rgba(255,120,40,0.10)');
    pen.fillStyle = glow;
    pen.fillRect(this.cam.x, this.cam.y, this.canvas.width, this.canvas.height);
  }

  // --- minimap ---

  drawMinimap(world) {
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
    const park = world.city.park;
    mm.fillStyle = '#5d9448';
    mm.fillRect(park.x * sx, park.y * sy, park.w * sx, park.h * sy);
    // Mission, taxi and courier markers.
    const target = world.missions.currentTarget();
    if (target) blip(target.x, target.y, 4, '#ffd23f');
    const taxi = world.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      blip(stop.x, stop.y, 4, '#58d068');
    }
    const courier = world.missions.courier;
    if (courier) blip(courier.target.x, courier.target.y, 4, '#7fd0ff');
    // Side-job blips: fares, targets, pizza stops, hidden packages.
    if (world.sidejobs) {
      for (const b of world.sidejobs.blips()) {
        blip(b.x, b.y, b.small ? 1.5 : 3, b.color);
      }
    }
    // Police blips in blue; the helicopter in red.
    for (const car of world.traffic.cars) {
      if (car.police && !car.dead) blip(car.x, car.y, 2.5, '#4a90ff');
    }
    if (world.police && world.police.heli) {
      blip(world.police.heli.x, world.police.heli.y, 3.5, '#ff2e2e');
    }
    // Food stalls in green.
    for (const ped of world.crowd.peds) {
      if (ped.kind === 'vendor') blip(ped.x, ped.y, 2.5, '#58d068');
    }
    // Pickups in yellow, the race pad in red, the race target in pink.
    for (const item of world.pickups.items) {
      if (!item.taken) blip(item.x, item.y, 2, '#ffd23f');
    }
    if (world.races) {
      blip(world.races.pad.x, world.races.pad.y, 3, '#ff5f6d');
      const raceTarget = world.races.currentTarget();
      if (raceTarget) blip(raceTarget.x, raceTarget.y, 3.5, '#ff8fb0');
    }
    // The player, as a white arrow.
    const pl = world.player;
    const px = pl.inCar ? world.playerCar.x : pl.x;
    const py = pl.inCar ? world.playerCar.y : pl.y;
    mm.save();
    mm.translate(px * sx, py * sy);
    mm.rotate(pl.inCar ? world.playerCar.angle : pl.angle);
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
