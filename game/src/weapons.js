// The armoury. Four guns and one grenade, each with its own numbers, view model and
// sound. Spread grows with movement and with sustained fire, so stopping to aim
// pays; headshots deal more than body shots. Damage numbers live here; main.js
// owns the ray and applies them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, kind: 'pistol',
    mag: 12, reserve: 36, gap: 0.16, reload: 1.3, damage: 22, headDamage: 46,
    spreadStill: 0.003, spreadMove: 0.02, recoil: 0.008, auto: false, zoom: 0,
  },
  rifle: {
    id: 'rifle', name: 'VK-9 Carbine', short: 'VK-9', price: 2700, kind: 'rifle',
    mag: 30, reserve: 90, gap: 0.105, reload: 1.9, damage: 26, headDamage: 78,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.011, auto: true, zoom: 0,
  },
  shotgun: {
    id: 'shotgun', name: 'Scatter-12', short: 'S-12', price: 1050, kind: 'shotgun',
    mag: 6, reserve: 24, gap: 0.85, reload: 2.6, damage: 9, headDamage: 16,
    spreadStill: 0.03, spreadMove: 0.05, recoil: 0.03, auto: false, zoom: 0, pellets: 8,
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', short: 'LGB', price: 4750, kind: 'dmr',
    mag: 10, reserve: 20, gap: 0.9, reload: 2.8, damage: 62, headDamage: 180,
    spreadStill: 0.0009, spreadMove: 0.03, recoil: 0.024, auto: false, zoom: 0.55,
  },
};

const VIEW_COLORS = { grip: '#22262b', body: '#5a646f', dark: '#1e2228', sight: '#f0a830' };

function buildViewModel(def) {
  const group = new THREE.Group();
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(VIEW_COLORS.grip), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(VIEW_COLORS.body), roughness: 0.45, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(VIEW_COLORS.dark), roughness: 0.6, metalness: 0.3 });
  const sight = new THREE.MeshStandardMaterial({ color: new THREE.Color(VIEW_COLORS.sight), roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(0x201404) });
  function part(mat, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  if (def.kind === 'pistol') {
    part(body, 0.06, 0.09, 0.24, 0, 0, -0.1);
    part(grip, 0.055, 0.14, 0.07, 0, -0.09, 0.04);
    part(dark, 0.02, 0.03, 0.05, 0, 0.03, -0.2);
  } else if (def.kind === 'shotgun') {
    part(body, 0.09, 0.1, 0.5, 0, 0, -0.15);
    part(dark, 0.05, 0.05, 0.44, 0, 0.03, -0.32);
    part(grip, 0.08, 0.09, 0.2, 0, -0.02, 0.18);
    part(body, 0.07, 0.06, 0.12, 0, -0.06, -0.05);
  } else if (def.kind === 'dmr') {
    part(body, 0.08, 0.09, 0.55, 0, 0, -0.18);
    part(dark, 0.05, 0.05, 0.5, 0, 0.02, -0.35);
    part(dark, 0.04, 0.05, 0.16, 0, 0.06, -0.15);
    part(grip, 0.075, 0.09, 0.2, 0, -0.02, 0.2);
  } else {
    part(body, 0.09, 0.1, 0.44, 0, 0, -0.12);
    part(dark, 0.045, 0.045, 0.4, 0, 0.025, -0.42);
    part(grip, 0.075, 0.08, 0.22, 0, -0.02, 0.2);
    part(body, 0.03, 0.05, 0.1, 0, 0.07, -0.2);
  }
  part(sight, 0.02, 0.035, 0.05, 0, 0.06, -0.3);
  group.position.set(0.22, -0.23, -0.52);
  group.scale.setScalar(0.8);
  return group;
}

export function createWeaponSet(camera, audio) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.22, -0.2, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.22, -0.18, -0.7);
  camera.add(flashLight);

  const owned = { pistol: { mag: 12, reserve: 36 }, rifle: null, shotgun: null, dmr: null };
  let current = 'pistol';
  let cooldown = 0;
  let reloadLeft = 0;
  let flashLeft = 0;
  let kick = 0;
  let bloom = 0;
  models.pistol.visible = true;

  function def() { return WEAPONS[current]; }
  function ammo() { return owned[current]; }

  function equip(id) {
    if (!owned[id] || id === current) return false;
    models[current].visible = false;
    current = id;
    models[current].visible = true;
    reloadLeft = 0;
    cooldown = 0.1;
    bloom = 0;
    return true;
  }

  function buy(id) {
    if (owned[id]) return false;
    owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    return true;
  }

  return {
    get current() { return current; },
    get def() { return def(); },
    get ammo() { return ammo(); },
    get reloading() { return reloadLeft > 0; },
    get owned() { return owned; },
    step(dt) {
      cooldown = Math.max(0, cooldown - dt);
      flashLeft = Math.max(0, flashLeft - dt);
      bloom = Math.max(0, bloom - dt * 0.9);
      kick += (0 - kick) * Math.min(1, dt * 14);
      const model = models[current];
      model.position.z = -0.52 + kick;
      model.rotation.x = kick * 2.2;
      flash.visible = flashLeft > 0;
      flash.rotation.z = flashLeft * 30;
      flashLight.intensity = flashLeft > 0 ? 20 : 0;
      if (reloadLeft > 0) {
        reloadLeft = Math.max(0, reloadLeft - dt);
        model.rotation.x = -0.5 * Math.min(1, (def().reload - reloadLeft) * 2);
        if (reloadLeft === 0) {
          const need = def().mag - ammo().mag;
          const take = Math.min(need, ammo().reserve);
          ammo().mag += take;
          ammo().reserve -= take;
        }
      }
    },
    ready() {
      return ammo().mag > 0 && cooldown === 0 && reloadLeft === 0;
    },
    pullTrigger() {
      cooldown = def().gap;
      flashLeft = 0.06;
      kick = 0.05 + def().recoil;
      bloom = Math.min(1, bloom + (def().kind === 'shotgun' ? 0.5 : 0.14));
      audio.shot(def().kind);
    },
    dryFire() {
      cooldown = 0.25;
      audio.dryClick();
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    reload() {
      if (reloadLeft > 0 || ammo().mag === def().mag || ammo().reserve === 0) return;
      reloadLeft = def().reload;
      audio.reload();
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.4);
      return def().spreadStill + moving * def().spreadMove + bloom * 0.012;
    },
    refill() {
      for (const id of Object.keys(owned)) {
        if (owned[id]) { owned[id].mag = WEAPONS[id].mag; owned[id].reserve = WEAPONS[id].reserve; }
      }
      cooldown = 0;
      reloadLeft = 0;
    },
    equip,
    buy,
  };
}
