# EMBERLINE — Kestrel Yard

A round-based tactical FPS in three.js (0.187.0, vendored), built for the
make.fun bounty "Make the best three.js tactical FPS".

One server, no build step: `node serve.ts`, then open http://localhost:8080.

## The game

Kestrel Yard, a dockyard at dusk. Vanguard (you + 4 bots) attacks; Jackals defend.
First to 5 rounds takes the match (max 9).

- **Objective:** carry the spike to Site A (Crane Yard) or Site B (the Stacks),
  hold F to plant, defend it for 35 seconds — or wipe the other team out.
  Jackals win by defusing it or running the clock out.
- **Economy:** $800 to start, $300 a kill, $3,250 a round win. Buy phase between
  rounds: VK-9 Carbine ($2,700), Scatter-12 ($1,050), Longbow DMR ($4,750),
  Spark-4 frag grenades ($300).
- **Gunplay:** hitscan with headshots, recoil and spread that punish firing on
  the move, acceleration/crouch/jump movement with map collision, DMR zoom.
- **Bots:** waypoint lanes, hold positions, reaction delays, burst fire, they
  hear gunfire, plant and defuse the spike.
- **Look:** dusk palette, amber work lamps, rust containers, tracers, muzzle
  flash, impact sparks, explosions, synth sound (WebAudio, no audio files).

## Controls

WASD move, mouse look, click fire, R reload, 1–4 weapons/buy, G grenade,
F plant the spike, Ctrl crouch, Space jump, right mouse zooms the DMR.

## Layout

- `game/index.html` — page, HUD, import map
- `game/src/main.js` — boot, fixed-step loop, staged screenshot modes
- `game/src/game.js` — rounds, money, spike, grenades, shots
- `game/src/bots.js` — bot AI (waypoints, engage, plant/defuse)
- `game/src/world.js` — Kestrel Yard map, sites, waypoint graph
- `game/src/weapons.js` — armoury, view models, spread/recoil
- `game/src/player.js`, `game/src/physics.js` — movement + collision
- `game/src/effects.js` — tracers, sparks, explosions (pooled)
- `game/src/audio.js` — synthesised sounds
- `game/src/hud.js`, `game/src/input.js`, `game/src/palette.js`, `game/src/rng.js`
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
