// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, killfeed,
// buy menu and the overlay panels. It never touches the simulation; game.js pushes
// numbers in and reads button clicks out.
const OVERLAY_COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Kestrel Yard at dusk. Five rounds decide it: plant the spike at Crane Yard or the Stacks, or wipe the Jackals out. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
  dead: {
    title: 'You are down',
    copy: 'Spectating your squad until the round ends.',
    action: 'Spectate',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const buyMenu = $('buy-menu');
  const killfeed = $('killfeed');
  const radioFeed = $('radio-feed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const vignette = $('damage-vignette');
  const flashVignette = $('flash-vignette');
  const crosshair = $('crosshair');
  const scope = $('scope');
  const scoreboard = $('scoreboard');
  const scoreRows = $('score-rows');
  const minimap = $('minimap');
  const mapCtx = minimap ? minimap.getContext('2d') : null;
  let bannerTimer = 0;
  let hitTimer = 0;

  // Minimap static base, drawn ONCE to an offscreen canvas at init: the
  // yard outline, lanes, warehouse block and site squares. Per frame we only
  // blit it and paint the moving dots — no gradients or objects per frame.
  const mapBase = document.createElement('canvas');
  mapBase.width = 176;
  mapBase.height = 132;
  const mapX = (x) => 4 + ((x + 24) / 48) * 168;
  const mapY = (z) => 4 + ((z + 18) / 36) * 124;
  (function drawMapBase() {
    const c = mapBase.getContext('2d');
    c.fillStyle = 'rgba(20,24,28,0.78)';
    c.fillRect(0, 0, 176, 132);
    c.strokeStyle = '#3a4148';
    c.lineWidth = 1;
    c.strokeRect(4, 4, 168, 124);
    // Warehouse block in the middle, flank lanes on the sides.
    c.fillStyle = '#2a3138';
    c.fillRect(mapX(-6.5), mapY(-2.5), mapX(6.5) - mapX(-6.5), mapY(2.5) - mapY(-2.5));
    c.strokeStyle = '#4b545e';
    c.beginPath(); c.moveTo(mapX(-8), mapY(7)); c.lineTo(mapX(-8), mapY(-7)); c.moveTo(mapX(8), mapY(7)); c.lineTo(mapX(8), mapY(-7)); c.stroke();
    // Site squares with letters.
    c.font = 'bold 11px ui-monospace, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [x, z, letter] of [[-17, -8, 'A'], [17, -8, 'B']]) {
      c.fillStyle = 'rgba(240,168,48,0.25)';
      c.fillRect(mapX(x) - 11, mapY(z) - 11, 22, 22);
      c.strokeStyle = '#f0a830';
      c.strokeRect(mapX(x) - 11, mapY(z) - 11, 22, 22);
      c.fillStyle = '#f0a830';
      c.fillText(letter, mapX(x), mapY(z) + 0.5);
    }
  })();

  return {
    setHealth(hp) {
      $('health-num').textContent = String(Math.max(0, Math.ceil(hp)));
      $('health-fill').style.width = `${Math.max(0, hp)}%`;
      $('health-fill').classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, weaponName, frags, smokes = 0, flashes = 0) {
      $('ammo-mag').textContent = String(mag);
      $('ammo-reserve').textContent = `/ ${reserve}`;
      $('weapon-name').textContent = weaponName;
      $('grenades').textContent = `◉ ${frags} · Q ${smokes} · E ${flashes}`;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      $('money').textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      $('timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      $('timer').classList.toggle('urgent', seconds <= 10 && phase === 'live');
      $('phase-label').textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND' : '';
    },
    setScore(vanguard, jackal, round) {
      $('score-vanguard').textContent = String(vanguard);
      $('score-jackal').textContent = String(jackal);
      $('round-label').textContent = `ROUND ${round}`;
    },
    setAlive(vanguard, jackal) {
      const clamp = (n) => Math.max(0, Math.min(5, n));
      $('alive-vanguard').textContent = '●'.repeat(clamp(vanguard)) + '○'.repeat(5 - clamp(vanguard));
      $('alive-jackal').textContent = '●'.repeat(clamp(jackal)) + '○'.repeat(5 - clamp(jackal));
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed) {
      const marker = $('hitmarker');
      marker.classList.add('on');
      marker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => marker.classList.remove('on', 'kill'), 110);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 220);
    },
    setFlash(level) {
      flashVignette.style.opacity = String(Math.max(0, Math.min(1, level)));
    },
    setArmor(light, heavy) {
      const el = $('armor');
      if (!el) return;
      el.textContent = heavy ? 'HEAVY VEST + HELMET' : light ? 'LIGHT VEST' : '';
      el.hidden = !light && !heavy;
    },
    setScope(on) {
      if (scope) scope.hidden = !on;
      crosshair.style.visibility = on ? 'hidden' : 'visible';
    },
    // Tactical radar: blit the static base, then paint dots. The player is
    // the white wedge; teammates amber, seen enemies red, the spike an amber
    // diamond, gunfire pings fading rings. Nothing allocated here.
    setMinimap(data) {
      if (!mapCtx || !data) return;
      mapCtx.drawImage(mapBase, 0, 0);
      for (const p of data.pings) {
        const r = 3 + p.age * 4;
        mapCtx.strokeStyle = `rgba(240,168,48,${Math.max(0, 0.9 - p.age * 0.25)})`;
        mapCtx.beginPath();
        mapCtx.arc(mapX(p.x), mapY(p.z), r, 0, Math.PI * 2);
        mapCtx.stroke();
      }
      if (data.spike.state === 'dropped' || data.spike.state === 'planted') {
        const x = mapX(data.spike.x);
        const y = mapY(data.spike.z);
        mapCtx.fillStyle = data.spike.state === 'planted' ? '#d64545' : '#f0a830';
        mapCtx.beginPath();
        mapCtx.moveTo(x, y - 5); mapCtx.lineTo(x + 4, y); mapCtx.lineTo(x, y + 5); mapCtx.lineTo(x - 4, y);
        mapCtx.closePath(); mapCtx.fill();
      }
      for (const b of data.bots) {
        if (!b.alive) continue;
        if (b.team !== data.playerTeam && !b.seen) continue;
        mapCtx.fillStyle = b.team === data.playerTeam ? '#f0a830' : '#d64545';
        mapCtx.beginPath();
        mapCtx.arc(mapX(b.x), mapY(b.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Player wedge, rotated to the facing yaw.
      const px = mapX(data.px);
      const py = mapY(data.pz);
      mapCtx.fillStyle = '#ece7db';
      mapCtx.beginPath();
      mapCtx.moveTo(px + Math.sin(data.yaw) * -6, py + Math.cos(data.yaw) * -6);
      mapCtx.lineTo(px + Math.cos(data.yaw) * 4, py - Math.sin(data.yaw) * 4);
      mapCtx.lineTo(px - Math.cos(data.yaw) * 4, py + Math.sin(data.yaw) * 4);
      mapCtx.closePath(); mapCtx.fill();
    },
    showScoreboard(show, rows) {
      if (!scoreboard) return;
      scoreboard.hidden = !show;
      if (!show || !rows) return;
      const vanguard = rows.filter((r) => r.team === 'vanguard');
      const jackal = rows.filter((r) => r.team === 'jackal');
      const line = (r) => `<div class="score-row ${r.team}"><span class="score-name">${r.name}</span><span>${r.k}</span><span>${r.d}</span><span>${r.a}</span><span>${r.money ? '$' + r.money : '—'}</span></div>`;
      scoreRows.innerHTML = '<div class="score-row head"><span>PLAYER</span><span>K</span><span>D</span><span>A</span><span>$</span></div>'
        + vanguard.map(line).join('') + jackal.map(line).join('');
    },
    killfeed(html) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = html;
      killfeed.prepend(entry);
      while (killfeed.children.length > 4) killfeed.lastChild.remove();
      setTimeout(() => entry.remove(), 6000);
    },
    radio(html) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = html;
      radioFeed.prepend(entry);
      while (radioFeed.children.length > 3) radioFeed.lastChild.remove();
      setTimeout(() => entry.remove(), 8000);
    },
    banner(text, sub = '') {
      bannerTitle.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), 2600);
    },
    setSpike(status) {
      const el = $('spike-status');
      el.textContent = status;
      el.classList.toggle('planted', status.includes('PLANTED'));
      el.hidden = !status;
    },
    setPlantProgress(frac, label = 'PLANTING…') {
      const bar = $('plant-progress');
      if (frac === null) { bar.hidden = true; return; }
      bar.hidden = false;
      $('plant-fill').style.width = `${Math.round(frac * 100)}%`;
      $('plant-label').textContent = frac >= 1 ? '' : label;
    },
    showBuy(show, money, owned, prices) {
      buyMenu.hidden = !show;
      if (!show) return;
      $('buy-money').textContent = `$${money}`;
      for (const item of buyMenu.querySelectorAll('[data-buy]')) {
        const id = item.dataset.buy;
        const price = prices[id];
        const have = owned[id];
        item.classList.toggle('owned', Boolean(have));
        item.classList.toggle('cant', !have && money < price);
        item.querySelector('.buy-price').textContent = have ? 'OWNED' : `$${price}`;
      }
    },
    showOverlay(mode, detail = '') {
      const text = OVERLAY_COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'round' || mode === 'match' ? detail : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const item = event.target.closest('[data-buy]');
        if (item) handler(item.dataset.buy);
      });
    },
    setSpectate(on) {
      $('spectate-note').hidden = !on;
    },
  };
}
