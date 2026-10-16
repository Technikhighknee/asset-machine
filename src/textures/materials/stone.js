import { field, hash } from '../random.js';

const palettes = [
  [164, 149, 126],
  [130, 135, 145],
  [180, 132, 96],
  [113, 104, 99],
  [189, 180, 155],
];

const clamp = (value) => Math.max(0, Math.min(1, value));

export const stone = {
  label: 'Rubble Stone',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const columns = Math.max(2, Math.round(structure.int(3, 11) * grammar.density));
    const rows = Math.max(2, Math.round(structure.int(3, 10) * grammar.density));
    const arrangement = structure.int(0, 2);
    const warp = structure.range(0.01, 0.12) * grammar.irregularity;
    const gap = structure.range(0.045, 0.14) * grammar.edgeWidth;
    const base = pigment.pick(palettes);
    const contrast = pigment.range(16, 55);
    const patina = weather.range(0.05, 0.36);

    return (u, v) => {
      const distortion = field(u, v, columns * 2, rows * 2, seeds.structure);
      const y = v * rows + distortion * warp;
      const row = Math.floor(y);
      const shift = arrangement === 0
        ? (row & 1) * 0.5
        : arrangement === 1
          ? hash(0, ((row % rows) + rows) % rows, seeds.structure) * 0.75
          : 0;

      const x = u * columns + shift + distortion * warp;
      const column = Math.floor(x);
      const dx = x - column;
      const dy = y - row;
      const distance = Math.min(dx, 1 - dx, dy, 1 - dy);
      const edge = clamp((gap - distance) / (gap * 0.7));
      const cellX = ((column % columns) + columns) % columns;
      const cellY = ((row % rows) + rows) % rows;
      const variation = (hash(cellX, cellY, seeds.structure ^ 0x41629b5d) - 0.5) * contrast;
      const grain = field(u, v, 31, 29, seeds.pigment) * 15 * grammar.detail;
      const stains = Math.max(0, field(u, v, 7, 9, seeds.weather)) * patina * 85;
      const elevation = hash(cellX, cellY, seeds.structure ^ 0x291573af);

      return {
        color: base.map((channel, index) => {
          const tint = index === 2 ? 0.74 : 1;
          return channel + variation * tint + grain - stains;
        }),
        height: 0.27 + (1 - edge) * (0.42 + elevation * 0.22) +
          field(u, v, 19, 23, seeds.structure ^ 0x97e31f42) * 0.025,
        roughness: clamp(0.75 + patina * 0.2 + grain / 190),
        edge,
        detail: grain / 64,
      };
    };
  },
};
