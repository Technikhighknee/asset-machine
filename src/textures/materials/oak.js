import { field, hash } from '../random.js';

const palettes = [
  [133, 91, 53],
  [181, 136, 78],
  [95, 69, 50],
  [150, 111, 77],
  [85, 85, 82],
];

const clamp = (value) => Math.max(0, Math.min(1, value));

export const oak = {
  label: 'Oak Wood',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const boards = Math.max(1, Math.round(structure.int(1, 8) * grammar.density));
    const horizontal = structure.float() < 0.5;
    const fibers = structure.int(9, 43);
    const bend = structure.range(0.05, 0.5) * grammar.irregularity;
    const knotsPerBoard = structure.int(0, 3);
    const gap = structure.range(0.013, 0.065) * grammar.edgeWidth;
    const base = pigment.pick(palettes);
    const contrast = pigment.range(16, 58);
    const wear = weather.range(0.05, 0.3);

    const knots = Array.from({ length: boards }, (_, board) =>
      Array.from({ length: knotsPerBoard }, (_, index) => ({
        x: 0.2 + hash(board, index, seeds.structure) * 0.6,
        y: hash(board, index, seeds.structure ^ 0xf12b579a),
        width: 0.06 + hash(index, board, seeds.structure ^ 0x89a14d21) * 0.17,
      }))
    );

    return (u, v) => {
      const across = horizontal ? v : u;
      const along = horizontal ? u : v;
      const position = across * boards;
      const board = Math.floor(position) % boards;
      const local = position - Math.floor(position);
      const edge = clamp((gap - Math.min(local, 1 - local)) / gap);

      const ripple = field(across, along, boards * 3, 6, seeds.structure) * bend;
      let knotInfluence = 0;

      for (const knot of knots[board]) {
        const dx = (local - knot.x) / knot.width;
        const dy = Math.min(Math.abs(along - knot.y), 1 - Math.abs(along - knot.y)) / 0.11;
        knotInfluence = Math.max(knotInfluence, Math.exp(-(dx * dx + dy * dy) * 2));
      }

      const rings = Math.sin((local + ripple + knotInfluence * 0.13) * fibers * Math.PI * 2);
      const fine = field(across, along, boards * 9, 28, seeds.pigment);
      const relief = field(across, along, boards * 9, 28, seeds.structure ^ 0x54f6c81b);
      const boardTone = (hash(board, 0, seeds.pigment) - 0.5) * contrast;
      const grain = (rings * 19 + fine * 20) * grammar.detail;
      const aging = Math.max(0, field(across, along, boards * 2, 7, seeds.weather)) * wear * 85;

      return {
        color: base.map((channel, index) => {
          const tint = index === 2 ? 0.7 : 1;
          return channel + (boardTone + grain - aging - knotInfluence * 25) * tint;
        }),
        height: 0.46 + rings * 0.045 * grammar.detail +
          relief * 0.035 - edge * 0.36 - knotInfluence * 0.09,
        roughness: clamp(0.65 + wear * 0.36 + knotInfluence * 0.06),
        edge,
        detail: grain / 64,
      };
    };
  },
};
