// Rendering: the top-down city, cars, people, particles, sunset light
// and the minimap. Everything is drawn with canvas primitives — the
// world ships no image assets at all, so the whole look is code.
//
// The paint order is the depth order: grass, roads, park, shore,
// buildings, props, stashes, markers, people, cars, the player,
// effects, and finally the sunset wash over everything. v6 rewrote
// this file wholesale — new method names and structure, same pixels —
// and kept the v4 hooks: side-job markers on the world and minimap,
// and the cutscene title card.
import { WORLD, ROAD, SHORE, COLORS, clamp } from './config.js';
import { AVENUES, STREETS } from './city.js';

// The rectangle of the world currently on screen, padded a little so
// objects half in frame still paint.
function viewRect(cam, width, height, pad) {
  return {
    left: cam.x - pad,
    right: cam.x + width + pad,
    top: cam.y - pad,
    bottom: cam.y + height + pad,
  };
}

// Does a box overlap a rectangle? Used to skip off-screen painting.
function hitsRect(rect, x, y, w, h) {
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

  draw(sim) {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.tick += 1 / 60;
    c.save();
    if (this.shake > 0) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    c.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.paintGround(c);
    this.paintRoads(c);
    this.paintPark(c, sim);
    this.paintShore(c);
    this.paintBuildings(c, sim);
    this.paintProps(c, sim);
    this.paintStashes(c, sim);
    this.paintPickups(c, sim);
    this.paintMarkers(c, sim);
    if (sim.sidejobs) sim.sidejobs.draw(c, this.cam);
    this.paintRacePad(c, sim);
    this.paintPeople(c, sim);
    this.paintCars(c, sim);
    this.paintPlayer(c, sim);
    this.paintEffects(c, sim);
    this.paintHeli(c, sim);
    this.paintSpikes(c, sim);
    this.paintSunset(c);
    // Night falls over the world, then the rain over that.
    sim.daynight.draw(c, { x: this.cam.x, y: this.cam.y, w: W, h: H }, sim);
    // Rain falls over the whole viewport, above the world.
    sim.weather.draw(c, { x: this.cam.x, y: this.cam.y, w: W, h: H });
    c.restore();
    this.paintMinimap(sim);
    if (sim.player.hurtFlash > 0) {
      c.fillStyle = `rgba(227,63,47,${sim.player.hurtFlash * 0.45})`;
      c.fillRect(0, 0, W, H);
    }
    if (sim.cutscenes) sim.cutscenes.drawTitle(c, W, H);
  }

  // --- ground and roads ---

  paintGround(c) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.fillStyle = COLORS.grass;
    c.fillRect(this.cam.x - 20, this.cam.y - 20, w + 40, h + 40);
    // Mow stripes give the grass some texture: alternating bands.
    const stripe = 120;
    c.fillStyle = COLORS.grassShade;
    const startX = Math.floor(this.cam.x / stripe) * stripe;
    const startY = Math.floor(this.cam.y / stripe) * stripe;
    for (let x = startX; x < this.cam.x + w; x += stripe * 2) {
      for (let y = startY; y < this.cam.y + h; y += stripe) {
        c.fillRect(x, y, stripe, stripe);
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

  paintRoads(c) {
    const { avenues, streets } = this.visibleRoads();
    const half = ROAD.width / 2;
    // Asphalt first.
    c.fillStyle = COLORS.asphalt;
    for (const ax of avenues) c.fillRect(ax - half, 0, ROAD.width, SHORE.sandY);
    for (const sy of streets) c.fillRect(0, sy - half, WORLD.width, ROAD.width);
    // Sidewalks hug both edges of every road.
    c.fillStyle = COLORS.sidewalk;
    for (const ax of avenues) {
      c.fillRect(ax - half - 8, 0, 8, SHORE.sandY);
      c.fillRect(ax + half, 0, 8, SHORE.sandY);
    }
    for (const sy of streets) {
      c.fillRect(0, sy - half - 8, WORLD.width, 8);
      c.fillRect(0, sy + half, WORLD.width, 8);
    }
    // Centre dashes down every road.
    c.fillStyle = COLORS.laneMark;
    for (const ax of avenues) {
      for (let y = 0; y < SHORE.sandY; y += 56) c.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of streets) {
      for (let x = 0; x < WORLD.width; x += 56) c.fillRect(x, sy - 2, 28, 4);
    }
    // Crosswalks at every intersection in view.
    c.fillStyle = '#e8e4da';
    for (const ax of avenues) {
      for (const sy of streets) {
        for (let i = -3; i <= 3; i++) {
          c.fillRect(ax + i * 10 - 3, sy - half + 4, 6, 12);
          c.fillRect(ax + i * 10 - 3, sy + half - 16, 6, 12);
        }
      }
    }
  }

  paintPark(c, sim) {
    const p = sim.city.park;
    c.fillStyle = COLORS.parkGreen;
    c.fillRect(p.x, p.y, p.w, p.h);
    c.strokeStyle = '#4a7a38';
    c.lineWidth = 4;
    c.strokeRect(p.x, p.y, p.w, p.h);
    // The pond.
    c.fillStyle = '#4a90b8';
    c.beginPath();
    c.ellipse(p.x + p.w * 0.62, p.y + p.h * 0.6, 46, 30, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 15px sans-serif';
    c.textAlign = 'center';
    c.fillText('PALMERA PARK', p.x + p.w / 2, p.y + 24);
  }

  paintShore(c) {
    // Sand, then the boardwalk, then Coral Bay itself.
    c.fillStyle = COLORS.sand;
    c.fillRect(0, SHORE.sandY, WORLD.width, SHORE.waterY - SHORE.sandY);
    c.fillStyle = '#b98d5f';
    c.fillRect(0, SHORE.sandY, WORLD.width, 14);
    c.fillStyle = '#a87c4f';
    for (let x = 0; x < WORLD.width; x += 46) c.fillRect(x, SHORE.sandY + 2, 3, 10);
    c.fillStyle = COLORS.sea;
    c.fillRect(0, SHORE.waterY, WORLD.width, WORLD.height - SHORE.waterY);
    // Animated shimmer lines on the water.
    c.fillStyle = COLORS.seaDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      const yy = SHORE.waterY + 26 + ((x * 7 + Math.floor(this.tick * 20)) % 90);
      c.fillRect(x, yy, 54, 5);
    }
    c.fillStyle = '#ffffffcc';
    c.fillRect(0, SHORE.waterY - 3, WORLD.width, 5);
    c.fillStyle = '#fff';
    c.font = 'bold 16px sans-serif';
    c.textAlign = 'left';
    c.fillText('CORAL BAY', 40, SHORE.waterY + 46);
  }

  // --- city furniture ---

  paintBuildings(c, sim) {
    const view = viewRect(this.cam, this.canvas.width, this.canvas.height, 40);
    for (const b of sim.city.buildings) {
      if (!hitsRect(view, b.x, b.y, b.w, b.h)) continue;
      // Drop shadow, then the roof.
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      c.fillStyle = b.color;
      c.fillRect(b.x, b.y, b.w, b.h);
      c.strokeStyle = COLORS.buildingLine;
      c.lineWidth = 2;
      c.strokeRect(b.x, b.y, b.w, b.h);
      // Sunlit roof inset.
      c.fillStyle = 'rgba(255,255,255,0.14)';
      c.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop vents / AC units.
      c.fillStyle = 'rgba(0,0,0,0.3)';
      for (const v of b.vents) c.fillRect(v.x, v.y, v.s, v.s);
      // Shop sign across the middle.
      if (b.sign) {
        c.fillStyle = '#22222a';
        c.fillRect(b.x + b.w / 2 - 26, b.y + b.h / 2 - 10, 52, 20);
        c.fillStyle = '#ffe9a8';
        c.font = 'bold 11px sans-serif';
        c.textAlign = 'center';
        c.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }

  paintProps(c, sim) {
    const view = viewRect(this.cam, this.canvas.width, this.canvas.height, 30);
    for (const t of sim.city.trees) {
      if (!hitsRect(view, t.x - t.r, t.y - t.r, t.r * 2, t.r * 2)) continue;
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath();
      c.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3f7a34';
      c.beginPath();
      c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#58a844';
      c.beginPath();
      c.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    // Park benches face the paths.
    for (const bench of sim.city.benches) {
      if (!hitsRect(view, bench.x - 12, bench.y - 4, 24, 8)) continue;
      c.save();
      c.translate(bench.x, bench.y);
      c.rotate(bench.angle);
      c.fillStyle = '#8a6b46';
      c.fillRect(-11, -3, 22, 6);
      c.fillStyle = '#6b5236';
      c.fillRect(-11, 3, 22, 2);
      c.restore();
    }
    c.fillStyle = '#3a3a42';
    for (const l of sim.city.lamps) c.fillRect(l.x - 2, l.y - 2, 4, 4);
    c.fillStyle = '#c0392b';
    for (const h of sim.city.hydrants) c.fillRect(h.x - 3, h.y - 3, 6, 6);
    // Food stalls: striped awning and counter.
    for (const ped of sim.crowd.peds) {
      if (ped.kind !== 'vendor' || ped.state === 'down') continue;
      if (!hitsRect(view, ped.x - 30, ped.y - 30, 60, 60)) continue;
      c.save();
      c.translate(ped.x, ped.y);
      c.rotate(ped.angle);
      c.fillStyle = '#8a6b46';
      c.fillRect(-14, -10, 28, 20);
      c.fillStyle = '#e8e4da';
      c.fillRect(-16, -12, 32, 5);
      c.fillStyle = '#e33f2f';
      for (let i = -2; i <= 2; i += 2) c.fillRect(-16 + i * 8, -12, 8, 5);
      c.fillStyle = '#f2c230';
      c.font = 'bold 8px sans-serif';
      c.textAlign = 'center';
      c.fillText('SNACKS', 0, 4);
      c.restore();
    }
    // Stunt ramps: chevron boards across the road.
    for (const ramp of sim.stunts.ramps) {
      if (!hitsRect(view, ramp.x - 30, ramp.y - 30, 60, 60)) continue;
      c.save();
      c.translate(ramp.x, ramp.y);
      c.rotate(ramp.angle);
      c.fillStyle = '#f2c230';
      for (let i = -1; i <= 1; i++) {
        c.fillRect(-14 + i * 12, -16, 6, 32);
      }
      c.fillStyle = '#22222a';
      c.fillRect(-16, -18, 32, 4);
      c.restore();
    }
  }

  paintStashes(c, sim) {
    for (const pkg of sim.missions.packages) {
      if (pkg.found) continue;
      const pulse = 1 + Math.sin(this.tick * 4) * 0.15;
      c.save();
      c.translate(pkg.x, pkg.y);
      c.scale(pulse, pulse);
      c.fillStyle = '#f2c230';
      c.fillRect(-9, -6, 18, 12);
      c.fillStyle = '#2c2c34';
      c.fillRect(-9, -1, 18, 2);
      c.restore();
    }
  }

  // Pickups on the ground: ammo crates, medkits, dropped wallets.
  // Each one pulses so a Marco on foot can spot it from a distance.
  paintPickups(c, sim) {
    for (const item of sim.pickups.items) {
      if (item.taken) continue;
      const pulse = 1 + Math.sin(this.tick * 4 + item.x) * 0.12;
      c.save();
      c.translate(item.x, item.y);
      c.scale(pulse, pulse);
      if (item.kind === 'ammo') {
        c.fillStyle = '#2c2c34';
        c.fillRect(-10, -7, 20, 14);
        c.fillStyle = '#f2c230';
        c.font = 'bold 8px sans-serif';
        c.textAlign = 'center';
        c.fillText('AMMO', 0, 3);
      } else if (item.kind === 'health') {
        c.fillStyle = '#e8e4da';
        c.fillRect(-9, -9, 18, 18);
        c.fillStyle = '#58d068';
        c.fillRect(-2, -7, 4, 14);
        c.fillRect(-7, -2, 14, 4);
      } else {
        c.fillStyle = '#7dff8a';
        c.beginPath();
        c.arc(0, 0, 9, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#111';
        c.font = 'bold 10px sans-serif';
        c.textAlign = 'center';
        c.fillText('$', 0, 3);
      }
      c.restore();
    }
  }

  // The street-race start pad by the stadium, and the next
  // checkpoint flag while a race is running.
  paintRacePad(c, sim) {
    const race = sim.races;
    if (!race) return;
    const pad = race.pad;
    c.save();
    c.strokeStyle = race.state === 'armed' ? '#ffd23f' : 'rgba(255,210,63,0.5)';
    c.lineWidth = 3;
    c.setLineDash([10, 8]);
    c.beginPath();
    c.arc(pad.x, pad.y, 60, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#ffd23f';
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillText('RACE', pad.x, pad.y - 70);
    c.restore();
    const target = race.currentTarget();
    if (target) {
      const bob = Math.sin(this.tick * 4) * 5;
      c.save();
      c.translate(target.x, target.y + bob);
      c.fillStyle = '#ff5f6d';
      c.beginPath();
      c.moveTo(0, -40);
      c.lineTo(14, -10);
      c.lineTo(-14, -10);
      c.closePath();
      c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 11px sans-serif';
      c.textAlign = 'center';
      c.fillText('🏁', 0, -22);
      c.restore();
    }
  }

  // Mission marker, taxi marker, courier marker and the bank-robbery ring.
  paintMarkers(c, sim) {
    const pin = (x, y, color, label) => {
      const bob = Math.sin(this.tick * 3) * 4;
      c.save();
      c.translate(x, y + bob);
      c.fillStyle = color;
      c.globalAlpha = 0.85;
      c.beginPath();
      c.moveTo(0, -34);
      c.lineTo(12, -8);
      c.lineTo(-12, -8);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = '#fff';
      c.font = 'bold 12px sans-serif';
      c.textAlign = 'center';
      c.fillText('▼', 0, -16);
      c.restore();
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(x, y, 26 + Math.sin(this.tick * 3) * 4, 12, 0, 0, Math.PI * 2);
      c.stroke();
      if (label) {
        c.font = 'bold 13px sans-serif';
        const w = c.measureText(label).width + 12;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(x - w / 2, y - 64, w, 20);
        c.fillStyle = '#111';
        c.fillText(label, x, y - 50);
      }
    };
    const target = sim.missions.currentTarget();
    if (target) pin(target.x, target.y, '#ffd23f', sim.missions.currentStep().text);
    const taxi = sim.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      pin(stop.x, stop.y, '#58d068', taxi.stage === 'pickup' ? 'PICKUP' : 'DROP-OFF');
    }
    const courier = sim.missions.courier;
    if (courier) {
      pin(courier.target.x, courier.target.y, '#7fd0ff', courier.label);
    }
    const step = sim.missions.currentStep();
    if (step && step.type === 'rob') {
      const bank = sim.city.landmarks.bank;
      c.strokeStyle = '#e33f2f';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(bank.x, bank.y, 90, 0, Math.PI * 2);
      c.stroke();
    }
  }

  // --- actors ---

  paintPeople(c, sim) {
    for (const ped of sim.crowd.peds) {
      this.paintPerson(c, ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.state === 'down');
    }
    for (const member of sim.gangs.members) {
      this.paintPerson(c, member.x, member.y, member.angle, member.color, member.skin, member.state === 'down');
    }
    for (const cop of sim.cops) {
      this.paintPerson(c, cop.x, cop.y, cop.angle, '#20242e', '#f0c8a0', cop.state === 'down', true);
    }
  }

  paintPerson(c, x, y, angle, shirt, skin, down, isCop = false) {
    c.save();
    c.translate(x, y);
    if (down) {
      // Lying flat, head to one side.
      c.rotate(angle + Math.PI / 2);
      c.fillStyle = shirt;
      c.fillRect(-12, -6, 24, 12);
      c.fillStyle = skin;
      c.beginPath();
      c.arc(15, 0, 6, 0, Math.PI * 2);
      c.fill();
      c.restore();
      return;
    }
    c.rotate(angle);
    // Shadow, body, head, and the direction they face.
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(0, 2, 12, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = shirt;
    c.beginPath();
    c.arc(0, 0, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = skin;
    c.beginPath();
    c.arc(4, 0, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = shirt;
    c.fillRect(8, -4, 6, 8);
    if (isCop) {
      // Badge stripe and cap.
      c.fillStyle = '#ffd23f';
      c.fillRect(-8, -9, 5, 18);
      c.fillStyle = '#20242e';
      c.beginPath();
      c.arc(4, 0, 7, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  paintCars(c, sim) {
    const ordered = [...sim.traffic.cars].sort((a, b) => a.y - b.y);
    for (const car of ordered) {
      if (car !== sim.playerCar) this.paintCar(c, car, sim);
    }
    if (sim.playerCar) this.paintCar(c, sim.playerCar, sim);
  }

  paintCar(c, car, sim) {
    const lift = car.airHeight || 0;
    c.save();
    c.translate(car.x, car.y - lift);
    c.rotate(car.angle);
    if (car.skid > 0) {
      c.fillStyle = 'rgba(20,20,20,0.5)';
      c.fillRect(-car.w / 2, -car.h / 2 - 4, 26, 4);
      c.fillRect(-car.w / 2, car.h / 2, 26, 4);
    }
    // Shadow, then the body.
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
    c.fillStyle = car.color;
    c.beginPath();
    c.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 7);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 1.5;
    c.stroke();
    // Hood highlight.
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(car.w / 2 - 12, -car.h / 2 + 3, 9, car.h - 6);
    // Cabin and windshield.
    c.fillStyle = '#1d2733';
    c.beginPath();
    c.roundRect(-6, -car.h / 2 + 3, 16, car.h - 6, 4);
    c.fill();
    c.fillStyle = '#8fc7e8';
    c.fillRect(7, -car.h / 2 + 4, 3, car.h - 8);
    // Wheels and headlights.
    c.fillStyle = '#14141a';
    c.fillRect(-car.w / 2 + 4, -car.h / 2 - 3, 9, 5);
    c.fillRect(-car.w / 2 + 4, car.h / 2 - 2, 9, 5);
    c.fillRect(car.w / 2 - 13, -car.h / 2 - 3, 9, 5);
    c.fillRect(car.w / 2 - 13, car.h / 2 - 2, 9, 5);
    c.fillStyle = '#ffe9a8';
    c.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 5);
    c.fillRect(car.w / 2 - 2, car.h / 2 - 8, 3, 5);
    // Police livery, light bar and POLICE lettering.
    if (car.police) {
      c.fillStyle = '#f5f5f5';
      c.fillRect(-car.w / 2 + 8, -car.h / 2 + 2, car.w - 16, 4);
      c.fillRect(-car.w / 2 + 8, car.h / 2 - 6, car.w - 16, 4);
      c.fillStyle = '#ffd23f';
      c.font = 'bold 8px sans-serif';
      c.textAlign = 'center';
      c.fillText('POLICE', 0, 3);
      const blink = Math.floor(this.tick * 6) % 2 === 0;
      c.fillStyle = blink ? '#ff2e2e' : '#2e6bff';
      c.beginPath();
      c.arc(-2, -car.h / 2 + 1, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = blink ? '#2e6bff' : '#ff2e2e';
      c.beginPath();
      c.arc(-2, car.h / 2 - 1, 4, 0, Math.PI * 2);
      c.fill();
    }
    if (car.taxi) {
      c.fillStyle = '#111';
      c.font = 'bold 8px sans-serif';
      c.textAlign = 'center';
      c.fillText('TAXI', 0, 3);
    }
    if (car.van) {
      c.fillStyle = '#ffd23f';
      c.font = 'bold 8px sans-serif';
      c.textAlign = 'center';
      c.fillText('ARMORED', 0, 3);
    }
    if (car.bus) {
      // A bus is a long box with a row of windows and a route number.
      c.fillStyle = '#1d2733';
      for (let i = 0; i < 4; i++) c.fillRect(-car.w / 2 + 8 + i * 13, -car.h / 2 + 3, 9, car.h - 6);
      c.fillStyle = '#fff';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      c.fillText('7', car.w / 2 - 8, 3);
    }
    if (car.bike) {
      // A bike is a sliver with a rider hunched over it.
      c.fillStyle = '#14141a';
      c.beginPath();
      c.arc(-car.w / 2 + 3, 0, 4, 0, Math.PI * 2);
      c.arc(car.w / 2 - 3, 0, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e33f2f';
      c.beginPath();
      c.arc(0, 0, 5, 0, Math.PI * 2);
      c.fill();
    }
    // Damage smoke.
    if (car.smoke > 0) {
      c.fillStyle = `rgba(120,120,120,${0.5 * car.smoke})`;
      c.beginPath();
      c.arc(-car.w / 2 + 4, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // An airborne car leaves its shadow on the ground below.
    if (lift > 0) {
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(car.x, car.y, 24, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    // The player's car gets a gold outline.
    if (car === sim.playerCar) {
      c.save();
      c.translate(car.x, car.y - lift);
      c.rotate(car.angle);
      c.strokeStyle = 'rgba(255,210,63,0.9)';
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(-car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 9);
      c.stroke();
      c.restore();
    }
  }

  paintPlayer(c, sim) {
    const p = sim.player;
    if (p.inCar) return;
    this.paintPerson(c, p.x, p.y, p.angle, '#e33f2f', '#f0c8a0', false);
    if (p.weapon === 'pistol') {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angle);
      c.fillStyle = '#22222a';
      c.fillRect(10, -2, 12, 4);
      c.restore();
    }
    // Pulsing ring so the player is always findable.
    c.save();
    c.strokeStyle = 'rgba(255,210,63,0.95)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.x, p.y, 18 + Math.sin(this.tick * 4) * 2, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  // The police helicopter: dark body, spinning rotor, spotlight cone tracking Marco.
  paintHeli(c, sim) {
    const heli = sim.police && sim.police.heli;
    if (!heli) return;
    const p = sim.player;
    const tx = p.inCar && sim.playerCar ? sim.playerCar.x : p.x;
    const ty = p.inCar && sim.playerCar ? sim.playerCar.y : p.y;
    if (heli.watching) {
      c.save();
      c.fillStyle = 'rgba(255,240,180,0.16)';
      c.beginPath();
      c.moveTo(heli.x, heli.y);
      c.lineTo(tx - 55, ty - 55);
      c.lineTo(tx + 55, ty + 55);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,240,180,0.30)';
      c.beginPath();
      c.arc(tx, ty, 42, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.save(); // shadow on the ground, body floating above it
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(heli.x, heli.y, 26, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.save();
    c.translate(heli.x, heli.y - 26);
    c.rotate(heli.angle);
    c.fillStyle = '#20242e';
    c.beginPath();
    c.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8fc7e8';
    c.beginPath();
    c.arc(10, 0, 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2e6bff';
    c.fillRect(-16, -3, 8, 6);
    c.strokeStyle = 'rgba(32,36,46,0.7)'; // spinning rotor, blurred
    c.lineWidth = 3;
    const r = this.tick * 22;
    c.beginPath();
    c.moveTo(Math.cos(r) * 30, Math.sin(r) * 30);
    c.lineTo(-Math.cos(r) * 30, -Math.sin(r) * 30);
    c.stroke();
    c.restore();
  }

  // Spike strips at five stars: a dark band with steel teeth.
  paintSpikes(c, sim) {
    const spikes = sim.police ? sim.police.spikes : [];
    for (const strip of spikes) {
      c.save();
      c.translate(strip.x, strip.y);
      c.rotate(strip.angle);
      c.fillStyle = '#1a1a20';
      c.fillRect(-40, -6, 80, 12);
      c.fillStyle = '#c8ccd4';
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(i * 11, -6);
        c.lineTo(i * 11 + 5, 0);
        c.lineTo(i * 11, 6);
        c.closePath();
        c.fill();
      }
      c.restore();
    }
  }

  // --- effects and light ---

  paintEffects(c, sim) {
    for (const pt of sim.particles) {
      c.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      c.fillStyle = pt.color;
      c.beginPath();
      c.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    for (const t of sim.tracers) {
      c.globalAlpha = Math.max(0, t.life / 0.15);
      c.strokeStyle = '#ffe9a8';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(t.x1, t.y1);
      c.lineTo(t.x2, t.y2);
      c.stroke();
    }
    c.globalAlpha = 1;
    for (const m of sim.muzzles) {
      c.globalAlpha = Math.max(0, m.life / 0.08);
      c.fillStyle = '#ffdf6b';
      c.beginPath();
      c.arc(m.x, m.y, 9, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  // A warm sunset wash, stronger toward the screen edges.
  paintSunset(c) {
    const cx = this.cam.x + this.canvas.width / 2;
    const cy = this.cam.y + this.canvas.height / 2;
    const glow = c.createRadialGradient(cx, cy, 200, cx, cy, 900);
    glow.addColorStop(0, 'rgba(255,170,80,0)');
    glow.addColorStop(1, 'rgba(255,120,40,0.10)');
    c.fillStyle = glow;
    c.fillRect(this.cam.x, this.cam.y, this.canvas.width, this.canvas.height);
  }

  // --- minimap ---

  paintMinimap(sim) {
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
    const park = sim.city.park;
    mm.fillStyle = '#5d9448';
    mm.fillRect(park.x * sx, park.y * sy, park.w * sx, park.h * sy);
    // Mission, taxi and courier markers.
    const target = sim.missions.currentTarget();
    if (target) blip(target.x, target.y, 4, '#ffd23f');
    const taxi = sim.missions.taxi;
    if (taxi) {
      const stop = taxi.stage === 'pickup' ? taxi.pickup : taxi.drop;
      blip(stop.x, stop.y, 4, '#58d068');
    }
    const courier = sim.missions.courier;
    if (courier) blip(courier.target.x, courier.target.y, 4, '#7fd0ff');
    // Side-job blips: fares, targets, pizza stops, hidden packages.
    if (sim.sidejobs) {
      for (const b of sim.sidejobs.blips()) {
        blip(b.x, b.y, b.small ? 1.5 : 3, b.color);
      }
    }
    // Police blips in blue; the helicopter in red.
    for (const car of sim.traffic.cars) {
      if (car.police && !car.dead) blip(car.x, car.y, 2.5, '#4a90ff');
    }
    if (sim.police && sim.police.heli) {
      blip(sim.police.heli.x, sim.police.heli.y, 3.5, '#ff2e2e');
    }
    // Food stalls in green.
    for (const ped of sim.crowd.peds) {
      if (ped.kind === 'vendor') blip(ped.x, ped.y, 2.5, '#58d068');
    }
    // Pickups in yellow, the race pad in red, the race target in pink.
    for (const item of sim.pickups.items) {
      if (!item.taken) blip(item.x, item.y, 2, '#ffd23f');
    }
    if (sim.races) {
      blip(sim.races.pad.x, sim.races.pad.y, 3, '#ff5f6d');
      const raceTarget = sim.races.currentTarget();
      if (raceTarget) blip(raceTarget.x, raceTarget.y, 3.5, '#ff8fb0');
    }
    // The player, as a white arrow.
    const pl = sim.player;
    const px = pl.inCar ? sim.playerCar.x : pl.x;
    const py = pl.inCar ? sim.playerCar.y : pl.y;
    mm.save();
    mm.translate(px * sx, py * sy);
    mm.rotate(pl.inCar ? sim.playerCar.angle : pl.angle);
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

// v7: the renderer draws the same city; the new systems only add sprites on top.
