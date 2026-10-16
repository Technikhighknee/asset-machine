import { field } from '../../random.js';

const wrap = (value) => ((value % 1) + 1) % 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Stone dimensions, mortar thickness and laying method all belong to the
// building tradition. The seed chooses a tradition before choosing any stones.
const traditions = [
  { name: 'bedded-limestone', count: [54, 78], minWidth: 0.063, minHeight: 0.048, minArea: 0.0048, minAspect: 0.72, maxAspect: 2.5, preferredAspect: 1.65, mortar: [0.003, 0.006], chamfer: [0.035, 0.13], slope: 0.25 },
  { name: 'rough-rubble', count: [49, 69], minWidth: 0.068, minHeight: 0.06, minArea: 0.0058, minAspect: 0.72, maxAspect: 2.5, preferredAspect: 1.35, mortar: [0.005, 0.009], chamfer: [0.07, 0.22], slope: 0.45 },
  { name: 'stacked-slate', count: [60, 85], minWidth: 0.072, minHeight: 0.046, minArea: 0.0049, minAspect: 0.77, maxAspect: 2.7, preferredAspect: 1.95, mortar: [0.002, 0.005], chamfer: [0.015, 0.07], slope: 0.18 },
  { name: 'weathered-rubble', count: [46, 66], minWidth: 0.07, minHeight: 0.062, minArea: 0.006, minAspect: 0.72, maxAspect: 2.5, preferredAspect: 1.4, mortar: [0.0055, 0.009], chamfer: [0.085, 0.25], slope: 0.62 },
];

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
  const targetCount = Math.round(random.range(...tradition.count) * Math.sqrt(grammar.density));
  const minWidth = tradition.minWidth;
  const minHeight = tradition.minHeight;
  const minArea = tradition.minArea;
  const mortar = random.range(...tradition.mortar) * grammar.edgeWidth;
  const offsetX = random.float();
  const offsetY = random.float();

  // Split free space, not stones. Each region belongs to exactly one stone:
  // chipped silhouettes can recede into mortar but can never hit a neighbour.
  const root = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const regions = [root];

  function valid(region) {
    const width = region.x1 - region.x0;
    const height = region.y1 - region.y0;
    const aspect = width / height;

    return width >= minWidth && height >= minHeight &&
      width * height >= minArea &&
      aspect >= tradition.minAspect && aspect <= tradition.maxAspect;
  }

  function divide(region) {
    const choices = [];
    const width = region.x1 - region.x0;
    const height = region.y1 - region.y0;

    for (const vertical of [true, false]) {
      for (let i = 0; i < 10; i++) {
        const fraction = i === 0 ? 0.5 : random.range(0.31, 0.69);
        const split = vertical
          ? region.x0 + width * fraction
          : region.y0 + height * fraction;
        const first = vertical
          ? { ...region, x1: split } : { ...region, y1: split };
        const second = vertical
          ? { ...region, x0: split } : { ...region, y0: split };

        if (!valid(first) || !valid(second)) continue;

        // Favor credible masonry proportions, not one repeated split grid.
        const preferred = tradition.preferredAspect;
        const balance = Math.abs(Math.log((vertical ? width : height) /
          (vertical ? height : width))) * 0.1;
        const quality = Math.abs(Math.log(
          ((first.x1 - first.x0) / (first.y1 - first.y0)) / preferred
        )) + Math.abs(Math.log(
          ((second.x1 - second.x0) / (second.y1 - second.y0)) / preferred
        )) + balance;
        choices.push({ first, second, score: quality + random.float() * 1.8 });
      }
    }

    choices.sort((a, b) => a.score - b.score);
    return choices[0] ?? null;
  }

  // Largest plausible regions are divided first, with seed-dependent sizes.
  // Tiny residuals and thin split pieces cannot be generated.
  for (let iteration = 0; iteration < targetCount * 3 &&
    regions.length < targetCount; iteration++) {
    const candidates = regions.map((region, index) => ({
      region,
      index,
      priority: (region.x1 - region.x0) * (region.y1 - region.y0) *
        random.range(0.65, 1.35),
    })).sort((a, b) => b.priority - a.priority);

    let selected = null;

    for (const candidate of candidates) {
      const split = divide(candidate.region);

      if (split) {
        selected = { ...candidate, ...split };
        break;
      }
    }

    if (!selected) break;

    regions.splice(selected.index, 1, selected.first, selected.second);
  }

  const stones = regions.map((region, id) => {
    const width = region.x1 - region.x0;
    const height = region.y1 - region.y0;
    const inset = Math.min(mortar, width * 0.09, height * 0.08);

    return {
      id,
      width,
      height,
      polygon: polygon(random, width, height, inset, tradition),
      face: tradition.name,
      orientation: random.range(-0.14, 0.14),
      proud: random.range(-0.027, 0.043),
      slab: random.range(0.65, 1.3),
      wear: random.range(0.2, 1),
    };
  });

  // Each split has two non-overlapping children. Point lookup is exact and
  // has no collision arbitration, even when tiles repeat across UV edges.
  // Reconstruct the split tree from the final partition's containment.
  function locate(x, y) {
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];

      if (x >= region.x0 && x < region.x1 &&
        y >= region.y0 && y < region.y1) {
        const stone = stones[i];

        return {
          stone,
          x: (x - region.x0) / stone.width,
          y: (y - region.y0) / stone.height,
        };
      }
    }

    throw new Error('Masonry partition does not cover its tile');
  }

  return {
    type: tradition.name,
    count: stones.length,
    sample(u, v) {
      const x = wrap(u + offsetX + field(u, v, 9, 7, seed ^ 0x719d24b3) * 0.006);
      const y = wrap(v + offsetY + field(u, v, 7, 9, seed ^ 0x6124eab9) * 0.007);
      const placement = locate(x, y);

      return {
        ...placement,
        distance: signedPolygonDistance(placement.stone, placement.x, placement.y),
      };
    },
  };
}
