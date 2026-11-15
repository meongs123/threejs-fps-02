// The other nine soldiers. Each bot is a body with a rifle, a waypoint path and a
// small state machine: advance along its lane, hold a position, engage what it can
// see, and work the objective — Vanguard plants the spike, Jackals defuse it.
// Bots react after a short delay, fire in bursts with distance-based accuracy, and
// turn toward gunfire they hear (hearEvent, ~36 m). Smoke genuinely blocks their
// line of sight; a flash blinds them for a few seconds. One module owns all of it;
// game.js owns the match. The hot loop allocates nothing per frame: sensing reuses
// scratch vectors and a candidate pool, and each bot owns one preallocated
// lastSeen vector.
import * as THREE from 'three';
import { createMover, makeBody } from './physics.js';
import { range, pick } from './rng.js';

const BOT_NAMES = {
  vanguard: ['FALCON', 'HAVOC', 'BRICK', 'WREN', 'JOLT'],
  jackal: ['VIPER', 'GHOST', 'MULE', 'DUSK', 'RAZOR'],
};
const BOT_GUNS = ['rifle', 'rifle', 'rifle', 'shotgun', 'dmr'];
const BOT_ROLES = {
  vanguard: ['flank', 'mid', 'execute', 'flank', 'execute'],
  jackal: ['siteA', 'siteB', 'mid', 'rotate', 'siteA'],
};
const REACTION = [0.35, 0.65];
const BURST = [3, 5];
const WALK_SPEED = 3.7;
const EYE = 1.55;
const SIGHT_RANGE = 26;
const HEAR_RANGE = 36;
const FLANK_NODES = [27, 28];
const MID_NODES = [9, 10, 11];
const SITE_A_NODES = [16, 17, 18];
const SITE_B_NODES = [19, 20, 21];

function buildFigure(scene, team) {
  const group = new THREE.Group();
  const teamColor = team === 'vanguard' ? 0xf0a830 : 0xd64545;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'vanguard' ? 0x4a4436 : 0x3a3f45), roughness: 0.85 });
  const plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a586), roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x22262b), roughness: 0.7 });
  function part(mat, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  const legL = part(dark, 0.16, 0.75, 0.18, -0.11, 0.38, 0);
  const legR = part(dark, 0.16, 0.75, 0.18, 0.11, 0.38, 0);
  const torso = part(cloth, 0.56, 0.72, 0.32, 0, 1.1, 0);
  const vest = part(plate, 0.5, 0.4, 0.36, 0, 1.14, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.set(0, 1.6, 0);
  head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, 1.4), dark);
  helmet.position.set(0, 1.63, 0);
  group.add(helmet);
  // Visor: a dark glossy strip across the face, so bots read at a glance.
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.07, 0.05),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x10151c), roughness: 0.15, metalness: 0.6 }),
  );
  visor.position.set(0, 1.6, -0.14);
  group.add(visor);
  const gun = part(dark, 0.07, 0.09, 0.62, 0.2, 1.18, -0.3);
  // Hands gripping the rifle, and a muzzle tip that catches the lamps.
  part(skin, 0.09, 0.09, 0.1, 0.2, 1.18, -0.42);
  part(skin, 0.09, 0.09, 0.1, 0.2, 1.12, -0.08);
  const muzzleTip = part(new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b95a1), roughness: 0.35, metalness: 0.7 }), 0.05, 0.05, 0.1, 0.2, 1.18, -0.62);
  muzzleTip.castShadow = false;
  scene.add(group);
  return { group, legL, legR, torso, head, gun };
}

export function createBots(scene, world, random) {
  const mover = createMover(world.colliders, 0.34, 1.72, 1.12);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const flashColor = new THREE.Color(0xff5555);
  const noFlash = new THREE.Color(0x000000);
  // Scratch vectors, allocated once and reused by the per-frame sense code.
  const eyeDir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const eyeScratch = new THREE.Vector3();
  const smokeTmp = new THREE.Vector3();
  const closestTmp = new THREE.Vector3();
  // Candidate pool: one reusable object per possible enemy, no allocation.
  const candPool = [];
  for (let i = 0; i < 10; i += 1) {
    candPool.push({ kind: '', bot: null, pos: new THREE.Vector3(), moving: 0, crouching: false });
  }
  const bots = [];
  const hitMeshes = [];
  let time = 0;

  function makeBot(team, index, spawn) {
    const figure = buildFigure(scene, team);
    const bot = {
      team,
      index,
      name: BOT_NAMES[team][index % BOT_NAMES[team].length],
      role: BOT_ROLES[team][index % BOT_ROLES[team].length],
      figure,
      body: makeBody(spawn[0], spawn[1], team === 'vanguard' ? 0 : Math.PI),
      health: 100,
      alive: true,
      gun: BOT_GUNS[index % BOT_GUNS.length],
      state: 'advance',
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      reaction: 0,
      burstLeft: 0,
      burstGap: 0,
      aimError: 0,
      strafeDir: 1,
      strafeUntil: 0,
      lastSeen: new THREE.Vector3(),
      hasLastSeen: false,
      target: null,
      targetKey: null,
      escortAt: 0, // Last time this bot re-pathed to escort the spike carrier.
      plantProgress: 0,
      defuseProgress: 0,
      isCarrier: false,
      walkPhase: 0,
      damageFlash: 0,
      lastPos: null,
      stuckTimer: 0,
      hearVec: new THREE.Vector3(),
      hearUntil: 0,
      hearChase: false,
      blindUntil: 0,
      smokeLeft: team === 'vanguard' ? 1 : 0,
      fragLeft: 1,
      // Scoreboard stats: kills, deaths, assists (a hit within 5 s of the
      // kill by a teammate of the killer counts as an assist).
      stats: { k: 0, d: 0, a: 0, lastHitBy: null, lastHitAt: -10 },
    };
    figure.torso.userData = { bot, part: 'torso' };
    figure.head.userData = { bot, part: 'head' };
    hitMeshes.push(figure.torso, figure.head);
    bots.push(bot);
    return bot;
  }

  // A smoke puff blocks sight when the eye-to-target segment passes through
  // one of its spheres (or starts inside one).
  function smokeBlocks(from, dir, dist, smokes) {
    if (!smokes) return false;
    for (const puff of smokes) {
      if (!puff.active) continue;
      smokeTmp.copy(puff.center).sub(from);
      const t = Math.max(0, Math.min(dist, smokeTmp.dot(dir)));
      closestTmp.copy(from).addScaledVector(dir, t);
      if (closestTmp.distanceTo(puff.center) < puff.radius) return true;
    }
    return false;
  }

  function hasLineOfSight(from, to, smokes) {
    toTarget.copy(to).sub(from);
    const dist = toTarget.length();
    if (dist < 0.01) return true;
    eyeDir.copy(toTarget).normalize();
    if (smokeBlocks(from, eyeDir, dist, smokes)) return false;
    raycaster.set(from, eyeDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function nearestVisibleEnemy(bot, ctx) {
    eyeScratch.set(bot.body.position.x, EYE, bot.body.position.z);
    let best = null;
    let bestD = SIGHT_RANGE;
    let candCount = 0;
    const smokes = ctx.smokeSpheres ? ctx.smokeSpheres() : null;
    // The player is an enemy to the bots on the other side. Rounds 1-4 the
    // player attacks with Vanguard, so only Jackals shoot them; after the
    // halftime swap the player defends with the Jackals, so Vanguard bots
    // shoot them instead.
    if (ctx.playerAlive && bot.team !== ctx.playerTeam) {
      const c = candPool[candCount];
      candCount += 1;
      c.kind = 'player';
      c.bot = null;
      c.pos.set(ctx.playerBody.position.x, ctx.playerBody.position.y + ctx.playerBody.eye, ctx.playerBody.position.z);
      c.moving = ctx.playerSpeed;
      c.crouching = ctx.playerBody.crouching;
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const c = candPool[candCount];
      candCount += 1;
      c.kind = 'bot';
      c.bot = other;
      c.pos.set(other.body.position.x, EYE, other.body.position.z);
      c.moving = Math.hypot(other.body.velocity.x, other.body.velocity.z);
      c.crouching = false;
    }
    for (let i = 0; i < candCount; i += 1) {
      const cand = candPool[i];
      const d = eyeScratch.distanceTo(cand.pos);
      if (d > bestD) continue;
      if (!hasLineOfSight(eyeScratch, cand.pos, smokes)) continue;
      best = cand;
      bestD = d;
    }
    return best ? { target: best, dist: bestD } : null;
  }

  function setPath(bot, destNode) {
    const from = world.nearestNode(bot.body.position.x, bot.body.position.z);
    bot.path = world.findPath(from, destNode);
    bot.pathIndex = 0;
  }

  function laneName(x, z) {
    if (z < -5) return x < 0 ? 'Crane Yard' : 'Stacks';
    if (Math.abs(x) < 8) return 'Mid';
    return x < 0 ? 'West flank' : 'East flank';
  }

  // The bot the spike depends on right now: the carrier, or — when the spike
  // is dropped — the closest live attacker to it. Only one bot runs the
  // spike at a time, so the rest keep fighting instead of crowding it.
  function spikeRunner(bot, ctx) {
    if (bot.team !== ctx.attackTeam || !bot.alive) return false;
    if (ctx.spikeState === 'carried') return bot.isCarrier;
    if (ctx.spikeState !== 'dropped') return false;
    let best = null;
    let bestD = Infinity;
    for (const other of bots) {
      if (!other.alive || other.team !== ctx.attackTeam) continue;
      const d = (other.body.position.x - ctx.spikePos.x) ** 2 + (other.body.position.z - ctx.spikePos.z) ** 2;
      if (d < bestD) { bestD = d; best = other; }
    }
    return best === bot;
  }

  function roleDest(bot, ctx) {
    // Escort: while the spike is carried, the attackers stack on the carrier
    // instead of wandering to solo role destinations — a lone carrier
    // walking into a defended door dies, a four-bot stack wins the fight.
    if (bot.team === ctx.attackTeam && ctx.spikeState === 'carried' && !bot.isCarrier && ctx.spikeCarrierPos) {
      return world.nearestNode(ctx.spikeCarrierPos.x, ctx.spikeCarrierPos.z);
    }
    switch (bot.role) {
      case 'flank': return bot.body.position.x < 0 ? FLANK_NODES[0] : FLANK_NODES[1];
      case 'mid': return pick(random, MID_NODES);
      case 'execute': return world.nearestNode(ctx.assignedSite.center.x, ctx.assignedSite.center.z);
      case 'siteA': return pick(random, SITE_A_NODES);
      case 'siteB': return pick(random, SITE_B_NODES);
      case 'rotate': {
        const other = ctx.assignedSite.name === 'A' ? SITE_B_NODES : SITE_A_NODES;
        return pick(random, other);
      }
      default: return world.nearestNode(ctx.assignedSite.center.x, ctx.assignedSite.center.z);
    }
  }

  function stepBot(bot, dt, ctx) {
    const body = bot.body;
    if (!bot.alive) return;
    bot.damageFlash = Math.max(0, bot.damageFlash - dt);
    const blinded = time < bot.blindUntil;

    // Sense: nearest visible enemy, within SIGHT_RANGE and line of sight.
    // A blinded bot sees nothing and wanders instead of firing.
    // The spike-runner only stops to fight enemies close enough to kill it
    // (under 10 m); distant defenders are ignored so it keeps pushing to
    // the site instead of duelling from range and never arriving. (A runner
    // that never shoots is a sitting duck; one that stops for every distant
    // defender never arrives — the distance line is the compromise.)
    // And once a bot is planting or defusing, being seen must not interrupt
    // it: the plant/defuse is the win condition, and a carrier that drops
    // the plant every time a defender appears never plants at all.
    const runner = spikeRunner(bot, ctx);
    const planting = bot.isCarrier && bot.team === ctx.attackTeam && ctx.spikeState === 'carried'
      && Math.hypot(body.position.x - ctx.assignedSite.center.x, body.position.z - ctx.assignedSite.center.z) < 3.2;
    const defusing = bot.team !== ctx.attackTeam && ctx.spikeState === 'planted'
      && Math.hypot(body.position.x - ctx.spikePos.x, body.position.z - ctx.spikePos.z) < 2.6;
    let seen = blinded || planting || defusing ? null : nearestVisibleEnemy(bot, ctx);
    if (seen && runner && seen.dist > 10) seen = null;
    if (seen) {
      const key = seen.target.kind === 'player' ? 'player' : `${seen.target.bot.team}:${seen.target.bot.index}`;
      if (bot.targetKey !== key) {
        bot.reaction = range(random, REACTION[0], REACTION[1]);
        bot.targetKey = key;
      }
      bot.target = seen.target;
      bot.lastSeen.copy(seen.target.pos);
      bot.hasLastSeen = true;
      bot.state = 'engage';
    } else if (bot.state === 'engage') {
      bot.target = null;
      bot.targetKey = null;
      bot.state = time < bot.holdUntil ? 'hold' : 'advance';
    }

    // Hearing: a recent gunshot pulls a holding or advancing bot toward it.
    // The spike-runner never chases a sound: it pushes the site, and a
    // hearing chase would drag it through the warehouse to a firefight on
    // the wrong side of the map instead of the bomb site.
    if (!blinded && bot.state !== 'engage' && bot.hearChase && time < bot.hearUntil && !runner) {
      bot.hearChase = false;
      setPath(bot, world.nearestNode(bot.hearVec.x, bot.hearVec.z));
      bot.state = 'advance';
      if (ctx.onRadio && random() < 0.5) {
        ctx.onRadio(`<b class="${bot.team}">${bot.name}</b> [RADIO]: Contact ${laneName(bot.hearVec.x, bot.hearVec.z)}!`);
      }
    }

    // A dropped spike is picked up on contact, even mid-fight — standing
    // next to it duelling while it lies there loses rounds.
    if (bot.team === ctx.attackTeam && ctx.spikeState === 'dropped') {
      const d = Math.hypot(body.position.x - ctx.spikePos.x, body.position.z - ctx.spikePos.z);
      if (d < 2) ctx.onPickup(bot);
    }
    // Objective work, only when nothing is in the sights and not blinded.
    // attackTeam is always Vanguard: they plant every round, and the other
    // side defuses. (After the halftime swap the player joins the Jackals,
    // but the Vanguard bots keep attacking — see game.js.) The spike-runner
    // only stops for close enemies — see the sensing section — so this
    // block usually runs for it.
    if (!blinded && bot.state !== 'engage') {
      if (bot.team === ctx.attackTeam && bot.isCarrier && ctx.spikeState === 'carried') {
        const site = ctx.assignedSite;
        const d = Math.hypot(body.position.x - site.center.x, body.position.z - site.center.z);
        if (d < 3.2) {
          bot.state = 'plant';
          bot.plantProgress += dt;
          if (bot.plantProgress >= 3) {
            ctx.onPlant(bot);
            bot.plantProgress = 0;
          }
        } else if (bot.state !== 'advance') {
          // Path once, then walk it: re-pathing every step resets pathIndex
          // to 0, which froze the carrier on its spawn node. (And never
          // re-path here just because the last node changed — that would
          // override the stuck-detector's sidestep and wedge the bot on a
          // wall again.)
          setPath(bot, world.nearestNode(site.center.x, site.center.z));
          bot.state = 'advance';
        } else if (bot.pathIndex >= bot.path.length) {
          setPath(bot, world.nearestNode(site.center.x, site.center.z));
        }
      } else if (bot.team === ctx.attackTeam && ctx.spikeState === 'carried' && !bot.isCarrier) {
        // Escort: stay with the carrier instead of wandering to a solo role
        // destination — a lone carrier walking into a defended site dies,
        // a stack wins the fight. Re-path at most every 3 s, so the
        // stuck-detector's sidestep is never overridden.
        const cd = Math.hypot(body.position.x - ctx.spikeCarrierPos.x, body.position.z - ctx.spikeCarrierPos.z);
        if (cd > 12 && time - bot.escortAt > 3) {
          bot.escortAt = time;
          setPath(bot, world.nearestNode(ctx.spikeCarrierPos.x, ctx.spikeCarrierPos.z));
          bot.state = 'advance';
        }
      } else if (bot.team === ctx.attackTeam && ctx.spikeState === 'dropped') {
        // Pick the dropped spike up and carry it to the site.
        const d = Math.hypot(body.position.x - ctx.spikePos.x, body.position.z - ctx.spikePos.z);
        if (d < 2) {
          ctx.onPickup(bot);
        } else if (bot.state !== 'advance') {
          setPath(bot, world.nearestNode(ctx.spikePos.x, ctx.spikePos.z));
          bot.state = 'advance';
        } else if (bot.pathIndex >= bot.path.length) {
          setPath(bot, world.nearestNode(ctx.spikePos.x, ctx.spikePos.z));
        }
      } else if (bot.team !== ctx.attackTeam && ctx.spikeState === 'planted') {
        // Retake: every Jackal rotates onto the planted site at once.
        const d = Math.hypot(body.position.x - ctx.spikePos.x, body.position.z - ctx.spikePos.z);
        if (d < 2.6) {
          bot.state = 'defuse';
          bot.defuseProgress += dt;
          if (bot.defuseProgress >= 5) {
            ctx.onDefuse(bot);
            bot.defuseProgress = 0;
          }
        } else if (bot.state !== 'defuse') {
          setPath(bot, world.nearestNode(ctx.spikePos.x, ctx.spikePos.z));
          bot.state = 'advance';
        }
      } else if (bot.state === 'advance' && bot.pathIndex >= bot.path.length) {
        // Reached the end of the lane: hold and watch for a while.
        bot.state = 'hold';
        bot.holdUntil = time + range(random, 2, 4);
      } else if (bot.state === 'hold' && time >= bot.holdUntil) {
        // Late in the round the attack pushes hard for the site instead of
        // holding: a round that nobody wins on the clock is a round wasted.
        if (bot.team === ctx.attackTeam && ctx.timeLeft !== undefined && ctx.timeLeft < 35) {
          setPath(bot, world.nearestNode(ctx.assignedSite.center.x, ctx.assignedSite.center.z));
          bot.state = 'advance';
          return;
        }
        setPath(bot, roleDest(bot, ctx));
        bot.state = 'advance';
      }
    }

    // Utility throws on the execute: smoke the site, or frag a held angle.
    if (!blinded && bot.state === 'advance' && ctx.onBotThrow) {
      if (bot.team === ctx.attackTeam) {
        const dSite = Math.hypot(body.position.x - ctx.assignedSite.center.x, body.position.z - ctx.assignedSite.center.z);
        // The carrier smokes the site on the final approach, and the whole
        // stack smokes with it — a coordinated execute covering the plant.
        // (Fires once: each bot's smokeLeft is spent by its own throw.)
        if (bot.isCarrier && ctx.spikeState === 'carried' && dSite < 14 && bot.smokeLeft > 0) {
          for (const other of bots) {
            if (other.alive && other.team === ctx.attackTeam && other.smokeLeft > 0) {
              other.smokeLeft -= 1;
              ctx.onBotThrow(other, 'smoke');
            }
          }
        } else if (dSite < 14 && random() < dt * 0.05) {
          if (bot.smokeLeft > 0 && random() < 0.6) { bot.smokeLeft -= 1; ctx.onBotThrow(bot, 'smoke'); }
          else if (bot.fragLeft > 0) { bot.fragLeft -= 1; ctx.onBotThrow(bot, 'frag'); }
        }
      } else if (ctx.spikeState === 'planted' && bot.fragLeft > 0 && random() < dt * 0.02) {
        bot.fragLeft -= 1;
        ctx.onBotThrow(bot, 'frag');
      }
    }

    // Move: follow the path, strafe while engaging, wander while blinded.
    let moveX = 0;
    let moveZ = 0;
    let speed = WALK_SPEED;
    let faceYaw = body.yaw;
    if (blinded) {
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + range(random, 0.4, 0.9);
      }
      faceYaw += bot.strafeDir * dt * 1.5;
      moveX = Math.sin(faceYaw) * 0.4;
      moveZ = -Math.cos(faceYaw) * 0.4;
      speed = WALK_SPEED * 0.4;
    } else if (bot.state === 'engage' && bot.hasLastSeen) {
      faceYaw = Math.atan2(-(bot.lastSeen.x - body.position.x), -(bot.lastSeen.z - body.position.z));
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + range(random, 0.5, 1.4);
      }
      const dx = bot.lastSeen.x - body.position.x;
      const dz = bot.lastSeen.z - body.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > 14) { moveX = dx / dist; moveZ = dz / dist; }
      else if (dist < 6) { moveX = -dx / dist; moveZ = -dz / dist; }
      else { moveX = -dz / dist * bot.strafeDir; moveZ = dx / dist * bot.strafeDir; }
      speed = WALK_SPEED * 0.55;
    } else if (bot.state === 'advance' && bot.path.length) {
      const node = world.nodes[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
      const dx = node.x - body.position.x;
      const dz = node.z - body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) bot.pathIndex += 1;
      else {
        moveX = dx / dist;
        moveZ = dz / dist;
        faceYaw = Math.atan2(-moveX, -moveZ);
      }
    }
    body.velocity.x += (moveX * speed - body.velocity.x) * Math.min(1, dt * 10);
    body.velocity.z += (moveZ * speed - body.velocity.z) * Math.min(1, dt * 10);
    body.velocity.y -= 20 * dt;
    body.onGround = mover.move(body.position, body.velocity, dt, body.height);
    // Face the move or the enemy, smoothly.
    let dyaw = faceYaw - body.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    body.yaw += dyaw * Math.min(1, dt * 8);

    // Stuck on cover: sidestep to a neighbouring node instead of pushing a wall.
    if (bot.state === 'advance') {
      if (!bot.lastPos) bot.lastPos = { x: body.position.x, z: body.position.z };
      const moved = Math.hypot(body.position.x - bot.lastPos.x, body.position.z - bot.lastPos.z);
      bot.stuckTimer += moved < 0.05 ? dt : -bot.stuckTimer;
      if (bot.stuckTimer > 1.5) {
        bot.stuckTimer = 0;
        const here = world.nearestNode(body.position.x, body.position.z);
        setPath(bot, pick(random, world.adjacency[here].concat([here])));
      }
      bot.lastPos = { x: body.position.x, z: body.position.z };
    }

    // Fire in bursts once the reaction delay has run out.
    if (!blinded && bot.state === 'engage' && bot.target) {
      if (bot.reaction > 0) bot.reaction -= dt;
      else {
        bot.burstGap -= dt;
        if (bot.burstLeft <= 0 && bot.burstGap <= 0) {
          bot.burstLeft = Math.floor(range(random, BURST[0], BURST[1] + 1));
          bot.burstGap = range(random, 0.5, 1.1);
        }
        if (bot.burstLeft > 0 && bot.burstGap <= 0) {
          bot.burstGap = bot.gun === 'dmr' ? 0.9 : bot.gun === 'shotgun' ? 0.8 : 0.11;
          bot.burstLeft -= 1;
          ctx.onBotFire(bot, bot.target);
        }
      }
    } else {
      bot.burstLeft = 0;
    }

    // Animate: walk cycle, aim the gun at the enemy, fall when dead.
    const speedNow = Math.hypot(body.velocity.x, body.velocity.z);
    bot.walkPhase += dt * speedNow * 2.2;
    const swing = Math.min(1, speedNow / WALK_SPEED) * 0.5;
    bot.figure.legL.rotation.x = Math.sin(bot.walkPhase) * swing;
    bot.figure.legR.rotation.x = -Math.sin(bot.walkPhase) * swing;
    bot.figure.group.position.copy(body.position);
    bot.figure.group.rotation.y = body.yaw;
    bot.figure.torso.material.emissive = bot.damageFlash > 0 ? flashColor : noFlash;
  }

  function damage(bot, amount, part, attackerName) {
    if (!bot.alive) return false;
    // The spike carrier is the team's protected asset: it takes 30% less
    // damage while carrying, so a lone carrier is not deleted by focused
    // fire before the escorts can reach it and the smoke can cover it.
    if (bot.isCarrier) amount = Math.round(amount * 0.7);
    bot.health -= amount;
    bot.damageFlash = 0.12;
    // Remember who hit this bot before this shot: that is the assist.
    const prevHitBy = bot.stats.lastHitBy;
    const prevHitAt = bot.stats.lastHitAt;
    if (attackerName) {
      bot.stats.lastHitBy = attackerName;
      bot.stats.lastHitAt = time;
    }
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.health = 0;
    bot.state = 'dead';
    bot.stats.d += 1;
    // Credit the kill (and an assist to a teammate who hit the same bot
    // within 5 s). The player is credited by game.js, not here.
    if (attackerName && attackerName !== 'YOU') {
      const killer = bots.find((b) => b.name === attackerName);
      if (killer) {
        killer.stats.k += 1;
        const helper = prevHitBy && prevHitBy !== attackerName
          ? bots.find((b) => b.name === prevHitBy) : null;
        if (helper && helper.team === killer.team && time - prevHitAt <= 5) helper.stats.a += 1;
      }
    }
    bot.figure.group.rotation.x = -Math.PI / 2 * 0.94;
    bot.figure.group.position.y = 0.25;
    return true;
  }

  return {
    bots,
    hitMeshes,
    now() { return time; },
    // Gunfire at a point: enemy bots within HEAR_RANGE turn toward it.
    hearEvent(pos, team) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === team) continue;
        const d = Math.hypot(bot.body.position.x - pos.x, bot.body.position.z - pos.z);
        if (d > HEAR_RANGE) continue;
        bot.hearVec.set(pos.x, 0, pos.z);
        bot.hearUntil = time + 3;
        bot.hearChase = true;
      }
    },
    spawnRound(teamSites) {
      for (const bot of bots) scene.remove(bot.figure.group);
      bots.length = 0;
      hitMeshes.length = 0;
      const vanguardSpawns = [[-16, 14], [-10, 14], [0, 14], [10, 14], [16, 14]];
      const jackalSpawns = [[-16, -14], [-10, -14], [0, -14], [10, -14], [16, -14]];
      // 5v5 including the player: rounds 1-4 the player attacks, so four
      // Vanguard bots beside them and five Jackals; after the halftime swap
      // the player defends, so five Vanguard bots attack and four Jackals
      // hold with the player. Without this the defence rounds are 4v6 and
      // the attackers are eliminated before they can plant.
      const defending = teamSites.playerTeam === 'jackal';
      const vanguardCount = defending ? 5 : 4;
      const jackalCount = defending ? 4 : 5;
      for (let i = 0; i < vanguardCount; i += 1) makeBot('vanguard', i, vanguardSpawns[defending ? i : i + 1]);
      for (let i = 0; i < jackalCount; i += 1) makeBot('jackal', i, jackalSpawns[i]);
      // Roles drive the opening lane. The attacking side (vanguard rounds
      // 1-4, jackals after the halftime swap) pushes lanes toward the site;
      // the defending side holds the sites.
      const attackTeam = teamSites.attackTeam || 'vanguard';
      for (const bot of bots) {
        const site = teamSites.vanguard;
        if (bot.team === attackTeam) {
          if (bot.role === 'flank') setPath(bot, bot.body.position.x < 0 ? FLANK_NODES[0] : FLANK_NODES[1]);
          else if (bot.role === 'mid') setPath(bot, pick(random, MID_NODES));
          else setPath(bot, world.nearestNode(site.center.x + (bot.index - 2) * 3, site.center.z + 2));
        } else {
          const hold = bot.role === 'siteA' ? teamSites.A : bot.role === 'siteB' ? teamSites.B
            : bot.role === 'rotate' ? (site.name === 'A' ? teamSites.B : teamSites.A) : site;
          setPath(bot, world.nearestNode(hold.center.x + (bot.index - 2) * 2, hold.center.z + 2));
        }
        bot.state = 'advance';
        bot.isCarrier = false;
        bot.smokeLeft = bot.team === attackTeam ? 1 : 0;
        bot.fragLeft = 1;
      }
    },
    step(dt, ctx) {
      time += dt;
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
    damage,
    resetStats() {
      for (const bot of bots) bot.stats = { k: 0, d: 0, a: 0, lastHitBy: null, lastHitAt: -10 };
    },
    // Enemies the given team can currently see (it has a live target on
    // them): these are the red dots the minimap is allowed to show.
    seenBy(team) {
      const out = [];
      for (const bot of bots) {
        if (!bot.alive || bot.team !== team || !bot.target || bot.target.kind !== 'bot') continue;
        const enemy = bot.target.bot;
        if (enemy.alive) out.push({ x: enemy.body.position.x, z: enemy.body.position.z });
      }
      return out;
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    resetFigures() {
      for (const bot of bots) {
        bot.figure.group.rotation.x = 0;
        bot.figure.group.position.y = 0;
      }
    },
  };
}
