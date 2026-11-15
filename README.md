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

Kestrel Yard, a dockyard at dusk. Vanguard attacks; Jackals defend.
First to 5 rounds takes the match (max 9). **At round 5 the sides swap:**
you join the Jackals and defend while the Vanguard bots keep attacking and
planting — so you get to plant the spike in rounds 1–4 and defuse it with F
in rounds 5–9. The HUD labels and scoreboard always follow your current side.

- **Objective:** carry the spike to Site A (Crane Yard) or Site B (the Stacks),
  hold F to plant, defend it for 35 seconds — or wipe the other team out.
  Jackals win by defusing it (hold F near the planted spike for 5 s) or
  running the clock out. The spike is a 3D prop on the ground, blinking amber
  when dropped and red once planted. Idle in spawn with the spike for 11 s
  and a Vanguard bot takes it and pushes the site; press X to drop it for a
  teammate.
- **Economy:** $800 to start, $300 a kill, $3,250 a round win. Buy phase between
  rounds: VK-9 Carbine ($2,700), Scatter-12 ($1,050), Longbow DMR ($4,750),
  Tactical Knife (slot 5, free), Light Vest ($650), Heavy Vest + Helmet
  ($1,000), Spark-4 frag grenades ($300), Dusk Smoke ($250), Flare Flash ($200).
  The vests are real protection, not labels: Light Vest cuts body damage to
  70%, Heavy Vest + Helmet also halves headshots. Armour is lost on death.
- **Utility:** Smoke (Q) blooms into a puff for ~10 s that genuinely blocks
  bot line of sight — cover a plant or a cross. Flash (E) bursts bright and
  blinds any enemy bot facing it with a clear line of sight, so it stops
  firing and wanders. Bots throw smoke and frags of their own on executes,
  and the carrier smokes the site on the final approach.
- **Gunplay:** hitscan with headshots, a **deterministic recoil pattern**
  (the same fixed per-weapon pitch/yaw sequence every time — no random
  spray), spread that punishes firing on the move, acceleration/crouch/jump
  movement with map collision, DMR zoom with a scope reticle overlay
  (right mouse). The Tactical Knife (slot 5) is a real melee weapon — 40
  torso / 65 head damage at 2.2 m — and makes you run 15% faster.
- **HUD:** a live 2D tactical radar in the top-left corner (lane layout, Sites
  A/B, team dots, visible enemies in red, the spike, and fading gunfire
  pings), a Tab scoreboard with K/D/A/Money per player and bot, and an armour
  chip under the money counter.
- **Bots:** waypoint lanes with squad roles (flank, mid control, site
  execute), hold positions, reaction delays, burst fire. They hear gunfire
  within 36 m and turn toward it, call out on a radio feed ("Smoke out —
  pushing Crane Yard!", "Contact Mid!"), plant and defuse the spike, and
  rotate to a planted spike to retake. The spike carrier pushes the site
  with an escort stack, ignores distant duels and gunfire so it actually
  arrives, and takes 30% less damage while carrying.
- **Look:** dusk palette, amber work lamps, rust containers, tracers, muzzle
  flash, impact sparks, explosions, synth sound (WebAudio, no audio files).
  Every texture is procedural — CanvasTexture generated in code
  (`game/src/textures.js`): speckled dock asphalt, corrugated containers
  stencilled with yard numbers, floor stencils "A" and "B" with yellow-black
  hazard striping in the bomb zones, a dusk gradient sky, harbour water and
  a barge outside the fence, crane jib and hook, hanging work lamps. Bot
  models have visors, hands gripping their guns, and muzzle tips; the DMR
  viewmodel has a scope tube and muzzle brake.

## Controls

WASD move, mouse look, click fire, R reload, 1–5 weapons (`[1] P9 [2] VK-9
[3] S-12 [4] DMR [5] Knife`), G frag grenade, Q smoke, E flash, F plant
the spike (hold 3 s) or defuse it after the side swap (hold 5 s), X drop
the spike, Ctrl crouch, Space jump, right mouse zooms the DMR (scope
reticle overlay), Tab scoreboard (hold), 6 Light Vest ($650), 7 Heavy Vest
+ Helmet ($1,000) in the buy menu.

## Layout

- `game/index.html` — page, HUD, import map
- `game/src/main.js` — boot, fixed-step loop, staged screenshot modes
- `game/src/game.js` — rounds, money, spike, grenades, smoke/flash, shots
- `game/src/bots.js` — bot AI (waypoints, roles, engage, hearing, plant/defuse)
- `game/src/world.js` — Kestrel Yard map, sites, waypoint graph
- `game/src/weapons.js` — armoury, view models, spread, deterministic recoil
- `game/src/textures.js` — procedural CanvasTextures (asphalt, containers,
  stencils, hazard striping, sky, water) — no image files, no network
- `game/src/player.js`, `game/src/physics.js` — movement + collision
- `game/src/effects.js` — tracers, sparks, explosions, smoke puffs, spike prop (pooled)
- `game/src/audio.js` — synthesised sounds
- `game/src/hud.js`, `game/src/input.js`, `game/src/palette.js`, `game/src/rng.js`
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
