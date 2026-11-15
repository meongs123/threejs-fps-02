// EMBERLINE — Kestrel Yard. Boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. ?shot=start|play|buy|end with &seed=N stages a
// deterministic frame for a capture, renders it twice, freezes it and sets
// window.__shotReady.
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
    }
    if (edgePressed('KeyG')) game.throwGrenade(camera);
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
  if (shot === 'start') {
    // Overlook from behind the Vanguard spawn: mid warehouse, both sites, bots
    // mid-lane in the open.
    for (let i = 0; i < 240; i += 1) bots.step(FIXED_STEP, {
      playerAlive: true, playerBody: body, playerSpeed: 0, assignedSite: SITES.A,
      spikeState: 'carried', spikePos: SITES.A.center, onPlant() {}, onDefuse() {},
      onBotFire() {},
    });
    body.position.set(-3, 0, 15.5);
    body.yaw = 0.12;
    body.pitch = 0.08;
    hud.showOverlay('start');
    freezeShot();
    return;
  }
  if (shot === 'buy') {
    hud.showBuy(true, game.money, weapons.owned, { rifle: 2700, shotgun: 1050, dmr: 4750, grenade: 300 });
    document.getElementById('banner').classList.remove('on');
    body.position.set(0, 0, 13);
    body.yaw = 0;
    body.pitch = 0;
    freezeShot();
    return;
  }
  skipBuy();
  if (shot === 'play') {
    // Mid-lane firefight through the warehouse door: aim at the nearest Jackal,
    // fire once, freeze on the tracer and the hit marker.
    const enemy = bots.bots.find((b) => b.team === 'jackal' && b.alive);
    body.position.set(0.3, 0, 10);
    if (enemy) {
      enemy.body.position.set(0.5, 0, -3);
      enemy.body.yaw = Math.PI;
      aimAt(new THREE.Vector3(enemy.body.position.x, 1.3, enemy.body.position.z));
    }
    for (let i = 0; i < 30; i += 1) game.step(FIXED_STEP, input.state, camera);
    if (enemy) aimAt(new THREE.Vector3(enemy.body.position.x, 1.3, enemy.body.position.z));
    game.firePlayer(camera);
    hud.killfeed('<b class="vanguard">HAVOC</b> ▸ <b class="jackal">VIPER</b>');
    hud.setHealth(74);
    hud.setScore(2, 1, 3);
    document.getElementById('banner').classList.remove('on');
    freezeShot();
    return;
  }
  if (shot === 'end') {
    hud.showOverlay('round', 'Vanguard takes Round 3 — the spike detonated at Site A. Score 3–1.');
    hud.setScore(3, 1, 3);
    hud.setHealth(61);
    body.position.set(2, 0, -13);
    body.yaw = Math.PI - 0.15;
    body.pitch = 0.05;
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
      name: b.name, team: b.team, state: b.state,
      x: +b.body.position.x.toFixed(1), z: +b.body.position.z.toFixed(1),
      vx: +b.body.velocity.x.toFixed(2), vz: +b.body.velocity.z.toFixed(2),
      targetKey: b.targetKey, reaction: +b.reaction.toFixed(2),
      burstLeft: b.burstLeft, path: b.path, pathIndex: b.pathIndex,
      lastSeen: b.lastSeen ? { x: +b.lastSeen.x.toFixed(1), z: +b.lastSeen.z.toFixed(1) } : null,
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
  start() { if (game.phase === 'lobby') { game.newMatch(); started = true; } },
  skipBuy,
};

requestAnimationFrame(frame);
