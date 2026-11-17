// HUD: health, money, wanted stars, objective line, speed, weapon,
// toast messages and the menu screens (start / pause / busted / wasted / done).
export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'health-fill', 'health-num', 'money', 'stars', 'objective',
      'speed', 'weapon', 'radio', 'clock', 'toast', 'toast-title', 'toast-body',
      'menu', 'menu-title', 'menu-body', 'menu-hint', 'minimap', 'fps']) {
      this.el[id] = document.getElementById(id);
    }
    this.toastTimer = 0;
    this.toastQueue = [];
  }

  showHud(on) { this.el.hud.style.display = on ? 'block' : 'none'; }

  update(game, dt) {
    const p = game.player;
    this.el['health-fill'].style.width = `${p.health}%`;
    this.el['health-fill'].style.background = p.health > 50 ? '#58d068' : p.health > 25 ? '#f2c230' : '#e33f2f';
    this.el['health-num'].textContent = Math.ceil(p.health);
    this.el.money.textContent = `$${p.money.toLocaleString('en-US')}`;
    this.el.stars.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
    this.el.stars.style.color = game.wanted > 0 ? '#ffd23f' : '#ffffff88';
    const step = game.missions.currentStep();
    const taxi = game.missions.taxi;
    let obj = 'No active mission — press M for the next job.';
    if (step) {
      obj = step.text;
      if (step.timer) {
        const left = Math.max(0, step.timer - game.missions.active.timer);
        obj += `  —  ${Math.ceil(left)}s`;
      }
      if (step.type === 'rob' && game.missions.active.holdT > 0) {
        obj += `  —  ${game.missions.active.holdT.toFixed(1)}s / ${step.hold}s`;
      }
    } else if (taxi) {
      obj = taxi.stage === 'pickup' ? 'Taxi: pick up the passenger at the marker.' : 'Taxi: drop the passenger at the marker.';
    } else if (game.missions.storyDone) {
      obj = 'Story complete — free roam: fares, stashes, chaos.';
    }
    this.el.objective.textContent = obj;
    this.el.speed.textContent = p.inCar && game.playerCar
      ? `${Math.round(Math.abs(game.playerCar.speed) * 0.22)} km/h`
      : (p.sprint ? 'Sprinting' : 'On foot');
    this.el.weapon.textContent = p.inCar ? (game.playerCar.model.name) : (p.weapon === 'pistol' ? `Pistol · ${p.ammo} rounds` : 'Fists');
    this.el.radio.textContent = game.sounds.radioOn ? `♪ ${game.sounds.radioNames[game.sounds.station]}` : '♪ Radio off';
    const mins = Math.floor(game.clock / 60);
    const hh = (17 + Math.floor(mins / 60)) % 24;
    const mm = String(mins % 60).padStart(2, '0');
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${mm}`;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
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

  hideMenu() { this.el.menu.style.display = 'none'; }
}
