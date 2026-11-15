// Tracers, impact sparks, explosions and death falls. Everything is pooled: no
// new objects are made in the hot loop, meshes are reused and hidden when spent.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 160;

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
    },
  };
}
