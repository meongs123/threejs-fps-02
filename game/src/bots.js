// The other nine soldiers. Each bot is a body with a rifle, a waypoint path and a
// small state machine: advance along its lane, hold a position, engage what it can
// see, and work the objective — Vanguard plants the spike, Jackals defuse it.
// Bots react after a short delay, fire in bursts with distance-based accuracy, and
// turn toward gunfire they hear. One module owns all of it; game.js owns the match.
import * as THREE from 'three';
import { createMover, makeBody } from './physics.js';
import { range, pick } from './rng.js';

const BOT_NAMES = {
  vanguard: ['FALCON', 'HAVOC', 'BRICK', 'WREN'],
  jackal: ['VIPER', 'GHOST', 'MULE', 'DUSK', 'RAZOR'],
};
const BOT_GUNS = ['rifle', 'rifle', 'rifle', 'shotgun', 'dmr'];
const REACTION = [0.35, 0.65];
const BURST = [3, 5];
const WALK_SPEED = 3.7;
const EYE = 1.55;

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
  const gun = part(dark, 0.07, 0.09, 0.62, 0.2, 1.18, -0.3);
  scene.add(group);
  return { group, legL, legR, torso, head, gun };
}

export function createBots(scene, world, random) {
  const mover = createMover(world.colliders, 0.34, 1.72, 1.12);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const flashColor = new THREE.Color(0xff5555);
  const noFlash = new THREE.Color(0x000000);
  const eyeDir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const bots = [];
  const hitMeshes = [];
  let time = 0;

  function makeBot(team, index, spawn) {
    const figure = buildFigure(scene, team);
    const bot = {
      team,
      index,
      name: BOT_NAMES[team][index % BOT_NAMES[team].length],
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
      lastSeen: null,
      target: null,
      targetKey: null,
      plantProgress: 0,
      defuseProgress: 0,
      isCarrier: false,
      walkPhase: 0,
      damageFlash: 0,
      lastPos: null,
      stuckTimer: 0,
    };
    figure.torso.userData = { bot, part: 'torso' };
    figure.head.userData = { bot, part: 'head' };
    hitMeshes.push(figure.torso, figure.head);
    bots.push(bot);
    return bot;
  }

  function hasLineOfSight(from, to) {
    toTarget.copy(to).sub(from);
    const dist = toTarget.length();
    if (dist < 0.01) return true;
    eyeDir.copy(toTarget).normalize();
    raycaster.set(from, eyeDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function nearestVisibleEnemy(bot, ctx) {
    const eye = new THREE.Vector3(bot.body.position.x, EYE, bot.body.position.z);
    let best = null;
    let bestD = 26;
    const candidates = [];
    // The player is only an enemy to Jackals; Vanguard bots never shoot them.
    if (ctx.playerAlive && bot.team === 'jackal') {
      candidates.push({
        kind: 'player',
        pos: new THREE.Vector3(ctx.playerBody.position.x, ctx.playerBody.position.y + ctx.playerBody.eye, ctx.playerBody.position.z),
        moving: ctx.playerSpeed,
        crouching: ctx.playerBody.crouching,
      });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      candidates.push({
        kind: 'bot',
        bot: other,
        pos: new THREE.Vector3(other.body.position.x, EYE, other.body.position.z),
        moving: Math.hypot(other.body.velocity.x, other.body.velocity.z),
        crouching: false,
      });
    }
    for (const cand of candidates) {
      const d = eye.distanceTo(cand.pos);
      if (d > bestD) continue;
      if (!hasLineOfSight(eye, cand.pos)) continue;
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

  function stepBot(bot, dt, ctx) {
    const body = bot.body;
    if (!bot.alive) return;
    bot.damageFlash = Math.max(0, bot.damageFlash - dt);

    // Sense: nearest visible enemy, within 42 m and line of sight.
    const seen = nearestVisibleEnemy(bot, ctx);
    if (seen) {
      const key = seen.target.kind === 'player' ? 'player' : `${seen.target.bot.team}:${seen.target.bot.index}`;
      if (bot.targetKey !== key) {
        bot.reaction = range(random, REACTION[0], REACTION[1]);
        bot.targetKey = key;
      }
      bot.target = seen.target;
      bot.lastSeen = seen.target.pos.clone();
      bot.state = 'engage';
    } else if (bot.state === 'engage') {
      bot.target = null;
      bot.targetKey = null;
      bot.state = time < bot.holdUntil ? 'hold' : 'advance';
    }

    // Objective work, only when nothing is in the sights.
    if (bot.state !== 'engage') {
      if (bot.team === 'vanguard' && bot.isCarrier && ctx.spikeState === 'carried') {
        const site = ctx.assignedSite;
        const d = Math.hypot(body.position.x - site.center.x, body.position.z - site.center.z);
        if (d < 3.2) {
          bot.state = 'plant';
          bot.plantProgress += dt;
          if (bot.plantProgress >= 3) {
            ctx.onPlant(bot);
            bot.plantProgress = 0;
          }
        } else if (bot.state !== 'plant') {
          setPath(bot, world.nearestNode(site.center.x, site.center.z));
          bot.state = 'advance';
        }
      } else if (bot.team === 'jackal' && ctx.spikeState === 'planted') {
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
        if (bot.team === 'vanguard' && ctx.timeLeft !== undefined && ctx.timeLeft < 30) {
          setPath(bot, world.nearestNode(ctx.assignedSite.center.x, ctx.assignedSite.center.z));
          bot.state = 'advance';
          return;
        }
        const dest = bot.team === 'vanguard'
          ? world.nearestNode(ctx.assignedSite.center.x + range(random, -4, 4), ctx.assignedSite.center.z + range(random, -4, 4))
          : pick(random, [16, 17, 18, 19, 20, 21]);
        setPath(bot, dest);
        bot.state = 'advance';
      }
    }

    // Move: follow the path, or strafe while engaging.
    let moveX = 0;
    let moveZ = 0;
    let speed = WALK_SPEED;
    let faceYaw = body.yaw;
    if (bot.state === 'engage' && bot.lastSeen) {
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
    if (bot.state === 'engage' && bot.target) {
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

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.damageFlash = 0.12;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.health = 0;
    bot.state = 'dead';
    bot.figure.group.rotation.x = -Math.PI / 2 * 0.94;
    bot.figure.group.position.y = 0.25;
    return true;
  }

  return {
    bots,
    hitMeshes,
    spawnRound(teamSites) {
      for (const bot of bots) scene.remove(bot.figure.group);
      bots.length = 0;
      hitMeshes.length = 0;
      const vanguardSpawns = [[-16, 14], [-10, 14], [0, 14], [10, 14], [16, 14]];
      const jackalSpawns = [[-16, -14], [-10, -14], [0, -14], [10, -14], [16, -14]];
      // 5v5 including the player: four Vanguard bots beside the player, five Jackals.
      for (let i = 0; i < 4; i += 1) makeBot('vanguard', i, vanguardSpawns[i + 1]);
      for (let i = 0; i < 5; i += 1) makeBot('jackal', i, jackalSpawns[i]);
      // Vanguard opens toward its assigned site; Jackals split across both sites.
      for (const bot of bots) {
        if (bot.team === 'vanguard') {
          const site = teamSites.vanguard;
          setPath(bot, world.nearestNode(site.center.x + (bot.index - 2) * 3, site.center.z + 2));
        } else {
          const site = bot.index % 2 === 0 ? teamSites.A : teamSites.B;
          setPath(bot, world.nearestNode(site.center.x + (bot.index - 2) * 2, site.center.z + 2));
        }
        bot.state = 'advance';
        bot.isCarrier = false;
      }
    },
    step(dt, ctx) {
      time += dt;
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
    damage,
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
