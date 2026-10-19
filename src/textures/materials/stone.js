import { buildWall } from './stone/layout.js';
import { makeSurface } from './stone/surface.js';

export const stone = {
  label: 'Rubble Masonry',

  create({ structure, pigment, weather, seeds }) {
    const wall = buildWall(structure, seeds.structure);
    const surface = makeSurface({ structure, pigment, weather, seeds });

    return (u, v) => surface(u, v, wall.sample(u, v));
  },
};
