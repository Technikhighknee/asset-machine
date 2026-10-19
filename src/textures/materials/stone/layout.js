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
  const pad = () => gap * random.range(0.58, 1.35);
  const left = pad();
  const right = pad();
  const top = pad();
  const bottom = pad();
  const chamfer = random.range(...tradition.chamfer);
  const cornerX = Math.min((width - left - right) * chamfer, height * 0.30);
  const cornerY = Math.min((height - top - bottom) * chamfer, width * 0.19);
  const edgeX = Math.min(width * 0.055, height * 0.18);
  const edgeY = Math.min(height * 0.09, width * 0.055);
  const x = (v) => clamp(v / width, 0.008, 0.992);
  const y = (v) => clamp(v / height, 0.008, 0.992);
  const jitter = (n) => random.range(-n, n);
  const notch = () => random.float() < 0.17 ? random.range(0.2, 0.95) : 0;

  // Bedded resting surfaces, but individually fractured sides and corners.
  return [
    [x(left + cornerX), y(top + jitter(edgeY * 0.8))],
    [x(left + width * 0.22), y(top + jitter(edgeY))],
    [x(left + width * 0.49), y(top + edgeY * notch() + jitter(edgeY * 0.6))],
    [x(width - right - width * 0.23), y(top + jitter(edgeY))],
    [x(width - right - cornerX), y(top + jitter(edgeY * 0.8))],
    [x(width - right + jitter(edgeX)), y(top + cornerY)],
    [x(width - right + jitter(edgeX)), y(height * 0.29)],
    [x(width - right - edgeX * notch() + jitter(edgeX * 0.6)), y(height * 0.61)],
    [x(width - right + jitter(edgeX)), y(height - bottom - cornerY)],
    [x(width - right - cornerX), y(height - bottom + jitter(edgeY * 0.8))],
    [x(width * 0.72), y(height - bottom + jitter(edgeY * 0.45))],
    [x(width * 0.46), y(height - bottom - edgeY * notch() + jitter(edgeY))],
    [x(width * 0.20), y(height - bottom + jitter(edgeY * 0.6))],
    [x(left + cornerX), y(height - bottom + jitter(edgeY * 0.8))],
    [x(left + jitter(edgeX)), y(height - bottom - cornerY)],
    [x(left - jitter(edgeX * 0.7)), y(height * 0.62)],
    [x(left + edgeX * notch() + jitter(edgeX * 0.6)), y(height * 0.34)],
    [x(left + jitter(edgeX)), y(top + cornerY)],
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

export function buildWall(random, seed) {
  const tradition = random.pick(traditions);
  const bins = 160;
  const mortar = random.range(...tradition.mortar);
  const skyline = new Float64Array(bins);
  const previousIds = new Int32Array(bins);
  const ceiling = new Float64Array(bins);
  const stones = [];
  const offsetX = random.float();
  const offsetY = random.float();
  const minWidth = 0.063;
  const maxWidth = tradition.width[1];
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
    // Select a plausible stock of masonry stones, not arbitrary thin slices.
    let widths = [];

    for (let attempt = 0; attempt < 80; attempt++) {
      const weights = Array.from({ length: count }, () => {
        const base = random.range(0.8, 1.35);
        const category = random.float();

        return base * (category < 0.16 ? 1.45 : category < 0.30 ? 0.78 : 1);
      });
      const total = weights.reduce((a, b) => a + b);
      widths = weights.map((value) => value / total);

      if (widths.every((value) => value >= minWidth * 1.04 &&
        value <= maxWidth * 0.97)) return widths;
    }

    return Array.from({ length: count }, () => 1 / count);
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
    const count = random.int(7, 10);
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
    const target = average + random.range(0.071, 0.099);
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
      const desiredHeight = target + random.range(-0.032, 0.034) - y0;
      const lower = Math.max(minHeight, length / (tradition.aspect[1] + 0.15));
      const upper = Math.min(upperLimit - y0, tradition.height[1] * 1.15,
        length / 0.78);
      const height = clamp(desiredHeight, lower, upper);

      if (lower <= upper && length >= minWidth * 0.95 &&
        length <= maxWidth * 1.07) {
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

  // Close only substantial supported pockets with medium stones. The
  // remaining irregular gaps belong to mortar, not tiny filler splinters.
  const grid = 128;
  const occupied = new Uint8Array(grid * grid);

  function mark(stone) {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [0, 1]) {
        if (dy && stone.y0 >= 0) continue;
        const left = Math.max(0, Math.ceil((stone.x0 + dx) * grid));
        const right = Math.min(grid, Math.floor((stone.x0 + dx + stone.width) * grid));
        const top = Math.max(0, Math.ceil((stone.y0 + dy) * grid));
        const bottom = Math.min(grid, Math.floor((stone.y0 + dy + stone.height) * grid));

        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) occupied[y * grid + x] = 1;
        }
      }
    }
  }

  for (const stone of stones) mark(stone);

  function empty(x0, y0, width, height) {
    for (let y = y0; y < y0 + height; y++) {
      for (let x = x0; x < x0 + width; x++) {
        if (occupied[y * grid + x]) return false;
      }
    }

    return true;
  }

  for (let iteration = 0; iteration < 18; iteration++) {
    const choices = [];

    for (let attempt = 0; attempt < 1200; attempt++) {
      const width = random.int(11, 23);
      const height = random.int(8, 17);
      const ratio = width / height;

      if (ratio < 0.8 || ratio > tradition.aspect[1] + 0.2) continue;

      const x = random.int(0, grid - width);
      const y = random.int(8, grid - height - 6);

      if (!empty(x, y, width, height)) continue;

      const x0 = x / grid;
      const y0 = y / grid;
      const w = width / grid;
      const h = height / grid;
      const collides = stones.some((other) => [-1, 0, 1].some((dx) =>
        [0, 1].some((dy) => {
          const bx = other.x0 + dx;
          const by = other.y0 + dy;

          return Math.min(x0 + w, bx + other.width) - Math.max(x0, bx) > 1e-7 &&
            Math.min(y0 + h, by + other.height) - Math.max(y0, by) > 1e-7;
        })));

      if (collides) continue;

      let support = 0;

      for (let b = x; b < x + width; b++) {
        support += occupied[(y - 2) * grid + b];
      }

      if (support < width * 0.32) continue;

      choices.push({
        x,
        y,
        width,
        height,
        quality: width * height + random.range(0, 30),
      });
    }

    if (!choices.length) break;

    choices.sort((a, b) => b.quality - a.quality);
    const chosen = choices[0];
    const stone = place(chosen.x / grid, chosen.width / grid,
      chosen.y / grid, chosen.height / grid);

    mark(stone);
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
