[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/mochhidayah/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/mochhidayah/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Palmera Bay — an open-world crime story

An entry for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666): a complete,
original open-world crime game that runs offline in a desktop browser from static files.

**Marco Solano** is back in Palmera Bay with $250 and a debt to pay. Thirteen story jobs stand between
him and freedom — a stolen car, a pickup against the clock, a police chase to outrun, a delivery,
a bank job, a night-shift courier rush, a turf war, one last dockside heist, and three new ones:
a street race at the stadium, payback at the docks, and a clean slate at the airfield — plus taxi
fares, courier runs, street races, daily challenges and hidden cash stashes in free roam.

## What's new in v4

- **Radio** — three stations with real songs: PALMERA FM 88.5, BAY ROCK 101.1 and CORAL NIGHT 94.7,
  each with its own tracks, DJ chatter and a banner you can click. Press **R** to switch stations;
  the tempo quickens as the wanted level climbs. **M** in the pause menu mutes it.
- **Side jobs** — taxi fares with chatty passengers and tips, vigilante takedowns, pizza delivery
  runs, and 30 hidden packages stashed across the map with a tracker (press **E** near a fare or
  a target to start one).
- **Cutscenes** — a scripted intro when a new game starts, and a briefing scene before most
  missions: dialogue, camera pans and code-drawn portraits of Marco, Lucia, Rico, Dana, Vex
  and Kane. Space, Enter or click advances the dialogue.

## What's new in v3

- **Day/night cycle** — the clock runs from a 17:00 sunset into a dark night (20:00–05:00) with
  stars, lamp glow and headlight cones; the four screenshots are taken at 17:00 so they stay bright.
- **Street races** — drive onto the stadium pad, press **T**, and race three rivals over four
  checkpoints (airfield, marina, docks, club) for up to $800. Winning adds a star of heat.
- **Stats and achievements** — thirteen achievements (first job, first race win, ghost escape,
  near-miss streaks, jump combos and more) tracked across the whole save, with a lifetime total
  earned and a summary on the pause screen.
- **World pickups** — ammo boxes, medkits and dropped wallets at ten fixed spots around the city,
  respawning about a minute after they are taken.
- **Photo mode** — press **C** to freeze the world and pan the camera with WASD for the perfect shot.
- **Daily challenges** — three fresh goals every day (races won, near misses, fares, jumps…),
  each paying a bonus.
- **Spike strips** — at five stars the precinct lays spike strips ahead of you: steer around them
  or lose tires and speed. **Bay fog** rolls in off the water between clear spells and downpours.
- **Gang retaliation** — drop a Shark or a Viper and their crew sends a squad after you.
- **Tourists** — camera-wielding visitors drift between the sights, pausing to take photos.
- **Fragile courier parcels** — a third of the parcels pay half again, but a hard crash smashes them.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: `game/index.html` plus its modules under `game/src/`.

## What's in the city

- **Open world on foot and by car** — a seeded city of avenues, streets, blocks, a park, and a
  beachfront on Coral Bay, all drawn in canvas with no image assets.
- **Traffic and pedestrians** — cars follow the road grid, pedestrians stroll the sidewalks and
  flee from chaos; any car can be stolen (press **E**).
- **Wanted level and police** — crimes raise 0–5 stars; police cars chase and ram, on-foot cops
  try to bust you, and the heat only fades while nobody can see you (line of sight — walls are
  cover). At 3+ stars roadblocks go up ahead of you; at 4–5 stars a police helicopter circles
  overhead, its spotlight keeping you visible. Lose the heat to clear it; getting busted or
  wasted costs you money.
- **Missions and story** — thirteen jobs with markers, timers, hold-ups, a turf war, a street race and escapes, each with a payday.
- **Day/night, fog and rain** — a full day cycle from sunset to night, bay fog, and downpours with lightning.
- **More wheels and street life** — a fast, fragile motorcycle and a slow, near-unkillable city
  bus join the traffic; street vendors sell snacks that restore health ($15), and a taxi that
  pulls over for you starts a fare when you hop in.
- **Combat** — fists and a pistol (mouse aim, click to shoot), car damage, smoke and explosions.
- **HUD with minimap** — health, money, wanted stars with a heat bar, a mission objective
  tracker (title, step, timer), a helicopter-watching alert, speed, weapon, radio station,
  in-game clock, and a live minimap with mission and police blips.
- **Sound and music** — everything synthesised live with WebAudio: engine, sirens, gunshots,
  and three radio stations (PALMERA FM, BAY ROCK, CORAL NIGHT). Press **R** to change station.
- **Save** — progress (missions done, money) persists in localStorage; continue from the menu.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| E | Steal & enter car / exit car / buy snack at a vendor / start a side job nearby |
| Mouse + click | Aim / shoot pistol |
| Space | Punch (on foot) / handbrake (driving) / advance cutscene dialogue |
| Shift | Sprint |
| H | Honk |
| M | Next mission (pause menu: mute radio) |
| T | Start street race (at the stadium pad) |
| C | Photo mode |
| Mouse wheel | Cycle weapon (fists / pistol) |
| R | Change radio station |
| 1 / 2 | Fists / pistol |
| P | Pause |

## Layout

- `game/` — the game itself: `index.html` and `src/` (one job per file: config, rng, city,
  vehicles, people, missions, police, render, hud, input, audio, shots, plus the v3 systems
  daynight, races, stats, pickups, photomode and challenges, plus the v4 systems radio,
  sidejobs and cutscenes).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes
  `dossier.json` with the vendored make.fun library.
- `screenshots/` — four real renders of the game running in a browser.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

Everything in this game — the city, characters, vehicles, names, story, art and sounds — is
original. Nothing is taken from Rockstar Games' Grand Theft Auto series or any other commercial game.

## License

MIT — see [LICENSE](LICENSE).
