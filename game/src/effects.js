// Tracers, impact sparks, explosions, smoke, flashes and the spike prop.
// Everything is pooled: no new objects are made in the hot loop, meshes are
// reused and hidden when spent. Smoke puffs and the spike prop are built once
// and only moved, scaled and faded after that.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 160;
const PROJECTILE_COUNT = 8;
const SMOKE_COUNT = 3;
const SMOKE_SPHERES = 6;
const SMOKE_RADIUS = 3.4;
const SMOKE_LIFE = 10;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.amber), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  const sparkVel = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) sparkVel.push(new THREE.Vector3());
  let sparkLife = 0;
  let sparkUsed = 0;

  const boomLight = new THREE.PointLight(new THREE.Color('#ff7a2a'), 0, 22, 1.4);
  scene.add(boomLight);
  const boomMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3d'), transparent: true, opacity: 0, depthWrite: false }),
  );
  boomMesh.visible = false;
  scene.add(boomMesh);
  let boomLife = 0;

  // Thrown utility: one shared geometry and material, a pool of hidden meshes.
  const projGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const projMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x22262b), roughness: 0.5, metalness: 0.5 });
  const projectiles = [];
  for (let i = 0; i < PROJECTILE_COUNT; i += 1) {
    const mesh = new THREE.Mesh(projGeo, projMat);
    mesh.visible = false;
    scene.add(mesh);
    projectiles.push(mesh);
  }
  let projNext = 0;

  // Smoke: three pooled puffs. Each puff is a group of spheres sharing one
  // geometry, with its own material so it can fade independently. A puff's
  // centre and radius are what the bots' line of sight tests against.
  const smokeGeo = new THREE.SphereGeometry(1, 12, 9);
  const smokePuffs = [];
  for (let i = 0; i < SMOKE_COUNT; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8b95a1), transparent: true, opacity: 0, depthWrite: false });
    const group = new THREE.Group();
    group.visible = false;
    const offsets = [[0, 1.0, 0], [1.4, 0.8, 0.6], [-1.3, 0.9, 0.5], [0.5, 1.5, -1.0], [-0.6, 0.7, -1.3], [0.2, 1.9, 0.4]];
    for (const [x, y, z] of offsets) {
      const ball = new THREE.Mesh(smokeGeo, mat);
      ball.position.set(x, y, z);
      group.add(ball);
    }
    scene.add(group);
    smokePuffs.push({
      group, mat, center: new THREE.Vector3(), radius: SMOKE_RADIUS, life: 0, active: false,
    });
  }
  let smokeNext = 0;

  // Flash: one pooled white burst, light plus expanding sphere.
  const flashLight = new THREE.PointLight(new THREE.Color('#fff6d8'), 0, 26, 1.2);
  scene.add(flashLight);
  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff8e0'), transparent: true, opacity: 0, depthWrite: false }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
  let flashLife = 0;

  // The spike: a small device with a blinking amber core, carried nowhere —
  // it only shows when dropped or planted, so the objective reads in 3D.
  const spikeGroup = new THREE.Group();
  const spikeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.26, 0.42),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x22262b), roughness: 0.4, metalness: 0.6 }),
  );
  spikeBody.position.y = 0.13;
  spikeBody.castShadow = true;
  const spikeCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.1, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1 }),
  );
  spikeCore.position.y = 0.29;
  const spikeAntenna = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.38, 0.04),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b95a1), roughness: 0.5, metalness: 0.5 }),
  );
  spikeAntenna.position.set(0.22, 0.44, 0);
  spikeGroup.add(spikeBody, spikeCore, spikeAntenna);
  spikeGroup.visible = false;
  scene.add(spikeGroup);
  let spikeMode = 'hidden';
  let spikeBlink = 0;

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to) {
      const slot = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_COUNT;
      const pos = slot.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      slot.line.visible = true;
      slot.line.material.opacity = 0.9;
      slot.life = 0.09;
    },
    impact(point, normal, count = 10) {
      sparks.visible = true;
      sparkLife = 0.35;
      sparkUsed = count;
      for (let i = 0; i < count; i += 1) {
        sparkPos[i * 3] = point.x;
        sparkPos[i * 3 + 1] = point.y;
        sparkPos[i * 3 + 2] = point.z;
        tmp.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
        if (normal) tmp.addScaledVector(normal, 2);
        sparkVel[i].copy(tmp);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.setDrawRange(0, count);
    },
    explosion(point) {
      boomLight.position.copy(point).y += 1;
      boomLight.intensity = 90;
      boomMesh.position.copy(point);
      boomMesh.position.y += 0.6;
      boomMesh.visible = true;
      boomLife = 0.5;
      this.impact(point, null, 60);
    },
    // A pooled mesh for a thrown canister; returns null when the pool is dry.
    spawnProjectile() {
      for (let i = 0; i < PROJECTILE_COUNT; i += 1) {
        const mesh = projectiles[(projNext + i) % PROJECTILE_COUNT];
        if (!mesh.visible) {
          projNext = (projNext + i + 1) % PROJECTILE_COUNT;
          mesh.visible = true;
          return mesh;
        }
      }
      return null;
    },
    freeProjectile(mesh) {
      if (mesh) mesh.visible = false;
    },
    // Bloom a smoke puff at a point; it blocks sight for SMOKE_LIFE seconds.
    spawnSmoke(point) {
      const puff = smokePuffs[smokeNext];
      smokeNext = (smokeNext + 1) % SMOKE_COUNT;
      puff.center.copy(point);
      puff.center.y = 0;
      puff.life = SMOKE_LIFE;
      puff.active = true;
      puff.group.position.copy(puff.center);
      puff.group.scale.setScalar(0.5);
      puff.group.visible = true;
      puff.mat.opacity = 0.55;
      return puff;
    },
    // Live smoke volumes for line-of-sight tests; the array itself is reused.
    smokeSpheres() {
      return smokePuffs;
    },
    smokeCount() {
      let n = 0;
      for (const puff of smokePuffs) if (puff.active) n += 1;
      return n;
    },
    flashBurst(point) {
      flashLight.position.copy(point);
      flashLight.position.y += 0.8;
      flashLight.intensity = 160;
      flashMesh.position.copy(point);
      flashMesh.position.y += 0.5;
      flashMesh.visible = true;
      flashLife = 0.45;
    },
    setSpikeProp(point, mode) {
      spikeMode = mode;
      if (mode === 'hidden') { spikeGroup.visible = false; return; }
      spikeGroup.visible = true;
      spikeGroup.position.set(point.x, 0, point.z);
      spikeCore.material.emissive.set(mode === 'planted' ? 0xd64545 : PALETTE.amber);
    },
    step(dt) {
      for (const tracer of tracers) {
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        if (tracer.life <= 0) tracer.line.visible = false;
        else tracer.line.material.opacity = tracer.life / 0.09 * 0.9;
      }
      if (sparkLife > 0) {
        sparkLife -= dt;
        for (let i = 0; i < sparkUsed; i += 1) {
          sparkVel[i].y -= 9 * dt;
          sparkPos[i * 3] += sparkVel[i].x * dt;
          sparkPos[i * 3 + 1] += sparkVel[i].y * dt;
          sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
          if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        if (sparkLife <= 0) sparks.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = 1 - boomLife / 0.5;
        boomMesh.scale.setScalar(1 + t * 5);
        boomMesh.material.opacity = Math.max(0, 0.55 * (1 - t));
        boomLight.intensity = Math.max(0, 90 * (1 - t));
        if (boomLife <= 0) { boomMesh.visible = false; boomLight.intensity = 0; }
      }
      for (const puff of smokePuffs) {
        if (!puff.active) continue;
        puff.life -= dt;
        const grow = Math.min(1, (SMOKE_LIFE - puff.life) / 1.2);
        puff.group.scale.setScalar(0.5 + grow * 0.9);
        if (puff.life <= 2) puff.mat.opacity = Math.max(0, 0.55 * (puff.life / 2));
        if (puff.life <= 0) { puff.active = false; puff.group.visible = false; puff.mat.opacity = 0; }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        const t = 1 - flashLife / 0.45;
        flashMesh.scale.setScalar(1 + t * 4);
        flashMesh.material.opacity = Math.max(0, 0.8 * (1 - t));
        flashLight.intensity = Math.max(0, 160 * (1 - t));
        if (flashLife <= 0) { flashMesh.visible = false; flashLight.intensity = 0; }
      }
      if (spikeMode !== 'hidden') {
        spikeBlink += dt;
        const rate = spikeMode === 'planted' ? 7 : 3.5;
        spikeCore.material.emissiveIntensity = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(spikeBlink * rate));
      }
    },
  };
}
