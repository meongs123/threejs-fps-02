// Every sound is synthesised with WebAudio: no audio files, no network. A short
// noise buffer through a filter is a gunshot; a low sine drop is an explosion; short
// square blips are UI, hits and the spike's beeps.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tone(freq, endFreq, duration, gainValue, type = 'sine') {
    if (!ensure()) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }

  function blip(freq, duration = 0.07, gainValue = 0.18, type = 'square') {
    tone(freq, freq, duration, gainValue, type);
  }

  return {
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    shot(kind) {
      if (kind === 'shotgun') { noise(0.28, 900, 0.5); tone(140, 45, 0.22, 0.4); }
      else if (kind === 'dmr') { noise(0.32, 1600, 0.55); tone(180, 50, 0.3, 0.45); }
      else if (kind === 'pistol') { noise(0.14, 2400, 0.35); tone(220, 90, 0.1, 0.25); }
      else { noise(0.16, 1800, 0.42); tone(160, 60, 0.14, 0.32); }
    },
    distantShot() {
      noise(0.2, 500, 0.12);
      tone(110, 50, 0.18, 0.1);
    },
    dryClick() { blip(1400, 0.03, 0.12); },
    reload() { blip(900, 0.04, 0.12); setTimeout(() => blip(600, 0.04, 0.12), 180); setTimeout(() => blip(1100, 0.05, 0.14), 520); },
    hit() { blip(1900, 0.05, 0.2); },
    kill() { blip(1320, 0.06, 0.2); setTimeout(() => blip(1760, 0.09, 0.2), 70); },
    hurt() { tone(220, 110, 0.18, 0.3, 'sawtooth'); },
    plantBeep() { blip(880, 0.12, 0.22); },
    spikeBeep() { blip(1200, 0.08, 0.16); },
    explosion() {
      noise(0.9, 320, 0.8);
      tone(120, 28, 0.9, 0.7);
      setTimeout(() => noise(0.5, 180, 0.3), 120);
    },
    bounce() { blip(300, 0.05, 0.1, 'triangle'); },
    buy() { blip(660, 0.05, 0.15); setTimeout(() => blip(990, 0.07, 0.15), 60); },
    deny() { blip(220, 0.12, 0.18, 'sawtooth'); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.14, 0.18), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.16, 0.16), i * 120)); },
    step() { noise(0.05, 300, 0.05); },
  };
}
