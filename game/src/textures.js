// Procedural textures, all drawn on canvas at boot — no image files, no
// network. Every texture is seeded, so a staged screenshot replays the
// same yard. Ground asphalt, corrugated containers with numbers, hazard
// striping, A/B stencils, dusk sky and harbour water.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, rnd, n, alpha) {
  for (let i = 0; i < n; i += 1) {
    const v = Math.floor(rnd() * 60);
    ctx.fillStyle = `rgba(${v + 30},${v + 34},${v + 38},${alpha})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function groundTexture() {
  const [c, ctx] = canvas(512, 512);
  const rnd = mulberry32(101);
  ctx.fillStyle = '#343a41';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, rnd, 2600, 0.5);
  // Expansion joints and tyre wear.
  ctx.strokeStyle = 'rgba(20,22,26,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(12,13,15,0.35)';
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    let x = rnd() * 512; let y = rnd() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j += 1) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // Faded centre line dashes.
  ctx.fillStyle = 'rgba(240,168,48,0.28)';
  for (let y = 0; y < 512; y += 64) ctx.fillRect(252, y, 8, 34);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 6);
  return t;
}

export function containerTexture(base, label, accent) {
  const [c, ctx] = canvas(256, 256);
  const rnd = mulberry32(202 + label.charCodeAt(0) * 7 + label.length);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // Corrugation: vertical light/dark ribs.
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 8, 0, 4, 256);
  }
  speckle(ctx, 256, 256, rnd, 500, 0.35);
  // Rust streaks running down from the top edge.
  ctx.fillStyle = 'rgba(60,30,12,0.4)';
  for (let i = 0; i < 8; i += 1) {
    const x = rnd() * 256;
    ctx.fillRect(x, 0, 3 + rnd() * 5, 40 + rnd() * 120);
  }
  // Stencilled ID and a corner marking.
  ctx.fillStyle = accent;
  ctx.font = 'bold 30px ui-monospace, monospace';
  ctx.fillText(label, 18, 52);
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.fillText('KES', 18, 82);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 236, 236);
  return tex(c);
}

export function hazardTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#e8b62a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#16181c';
  for (let i = -2; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 128); ctx.lineTo(i * 32 + 32, 0);
    ctx.lineTo(i * 32 + 48, 0); ctx.lineTo(i * 32 + 16, 128);
    ctx.closePath(); ctx.fill();
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function stencilTexture(letter) {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(240,168,48,0.85)';
  ctx.font = 'bold 200px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 138);
  // Worn paint: knock out speckles.
  ctx.globalCompositeOperation = 'destination-out';
  const rnd = mulberry32(303 + letter.charCodeAt(0));
  for (let i = 0; i < 260; i += 1) {
    ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 4);
  }
  return tex(c);
}

export function skyTexture() {
  const [c, ctx] = canvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#141b26');
  g.addColorStop(0.45, '#2c3646');
  g.addColorStop(0.72, '#7a5238');
  g.addColorStop(0.88, '#e08a3c');
  g.addColorStop(1, '#3a2a22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  // Low sun disc and a few early stars.
  ctx.fillStyle = 'rgba(255,190,110,0.9)';
  ctx.beginPath(); ctx.arc(700, 392, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,220,170,0.35)';
  ctx.beginPath(); ctx.arc(700, 392, 44, 0, Math.PI * 2); ctx.fill();
  const rnd = mulberry32(404);
  ctx.fillStyle = 'rgba(236,231,219,0.8)';
  for (let i = 0; i < 40; i += 1) ctx.fillRect(rnd() * 1024, rnd() * 180, 1.5, 1.5);
  return tex(c);
}

export function waterTexture() {
  const [c, ctx] = canvas(256, 256);
  const rnd = mulberry32(505);
  ctx.fillStyle = '#16222e';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i += 1) {
    ctx.strokeStyle = `rgba(240,168,48,${0.05 + rnd() * 0.16})`;
    ctx.lineWidth = 1 + rnd() * 2;
    const y = rnd() * 256; const x = rnd() * 256; const len = 20 + rnd() * 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rnd() - 0.5) * 4); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,150,175,0.25)';
  for (let i = 0; i < 24; i += 1) {
    const y = rnd() * 256;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + (rnd() - 0.5) * 6); ctx.stroke();
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  return t;
}
