// Seeded randomness. The game takes its seed from ?seed= (default: the clock), so a
// staged screenshot run replays the same bot decisions and the same spread.
export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

export function gaussian(random) {
  // Two uniform draws make a rough bell curve, good enough for spread and aim error.
  return (random() + random() + random() - 1.5) / 1.5;
}
