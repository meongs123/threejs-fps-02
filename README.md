# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/meongs123/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/meongs123/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBERLINE — Kestrel Yard: a round-based tactical FPS in three.js (0.187.0, vendored), built for the make.fun bounty "Make the best three.js tactical FPS". Two teams, spike objective, buy economy, bots.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

## The game

Kestrel Yard, a dockyard at dusk. Vanguard (you + 4 bots) attacks; Jackals defend.
First to 5 rounds takes the match (max 9).

- **Objective:** carry the spike to Site A (Crane Yard) or Site B (the Stacks),
  hold F to plant, defend it for 35 seconds — or wipe the other team out.
  Jackals win by defusing it or running the clock out. The spike is a 3D
  prop on the ground, blinking amber when dropped and red once planted.
  Idle in spawn with the spike for 11 s and a Vanguard bot takes it and
  pushes the site; press X to drop it for a teammate.
- **Economy:** $800 to start, $300 a kill, $3,250 a round win. Buy phase between
  rounds: VK-9 Carbine ($2,700), Scatter-12 ($1,050), Longbow DMR ($4,750),
  Spark-4 frag grenades ($300), Dusk Smoke ($250), Flare Flash ($200).
- **Utility:** Smoke (Q) blooms into a puff for ~10 s that genuinely blocks
  bot line of sight — cover a plant or a cross. Flash (E) bursts bright and
  blinds any enemy bot facing it with a clear line of sight, so it stops
  firing and wanders. Bots throw smoke and frags of their own on executes.
- **Gunplay:** hitscan with headshots, recoil and spread that punish firing on
  the move, acceleration/crouch/jump movement with map collision, DMR zoom.
- **Bots:** waypoint lanes with squad roles (flank, mid control, site
  execute), hold positions, reaction delays, burst fire. They hear gunfire
  within 36 m and turn toward it, call out on a radio feed ("Smoke out —
  pushing Crane Yard!", "Contact Mid!"), plant and defuse the spike, and
  rotate to a planted spike to retake.
- **Look:** dusk palette, amber work lamps, rust containers, tracers, muzzle
  flash, impact sparks, explosions, synth sound (WebAudio, no audio files).

## Controls

WASD move, mouse look, click fire, R reload, 1–4 weapons (`[1] P9 [2] VK-9
[3] S-12 [4] DMR`), G frag grenade, Q smoke, E flash, F plant the spike
(hold 3 s), X drop the spike, Ctrl crouch, Space jump, right mouse zooms
the DMR.

## Layout

- `game/index.html` — page, HUD, import map
- `game/src/main.js` — boot, fixed-step loop, staged screenshot modes
- `game/src/game.js` — rounds, money, spike, grenades, smoke/flash, shots
- `game/src/bots.js` — bot AI (waypoints, roles, engage, hearing, plant/defuse)
- `game/src/world.js` — Kestrel Yard map, sites, waypoint graph
- `game/src/weapons.js` — armoury, view models, spread/recoil
- `game/src/player.js`, `game/src/physics.js` — movement + collision
- `game/src/effects.js` — tracers, sparks, explosions, smoke puffs, spike prop (pooled)
- `game/src/audio.js` — synthesised sounds
- `game/src/hud.js`, `game/src/input.js`, `game/src/palette.js`, `game/src/rng.js`
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
