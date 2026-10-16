export function random(seed) {
  let state = seed >>> 0;

  function float() {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  return {
    float,
    range: (min, max) => min + float() * (max - min),
    int: (min, max) => min + Math.floor(float() * (max - min + 1)),
    pick: (items) => items[Math.floor(float() * items.length)],
  };
}

export function deriveSeed(seed, label) {
  let hash = (2166136261 ^ seed) >>> 0;

  for (const character of label) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }

  return hash;
}

export function hash(x, y, seed) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);

  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function field(u, v, columns, rows, seed) {
  const x = u * columns;
  const y = v * rows;
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  const tx = (x - ix) ** 2 * (3 - 2 * (x - ix));
  const ty = (y - iy) ** 2 * (3 - 2 * (y - iy));
  const wrap = (value, size) => ((value % size) + size) % size;
  const value = (dx, dy) => hash(wrap(ix + dx, columns), wrap(iy + dy, rows), seed);

  const top = value(0, 0) * (1 - tx) + value(1, 0) * tx;
  const bottom = value(0, 1) * (1 - tx) + value(1, 1) * tx;

  return (top * (1 - ty) + bottom * ty) * 2 - 1;
}
