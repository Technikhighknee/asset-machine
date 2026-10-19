import { makeReedSurface } from './thatch/structure.js';
import { makeReedPbr } from './thatch/pbr.js';

let lastSize = 0;
let lastMaterial = null;

export const thatch = {
  label: 'Reed Thatch',

  generate({ size }) {
    if (lastSize !== size || !lastMaterial) {
      lastMaterial = makeReedPbr(makeReedSurface(size), size);
      lastSize = size;
    }

    return lastMaterial;
  },
};
