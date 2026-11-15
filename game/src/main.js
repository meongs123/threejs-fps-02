// EMBERLINE — Kestrel Yard. Boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. ?shot=firefight|site-plant|buy|round-win with
// &seed=N stages a deterministic frame for a capture, renders it twice, freezes
// it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createAudio } from './audio.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud();
const player = createPlayer(world.colliders, [0, 14]);
const weapons = createWeaponSet(camera, audio);
const bots = createBots(scene, world, random);
const game = createGame({ scene, world, bots, player, weapons, effects, audio, hud, random });
const input = createInput(renderer.domElement, onLockChange);

const body = player.state;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let prevKeys = new Set();
let scoreShown = false;
let elapsed = 0;
let fovCurrent = 74;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0);
}

function onPlayClick() {
  if (shot) return;
  audio.unlock();
  if (game.phase === 'lobby') {
    game.newMatch();
    started = true;
  } else if (game.phase === 'intermission') {
    game.nextRound();
  } else if (game.phase === 'matchEnd') {
    game.newMatch();
    started = true;
  }
  input.requestLock();
}

hud.onPlay(onPlayClick);
hud.onBuy((id) => game.buyItem(id));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (game.phase === 'live' || game.phase === 'buy') {
    hud.showOverlay('paused');
  }
}

function edgePressed(code) {
  return input.state.keys.has(code) && !prevKeys.has(code);
}

function step(dt) {
  elapsed += dt;
  if (game.phase === 'live' || game.phase === 'buy') {
    const look = input.takeLook();
    if (look.x || look.y) player.look(look.x, look.y);
    if (playerAlive()) player.step(dt, input.state.keys);

    // Fire: automatic weapons hold, the rest fire on the rising edge.
    const firing = input.state.firing;
    const wantFire = weapons.def.auto ? firing : firing && !prevFiring;
    if (wantFire) game.firePlayer(camera);
    prevFiring = firing;

    if (edgePressed('KeyR')) weapons.reload();
    if (game.phase === 'live') {
      if (edgePressed('Digit1')) weapons.equip('pistol');
      if (edgePressed('Digit2')) weapons.equip('rifle');
      if (edgePressed('Digit3')) weapons.equip('shotgun');
      if (edgePressed('Digit4')) weapons.equip('dmr');
      if (edgePressed('Digit5')) weapons.equip('knife');
      // The knife is light: +15% run speed while it is out.
      player.setSpeedMul(weapons.def.kind === 'knife' ? 1.15 : 1);
    }
    // Scoreboard while Tab is held (build once on press, hide on release).
    const tabHeld = input.state.keys.has('Tab');
    if (tabHeld && !scoreShown) { scoreShown = true; hud.showScoreboard(true, game.scoreboard); }
    else if (!tabHeld && scoreShown) { scoreShown = false; hud.showScoreboard(false); }
    if (edgePressed('KeyG')) game.throwGrenade(camera);
    if (edgePressed('KeyQ')) game.throwUtility('smoke', camera);
    if (edgePressed('KeyE')) game.throwUtility('flash', camera);
    if (edgePressed('KeyX')) game.dropSpike();
  }
  prevKeys = new Set(input.state.keys);
  game.step(dt, input.state, camera);

  // DMR zoom eases the field of view toward its target.
  const zoomTarget = camera.userData.zoomTarget ?? 74;
  if (Math.abs(fovCurrent - zoomTarget) > 0.1) {
    fovCurrent += (zoomTarget - fovCurrent) * Math.min(1, dt * 10);
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }
  hud.setCrosshairSpread(6 + weapons.spread(player.groundSpeed()) * 900);
  syncCamera();
}

function playerAlive() {
  return game.playerAlive;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (frozen) return;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += dt;
  let guard = 0;
  while (accumulator >= FIXED_STEP && guard < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    guard += 1;
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Staged captures: pose the match, run a few fixed steps, render twice, freeze.
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function skipBuy() {
  // Run the buy clock out at fixed steps; bots stand at spawn until it ends.
  for (let i = 0; i < 15 * 60 + 5; i += 1) game.step(FIXED_STEP, input.state, camera);
}

function freezeShot() {
  syncCamera();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  frozen = true;
  window.__shotReady = true;
}

function stageShot() {
  game.newMatch();
  hud.hideOverlay();
  if (shot === 'buy') {
    hud.showBuy(true, game.money, weapons.owned, { rifle: 2700, shotgun: 1050, dmr: 4750, lightvest: 650, heavyvest: 1000, grenade: 300, smoke: 250, flash: 200 });
    document.getElementById('banner').classList.remove('on');
    body.position.set(0, 0, 13);
    body.yaw = 0;
    body.pitch = 0;
    freezeShot();
    return;
  }
  skipBuy();
  if (shot === 'firefight') {
    // Mid-lane firefight: smoke blooming at the left chokepoint, tracer and
    // hitmarker on a Jackal in the warehouse door, killfeed and radio in HUD.
    const enemy = bots.bots.find((b) => b.team === 'jackal' && b.alive);
    const enemy2 = bots.bots.find((b) => b.team === 'jackal' && b.alive && b !== enemy);
    body.position.set(0.3, 0, 10);
    aimAt(new THREE.Vector3(-6, 1.2, -2));
    game.debugArm('smoke');
    game.throwUtility('smoke', camera);
    for (let i = 0; i < 90; i += 1) game.step(FIXED_STEP, input.state, camera);
    if (enemy) {
      enemy.body.position.set(0.5, 0, -3);
      enemy.body.yaw = Math.PI;
    }
    if (enemy2) {
      enemy2.body.position.set(-1.5, 0, 3);
      enemy2.body.yaw = Math.PI * 0.9;
    }
    for (let i = 0; i < 10; i += 1) game.step(FIXED_STEP, input.state, camera);
    if (enemy) aimAt(new THREE.Vector3(enemy.body.position.x, 1.3, enemy.body.position.z));
    game.firePlayer(camera);
    hud.killfeed('<b class="vanguard">HAVOC</b> ▸ <b class="jackal">VIPER</b>');
    hud.radio('<b class="vanguard">FALCON</b> [RADIO]: Smoke out — pushing Crane Yard!');
    hud.setHealth(74);
    hud.setScore(2, 1, 3);
    document.getElementById('banner').classList.remove('on');
    freezeShot();
    return;
  }
  if (shot === 'site-plant') {
    // Site A, spike planted: the blinking 3D prop on the amber pad, squad
    // holding cover, SPIKE PLANTED in the HUD.
    game.debugPlant();
    const guard1 = bots.bots.find((b) => b.team === 'vanguard' && b.alive);
    const guard2 = bots.bots.find((b) => b.team === 'vanguard' && b.alive && b !== guard1);
    if (guard1) { guard1.body.position.set(-19.5, 0, -2.5); guard1.body.yaw = Math.PI * 0.75; }
    if (guard2) { guard2.body.position.set(-15.5, 0, -5.5); guard2.body.yaw = -Math.PI * 0.25; }
    body.position.set(-17, 0, -1.5);
    aimAt(new THREE.Vector3(SITES.A.center.x, 0.3, SITES.A.center.z));
    hud.radio('<b class="vanguard">HAVOC</b> [RADIO]: Covering Spike at A!');
    for (let i = 0; i < 30; i += 1) game.step(FIXED_STEP, input.state, camera);
    hud.setHealth(82);
    hud.setScore(2, 1, 3);
    freezeShot();
    return;
  }
  if (shot === 'round-win') {
    // Round won at Site A: a frag bursting mid-frame, compact ROUND WON
    // banner, the yard still visible behind it.
    body.position.set(-13, 0, -2);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    game.debugArm('frag');
    game.throwGrenade(camera);
    for (let i = 0; i < 115; i += 1) game.step(FIXED_STEP, input.state, camera);
    hud.banner('ROUND WON', 'Jackal squad eliminated — Site A held.');
    hud.setScore(3, 1, 4);
    hud.setHealth(61);
    freezeShot();
  }
}

if (shot) {
  stageShot();
} else {
  hud.setHealth(100);
  hud.setAmmo(weapons.ammo.mag, weapons.ammo.reserve, weapons.def.name, 1);
  hud.setMoney(800);
  hud.setScore(0, 0, 1);
  hud.setAlive(5, 5);
  hud.showOverlay('start');
  syncCamera();
}

// Test handle: the play-test reads phase, health and bot counts through this.
window.__game = {
  get phase() { return game.phase; },
  get health() { return game.playerHealth; },
  get alive() { return game.playerAlive; },
  get score() { return game.score; },
  get round() { return game.round; },
  get money() { return game.money; },
  botsAlive(team) { return bots.aliveCount(team); },
  botDebug(i) {
    const b = bots.bots[i];
    if (!b) return null;
    return {
      name: b.name, team: b.team, role: b.role, state: b.state,
      x: +b.body.position.x.toFixed(1), z: +b.body.position.z.toFixed(1),
      vx: +b.body.velocity.x.toFixed(2), vz: +b.body.velocity.z.toFixed(2),
      targetKey: b.targetKey, reaction: +b.reaction.toFixed(2),
      burstLeft: b.burstLeft, path: b.path, pathIndex: b.pathIndex,
      hasTarget: !!b.target, blindUntil: +b.blindUntil.toFixed(2),
      plantProgress: +b.plantProgress.toFixed(2), defuseProgress: +b.defuseProgress.toFixed(2),
      hearUntil: +b.hearUntil.toFixed(2), smokeLeft: b.smokeLeft, fragLeft: b.fragLeft,
      lastSeen: b.hasLastSeen ? { x: +b.lastSeen.x.toFixed(1), z: +b.lastSeen.z.toFixed(1) } : null,
    };
  },
  botsPos() {
    return bots.bots.map((b) => ({
      team: b.team, name: b.name, alive: b.alive, state: b.state,
      x: +b.body.position.x.toFixed(1), z: +b.body.position.z.toFixed(1),
      hp: Math.round(b.health),
    }));
  },
  playerPos() { return { x: +body.position.x.toFixed(1), z: +body.position.z.toFixed(1), yaw: +body.yaw.toFixed(2) }; },
  fireAtNearest() {
    const enemy = bots.bots.find((b) => b.team === 'jackal' && b.alive);
    if (!enemy) return 'no-enemy';
    aimAt(new THREE.Vector3(enemy.body.position.x, 1.3, enemy.body.position.z));
    const before = enemy.health;
    game.firePlayer(camera);
    return { target: enemy.name, hpBefore: before, hpAfter: enemy.health, ammo: weapons.ammo.mag };
  },
  grenade() {
    game.throwGrenade(camera);
    return 'thrown';
  },
  throwSmoke() { game.debugArm('smoke'); game.throwUtility('smoke', camera); return game.smokes; },
  throwFlash() { game.debugArm('flash'); game.throwUtility('flash', camera); return game.flashes; },
  utility() { return { frag: game.grenades, smoke: game.smokes, flash: game.flashes, throws: game.throws, smokeActive: game.smokeCount }; },
  ammo() { return { mag: weapons.ammo.mag, reserve: weapons.ammo.reserve, weapon: weapons.current, reloading: weapons.reloading }; },
  weapon() { return { current: weapons.current, kind: weapons.def.kind, speedMul: player.speedMul }; },
  equip(id) { return weapons.equip(id); },
  recoilStep() { return weapons.recoilStep(); },
  armor() { return game.armor; },
  playerTeam() { return game.playerTeam; },
  scoreboard() { return game.scoreboard; },
  buyItem(id) { game.buyItem(id); return { money: game.money, armor: game.armor }; },
  damagePlayer(amount, attacker, part) { game.damagePlayer(amount, attacker || 'VIPER', part || 'torso'); return game.playerHealth; },
  nextRound() { game.nextRound(); return { round: game.round, playerTeam: game.playerTeam, spike: game.spike.state }; },
  aim(x, y, z) { aimAt(new THREE.Vector3(x, y, z)); return 'ok'; },
  spikeCarrier() { return { state: game.spike.state, carrier: game.spike.carrier, carrierBot: game.spike.carrierBot ? game.spike.carrierBot.name : null, idleTimer: +game.idleTimer.toFixed(1), x: +game.spike.pos.x.toFixed(1), z: +game.spike.pos.z.toFixed(1) }; },
  flashLevel() { return +game.flashLevel.toFixed(2); },
  teleport(x, z) { body.position.set(x, 0, z); return 'ok'; },
  stepN(n) { for (let i = 0; i < n; i += 1) game.step(FIXED_STEP, input.state, camera); return game.phase; },
  // Full frame step (main.js step): player movement, edge-triggered utility
  // throws (G/Q/E/R/X), firing, then game.step. Use this in play-tests when
  // a check needs the real input path instead of game.step alone.
  stepMain(n) { for (let i = 0; i < n; i += 1) step(FIXED_STEP); return game.phase; },
  debugPlant() { game.debugPlant(); return game.spike.state; },
  debugMoney(n) { return game.debugMoney(n); },
  setAltFire(on) { input.state.altFire = !!on; return input.state.altFire; },
  start() { if (game.phase === 'lobby') { game.newMatch(); started = true; } },
  skipBuy,
};

requestAnimationFrame(frame);
