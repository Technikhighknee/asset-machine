import { fbm, field, hash } from '../random.js';

const palettes = [
  [133, 91, 53],
  [181, 136, 78],
  [95, 69, 50],
  [150, 111, 77],
  [85, 85, 82],
];

const clamp = (value) => Math.max(0, Math.min(1, value));
const wrap = (value) => ((value % 1) + 1) % 1;

function boardWidths(count, structure) {
  const weights = Array.from({ length: count }, () => structure.range(0.55, 1.8));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const boundaries = [0];

  for (const weight of weights) {
    boundaries.push(boundaries.at(-1) + weight / total);
  }

  return boundaries;
}

export const oak = {
  label: 'Oak Wood',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const finish = structure.int(0, 3);

    // Clear-cut timber, sawn boards, hand-hewn timber or knotty reclaimed wood.
    const count = finish === 0 ? 1
      : finish === 1 ? structure.int(2, 6)
        : finish === 2 ? structure.int(1, 3) : structure.int(3, 7);

    const boards = Math.max(1, Math.round(count * grammar.density));
    const horizontal = structure.float() < 0.5;
    const boundaries = boardWidths(boards, structure);

    const fibers = 2 * (finish === 2 ? structure.int(3, 7) : structure.int(9, 19));
    const bend = structure.range(0.015, 0.09) * grammar.irregularity;
    const seamWidth = finish === 0 ? 0 : structure.range(0.004, 0.013) * grammar.edgeWidth;
    const grainRelief = structure.range(0.02, 0.055);
    const base = pigment.pick(palettes);
    const contrast = pigment.range(16, 48);
    const wear = weather.range(0.04, 0.24);

    const knots = Array.from({ length: boards }, (_, board) => {
      const number = finish === 3 ? structure.int(3, 6)
        : finish === 0 ? structure.int(0, 1) : structure.int(0, 2);

      return Array.from({ length: number }, (_, index) => ({
        across: structure.range(0.12, 0.88),
        along: structure.float(),
        width: structure.range(0.07, finish === 3 ? 0.23 : 0.16),
        length: structure.range(0.05, 0.17),
        tone: hash(board, index, seeds.structure ^ 0x418a29c5),
      }));
    });

    const splits = finish === 3
      ? Array.from({ length: boards }, () => ({
        across: structure.range(0.2, 0.8),
        start: structure.float(),
        length: structure.range(0.16, 0.5),
      }))
      : [];

    return (u, v) => {
      const across = horizontal ? v : u;
      const along = horizontal ? u : v;

      const crooked = field(across, along, boards * 2, 5, seeds.structure ^ 0x9b462ed1);
      const position = wrap(across + crooked * seamWidth * grammar.irregularity);

      let board = 0;

      while (board < boards - 1 && position >= boundaries[board + 1]) {
        board++;
      }

      const width = boundaries[board + 1] - boundaries[board];
      const local = (position - boundaries[board]) / width;
      const distanceToSeam = Math.min(
        position - boundaries[board],
        boundaries[board + 1] - position,
      );

      const seam = seamWidth
        ? clamp((seamWidth - distanceToSeam) / seamWidth) : 0;
      const ripple = fbm(across, along, boards * 3, 4, seeds.structure ^ 0xb573a1cf, 3);

      let knotBend = 0;
      let knotDark = 0;

      for (const knot of knots[board]) {
        const dx = (local - knot.across) / knot.width;
        const deltaY = Math.abs(along - knot.along);
        const dy = Math.min(deltaY, 1 - deltaY) / knot.length;
        const radius = Math.hypot(dx, dy);
        const influence = Math.exp(-radius * radius * 1.4);

        knotBend += (local - knot.across) * influence * (0.28 + knot.tone * 0.2);
        knotDark = Math.max(knotDark, Math.exp(-radius * radius * 3));
      }

      const phase = (local + ripple * bend + knotBend) * fibers * Math.PI * 2;
      const rings = Math.sin(phase) * 0.68 + Math.sin(phase * 0.5 + ripple * 3) * 0.32;
      const fine = fbm(across, along, boards * 15, 5, seeds.structure ^ 0x51ca6b48, 3);
      const brush = fbm(across, along, boards * 14, 7, seeds.pigment ^ 0xf3a6192d, 3);
      const natural = fbm(across, along, boards * 2, 5, seeds.pigment ^ 0x2a591fc3, 3);
      const age = Math.max(0, fbm(across, along, boards * 2, 6, seeds.weather, 3));
      const boardTone = (hash(board, 0, seeds.pigment ^ 0x1493d8af) - 0.5) * contrast;

      // Hewn wood has broad tool facets instead of dense, sawn grain.
      const facetNoise = fbm(across, along, boards * 4, 13, seeds.structure ^ 0x8d6e319a, 3);
      const facets = finish === 2 ? Math.round(facetNoise * 5) / 5 : 0;

      let crack = 0;

      if (finish === 3) {
        const split = splits[board];
        const deviation = field(across, along, boards * 5, 7, seeds.structure ^ 0x1b58e9a3) * 0.035;
        const distance = Math.abs(local - split.across - deviation);
        const delta = wrap(along - split.start);
        const extent = Math.max(0, 1 - Math.abs(delta - split.length * 0.5) / (split.length * 0.5));

        crack = clamp((0.012 - distance) / 0.012) * extent;
      }

      const grainStrength = finish === 2 ? 0.4 : finish === 0 ? 0.65 : 1;
      const tone = boardTone + rings * 17 * grammar.detail * grainStrength +
        brush * 24 * grammar.detail + natural * 21 - knotDark * 34 -
        age * wear * 130 + facets * 46 - crack * 65;
      const height = 0.52 + rings * grainRelief * grammar.detail * grainStrength +
        fine * 0.025 - knotDark * 0.035 - seam * 0.16 +
        facets * 0.075 - crack * 0.12;

      return {
        color: base.map((channel, index) => {
          const tinted = channel + tone * (index === 2 ? 0.75 : 1);

          return tinted * (1 - seam * 0.55) + base[index] * 0.25 * seam;
        }),
        height,
        roughness: clamp(0.73 + wear * 0.3 + age * 0.075 + knotDark * 0.05),
        edge: Math.max(seam, crack),
        detail: brush * 0.45,
      };
    };
  },
};
