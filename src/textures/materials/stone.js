import { fbm, field, hash } from '../random.js';

const palettes = [
  [[164, 148, 121], [119, 119, 111], [181, 162, 131], [99, 100, 99], [146, 113, 85]],
  [[142, 140, 135], [103, 113, 120], [166, 162, 145], [91, 95, 96], [158, 133, 103]],
  [[164, 113, 82], [114, 104, 97], [190, 150, 102], [118, 89, 79], [164, 145, 125]],
  [[177, 169, 148], [130, 133, 124], [201, 187, 150], [151, 143, 129], [111, 119, 119]],
  [[113, 122, 121], [80, 93, 102], [160, 137, 109], [138, 144, 133], [103, 90, 84]],
];

const clamp = (value) => Math.max(0, Math.min(1, value));
const wrap = (value) => ((value % 1) + 1) % 1;

function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a));

  return t * t * (3 - 2 * t);
}

function partitions(count, random) {
  const weights = Array.from({ length: count }, () => random.range(0.48, 1.9));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const boundaries = [0];

  for (const width of weights) {
    boundaries.push(boundaries.at(-1) + width / total);
  }

  return boundaries;
}

function segmentAt(position, boundaries) {
  let index = 0;

  while (index < boundaries.length - 2 && position >= boundaries[index + 1]) {
    index++;
  }

  const width = boundaries[index + 1] - boundaries[index];

  return {
    index,
    edge: Math.min(position - boundaries[index], boundaries[index + 1] - position) / width,
  };
}

function coursedLayout(structure, density) {
  const rows = Math.max(3, Math.round(structure.int(4, 10) * density));
  const heights = partitions(rows, structure);
  const courses = Array.from({ length: rows }, () => ({
    edges: partitions(Math.max(2, Math.round(structure.int(2, 8) * density)), structure),
    offset: structure.float(),
  }));

  return (u, v) => {
    const row = segmentAt(wrap(v), heights);
    const course = courses[row.index];
    const stone = segmentAt(wrap(u + course.offset), course.edges);

    return {
      idX: stone.index,
      idY: row.index,
      edge: Math.min(stone.edge, row.edge) * 0.9,
      center: 0.5,
    };
  };
}

function scatteredLayout(structure, density, seed, fieldstones) {
  const columns = Math.max(3, Math.round(structure.int(4, fieldstones ? 8 : 13) * density));
  const rows = Math.max(3, Math.round(structure.int(4, fieldstones ? 8 : 12) * density));
  const aspect = fieldstones ? structure.range(0.84, 1.18) : structure.range(0.65, 1.55);
  const jitter = fieldstones ? 0.36 : structure.range(0.28, 0.48);

  const centers = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => ({
      x: x + 0.5 + (hash(x, y, seed ^ 0xa8c519f3) - 0.5) * jitter * 2,
      y: y + 0.5 + (hash(x, y, seed ^ 0x41f7c22b) - 0.5) * jitter * 2,
      weight: (hash(x, y, seed ^ 0xda3195bd) - 0.5) * (fieldstones ? 0.65 : 0.9),
    }))
  );

  return (u, v) => {
    const x = wrap(u) * columns;
    const y = wrap(v) * rows;
    const originX = Math.floor(x);
    const originY = Math.floor(y);

    let first = Infinity;
    let second = Infinity;
    let winnerX = 0;
    let winnerY = 0;
    let closestDistance = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = originX + dx;
        const gy = originY + dy;
        const ix = ((gx % columns) + columns) % columns;
        const iy = ((gy % rows) + rows) % rows;
        const center = centers[iy][ix];
        const offsetX = (x - (gx - ix + center.x)) / aspect;
        const offsetY = (y - (gy - iy + center.y)) * aspect;
        const distance = offsetX * offsetX + offsetY * offsetY;
        const score = distance - center.weight;

        if (score < first) {
          second = first;
          first = score;
          winnerX = ix;
          winnerY = iy;
          closestDistance = Math.sqrt(distance);
        } else if (score < second) {
          second = score;
        }
      }
    }

    return {
      idX: winnerX,
      idY: winnerY,
      edge: Math.max(0, (second - first) * (fieldstones ? 0.36 : 0.42)),
      center: closestDistance,
    };
  };
}

export const stone = {
  label: 'Rubble Masonry',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const layout = structure.int(0, 2);
    const findStone = layout === 0
      ? coursedLayout(structure, grammar.density)
      : scatteredLayout(structure, grammar.density, seeds.structure, layout === 2);

    const gap = structure.range(0.023, 0.09) * grammar.edgeWidth;
    const bevelWidth = structure.range(2.2, 4.6);
    const warp = structure.range(0.007, 0.035) * grammar.irregularity;
    const ruggedness = structure.range(0.55, 1.25);
    const palettesForWall = pigment.pick(palettes);
    const mortarBase = pigment.range(0.52, 0.78);
    const colorSpread = pigment.range(0.72, 1.18);
    const weathering = weather.range(0.1, 0.48);
    const lichenCoverage = weather.range(0, 0.25);

    const stoneCache = new Map();

    function profile(x, y) {
      const key = x + ':' + y;

      if (stoneCache.has(key)) return stoneCache.get(key);

      const elevation = hash(x, y, seeds.structure ^ 0x291573af);
      const tint = hash(x, y, seeds.pigment ^ 0x41629b5d);
      const colorIndex = Math.floor(hash(x, y, seeds.pigment ^ 0x4bd9036f) * palettesForWall.length);
      const variation = (hash(x, y, seeds.pigment ^ 0x93b15e26) - 0.5) * 24;
      const mineral = hash(x, y, seeds.structure ^ 0x853bcaf1);
      const data = {
        elevation,
        color: palettesForWall[colorIndex].map((channel) =>
          channel * (0.83 + tint * 0.34) + variation * colorSpread
        ),
        mineral,
      };

      stoneCache.set(key, data);

      return data;
    }

    return (u, v) => {
      const distortionX = field(u, v, 19, 17, seeds.structure ^ 0x719e3f41) * warp;
      const distortionY = field(u, v, 17, 19, seeds.structure ^ 0x4d16ab27) * warp;
      const stone = findStone(u + distortionX, v + distortionY);
      const data = profile(stone.idX, stone.idY);

      const brokenEdge = field(u, v, 39, 37, seeds.structure ^ 0x82511e7b);
      const boundary = stone.edge + brokenEdge * gap * 0.3;
      const joint = 1 - smooth(gap * 0.25, gap, boundary);
      const bevel = smooth(gap * 0.4, gap * bevelWidth, boundary);
      const chipped = Math.max(0, brokenEdge - 0.2);
      const coarse = fbm(u, v, 23, 21, seeds.structure ^ 0x6dc8a195, 2);
      const fine = field(u, v, 101, 99, seeds.structure ^ 0x01c5e2b7);
      const pits = smooth(0.12, 0.48, fine * 0.7 + coarse * 0.3);
      const face = (0.62 + data.elevation * 0.21) * bevel -
        chipped * 0.11 * (1 - bevel) + coarse * 0.07 * ruggedness -
        pits * 0.075 * ruggedness;

      const mineral = fbm(u, v, 17, 19, seeds.pigment ^ 0x2e81a549, 2);
      const speckle = field(u, v, 97, 101, seeds.pigment ^ 0x7ad61b93);
      const mineralVein = smooth(0.42, 0.7, Math.abs(mineral + speckle * 0.25)) *
        data.mineral;
      const stain = Math.max(0, field(u, v, 7, 9, seeds.weather)) * weathering;
      const lichen = smooth(0.14, 0.4, field(u, v, 21, 23, seeds.weather ^ 0xc537e2a1)) *
        lichenCoverage;

      const mortar = palettesForWall[0].map((channel) =>
        channel * mortarBase + fine * 12 + stain * 15
      );

      const color = data.color.map((channel, index) => {
        const grain = (mineral * 22 + speckle * 15 * grammar.detail +
          mineralVein * 18) * (index === 2 ? 0.78 : 1);
        const stoneColor = channel + grain - stain * 60 -
          pits * 13 + lichen * (index === 1 ? 24 : -23);

        return stoneColor * (1 - joint) + mortar[index] * joint;
      });

      return {
        color,
        height: 0.28 * joint + clamp(0.18 + face) * (1 - joint),
        roughness: clamp(0.77 + pits * 0.13 + stain * 0.15 +
          lichen * 0.09 + joint * 0.14 + Math.max(0, coarse) * 0.04),
        edge: joint,
        detail: mineral * 0.33,
      };
    };
  },
};
