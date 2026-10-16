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

export const oak = {
  label: 'Oak Wood',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const count = Math.max(1, Math.round(structure.int(1, 7) * grammar.density));
    const horizontal = structure.float() < 0.5;

    const weights = Array.from({ length: count }, () => structure.range(0.55, 1.75));
    const total = weights.reduce((sum, width) => sum + width, 0);
    const boundaries = [0];

    for (const width of weights) {
      boundaries.push(boundaries.at(-1) + width / total);
    }

    const fibers = structure.int(14, 39);
    const bend = structure.range(0.025, 0.10) * grammar.irregularity;
    const seamWidth = structure.range(0.004, 0.014) * grammar.edgeWidth;
    const grainRelief = structure.range(0.025, 0.055);
    const base = pigment.pick(palettes);
    const contrast = pigment.range(16, 48);
    const wear = weather.range(0.04, 0.24);

    const knots = Array.from({ length: count }, (_, board) => {
      const number = structure.int(0, 2);

      return Array.from({ length: number }, (_, index) => ({
        across: structure.range(0.16, 0.84),
        along: structure.float(),
        width: structure.range(0.09, 0.17),
        length: structure.range(0.05, 0.13),
        tone: hash(board, index, seeds.structure ^ 0x418a29c5),
      }));
    });

    return (u, v) => {
      const across = horizontal ? v : u;
      const along = horizontal ? u : v;

      const crooked = field(across, along, count * 2, 5, seeds.structure ^ 0x9b462ed1);
      const position = wrap(across + crooked * seamWidth * grammar.irregularity);

      let board = 0;

      while (board < count - 1 && position >= boundaries[board + 1]) {
        board++;
      }

      const width = boundaries[board + 1] - boundaries[board];
      const local = (position - boundaries[board]) / width;
      const distanceToSeam = Math.min(
        position - boundaries[board],
        boundaries[board + 1] - position,
      );

      const seam = clamp((seamWidth - distanceToSeam) / seamWidth);
      const ripple = fbm(across, along, count * 3, 4, seeds.structure ^ 0xb573a1cf, 3);

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
      const rings = Math.sin(phase) * 0.68 + Math.sin(phase * 0.49 + ripple * 3) * 0.32;

      const fine = fbm(across, along, count * 15, 5, seeds.structure ^ 0x51ca6b48, 3);
      const brush = fbm(across, along, count * 14, 7, seeds.pigment ^ 0xf3a6192d, 3);
      const natural = fbm(across, along, count * 2, 5, seeds.pigment ^ 0x2a591fc3, 3);
      const age = Math.max(0, fbm(across, along, count * 2, 6, seeds.weather, 3));
      const boardTone = (hash(board, 0, seeds.pigment ^ 0x1493d8af) - 0.5) * contrast;

      const tone = boardTone + rings * 15 * grammar.detail +
        brush * 24 * grammar.detail + natural * 21 -
        knotDark * 34 - age * wear * 130;
      const height = 0.52 + rings * grainRelief * grammar.detail +
        fine * 0.025 - knotDark * 0.035 - seam * 0.16;

      return {
        color: base.map((channel, index) => {
          const tinted = channel + tone * (index === 2 ? 0.75 : 1);
          return tinted * (1 - seam * 0.55) + base[index] * 0.25 * seam;
        }),
        height,
        roughness: clamp(0.73 + wear * 0.3 + age * 0.075 + knotDark * 0.05),
        edge: seam,
        detail: brush * 0.45,
      };
    };
  },
};
