// Kestrel Yard: a 48 x 36 m dockyard at dusk. Vanguard spawn north, Jackals south.
// Site A is the crane yard west, Site B the container stacks east; between them a
// warehouse block with a door on each side, so three lanes run north to south.
// Every box is a collider for bodies and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint nodes [x, z] bots walk between; edges are index pairs.
const NODES = [
  [-18, 14], [-10, 14], [0, 14], [10, 14], [18, 14], // 0-4 north spawn
  [-16, 7], [-6, 7], [5, 7], [15, 7], // 5-8 north mid
  [-12, 0], [0, 0], [12, 0], // 9-11 through the warehouse doors
  [-16, -3], [-6, -4], [5, -4], [15, -3], // 12-15 south mid
  [-17, -8], [-12, -11], [-20, -15], // 16-18 site A
  [17, -8], [12, -11], [20, -15], // 19-21 site B
  [-16, -14], [-10, -14], [0, -14], [10, -14], [16, -14], // 22-26 south spawn
  [-21, 3], [21, 3], // 27-28 west / east flanks
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7], [3, 8], [4, 8],
  [5, 6], [6, 7], [7, 8], [5, 9], [6, 10], [7, 10], [8, 11], [5, 27], [8, 28],
  [9, 10], [10, 11], [9, 12], [10, 13], [11, 14], [10, 15], [12, 16], [13, 16],
  [14, 19], [15, 19], [12, 13], [13, 14], [14, 15], [16, 17], [16, 18],
  [19, 20], [19, 21], [17, 22], [18, 22], [20, 25], [21, 26], [22, 23],
  [23, 24], [24, 25], [25, 26], [12, 22], [15, 26], [9, 27], [11, 28],
  [27, 12], [28, 15], [6, 9], [7, 11],
];
export const SITES = {
  A: { name: 'A', center: new THREE.Vector3(-17, 0, -8), label: 'CRANE YARD' },
  B: { name: 'B', center: new THREE.Vector3(17, 0, -8), label: 'STACKS' },
};
export const SPAWNS = {
  vanguard: [[-16, 14], [-10, 14], [0, 14], [10, 14], [16, 14]],
  jackal: [[-16, -14], [-10, -14], [0, -14], [10, -14], [16, -14]],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' ? 0.5 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.05,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground and perimeter.
  box(48.4, 0.4, 36.4, 0, -0.2, 0, 'ground');
  box(0.5, 5, 36.4, -24.2, 2.5, 0, 'concrete');
  box(0.5, 5, 36.4, 24.2, 2.5, 0, 'concrete');
  box(48.4, 5, 0.5, 0, 2.5, -18.2, 'concrete');
  box(48.4, 5, 0.5, 0, 2.5, 18.2, 'concrete');

  // Mid warehouse: two walls with a 2.4 m door each, a roof slab on pillars.
  box(6.4, 3.4, 0.5, -4.3, 1.7, -2, 'steel');
  box(6.4, 3.4, 0.5, 4.3, 1.7, -2, 'steel');
  box(6.4, 3.4, 0.5, -4.3, 1.7, 2, 'steel');
  box(6.4, 3.4, 0.5, 4.3, 1.7, 2, 'steel');
  box(13.4, 0.35, 5.2, 0, 3.55, 0, 'concrete');
  box(0.5, 3.4, 0.5, -6.2, 1.7, -2, 'steel');
  box(0.5, 3.4, 0.5, 6.2, 1.7, -2, 'steel');
  box(0.5, 3.4, 0.5, -6.2, 1.7, 2, 'steel');
  box(0.5, 3.4, 0.5, 6.2, 1.7, 2, 'steel');

  // Site A: crane legs and beam, stacked containers, crates.
  box(0.7, 7, 0.7, -21, 3.5, -12, 'steel');
  box(0.7, 7, 0.7, -21, 3.5, -4, 'steel');
  box(0.6, 0.6, 9.4, -21, 7, -8, 'steel');
  box(6.1, 2.6, 2.5, -17, 1.3, -12.5, 'rust');
  box(6.1, 2.6, 2.5, -17, 3.9, -12.5, 'containerB');
  box(2.5, 2.6, 6.1, -13.2, 1.3, -8, 'teal');
  box(1.2, 1.2, 1.2, -14.5, 0.6, -4.5, 'container');
  box(1.2, 1.2, 1.2, -19.5, 0.6, -5, 'container');

  // Site B: container rows and a low wall.
  box(6.1, 2.6, 2.5, 17, 1.3, -12.5, 'containerB');
  box(2.5, 2.6, 6.1, 20.5, 1.3, -7, 'rust');
  box(6.1, 2.6, 2.5, 17, 3.9, -12.5, 'rustDark');
  box(1.2, 1.2, 1.2, 13.5, 0.6, -5, 'container');
  box(4.5, 1.1, 0.6, 14.5, 0.55, -11, 'concrete');

  // Mid cover: crates and barrels along the lanes.
  box(1.2, 1.2, 1.2, -12, 0.6, 6, 'container');
  box(1.2, 1.2, 1.2, -12, 1.8, 6, 'rust');
  box(1.2, 1.2, 1.2, 12, 0.6, 6, 'containerB');
  box(2.4, 1.1, 1.2, -4, 0.55, 8, 'steel');
  box(2.4, 1.1, 1.2, 5, 0.55, 8, 'steel');
  box(1.2, 1.2, 1.2, -8, 0.6, -6, 'rust');
  box(1.2, 1.2, 1.2, 8, 0.6, -6, 'container');
  box(1.2, 2.4, 1.2, -21, 1.2, 6, 'teal');
  box(1.2, 2.4, 1.2, 21, 1.2, 6, 'teal');
  box(3.2, 0.9, 1.4, 0, 0.45, 12, 'concrete');

  // Site pads: glowing floor marks so a site reads at a glance.
  const padGeo = new THREE.PlaneGeometry(5.4, 5.4);
  for (const site of Object.values(SITES)) {
    const pad = new THREE.Mesh(
      padGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.16 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.center.x, 0.03, site.center.z);
    group.add(pad);
  }

  // Distant skyline silhouettes, outside the walls, no colliders.
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#161d26') });
  const skyBoxes = [[-30, 8, -26, 10, 16, 4], [0, 10, -30, 14, 20, 4], [28, 6, -24, 8, 12, 4], [-34, 5, 10, 6, 10, 4], [32, 9, 14, 10, 18, 4]];
  for (const [x, h, z, w, hh, d] of skyBoxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), skyMat);
    m.position.set(x, h, z);
    skyline.add(m);
  }
  scene.add(skyline);

  // Dusk light: a low amber sun, cool hemisphere fill, one lamp per site.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#5a6b80'), new THREE.Color('#1c2024'), 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.0);
  sun.position.set(-18, 16, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  for (const site of Object.values(SITES)) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.amber), 14, 16, 1.6);
    lamp.position.set(site.center.x, 4.2, site.center.z);
    scene.add(lamp);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), mats.steel);
    pole.position.set(site.center.x + 2.6, 2.2, site.center.z + 2.6);
    pole.castShadow = true;
    group.add(pole);
    colliders.push(new THREE.Box3().setFromObject(pole));
  }

  // Waypoint adjacency, built from EDGES.
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    nodes: NODES.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    adjacency,
    nearestNode(x, z) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < NODES.length; i += 1) {
        const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    },
    // Breadth-first path of node indices from a to b.
    findPath(a, b) {
      if (a === b) return [a];
      const prev = new Array(NODES.length).fill(-1);
      const queue = [a];
      prev[a] = a;
      while (queue.length) {
        const cur = queue.shift();
        for (const next of adjacency[cur]) {
          if (prev[next] !== -1) continue;
          prev[next] = cur;
          if (next === b) {
            const path = [b];
            let node = cur;
            while (node !== a) { path.unshift(node); node = prev[node]; }
            path.unshift(a);
            return path;
          }
          queue.push(next);
        }
      }
      return [a];
    },
  };
}
