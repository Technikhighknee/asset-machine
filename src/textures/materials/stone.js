import { buildWall } from './stone/layout.js';
import { makeSurface } from './stone/surface.js';

export const stone = {
  label: 'Rubble Masonry',

  create({ structure, pigment, weather, style, seeds }) {
    const wall = buildWall(structure, style.grammar, seeds.structure);
    const surface = makeSurface({ structure, pigment, weather, seeds, grammar: style.grammar });

    return (u, v) => surface(u, v, wall.sample(u, v));
  },
};
