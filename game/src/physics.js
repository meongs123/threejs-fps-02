// Shared movement: a standing box (radius, height) resolved against the world's
// axis-aligned colliders one axis at a time, so a wall never swallows a body. The
// player and every bot move through this one helper.
import * as THREE from 'three';

export function createMover(colliders, radius, standHeight, crouchHeight) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  return {
    radius,
    overlaps,
    // Move position by velocity for dt, sliding along walls. Returns whether the
    // body is standing on something.
    move(position, velocity, dt, height) {
      const nextX = position.x + velocity.x * dt;
      if (!overlaps(nextX, position.y, position.z, height, 0.04)) position.x = nextX;
      else velocity.x = 0;
      const nextZ = position.z + velocity.z * dt;
      if (!overlaps(position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
      else velocity.z = 0;
      position.y += velocity.y * dt;
      let onGround = false;
      const hit = overlaps(position.x, position.y, position.z, height, 0);
      if (hit && velocity.y <= 0) {
        position.y = hit.max.y;
        velocity.y = 0;
        onGround = true;
      } else if (hit) {
        position.y = hit.min.y - height;
        velocity.y = 0;
      }
      if (position.y < 0) {
        position.y = 0;
        velocity.y = 0;
        onGround = true;
      }
      return onGround;
    },
    canStand(x, y, z) {
      return !overlaps(x, y, z, standHeight, 0.02);
    },
    standHeight,
    crouchHeight,
  };
}

export function makeBody(x, z, yaw) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw,
    pitch: 0,
    eye: 1.6,
    onGround: true,
    crouching: false,
    height: 1.72,
  };
}
