import { fbm, field, hash } from '../random.js';

const palettes = [
  [164, 149, 126],
  [130, 135, 145],
  [180, 132, 96],
  [113, 104, 99],
  [189, 180, 155],
];

const clamp = (value) => Math.max(0, Math.min(1, value));
const wrap = (value) => ((value % 1) + 1) % 1;

function smooth(min, max, value) {
  const t = clamp((value - min) / (max - min));

  return t * t * (3 - 2 * t);
}

function partitions(count, random) {
  const widths = Array.from({ length: count }, () => random.range(0.6, 1.65));
  const total = widths.reduce((sum, width) => sum + width, 0);
  const boundaries = [0];

  for (const width of widths) {
    boundaries.push(boundaries.at(-1) + width / total);
  }

  return boundaries;
}

function partitionAt(value, boundaries) {
  let index = 0;

  while (index < boundaries.length - 2 && value >= boundaries[index + 1]) {
    index++;
  }

  const width = boundaries[index + 1] - boundaries[index];

  return {
    index,
    distance: Math.min(value - boundaries[index], boundaries[index + 1] - value) / width,
  };
}

function coursedStones(structure, density) {
  const rows = Math.max(2, Math.round(structure.int(3, 8) * density));
  const rowBoundaries = partitions(rows, structure);
  const courses = Array.from({ length: rows }, () => {
    const count = Math.max(2, Math.round(structure.int(2, 7) * density));

    return {
      boundaries: partitions(count, structure),
      offset: structure.float(),
    };
  });

  return (u, v) => {
    const row = partitionAt(wrap(v), rowBoundaries);
    const course = courses[row.index];
    const stone = partitionAt(wrap(u + course.offset), course.boundaries);

    return {
      x: stone.index,
      y: row.index,
      boundary: Math.min(stone.distance, row.distance),
      face: 1,
    };
  };
}

function scatteredStones(structure, density, seed, rounded) {
  const columns = Math.max(2, Math.round(structure.int(3, rounded ? 9 : 7) * density));
  const rows = Math.max(2, Math.round(structure.int(3, rounded ? 9 : 7) * density));
  const jitter = rounded ? 0.33 : structure.range(0.25, 0.48);
  const aspect = rounded ? structure.range(0.88, 1.12) : structure.range(0.65, 1.75);
  const centers = [];

  for (let y = 0; y < rows; y++) {
    const row = [];

    for (let x = 0; x < columns; x++) {
      row.push([
        x + 0.5 + (hash(x, y, seed ^ 0xa8c519f3) - 0.5) * jitter * 2,
        y + 0.5 + (hash(x, y, seed ^ 0x41f7c22b) - 0.5) * jitter * 2,
      ]);
    }

    centers.push(row);
  }

  return (u, v) => {
    const x = wrap(u) * columns;
    const y = wrap(v) * rows;
    const cx = Math.floor(x);
    const cy = Math.floor(y);

    let first = Infinity;
    let second = Infinity;
    let stoneX = 0;
    let stoneY = 0;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ix = ((cx + ox) % columns + columns) % columns;
        const iy = ((cy + oy) % rows + rows) % rows;
        const center = centers[iy][ix];
        const dx = (x - (center[0] + Math.floor((cx + ox) / columns) * columns)) / aspect;
        const dy = (y - (center[1] + Math.floor((cy + oy) / rows) * rows)) * aspect;
        const distance = Math.hypot(dx, dy);

        if (distance < first) {
          second = first;
          first = distance;
          stoneX = ix;
          stoneY = iy;
        } else if (distance < second) {
          second = distance;
        }
      }
    }

    return {
      x: stoneX,
      y: stoneY,
      boundary: (second - first) * 0.55,
      face: rounded ? clamp(1 - first * 0.2) : 1,
    };
  };
}

export const stone = {
  label: 'Rubble Masonry',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const layout = structure.int(0, 2);

    const findStone = layout === 0
      ? coursedStones(structure, grammar.density)
      : scatteredStones(structure, grammar.density, seeds.structure, layout === 2);

    const jointWidth = structure.range(0.045, 0.125) * grammar.edgeWidth;
    const relief = structure.range(0.2, 0.48);
    const deformation = structure.range(0.005, 0.035) * grammar.irregularity;
    const base = pigment.pick(palettes);
    const contrast = pigment.range(14, 43);
    const mortar = base.map((channel) => channel * 0.57);
    const patina = weather.range(0.05, 0.28);

    return (u, v) => {
      const warpX = field(u, v, 6, 7, seeds.structure ^ 0x719e3f41) * deformation;
      const warpY = field(u, v, 7, 6, seeds.structure ^ 0x4d16ab27) * deformation;
      const cell = findStone(u + warpX, v + warpY);

      const joint = 1 - smooth(jointWidth * 0.35, jointWidth, cell.boundary);
      const bevel = smooth(jointWidth * 0.2, jointWidth * 2.8, cell.boundary);
      const elevation = hash(cell.x, cell.y, seeds.structure ^ 0x291573af);
      const fracture = fbm(u, v, 21, 17, seeds.structure ^ 0x6dc8a195, 3);
      const shape = clamp(0.42 + relief * bevel * cell.face * (0.78 + elevation * 0.22) + fracture * 0.03);

      const stoneTone = (hash(cell.x, cell.y, seeds.pigment ^ 0x41629b5d) - 0.5) * contrast;
      const mineral = fbm(u, v, 13, 12, seeds.pigment ^ 0x2e81a549, 3);
      const grain = field(u, v, 49, 47, seeds.pigment ^ 0x7ad61b93) * grammar.detail;
      const stains = Math.max(0, fbm(u, v, 6, 7, seeds.weather, 3)) * patina * 100;
      const pitting = Math.max(0, fbm(u, v, 36, 33, seeds.weather ^ 0x9ebd1a34, 3));

      const color = base.map((channel, index) => {
        const tone = stoneTone + mineral * 30 + grain * 9;
        const stoneColor = channel + tone * (index === 2 ? 0.8 : 1) - stains - pitting * 14;

        return stoneColor * (1 - joint) + mortar[index] * joint;
      });

      return {
        color,
        height: shape * (1 - joint) + 0.24 * joint,
        roughness: clamp(0.8 + pitting * 0.22 + patina * 0.12 + joint * 0.12),
        edge: joint,
        detail: mineral * 0.4,
      };
    };
  },
};
