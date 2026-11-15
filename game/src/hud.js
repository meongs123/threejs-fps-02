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
  let bannerTimer = 0;
  let hitTimer = 0;

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
    setPlantProgress(frac) {
      const bar = $('plant-progress');
      if (frac === null) { bar.hidden = true; return; }
      bar.hidden = false;
      $('plant-fill').style.width = `${Math.round(frac * 100)}%`;
      $('plant-label').textContent = frac >= 1 ? '' : 'PLANTING…';
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
