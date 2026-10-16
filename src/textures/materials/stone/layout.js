import { field } from '../../random.js';

const wrap = (value) => ((value % 1) + 1) % 1;
const clamp = (value, a, b) => Math.max(a, Math.min(b, value));

// A mason picks stones from a quarry, fits each one onto existing supports,
// then lets mortar bridge the small gaps. The lifts are not a fixed grid.
const traditions = [
  { name: 'bedded-limestone', width: [0.075, 0.19], height: [0.052, 0.102], aspect: [1.0, 2.6], mortar: [0.003, 0.006], chamfer: [0.035, 0.13], slope: 0.25 },
  { name: 'rough-rubble', width: [0.074, 0.20], height: [0.060, 0.13], aspect: [0.85, 2.5], mortar: [0.005, 0.010], chamfer: [0.07, 0.22], slope: 0.45 },
  { name: 'stacked-slate', width: [0.09, 0.24], height: [0.048, 0.092], aspect: [1.3, 2.85], mortar: [0.002, 0.005], chamfer: [0.015, 0.07], slope: 0.18 },
  { name: 'weathered-rubble', width: [0.075, 0.19], height: [0.060, 0.135], aspect: [0.85, 2.5], mortar: [0.005, 0.011], chamfer: [0.085, 0.25], slope: 0.62 },
];

function outline(random, width, height, gap, tradition) {
  const pad = () => gap * random.range(0.75, 1.5);
  const left = pad();
  const right = pad();
  const top = pad();
  const bottom = pad();
  const chamfer = random.range(...tradition.chamfer);
  const chipX = Math.min((width - left - right) * chamfer, height * 0.27);
  const chipY = Math.min((height - top - bottom) * chamfer, width * 0.2);
  const jag = Math.min(gap * (1.6 + tradition.slope), height * 0.1);
  const shake = () => random.range(-jag, jag);
  const x = (value) => clamp(value / width, 0.009, 0.991);
  const y = (value) => clamp(value / height, 0.009, 0.991);

  return [
    [x(left + chipX), y(top + shake())],
    [x(left + width * 0.31 + shake()), y(top + shake())],
    [x(left + width * 0.66 + shake()), y(top + shake())],
    [x(width - right - chipX), y(top + shake())],
    [x(width - right + shake()), y(top + chipY)],
    [x(width - right + shake()), y(height * 0.53 + shake())],
    [x(width - right + shake()), y(height - bottom - chipY)],
    [x(width - right - chipX), y(height - bottom + shake())],
    [x(width * 0.68 + shake()), y(height - bottom + shake())],
    [x(width * 0.32 + shake()), y(height - bottom + shake())],
    [x(left + chipX), y(height - bottom + shake())],
    [x(left + shake()), y(height - bottom - chipY)],
    [x(left + shake()), y(height * 0.48 + shake())],
    [x(left + shake()), y(top + chipY)],
  ];
}

function polygonDistance(stone, u, v) {
  const px = u * stone.width;
  const py = v * stone.height;
  const points = stone.polygon;
  let distanceSq = Infinity;
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const ax = points[j][0] * stone.width;
    const ay = points[j][1] * stone.height;
    const bx = points[i][0] * stone.width;
    const by = points[i][1] * stone.height;
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const ex = px - ax - dx * t;
    const ey = py - ay - dy * t;

    distanceSq = Math.min(distanceSq, ex * ex + ey * ey);

    if ((ay > py) !== (by > py) && px < ax + dx * (py - ay) / dy) {
      inside = !inside;
    }
  }

  return Math.sqrt(distanceSq) * (inside ? 1 : -1);
}

export function buildWall(random, grammar, seed) {
  const tradition = random.pick(traditions);
  const bins = 160;
  const mortar = random.range(...tradition.mortar) * grammar.edgeWidth;
  const skyline = new Float64Array(bins);
  const previousIds = new Int32Array(bins);
  const ceiling = new Float64Array(bins);
  const stones = [];
  const offsetX = random.float();
  const offsetY = random.float();
  const minWidth = 0.063 / Math.sqrt(grammar.density);
  const maxWidth = tradition.width[1] / Math.sqrt(grammar.density);
  const minHeight = tradition.height[0] * 0.78;

  function place(x0, width, y0, height) {
    const stone = {
      id: stones.length,
      x0,
      y0,
      width,
      height,
      polygon: outline(random, width, height, mortar, tradition),
      face: tradition.name,
      orientation: random.range(-0.14, 0.14),
      proud: random.range(-0.027, 0.043),
      slab: random.range(0.65, 1.3),
      wear: random.range(0.2, 1),
    };
    stones.push(stone);
    return stone;
  }

  function sections(count) {
    const weights = Array.from({ length: count }, () => random.range(0.7, 1.3));
    const total = weights.reduce((a, b) => a + b);
    const widths = weights.map((v) => v / total);
    return widths;
  }

  // The first, partly buried lift is mirrored above the wall. Its stones
  // physically cross the UV seam instead of getting sliced at the boundary.
  const foundation = sections(random.int(8, 10));
  let x = 0;

  for (const width of foundation) {
    const y0 = -random.range(0.018, 0.033);
    const height = random.range(0.088, 0.115);
    const stone = place(x, width, y0, height);
    const start = Math.round(x * bins);
    const end = Math.round((x + width) * bins);

    for (let b = start; b < end; b++) {
      skyline[b] = y0 + height;
      previousIds[b] = stone.id;
      ceiling[b] = y0 + 1 - mortar * 1.15;
    }
    x += width;
  }

  // Build consecutive lifts. Quarry stones are selected to meet a nearby
  // support height; mortar levels differences rather than leaving voids.
  for (let course = 0; course < 18; course++) {
    const average = skyline.reduce((a, b) => a + b, 0) / bins;
    if (average > 0.865) break;
    const count = random.int(7, 11);
    const widths = sections(count);
    const edgeCandidates = [];

    for (let attempt = 0; attempt < 12; attempt++) {
      const offset = random.float();
      let cursor = offset;
      let aligned = 0;

      for (const width of widths) {
        const boundary = Math.round(wrap(cursor) * bins) % bins;
        if (previousIds[boundary] !== previousIds[(boundary + bins - 1) % bins]) aligned++;
        cursor += width;
      }
      edgeCandidates.push({ offset, aligned: aligned + random.float() * 0.5 });
    }

    edgeCandidates.sort((a, b) => a.aligned - b.aligned);
    let position = edgeCandidates[0].offset;
    const target = average + random.range(0.065, 0.09);
    const placements = [];

    for (const w of widths) {
      const start = Math.round(position * bins);
      const end = Math.round((position + w) * bins);
      const length = (end - start) / bins;
      if (length <= 0) continue;
      let maxSupport = -Infinity;
      let upperLimit = Infinity;

      for (let b = start; b < end; b++) {
        const index = ((b % bins) + bins) % bins;
        maxSupport = Math.max(maxSupport, skyline[index]);
        upperLimit = Math.min(upperLimit, ceiling[index]);
      }

      const y0 = maxSupport + mortar * random.range(0.65, 1.25);
      const desiredHeight = target + random.range(-0.027, 0.027) - y0;
      const height = Math.min(upperLimit - y0,
        clamp(desiredHeight, minHeight, tradition.height[1] * 1.15));

      if (height >= minHeight && length >= minWidth * 0.8 &&
        length <= maxWidth * 1.2 && length / height >= 0.72 &&
        length / height <= tradition.aspect[1] + 0.35) {
        placements.push({ start, end, y0, height });
      }
      position += w;
    }

    if (!placements.length) break;

    for (const p of placements) {
      const stone = place(p.start / bins, (p.end - p.start) / bins, p.y0, p.height);

      for (let b = p.start; b < p.end; b++) {
        const index = ((b % bins) + bins) % bins;
        skyline[index] = p.y0 + p.height;
        previousIds[index] = stone.id;
      }
    }
  }

  // Spatially indexed periodic copies support distance-to-stone and mortar
  // queries without allowing the sampling phase to invent new overlaps.
  const divisions = 26;
  const cells = Array.from({ length: divisions * divisions }, () => []);

  for (const stone of stones) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        if (dy === 1 && stone.y0 >= 0) continue;
        const x0 = stone.x0 + dx;
        const y0 = stone.y0 + dy;
        const padding = 0.035;
        const left = Math.max(0, Math.floor((x0 - padding) * divisions));
        const right = Math.min(divisions - 1, Math.floor((x0 + stone.width + padding) * divisions));
        const top = Math.max(0, Math.floor((y0 - padding) * divisions));
        const bottom = Math.min(divisions - 1, Math.floor((y0 + stone.height + padding) * divisions));

        for (let iy = top; iy <= bottom; iy++) {
          for (let ix = left; ix <= right; ix++) cells[iy * divisions + ix].push({ stone, x0, y0 });
        }
      }
    }
  }

  return {
    type: tradition.name,
    count: stones.length,
    sample(u, v) {
      const x = wrap(u + offsetX + field(u, v, 9, 7, seed ^ 0x719d24b3) * 0.003);
      const y = wrap(v + offsetY + field(u, v, 7, 9, seed ^ 0x6124eab9) * 0.003);
      const cx = Math.min(divisions - 1, Math.floor(x * divisions));
      const cy = Math.min(divisions - 1, Math.floor(y * divisions));
      let nearest = null;
      let signed = -Infinity;

      for (const { stone, x0, y0 } of cells[cy * divisions + cx]) {
        const localX = (x - x0) / stone.width;
        const localY = (y - y0) / stone.height;
        const distance = polygonDistance(stone, localX, localY);

        if (distance > signed) {
          signed = distance;
          nearest = { stone, x: localX, y: localY, distance };
        }
      }

      return nearest || { stone: stones[0], x: 0, y: 0, distance: -0.15 };
    },
  };
}
