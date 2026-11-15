// The match: rounds, money, the spike, grenades and every shot. Vanguard (the
// player plus four bots) attacks; Jackals defend. A round is won by eliminating the
// other team, by the spike exploding, or by defusing it; first to five rounds
// takes the match. game.js owns the rules; main.js owns the loop and the input.
import * as THREE from 'three';
import { SITES } from './world.js';
import { WEAPONS } from './weapons.js';
import { gaussian } from './rng.js';

const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const SPIKE_SECONDS = 35;
const PLANT_SECONDS = 3;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const START_MONEY = 800;
const IDLE_HANDOFF_SECONDS = 11;

// Buy keys match the live weapon keys: 2-4 buy the guns, G/Q/E buy the
// utilities they throw, so the menu and the HUD never disagree.
const SHOP = [
  { id: 'rifle', code: 'Digit2', name: 'VK-9 Carbine', desc: 'Auto rifle. The workhorse.' },
  { id: 'shotgun', code: 'Digit3', name: 'Scatter-12', desc: '8 pellets up close.' },
  { id: 'dmr', code: 'Digit4', name: 'Longbow DMR', desc: 'One shot, long sightlines.' },
  { id: 'grenade', code: 'KeyG', name: 'Spark-4 Frag', desc: 'Timed frag grenade.' },
  { id: 'smoke', code: 'KeyQ', name: 'Dusk Smoke', desc: 'Blocks sight for 10 s.' },
  { id: 'flash', code: 'KeyE', name: 'Flare Flash', desc: 'Blinds anyone facing it.' },
];
const PRICES = { rifle: 2700, shotgun: 1050, dmr: 4750, grenade: 300, smoke: 250, flash: 200 };
const UTIL_MAX = { grenade: 3, smoke: 2, flash: 2 };

export function createGame(deps) {
  const { scene, world, bots, player, weapons, effects, audio, hud, random } = deps;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const dir = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const right = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const shotDir = new THREE.Vector3();
  const farPoint = new THREE.Vector3();
  const botMuzzle = new THREE.Vector3();
  const prevGrenade = new THREE.Vector3();
  const downOffset = new THREE.Vector3(0, -0.14, 0);
  const grenadeVel = new THREE.Vector3();
  const flashDir = new THREE.Vector3();
  const flashTo = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  let phase = 'lobby';
  let round = 1;
  let score = { vanguard: 0, jackal: 0 };
  let money = START_MONEY;
  let lossStreak = 0;
  let kills = 0;
  let phaseTimer = 0;
  let roundEndTimer = 0;
  let roundEndInfo = null;
  let playerHealth = 100;
  let playerAlive = true;
  let grenades = 1;
  let smokes = 0;
  let flashes = 0;
  let throws = { frag: 0, smoke: 0, flash: 0 };
  let assignedSite = SITES.A;
  let spike = { state: 'carried', carrier: 'player', carrierBot: null, site: SITES.A, timer: 0, pos: new THREE.Vector3() };
  let plantProgress = 0;
  let grenadeProjectiles = [];
  let lastBuyKey = new Set();
  let elapsed = 0;
  let idleTimer = 0;
  let dropCooldown = 0; // After dropping, the player cannot re-pick the spike
  // for 1.5 s — otherwise the walk-over pickup in the same step would
  // instantly undo the drop and X could never leave the spike down.
  let lastRadioAt = -10;
  let flashBlindUntil = 0;
  let flashBlindStrength = 0;
  const shootables = world.shootables;

  function aliveCount(team) {
    return (team === 'vanguard' && playerAlive ? 1 : 0) + bots.aliveCount(team);
  }

  function currentFlashLevel() {
    const remain = flashBlindUntil - elapsed;
    if (remain <= 0) return 0;
    return Math.min(1, flashBlindStrength * Math.min(1, remain));
  }

  function syncHud() {
    hud.setHealth(playerHealth);
    hud.setAmmo(weapons.ammo.mag, weapons.ammo.reserve, weapons.def.name, grenades, smokes, flashes);
    hud.setMoney(money);
    hud.setScore(score.vanguard, score.jackal, round);
    hud.setAlive(aliveCount('vanguard'), aliveCount('jackal'));
    hud.setTimer(phase === 'buy' ? phaseTimer : phase === 'live' ? phaseTimer : 0, phase);
    hud.setFlash(currentFlashLevel());
  }

  function feed(html) {
    hud.killfeed(html);
  }

  // Squad radio, throttled so callouts stay readable instead of spammy.
  function radio(html) {
    if (elapsed - lastRadioAt < 4) return;
    lastRadioAt = elapsed;
    hud.radio(html);
  }

  function startRound() {
    assignedSite = round % 2 === 1 ? SITES.A : SITES.B;
    spike = { state: 'carried', carrier: 'player', carrierBot: null, site: assignedSite, timer: 0, pos: assignedSite.center.clone() };
    playerHealth = 100;
    playerAlive = true;
    grenades = Math.max(grenades, 1);
    plantProgress = 0;
    idleTimer = 0;
    flashBlindUntil = 0;
    flashBlindStrength = 0;
    grenadeProjectiles = [];
    weapons.refill();
    player.respawn([0, 14], 0);
    bots.spawnRound({ vanguard: assignedSite, A: SITES.A, B: SITES.B });
    effects.setSpikeProp(spike.pos, 'hidden');
    phase = 'buy';
    phaseTimer = BUY_SECONDS;
    hud.setSpike(`PLANT THE SPIKE — SITE ${assignedSite.name} · ${assignedSite.label}`);
    hud.banner(`ROUND ${round}`, `Plant the spike at Site ${assignedSite.name} — ${assignedSite.label}`);
    hud.setSpectate(false);
    hud.setFlash(0);
    syncHud();
  }

  function newMatch() {
    score = { vanguard: 0, jackal: 0 };
    money = START_MONEY;
    lossStreak = 0;
    kills = 0;
    round = 1;
    startRound();
  }

  function endRound(winner, reason) {
    if (phase !== 'live') return;
    phase = 'roundEnd';
    roundEndTimer = 3;
    roundEndInfo = { winner, reason };
    score[winner] += 1;
    if (winner === 'vanguard') {
      money += 3250;
      lossStreak = 0;
      audio.roundWin();
      hud.banner('ROUND WON', reason);
    } else {
      money += 1900 + Math.min(1000, lossStreak * 500);
      lossStreak += 1;
      audio.roundLose();
      hud.banner('ROUND LOST', reason);
    }
    hud.setSpike('');
    hud.setPlantProgress(null);
    hud.setFlash(0);
    effects.setSpikeProp(spike.pos, 'hidden');
    syncHud();
  }

  function finishRoundEnd() {
    if (score.vanguard >= WIN_ROUNDS || score.jackal >= WIN_ROUNDS || round >= MAX_ROUNDS) {
      phase = 'matchEnd';
      const won = score.vanguard > score.jackal;
      hud.showOverlay('match', won
        ? `Vanguard takes the match ${score.vanguard}–${score.jackal}. Kestrel Yard is yours.`
        : `Jackals hold the yard ${score.jackal}–${score.vanguard}. Run it back.`);
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    phase = 'intermission';
    const { winner, reason } = roundEndInfo;
    hud.showOverlay('round', `${winner === 'vanguard' ? 'Vanguard' : 'Jackals'} takes Round ${round} — ${reason}. Score ${score.vanguard}–${score.jackal}.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function nextRound() {
    round += 1;
    startRound();
  }

  // Hand the spike to the Vanguard bot closest to the site; if none is alive
  // it drops where the carrier fell. fromPos is where the drop lands.
  function transferSpike(fromPos) {
    let carrier = null;
    let bestD = Infinity;
    for (const b of bots.bots) {
      if (!b.alive || b.team !== 'vanguard') continue;
      const d = Math.hypot(b.body.position.x - assignedSite.center.x, b.body.position.z - assignedSite.center.z);
      if (d < bestD) { bestD = d; carrier = b; }
    }
    if (carrier) {
      carrier.isCarrier = true;
      spike.carrier = 'bot';
      spike.carrierBot = carrier;
      spike.state = 'carried';
      feed(`<b class="vanguard">${carrier.name}</b> picked up the spike`);
    } else {
      spike.carrier = 'dropped';
      spike.carrierBot = null;
      spike.state = 'dropped';
      spike.pos.copy(fromPos);
      feed('The spike is down — pick it up');
    }
  }

  function dropSpike() {
    if (phase !== 'live' || spike.state !== 'carried' || spike.carrier !== 'player') return;
    spike.state = 'dropped';
    spike.carrier = 'dropped';
    spike.carrierBot = null;
    spike.pos.copy(player.state.position);
    dropCooldown = 1.5;
    feed('<b class="vanguard">YOU</b> dropped the spike');
  }

  function damagePlayer(amount, attackerName) {
    if (!playerAlive || phase !== 'live') return;
    playerHealth -= amount;
    audio.hurt();
    hud.damageFlash();
    hud.setHealth(playerHealth);
    if (playerHealth <= 0) {
      playerHealth = 0;
      playerAlive = false;
      hud.setSpectate(true);
      feed(`<b class="jackal">${attackerName}</b> ▸ <b class="vanguard">YOU</b>`);
      if (spike.state === 'carried' && spike.carrier === 'player') transferSpike(player.state.position);
      syncHud();
    }
  }

  function damageBot(bot, amount, part, sourceName) {
    const killed = bots.damage(bot, amount, part);
    if (killed) {
      if (sourceName === 'YOU') {
        kills += 1;
        money += 300;
        audio.kill();
        hud.hitMarker(true);
      }
      feed(`<b class="${bot.team === 'jackal' ? 'vanguard' : 'jackal'}">${sourceName}</b> ▸ <b class="${bot.team}">${bot.name}</b>${part === 'head' ? ' ◉' : ''}`);
      if (spike.carrierBot === bot) {
        bot.isCarrier = false;
        transferSpike(bot.body.position);
      }
      syncHud();
    }
    return killed;
  }

  function firePlayer(camera) {
    if (phase !== 'live' || !playerAlive) return;
    const def = weapons.def;
    if (!weapons.ready()) {
      if (weapons.ammo.mag === 0) weapons.dryFire();
      return;
    }
    if (!weapons.takeRound()) return;
    weapons.pullTrigger();
    player.recoil(0.009 + def.recoil, (random() * 2 - 1) * 0.004);
    camera.getWorldDirection(dir);
    const spread = weapons.spread(player.groundSpeed());
    const pellets = def.pellets || 1;
    let hitSomething = false;
    muzzle.copy(camera.position).addScaledVector(dir, 0.6);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    muzzle.addScaledVector(right, 0.18).add(downOffset);
    for (let p = 0; p < pellets; p += 1) {
      shotDir.copy(dir);
      shotDir.x += gaussian(random) * spread;
      shotDir.y += gaussian(random) * spread;
      shotDir.z += gaussian(random) * spread;
      shotDir.normalize();
      raycaster.set(camera.position, shotDir);
      const targets = shootables.concat(bots.hitMeshes);
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) continue;
      hitPoint.copy(hit.point);
      effects.tracer(muzzle, hitPoint);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const part = hit.object.userData.part;
        const amount = part === 'head' ? def.headDamage : def.damage;
        const killed = damageBot(bot, amount, part, 'YOU');
        if (!killed) { audio.hit(); hud.hitMarker(false); }
        hitSomething = true;
      } else {
        effects.impact(hitPoint, hit.face ? hit.face.normal : null, 8);
        hitSomething = true;
      }
    }
    if (!hitSomething) {
      farPoint.copy(camera.position).addScaledVector(dir, 60);
      effects.tracer(muzzle, farPoint);
    }
    // Gunfire is loud: every enemy bot in earshot turns toward it.
    bots.hearEvent(muzzle, 'vanguard');
    syncHud();
  }

  function botFire(bot, target) {
    const from = eye.set(bot.body.position.x, 1.45, bot.body.position.z);
    botMuzzle.copy(from);
    const dist = from.distanceTo(target.pos);
    let hitChance = Math.max(0.08, Math.min(0.55, 0.55 - dist * 0.008));
    if (target.moving > 3) hitChance *= 0.7;
    if (target.crouching) hitChance *= 0.8;
    if (bot.gun === 'dmr') hitChance *= 1.25;
    if (bot.gun === 'shotgun' && dist > 14) hitChance *= 0.4;
    const hit = random() < hitChance;
    targetPos.copy(target.pos);
    if (!hit) {
      targetPos.x += gaussian(random) * (1.6 - hitChance * 2);
      targetPos.y += gaussian(random) * 1.1;
      targetPos.z += gaussian(random) * (1.6 - hitChance * 2);
    }
    effects.tracer(botMuzzle, targetPos);
    if (target.kind === 'player') {
      if (hit) {
        const dmg = bot.gun === 'dmr' ? 55 : bot.gun === 'shotgun' ? 26 : 15;
        damagePlayer(dmg, bot.name);
      }
    } else if (hit) {
      const dmg = bot.gun === 'dmr' ? 55 : bot.gun === 'shotgun' ? 26 : 15;
      const killed = damageBot(target.bot, dmg, 'torso', bot.name);
      if (killed && target.bot.team === 'jackal') { /* killfeed handled in damageBot */ }
    }
    if (dist < 45) audio.distantShot();
    bots.hearEvent(bot.body.position, bot.team);
  }

  function throwGrenade(camera) {
    if (phase !== 'live' || !playerAlive || grenades <= 0) return;
    const mesh = effects.spawnProjectile();
    if (!mesh) return;
    grenades -= 1;
    throws.frag += 1;
    camera.getWorldDirection(dir);
    mesh.position.copy(camera.position).addScaledVector(dir, 0.5);
    grenadeVel.copy(dir).multiplyScalar(17);
    grenadeVel.y += 4.5;
    grenadeProjectiles.push({ mesh, vel: grenadeVel.clone(), fuse: 1.8, bounces: 0, kind: 'frag', team: 'vanguard', source: 'YOU' });
    audio.buy();
    syncHud();
  }

  function throwUtility(kind, camera) {
    if (phase !== 'live' || !playerAlive) return;
    if (kind === 'smoke' && smokes <= 0) return;
    if (kind === 'flash' && flashes <= 0) return;
    const mesh = effects.spawnProjectile();
    if (!mesh) return;
    if (kind === 'smoke') smokes -= 1; else flashes -= 1;
    throws[kind] += 1;
    camera.getWorldDirection(dir);
    mesh.position.copy(camera.position).addScaledVector(dir, 0.5);
    grenadeVel.copy(dir).multiplyScalar(15);
    grenadeVel.y += 3.5;
    grenadeProjectiles.push({ mesh, vel: grenadeVel.clone(), fuse: kind === 'smoke' ? 1.1 : 0.9, bounces: 0, kind, team: 'vanguard', source: 'YOU' });
    audio.buy();
    syncHud();
  }

  // A bot throws utility on an execute: smoke toward the site, frag at it.
  function botThrow(bot, kind) {
    const mesh = effects.spawnProjectile();
    if (!mesh) return;
    const from = bot.body.position;
    mesh.position.set(from.x, 1.4, from.z);
    const target = kind === 'smoke' || bot.team === 'vanguard' ? assignedSite.center : spike.pos;
    dir.set(target.x - from.x, 0, target.z - from.z).normalize();
    grenadeVel.copy(dir).multiplyScalar(13);
    grenadeVel.y += 5;
    grenadeProjectiles.push({ mesh, vel: grenadeVel.clone(), fuse: 1.2, bounces: 0, kind, team: bot.team, source: bot.name });
    if (kind === 'smoke') {
      radio(`<b class="vanguard">${bot.name}</b> [RADIO]: Smoke out — pushing ${assignedSite.label}!`);
    }
  }

  function applyFlashBlind(pos, camera) {
    // The player: blinded when facing the burst with a clear line of sight.
    if (playerAlive) {
      flashTo.copy(pos).sub(camera.position);
      const dist = flashTo.length();
      if (dist < 30 && dist > 0.01) {
        flashTo.normalize();
        camera.getWorldDirection(camDir);
        const facing = camDir.dot(flashTo);
        if (facing > 0.1) {
          raycaster.set(camera.position, flashTo);
          raycaster.far = dist;
          if (!raycaster.intersectObjects(shootables, false)[0]) {
            const strength = Math.min(1, (0.5 + facing * 0.7) * (1 - dist / 40));
            flashBlindUntil = elapsed + 0.8 + strength * 2.2;
            flashBlindStrength = Math.max(flashBlindStrength, strength);
          }
        }
      }
    }
    // Enemy bots in line of sight stop firing and wander, confused.
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'jackal') continue;
      eye.set(bot.body.position.x, 1.55, bot.body.position.z);
      flashTo.copy(pos).sub(eye);
      const dist = flashTo.length();
      if (dist > 28 || dist < 0.01) continue;
      flashTo.normalize();
      raycaster.set(eye, flashTo);
      raycaster.far = dist;
      if (raycaster.intersectObjects(shootables, false)[0]) continue;
      bot.blindUntil = bots.now() + 1.5 + random() * 1.5;
    }
  }

  function explodeGrenade(projectile, camera) {
    effects.freeProjectile(projectile.mesh);
    const pos = projectile.mesh.position;
    if (projectile.kind === 'smoke') {
      effects.spawnSmoke(pos);
      audio.bounce();
      bots.hearEvent(pos, projectile.team);
      return;
    }
    if (projectile.kind === 'flash') {
      effects.flashBurst(pos);
      applyFlashBlind(pos, camera);
      bots.hearEvent(pos, projectile.team);
      return;
    }
    effects.explosion(pos);
    audio.explosion();
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const d = pos.distanceTo(bot.body.position);
      if (d < 6) {
        const dmg = Math.round(130 * (1 - d / 6) + 10);
        damageBot(bot, dmg, 'torso', projectile.source);
      }
    }
    if (playerAlive) {
      const d = pos.distanceTo(player.state.position);
      if (d < 5) damagePlayer(Math.round(70 * (1 - d / 5) + 5), 'SPARK-4');
    }
    bots.hearEvent(pos, projectile.team);
  }

  function stepGrenades(dt, camera) {
    for (let i = grenadeProjectiles.length - 1; i >= 0; i -= 1) {
      const g = grenadeProjectiles[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      prevGrenade.copy(g.mesh.position);
      g.mesh.position.addScaledVector(g.vel, dt);
      // Cheap bounce: if the new spot is inside a collider, step back and flip.
      let inside = false;
      for (const box of world.colliders) {
        if (box.containsPoint(g.mesh.position)) { inside = true; break; }
      }
      if (inside || g.mesh.position.y < 0.09) {
        g.mesh.position.copy(prevGrenade);
        if (g.mesh.position.y < 0.12) g.vel.y = Math.abs(g.vel.y) * 0.45;
        else { g.vel.x *= -0.45; g.vel.z *= -0.45; }
        g.bounces += 1;
        if (g.bounces <= 3) audio.bounce();
      }
      if (g.fuse <= 0) {
        explodeGrenade(g, camera);
        grenadeProjectiles.splice(i, 1);
      }
    }
  }

  function buyItem(id) {
    if (phase !== 'buy') return;
    if (UTIL_MAX[id] !== undefined) {
      const cur = id === 'grenade' ? grenades : id === 'smoke' ? smokes : flashes;
      if (money >= PRICES[id] && cur < UTIL_MAX[id]) {
        money -= PRICES[id];
        if (id === 'grenade') grenades += 1;
        else if (id === 'smoke') smokes += 1;
        else flashes += 1;
        audio.buy();
      } else audio.deny();
      syncHud();
      return;
    }
    const def = WEAPONS[id];
    if (!def || weapons.owned[id]) { audio.deny(); return; }
    if (money < def.price) { audio.deny(); return; }
    money -= def.price;
    weapons.buy(id);
    weapons.equip(id);
    audio.buy();
    syncHud();
  }

  function botContext() {
    return {
      playerAlive,
      playerBody: player.state,
      playerSpeed: player.groundSpeed(),
      assignedSite,
      spikeState: spike.state,
      spikePos: spike.pos,
      timeLeft: phaseTimer,
      smokeSpheres: () => effects.smokeSpheres(),
      onPlant(bot) {
        spike.state = 'planted';
        spike.timer = SPIKE_SECONDS;
        spike.pos.copy(bot.body.position);
        audio.plantBeep();
        hud.banner('SPIKE PLANTED', 'Jackals must defuse it');
        hud.setSpike('SPIKE PLANTED');
        feed(`<b class="vanguard">${bot.name}</b> planted the spike at Site ${spike.site.name}`);
        radio(`<b class="vanguard">${bot.name}</b> [RADIO]: Spike down at ${spike.site.name} — hold it!`);
      },
      onDefuse(bot) {
        spike.state = 'defused';
        audio.roundWin();
        endRound('jackal', `${bot.name} defused the spike`);
      },
      onPickup(bot) {
        bot.isCarrier = true;
        spike.carrier = 'bot';
        spike.carrierBot = bot;
        spike.state = 'carried';
        feed(`<b class="vanguard">${bot.name}</b> picked up the spike`);
      },
      onBotThrow: botThrow,
      onRadio: radio,
      onBotFire: botFire,
    };
  }

  function step(dt, input, camera) {
    if (phase === 'lobby' || phase === 'matchEnd' || phase === 'intermission') return;
    if (phase === 'roundEnd') {
      elapsed += dt;
      roundEndTimer -= dt;
      effects.step(dt);
      if (roundEndTimer <= 0) finishRoundEnd();
      return;
    }

    // Buy phase: 15 s to shop, then the round goes live.
    if (phase === 'buy') {
      elapsed += dt;
      phaseTimer -= dt;
      hud.setTimer(phaseTimer, 'buy');
      hud.showBuy(true, money, weapons.owned, PRICES);
      for (const item of SHOP) {
        if (input.keys.has(item.code) && !lastBuyKey.has(item.code)) buyItem(item.id);
      }
      lastBuyKey = new Set(input.keys);
      if (phaseTimer <= 0) {
        phase = 'live';
        phaseTimer = ROUND_SECONDS;
        hud.showBuy(false);
        hud.banner('ROUND LIVE', `Site ${assignedSite.name} — plant the spike`);
        radio(`<b class="vanguard">HAVOC</b> [RADIO]: Pushing ${assignedSite.label} — watch Mid!`);
      }
      return;
    }

    // Live round.
    elapsed += dt;
    phaseTimer -= dt;
    if (spike.state === 'planted') {
      spike.timer -= dt;
      hud.setSpike(`SPIKE PLANTED — 0:${String(Math.max(0, Math.ceil(spike.timer))).padStart(2, '0')}`);
      if (Math.floor(spike.timer * 2) !== Math.floor((spike.timer + dt) * 2)) audio.spikeBeep();
      if (spike.timer <= 0) {
        effects.explosion(spike.pos);
        audio.explosion();
        spike.state = 'exploded';
        endRound('vanguard', 'The spike detonated at Site ' + spike.site.name);
        return;
      }
    }

    // The spike prop tracks its carrier, or sits blinking where it fell.
    if (spike.state === 'carried') {
      if (spike.carrier === 'player') spike.pos.copy(player.state.position);
      else if (spike.carrierBot) spike.pos.copy(spike.carrierBot.body.position);
      effects.setSpikeProp(spike.pos, 'hidden');
    } else if (spike.state === 'planted' || spike.state === 'dropped') {
      effects.setSpikeProp(spike.pos, spike.state);
    } else {
      effects.setSpikeProp(spike.pos, 'hidden');
    }

    // Planting: hold F on the site while carrying the spike.
    if (playerAlive && spike.state === 'carried' && spike.carrier === 'player') {
      const d = Math.hypot(player.state.position.x - assignedSite.center.x, player.state.position.z - assignedSite.center.z);
      const still = player.groundSpeed() < 0.6;
      if (input.keys.has('KeyF') && d < 3.2 && still) {
        plantProgress += dt / PLANT_SECONDS;
        hud.setPlantProgress(Math.min(1, plantProgress));
        if (plantProgress >= 1) {
          spike.state = 'planted';
          spike.timer = SPIKE_SECONDS;
          spike.pos.copy(player.state.position);
          plantProgress = 0;
          hud.setPlantProgress(null);
          audio.plantBeep();
          hud.banner('SPIKE PLANTED', 'Jackals must defuse it');
          hud.setSpike('SPIKE PLANTED');
          feed('<b class="vanguard">YOU</b> planted the spike at Site ' + assignedSite.name);
        }
      } else {
        if (plantProgress > 0) plantProgress = 0;
        hud.setPlantProgress(null);
      }
    }

    // Pick up a dropped spike by walking over it (not during the short
    // cooldown right after the player dropped it — see dropCooldown).
    if (dropCooldown > 0) dropCooldown -= dt;
    if (playerAlive && spike.state === 'dropped' && dropCooldown <= 0) {
      const d = Math.hypot(player.state.position.x - spike.pos.x, player.state.position.z - spike.pos.z);
      if (d < 1.8) {
        spike.state = 'carried';
        spike.carrier = 'player';
        spike.carrierBot = null;
        feed('<b class="vanguard">YOU</b> picked up the spike');
      }
    }

    // Idle in spawn with the spike: hand it to the leading Vanguard bot so
    // the round never stalls on a player who never moves.
    if (spike.state === 'carried' && spike.carrier === 'player') {
      const inSpawn = player.state.position.z > 10 && Math.abs(player.state.position.x) < 20;
      idleTimer = inSpawn && player.groundSpeed() < 0.6 ? idleTimer + dt : 0;
      if (idleTimer > IDLE_HANDOFF_SECONDS) {
        idleTimer = 0;
        transferSpike(player.state.position);
        radio(`<b class="vanguard">FALCON</b> [RADIO]: Taking the spike — pushing ${assignedSite.label}!`);
      }
    } else {
      idleTimer = 0;
    }

    // Drop the spike with X so a bot can take it (handled by main.js
    // edgePressed('KeyX') — consolidated there, not duplicated here).

    bots.step(dt, botContext());
    stepGrenades(dt, camera);
    weapons.step(dt);
    effects.step(dt);

    // Round end by elimination or by the clock.
    const vanguardAlive = aliveCount('vanguard');
    const jackalAlive = aliveCount('jackal');
    if (jackalAlive === 0) endRound('vanguard', 'Jackal squad eliminated');
    else if (vanguardAlive === 0 && spike.state !== 'planted') endRound('jackal', 'Vanguard squad eliminated');
    else if (phaseTimer <= 0 && spike.state !== 'planted') endRound('jackal', 'Time expired — spike never planted');

    // Zoom: right mouse on the DMR narrows the field of view.
    if (camera.userData.zoomTarget === undefined) camera.userData.zoomTarget = 74;
    camera.userData.zoomTarget = input.altFire && weapons.current === 'dmr' && playerAlive ? 40 : 74;

    syncHud();
  }

  return {
    get phase() { return phase; },
    get playerAlive() { return playerAlive; },
    get playerHealth() { return playerHealth; },
    get money() { return money; },
    get score() { return score; },
    get round() { return round; },
    get spike() { return spike; },
    get shop() { return SHOP; },
    get grenades() { return grenades; },
    get smokes() { return smokes; },
    get flashes() { return flashes; },
    get throws() { return throws; },
    get smokeCount() { return effects.smokeCount(); },
    get flashLevel() { return currentFlashLevel(); },
    get idleTimer() { return idleTimer; },
    newMatch,
    startRound,
    nextRound,
    step,
    firePlayer,
    throwGrenade,
    throwUtility,
    dropSpike,
    buyItem,
    damagePlayer,
    syncHud,
    setPhase(value) { phase = value; },
    // Staging hook for screenshots: plant the spike at the assigned site.
    debugPlant() {
      if (phase !== 'live') return;
      spike.state = 'planted';
      spike.timer = SPIKE_SECONDS;
      spike.pos.copy(assignedSite.center);
      hud.banner('SPIKE PLANTED', 'Jackals must defuse it');
      hud.setSpike('SPIKE PLANTED');
    },
    // Staging/test hook: hand the player one utility without buying it.
    debugArm(kind) {
      if (kind === 'smoke') smokes += 1;
      else if (kind === 'flash') flashes += 1;
      else grenades += 1;
      syncHud();
    },
  };
}
