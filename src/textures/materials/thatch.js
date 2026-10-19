import { makeReedSurface } from './thatch/structure.js';
import { makeReedPbr } from './thatch/pbr.js';

export const thatch = {
  label: 'Reed Thatch',

  generate({ size }) {
    return makeReedPbr(makeReedSurface(size), size);
  },
};
