// HUD: health, money, wanted stars, objective line, speed, weapon,
// radio, in-game clock, toast banners and the menu screens
// (start / pause / busted / wasted / story complete).
//
// Every frame the game hands the HUD itself and the HUD paints the
// numbers. The objective line picks the most urgent thing to say:
// the story step, then a taxi fare, then a courier run, then the
// free-roam hint.
const ELEMENT_IDS = [
  'hud', 'health-fill', 'health-num', 'money', 'stars', 'objective',
  'speed', 'weapon', 'radio', 'clock', 'toast', 'toast-title', 'toast-body',
  'menu', 'menu-title', 'menu-body', 'menu-hint', 'minimap', 'fps',
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

function clockText(clockSeconds) {
  const totalMins = Math.floor(clockSeconds / 60);
  const hour = (17 + Math.floor(totalMins / 60)) % 24;
  const minute = String(totalMins % 60).padStart(2, '0');
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function speedText(game) {
  const p = game.player;
  if (p.inCar && game.playerCar) return `${Math.round(Math.abs(game.playerCar.speed) * 0.22)} km/h`;
  return p.sprint ? 'Sprinting' : 'On foot';
}

function weaponText(game) {
  const p = game.player;
  if (p.inCar) return game.playerCar.model.name;
  if (p.weapon === 'pistol') return `Pistol · ${p.ammo} rounds`;
  return 'Fists';
}

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ELEMENT_IDS) this.el[id] = document.getElementById(id);
    this.toastTimer = 0;
  }

  showHud(on) {
    this.el.hud.style.display = on ? 'block' : 'none';
  }

  update(game, dt) {
    const p = game.player;
    const bar = this.el['health-fill'];
    bar.style.width = `${p.health}%`;
    bar.style.background = healthColor(p.health);
    this.el['health-num'].textContent = `${Math.ceil(p.health)} HP`;
    this.el.money.textContent = moneyText(p.money);
    this.el.stars.textContent = starsText(game.wanted);
    this.el.stars.style.color = game.wanted > 0 ? '#ffd23f' : '#ffffff88';
    this.el.objective.textContent = this.objectiveText(game);
    this.el.speed.textContent = speedText(game);
    this.el.weapon.textContent = weaponText(game);
    this.el.radio.textContent = game.sounds.radioOn
      ? `♪ ${game.sounds.radioNames[game.sounds.station]}`
      : '♪ Radio off';
    this.el.clock.textContent = clockText(game.clock);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }

  // The top-left objective line: mission step, taxi fare, courier run,
  // or the free-roam hint when nothing is on.
  objectiveText(game) {
    const step = game.missions.currentStep();
    if (step) return this.stepText(game, step);
    const taxi = game.missions.taxi;
    if (taxi) {
      return taxi.stage === 'pickup'
        ? 'Taxi: pick up the passenger at the marker.'
        : 'Taxi: drop the passenger at the marker.';
    }
    const courier = game.missions.courier;
    if (courier) {
      return `${courier.label}  —  ${Math.ceil(courier.timeLeft)}s left.`;
    }
    if (game.missions.storyDone) return 'Story complete — free roam: fares, runs, stashes, chaos.';
    return 'No active mission — press M for the next job.';
  }

  stepText(game, step) {
    let text = step.text;
    if (step.timer) {
      const left = Math.max(0, step.timer - game.missions.active.timer);
      text += `  —  ${Math.ceil(left)}s`;
    }
    if (step.type === 'rob' && game.missions.active.holdT > 0) {
      text += `  —  ${game.missions.active.holdT.toFixed(1)}s / ${step.hold}s`;
    }
    return text;
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
}
