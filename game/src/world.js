// Kestrel Yard: a 48 x 36 m dockyard at dusk. Vanguard spawn north, Jackals south.
// Site A is the crane yard west, Site B the container stacks east; between them a
// warehouse block with a door on each side, so three lanes run north to south.
// Every box is a collider for bodies and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { groundTexture, containerTexture, hazardTexture, stencilTexture, skyTexture, waterTexture } from './textures.js';

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
  [5, 6], [6, 7], [7, 8], [5, 9], [7, 11], [8, 11], [5, 27], [8, 28],
  [9, 10], [10, 11], [9, 12], [11, 14], [12, 16], [13, 16],
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
  // Dusk gradient sky replaces the flat colour (main.js sets a colour first).
  scene.background = skyTexture();
  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' ? 0.5 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.05,
    });
  }
  // Textured materials, built once from canvas (no files, no network).
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.02 });
  const texMats = {
    rust: new THREE.MeshStandardMaterial({ map: containerTexture('#a8542c', 'KES-2210', '#f0a830'), roughness: 0.8, metalness: 0.25 }),
    rustDark: new THREE.MeshStandardMaterial({ map: containerTexture('#7e3d20', 'KES-1187', '#e8b62a'), roughness: 0.85, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ map: containerTexture('#2e6f6a', 'KES-9044', '#ece7db'), roughness: 0.8, metalness: 0.25 }),
    container: new THREE.MeshStandardMaterial({ map: containerTexture('#8a6d3b', 'KES-3301', '#f0a830'), roughness: 0.8, metalness: 0.25 }),
    containerB: new THREE.MeshStandardMaterial({ map: containerTexture('#5d7a68', 'KES-5520', '#ece7db'), roughness: 0.8, metalness: 0.25 }),
  };
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mat = typeof material === 'string' ? mats[material] : material;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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
  box(48.4, 0.4, 36.4, 0, -0.2, 0, groundMat);
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
  // Crane jib reaching over the yard, hook cable and block hanging below it.
  box(0.5, 0.5, 10, -16, 7.6, -8, 'steel');
  box(0.06, 3.2, 0.06, -12.5, 5.6, -8, 'concrete');
  box(0.5, 0.6, 0.5, -12.5, 3.7, -8, 'amber');
  // Site A stacks, pulled 1 m north: their south faces used to sit 0.25 m
  // from the south spawn line and wedged the defenders spawning at (±16, -14).
  box(6.1, 2.6, 2.5, -17, 1.3, -11.5, texMats.rust);
  box(6.1, 2.6, 2.5, -17, 3.9, -11.5, texMats.containerB);
  box(2.5, 2.6, 6.1, -13.2, 1.3, -8, texMats.teal);
  box(1.2, 1.2, 1.2, -14.5, 0.6, -4.5, texMats.container);
  box(1.2, 1.2, 1.2, -19.5, 0.6, -5, texMats.container);

  // Site B: container rows and a low wall.
  box(6.1, 2.6, 2.5, 17, 1.3, -11.5, texMats.containerB);
  box(2.5, 2.6, 6.1, 20.5, 1.3, -7, texMats.rust);
  box(6.1, 2.6, 2.5, 17, 3.9, -11.5, texMats.rustDark);
  box(1.2, 1.2, 1.2, 13.5, 0.6, -5, texMats.container);
  box(4.5, 1.1, 0.6, 14.5, 0.55, -11, 'concrete');

  // Mid cover: crates and barrels along the lanes.
  box(1.2, 1.2, 1.2, -12, 0.6, 6, texMats.container);
  box(1.2, 1.2, 1.2, -12, 1.8, 6, texMats.rust);
  box(1.2, 1.2, 1.2, 12, 0.6, 6, texMats.containerB);
  box(2.4, 1.1, 1.2, -4, 0.55, 8, 'steel');
  box(2.4, 1.1, 1.2, 5, 0.55, 8, 'steel');
  box(1.2, 1.2, 1.2, -8, 0.6, -6, texMats.rust);
  box(1.2, 1.2, 1.2, 8, 0.6, -6, texMats.container);
  box(1.2, 2.4, 1.2, -21, 1.2, 6, texMats.teal);
  box(1.2, 2.4, 1.2, 21, 1.2, 6, texMats.teal);
  // Waist-high mid cover, kept out of the centre spawn lane (it used to sit
  // at (0, 12) and wedged the player against it one step out of spawn).
  box(3.2, 0.9, 1.4, 6, 0.45, 12, 'concrete');

  // Site pads: glowing floor marks so a site reads at a glance.
  const padGeo = new THREE.PlaneGeometry(5.4, 5.4);
  const hazardMat = new THREE.MeshBasicMaterial({ map: hazardTexture(), transparent: true, opacity: 0.85 });
  const stencilGeo = new THREE.PlaneGeometry(4.6, 4.6);
  for (const site of Object.values(SITES)) {
    const pad = new THREE.Mesh(
      padGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.16 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.center.x, 0.03, site.center.z);
    group.add(pad);
    // Stencilled site letter on the pad.
    const stencil = new THREE.Mesh(
      stencilGeo,
      new THREE.MeshBasicMaterial({ map: stencilTexture(site.name), transparent: true, opacity: 0.9, depthWrite: false }),
    );
    stencil.rotation.x = -Math.PI / 2;
    stencil.position.set(site.center.x, 0.045, site.center.z);
    group.add(stencil);
    // Hazard striping framing the bomb zone.
    for (const [w, d, ox, oz] of [[5.9, 0.4, 0, -2.9], [5.9, 0.4, 0, 2.9], [0.4, 5.9, -2.9, 0], [0.4, 5.9, 2.9, 0]]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), hazardMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(site.center.x + ox, 0.04, site.center.z + oz);
      group.add(strip);
    }
  }

  // Harbour water and a barge beyond the south fence — outside the walls,
  // no colliders, purely for the dusk read in screenshots.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 12),
    new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.35, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.06, -24.5);
  scene.add(water);
  const barge = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 1.4, 4.5), mats.steel);
  hull.position.y = 0.5;
  barge.add(hull);
  const bargeBox = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), texMats.rustDark);
  bargeBox.position.set(-2.5, 1.9, 0);
  barge.add(bargeBox);
  const bargeBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), texMats.teal);
  bargeBox2.position.set(2.5, 1.9, 0);
  barge.add(bargeBox2);
  barge.position.set(8, 0, -24.5);
  scene.add(barge);

  // Hanging work lamps under the warehouse roof, lit bulbs with cables.
  const bulbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 2 });
  for (const x of [-3, 3]) {
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), mats.steel);
    cable.position.set(x, 3.3, 0);
    group.add(cable);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bulbMat);
    bulb.position.set(x, 3.0, 0);
    group.add(bulb);
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
  const hemi = new THREE.HemisphereLight(new THREE.Color('#5a6b80'), new THREE.Color('#1c2024'), 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.4);
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
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.amber), 20, 18, 1.6);
    lamp.position.set(site.center.x, 4.2, site.center.z);
    scene.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 2.5 }));
    bulb.position.set(site.center.x, 4.2, site.center.z);
    scene.add(bulb);
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
