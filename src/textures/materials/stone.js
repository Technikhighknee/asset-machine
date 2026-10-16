import { fbm, field, hash } from '../random.js';

const palettes = [
  [164, 149, 126],
  [130, 135, 145],
  [180, 132, 96],
  [113, 104, 99],
  [189, 180, 155],
];

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const wrap = (value, size) => ((value % size) + size) % size;

export const stone = {
  label: 'Rubble Masonry',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;

    const columns = Math.max(3, Math.round(structure.int(4, 10) * grammar.density));
    const rows = Math.max(3, Math.round(structure.int(4, 9) * grammar.density));
    const elongation = structure.range(0.72, 1.6);
    const jitter = structure.range(0.24, 0.43) * grammar.irregularity;
    const warp = structure.range(0.06, 0.18) * grammar.irregularity;
    const jointWidth = structure.range(0.055, 0.12) * grammar.edgeWidth;
    const relief = structure.range(0.26, 0.46);

    const base = pigment.pick(palettes);
    const tint = pigment.range(14, 42);
    const mortar = base.map((channel) => channel * 0.55);
    const patina = weather.range(0.07, 0.3);

    return (u, v) => {
      const distortionX = field(u, v, columns * 2, rows * 2, seeds.structure ^ 0x719e3f41);
      const distortionY = field(u, v, columns * 2, rows * 2, seeds.structure ^ 0x4d16ab27);
      const x = u * columns + distortionX * warp;
      const y = v * rows + distortionY * warp;
      const originX = Math.floor(x);
      const originY = Math.floor(y);

      let closest = Infinity;
      let second = Infinity;
      let stoneX = 0;
      let stoneY = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const candidateX = originX + dx;
          const candidateY = originY + dy;
          const ix = wrap(candidateX, columns);
          const iy = wrap(candidateY, rows);

          const cx = candidateX + 0.5 +
            (hash(ix, iy, seeds.structure ^ 0xa8c519f3) - 0.5) * 2 * jitter;
          const cy = candidateY + 0.5 +
            (hash(ix, iy, seeds.structure ^ 0x41f7c22b) - 0.5) * 2 * jitter;

          const vx = (x - cx) / elongation;
          const vy = (y - cy) * elongation;
          const distance = Math.hypot(vx, vy);

          if (distance < closest) {
            second = closest;
            closest = distance;
            stoneX = ix;
            stoneY = iy;
          } else if (distance < second) {
            second = distance;
          }
        }
      }

      const boundary = second - closest;
      const joint = 1 - smooth(jointWidth * 0.35, jointWidth * 1.3, boundary);
      const bevel = smooth(jointWidth * 0.2, jointWidth * 3.8, boundary);
      const elevation = hash(stoneX, stoneY, seeds.structure ^ 0x291573af);

      const chips = fbm(u, v, columns * 4, rows * 4, seeds.structure ^ 0x6dc8a195, 3);
      const shape = clamp(0.46 + relief * bevel * (0.73 + elevation * 0.27) + chips * 0.035);

      const stoneTone = (hash(stoneX, stoneY, seeds.pigment ^ 0x41629b5d) - 0.5) * tint;
      const mineral = fbm(u, v, columns * 2, rows * 2, seeds.pigment ^ 0x2e81a549, 3);
      const grains = field(u, v, columns * 11, rows * 11, seeds.pigment ^ 0x7ad61b93);
      const stains = Math.max(0, fbm(u, v, 6, 7, seeds.weather, 3)) * patina * 110;
      const pitting = Math.max(0, fbm(u, v, columns * 6, rows * 6, seeds.weather ^ 0x9ebd1a34, 3));

      const color = base.map((channel, index) => {
        const variation = stoneTone + mineral * 30 + grains * 9 * grammar.detail;
        const stoneColor = channel + variation * (index === 2 ? 0.8 : 1) -
          stains - pitting * 14;
        return stoneColor * (1 - joint) + mortar[index] * joint;
      });

      return {
        color,
        height: shape * (1 - joint) + 0.24 * joint,
        roughness: clamp(0.82 + pitting * 0.2 + patina * 0.1 + joint * 0.11),
        edge: joint,
        detail: mineral * 0.4,
      };
    };
  },
};
