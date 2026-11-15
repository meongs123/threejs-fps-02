// Player movement: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time. Stopping to aim pays: the
// weapon spread grows with ground speed, which this module reports.
import * as THREE from 'three';
import { createMover, makeBody } from './physics.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders, spawn) {
  const mover = createMover(colliders, 0.34, STAND_HEIGHT, CROUCH_HEIGHT);
  const body = makeBody(spawn[0], spawn[1], Math.PI);
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching && mover.canStand(body.position.x, body.position.y, body.position.z)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = body.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;
    body.velocity.y = Math.max(-30, body.velocity.y);
    body.onGround = mover.move(body.position, body.velocity, dt, body.height);
  }

  return {
    state: body,
    step,
    look,
    recoil,
    respawn(spawnPoint, yaw) {
      body.position.set(spawnPoint[0], 0, spawnPoint[1]);
      body.velocity.set(0, 0, 0);
      body.yaw = yaw;
      body.pitch = 0;
      body.crouching = false;
      body.height = STAND_HEIGHT;
      body.eye = STAND_EYE;
    },
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
