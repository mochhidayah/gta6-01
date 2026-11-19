// HUD: health, money, wanted stars with a heat bar, the mission
// objective tracker, speed, weapon, radio, clock, toasts, menus.
// The tracker (top-left) shows mission title, step, timer. The heat
// bar fills as the wanted level nears its next star; a helicopter
// badge appears while the chopper watches. v6 rewrote this file
// wholesale — same elements, same text, new internal names.
const UI_IDS = [
  'hud', 'health-fill', 'health-num', 'money', 'stars', 'heat-fill', 'heat-wrap',
  'heli-alert', 'objective', 'objective-title', 'objective-step', 'objective-timer',
  'speed', 'weapon', 'radio', 'clock', 'toast', 'toast-title', 'toast-body',
  'menu', 'menu-title', 'menu-body', 'menu-hint', 'minimap', 'fps', 'race-status',
];

function healthColor(hp) {
  if (hp > 50) return '#58d068';
  if (hp > 25) return '#f2c230';
  return '#e33f2f';
}

function moneyText(amount) {
  return `$${amount.toLocaleString('en-US')}`;
}

function starsText(wanted) {
  return '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
}

function timeText(clockSeconds) {
  const totalMins = Math.floor(clockSeconds / 60);
  const hour = (17 + Math.floor(totalMins / 60)) % 24;
  const minute = String(totalMins % 60).padStart(2, '0');
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function speedText(game) {
  const hero = game.player;
  if (hero.inCar && game.playerCar) return `${Math.round(Math.abs(game.playerCar.speed) * 0.22)} km/h`;
  return hero.sprint ? 'Sprinting' : 'On foot';
}

function weaponText(game) {
  const hero = game.player;
  if (hero.inCar) return game.playerCar.model.name;
  if (hero.weapon === 'pistol') return `Pistol · ${hero.ammo} rounds`;
  return 'Fists';
}

export class HUD {
  constructor() {
    this.el = {};
    for (const id of UI_IDS) this.el[id] = document.getElementById(id);
    this.toastTimer = 0;
  }

  showHud(on) {
    this.el.hud.style.display = on ? 'block' : 'none';
  }

  toast(title, body, seconds = 4) {
    this.el['toast-title'].textContent = title;
    this.el['toast-body'].textContent = body;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  showMenu(title, body, hint) {
    this.el['menu-title'].textContent = title;
    this.el['menu-body'].innerHTML = body;
    this.el['menu-hint'].textContent = hint;
    this.el.menu.style.display = 'flex';
  }

  hideMenu() {
    this.el.menu.style.display = 'none';
  }

  update(game, dt) {
    const hero = game.player;
    const bar = this.el['health-fill'];
    bar.style.width = `${hero.health}%`;
    bar.style.background = healthColor(hero.health);
    this.el['health-num'].textContent = `${Math.ceil(hero.health)} HP`;
    this.el.money.textContent = moneyText(hero.money);
    this.el.stars.textContent = starsText(game.wanted);
    this.el.stars.style.color = game.wanted > 0 ? '#ffd23f' : '#ffffff88';
    const heat = game.police ? game.police.heatFrac() : 0;
    this.el['heat-fill'].style.width = `${Math.round(heat * 100)}%`;
    this.el['heat-wrap'].style.display = game.wanted > 0 ? 'block' : 'none';
    const watched = !!(game.police && game.police.watched);
    this.el['heli-alert'].style.display = watched ? 'block' : 'none';
    if (watched) this.el['heli-alert'].textContent = '🚁 HELICOPTER WATCHING — break line of sight!';
    this.drawTracker(game);
    this.el.speed.textContent = speedText(game);
    this.el.weapon.textContent = weaponText(game);
    this.el.radio.textContent = game.sounds.radioOn
      ? `♪ ${game.sounds.radioNames[game.sounds.station]}`
      : '♪ Radio off';
    this.el.clock.textContent = timeText(game.clock);
    this.drawRaceChip(game);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }

  // Race status chip (top centre): countdown, checkpoint, or the
  // armed prompt. Hidden when no race is anywhere near starting.
  drawRaceChip(game) {
    const chip = this.el['race-status'];
    if (!chip) return;
    const race = game.races;
    if (!race) {
      chip.style.display = 'none';
      return;
    }
    if (race.state === 'countdown') {
      chip.style.display = 'block';
      chip.textContent = `🏁 ${Math.ceil(race.countdown)}...`;
      return;
    }
    if (race.state === 'racing') {
      chip.style.display = 'block';
      chip.textContent = `🏁 CHECKPOINT ${Math.min(race.next + 1, race.route.length)} / ${race.route.length} — ${Math.floor(race.time)}s`;
      return;
    }
    if (race.state === 'armed') {
      chip.style.display = 'block';
      chip.textContent = '🏁 STREET RACE — press T to line up';
      return;
    }
    chip.style.display = 'none';
  }

  // Tracker: mission title, step, timer; taxi / courier / free-roam when idle.
  drawTracker(game) {
    const msn = game.missions;
    const step = msn.currentStep();
    if (step) {
      this.el['objective-title'].textContent = `◆ ${msn.active.def.title}  ($${msn.active.def.pay})`;
      this.el['objective-step'].textContent = step.text;
      this.el['objective-timer'].textContent = this.stepTimerText(game, step);
      return;
    }
    if (game.races && game.races.racing) {
      const race = game.races;
      const target = race.currentTarget();
      this.el['objective-title'].textContent = '◆ STREET RACE';
      if (race.state === 'countdown') {
        this.el['objective-step'].textContent = 'Get ready — the countdown is running.';
        this.el['objective-timer'].textContent = `${Math.ceil(race.countdown)}...`;
      } else {
        this.el['objective-step'].textContent = target
          ? `Next checkpoint: ${target.label} — ${race.next + 1} of ${race.route.length}`
          : 'Final stretch — bring it home.';
        this.el['objective-timer'].textContent = `${Math.floor(race.time)}s`;
      }
      return;
    }
    if (msn.taxi) {
      this.el['objective-title'].textContent = '◆ TAXI FARE';
      this.el['objective-step'].textContent = msn.taxi.stage === 'pickup'
        ? 'Pick up the passenger at the marker.'
        : 'Drop the passenger at the marker.';
      this.el['objective-timer'].textContent = '';
      return;
    }
    if (msn.courier) {
      this.el['objective-title'].textContent = '◆ COURIER RUN';
      this.el['objective-step'].textContent = msn.courier.label;
      this.el['objective-timer'].textContent = `${Math.ceil(msn.courier.timeLeft)}s left`;
      return;
    }
    const challenge = game.challenges ? game.challenges.current : null;
    this.el['objective-title'].textContent = msn.storyDone
      ? '◆ STORY COMPLETE'
      : `◆ NEXT JOB: ${msn.storyIndex + 1} of ${msn.total}`;
    this.el['objective-step'].textContent = msn.storyDone
      ? 'Free roam: fares, runs, races, stashes, chaos.'
      : 'Press M for the next job.';
    this.el['objective-timer'].textContent = challenge
      ? `Challenge: ${challenge.label} (+$${challenge.reward})`
      : '';
  }

  stepTimerText(game, step) {
    if (step.timer) {
      const left = Math.max(0, step.timer - game.missions.active.timer);
      return `${Math.ceil(left)}s left`;
    }
    if (step.type === 'rob' && game.missions.active.holdT > 0) {
      return `${game.missions.active.holdT.toFixed(1)}s / ${step.hold}s`;
    }
    if (step.type === 'defeat') {
      const down = game.gangs.members.filter((x) => x.crew.name === step.crew && x.state === 'down').length;
      const base = game.missions.active.defeatBase || 0;
      return `${Math.max(0, down - base)} / ${step.count} down`;
    }
    return '';
  }
}

// v7: the HUD still shows the same bars; the new systems report through it.
