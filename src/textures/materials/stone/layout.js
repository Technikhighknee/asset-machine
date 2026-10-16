import { field } from '../../random.js';

const wrap = (value) => ((value % 1) + 1) % 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Stone dimensions, mortar thickness and laying method all belong to the
// building tradition. The seed chooses a tradition before choosing any stones.
const traditions = [
  { name: 'bedded-limestone', rows: [11, 15], cols: [7, 12], widthSpread: 0.8, heightSpread: 0.24, mortar: [0.003, 0.006], split: 0.16, chamfer: [0.035, 0.13], slope: 0.25 },
  { name: 'rough-rubble', rows: [8, 12], cols: [5, 10], widthSpread: 1.05, heightSpread: 0.37, mortar: [0.005, 0.009], split: 0.09, chamfer: [0.07, 0.22], slope: 0.45 },
  { name: 'stacked-slate', rows: [13, 19], cols: [5, 11], widthSpread: 1, heightSpread: 0.39, mortar: [0.002, 0.005], split: 0.22, chamfer: [0.015, 0.07], slope: 0.18 },
  { name: 'weathered-rubble', rows: [8, 12], cols: [5, 9], widthSpread: 0.88, heightSpread: 0.37, mortar: [0.0055, 0.009], split: 0.09, chamfer: [0.085, 0.25], slope: 0.62 },
];

function randomBoundaries(random, count, spread) {
  const weights = Array.from({ length: count }, () => {
    const w = random.range(1 - spread * 0.73, 1 + spread);
    const choice = random.float();

    return choice < 0.13 ? w * random.range(1.7, 2.5)
      : choice < 0.30 ? w * random.range(0.4, 0.7) : w;
  });
  const total = weights.reduce((a, b) => a + b);
  const result = [0];

  for (const weight of weights) result.push(result.at(-1) + weight / total);

  result[result.length - 1] = 1;
  return result;
}

function polygon(random, width, height, gap, tradition) {
  // Fractured edges and chipped corners; the broad resting surfaces stay level.
  const pad = () => gap * random.range(0.72, 1.65);
  const left = pad();
  const right = pad();
  const top = pad();
  const bottom = pad();
  const chamfer = random.range(...tradition.chamfer);
  const stoneWidth = Math.max(0.004, width - left - right);
  const stoneHeight = Math.max(0.004, height - top - bottom);
  const cornerX = Math.min(stoneWidth * chamfer, stoneHeight * 0.33);
  const cornerY = Math.min(stoneHeight * chamfer, stoneWidth * 0.28);
  const jag = Math.min(gap * (2.2 + tradition.slope * 2.8), stoneHeight * 0.19);
  const kink = () => random.range(-jag, jag);
  const ix = (v) => clamp(v / width, 0.006, 0.994);
  const iy = (v) => clamp(v / height, 0.006, 0.994);
  const edgeX = (a, b, t) => a + (b - a) * t;

  return [
    [ix(left + cornerX), iy(top + kink())],
    [ix(edgeX(left, width - right, 0.31)), iy(top + kink())],
    [ix(edgeX(left, width - right, 0.66)), iy(top + kink())],
    [ix(width - right - cornerX), iy(top + kink())],
    [ix(width - right + kink()), iy(top + cornerY)],
    [ix(width - right + kink()), iy(edgeX(top, height - bottom, 0.47))],
    [ix(width - right + kink()), iy(height - bottom - cornerY)],
    [ix(width - right - cornerX), iy(height - bottom + kink())],
    [ix(edgeX(left, width - right, 0.65)), iy(height - bottom + kink())],
    [ix(edgeX(left, width - right, 0.33)), iy(height - bottom + kink())],
    [ix(left + cornerX), iy(height - bottom + kink())],
    [ix(left + kink()), iy(height - bottom - cornerY)],
    [ix(left + kink()), iy(edgeX(top, height - bottom, 0.54))],
    [ix(left + kink()), iy(top + cornerY)],
  ];
}

function signedPolygonDistance(stone, u, v) {
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
    const ex = px - ax - t * dx;
    const ey = py - ay - t * dy;

    distanceSq = Math.min(distanceSq, ex * ex + ey * ey);

    if ((ay > py) !== (by > py) && px < ax + dx * (py - ay) / dy) {
      inside = !inside;
    }
  }

  return Math.sqrt(distanceSq) * (inside ? 1 : -1);
}

export function buildWall(random, grammar, seed) {
  const tradition = random.pick(traditions);
  const rows = Math.max(4, Math.round(random.int(...tradition.rows) *
    (0.75 + 0.25 * grammar.density)));
  const boundaries = randomBoundaries(random, rows, tradition.heightSpread);
  const stones = [];
  const mortar = random.range(...tradition.mortar) * grammar.edgeWidth;
  const offsetX = random.float();
  const offsetY = random.float();
  const variation = tradition.name === 'stacked-slate' ? 0.19 : 0.34;
  let nextId = 0;

  // Courses guide placement, but each stone has its own vertical extent.
  // Neighbouring stones need not end at the same height: mortar fills gaps.
  for (let row = 0; row < rows; row++) {
    const count = Math.max(3, Math.round(random.int(...tradition.cols) *
      Math.sqrt(grammar.density)));
    const xs = randomBoundaries(random, count, tradition.widthSpread);
    const offset = random.float();
    const courseHeight = boundaries[row + 1] - boundaries[row];

    for (let col = 0; col < count; col++) {
      const width = xs[col + 1] - xs[col];
      const split = random.float() < tradition.split && width > 0.055;
      const middle = random.range(0.3, 0.7);
      const pieces = split ? [[0, middle], [middle, 1]] : [[0, 1]];

      for (const [start, end] of pieces) {
        const baseY = boundaries[row] + start * courseHeight;
        const height = courseHeight * (end - start);
        const lift = random.range(-variation, variation) * height;
        const tall = !split && random.float() < 0.14
          ? random.range(0.14, 0.42) * height : 0;
        const y0 = baseY + lift - tall * random.range(0.2, 0.65);
        const y1 = baseY + height + lift + tall * random.range(0.2, 0.7);
        const finalHeight = y1 - y0;

        stones.push({
          id: nextId++,
          x0: xs[col] - offset,
          y0,
          width,
          height: finalHeight,
          polygon: polygon(random, width, finalHeight, mortar, tradition),
          face: tradition.name,
          orientation: random.range(-0.14, 0.14),
          proud: random.range(-0.027, 0.043),
          slab: random.range(0.65, 1.3),
          wear: random.range(0.2, 1),
        });
      }
    }
  }

  // Periodic spatial indexing allows stones to cross every tile boundary.
  // The same stone is reused on the opposite edge, rather than copied pixels.
  const divisions = 24;
  const cells = Array.from({ length: divisions * divisions }, () => []);
  const padding = 0.025;

  for (const stone of stones) {
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const left = stone.x0 + dx - padding;
        const right = stone.x0 + stone.width + dx + padding;
        const top = stone.y0 + dy - padding;
        const bottom = stone.y0 + stone.height + dy + padding;

        if (right < 0 || left > 1 || bottom < 0 || top > 1) continue;

        const minX = Math.max(0, Math.floor(left * divisions));
        const maxX = Math.min(divisions - 1, Math.floor(right * divisions));
        const minY = Math.max(0, Math.floor(top * divisions));
        const maxY = Math.min(divisions - 1, Math.floor(bottom * divisions));

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            cells[y * divisions + x].push({ stone, dx, dy });
          }
        }
      }
    }
  }

  return {
    type: tradition.name,
    count: nextId,
    sample(u, v) {
      const uu = wrap(u + offsetX +
        field(u, v, 9, 7, seed ^ 0x719d24b3) * 0.007);
      const vv = wrap(v + offsetY +
        field(u, v, 7, 9, seed ^ 0x6124eab9) * 0.009);
      const cx = Math.min(divisions - 1, Math.floor(uu * divisions));
      const cy = Math.min(divisions - 1, Math.floor(vv * divisions));
      const candidates = cells[cy * divisions + cx];
      let best = null;
      let bestDistance = -Infinity;

      for (const { stone, dx, dy } of candidates) {
        const x = (uu - (stone.x0 + dx)) / stone.width;
        const y = (vv - (stone.y0 + dy)) / stone.height;
        const distance = signedPolygonDistance(stone, x, y);

        if (distance > bestDistance) {
          bestDistance = distance;
          best = { stone, x, y, distance };
        }
      }

      // All cells are covered by at least one stone's padded placement.
      return best;
    },
  };
}
