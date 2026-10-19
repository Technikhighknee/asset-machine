// Fixed, densely layered water-reed construction. No public variants.

const TAU = Math.PI * 2;

const RECIPE = Object.freeze({
  rows: 16,
  columns: 43,
  fibers: 39,
  sheafWidth: 0.027,
  sheafLength: 0.155,
  baseHeight: 0.5,
  bundleLift: 0.007,
  strandLift: 0.0012,
  pigments: [
    [0.44, 0.32, 0.193],
    [0.49, 0.363, 0.218],
    [0.555, 0.433, 0.269],
    [0.381, 0.275, 0.163],
    [0.597, 0.465, 0.292],
    [0.468, 0.327, 0.182],
    [0.535, 0.382, 0.222],
    [0.42, 0.3, 0.177],
  ],
});

function clamp(v, a = 0, b = 1) {return Math.max(a, Math.min(b, v))}

function wrap(v, n) {
  const result = v % n;

  return result < 0 ? result + n : result;
}

function fade(v) {v = clamp(v); return v*v*(3-2*v)}

function hash(x, y) {let n = (Math.imul(x+17, 374761393)^Math.imul(y+73, 668265263))>>>0; n = Math.imul(n^(n>>>13), 1274126177)>>>0; return((n^(n>>>16))>>>0)/4294967296}

function noise(u, v, nx, ny, lattice) {
  const ax = u*nx, ay = v*ny, x = Math.floor(ax), y = Math.floor(ay);
  const tx = fade(ax-x), ty = fade(ay-y);
  const left = wrap(x, nx), right = wrap(x+1, nx);
  const top = wrap(y, ny)*nx, bottom = wrap(y+1, ny)*nx;
  const a = lattice[top+left], b = lattice[top+right];
  const c = lattice[bottom+left], d = lattice[bottom+right];
  return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}

export function makeReedSurface(size) {
  const n = size*size, p = RECIPE;
  const color = new Float32Array(n*3), coarse = new Float32Array(n);
  const fiberRelief = new Float32Array(n);
  const microNormalX = new Float32Array(n);
  const microNormalY = new Float32Array(n);
  const roughness = new Float32Array(n);

  const broadLattice = new Float32Array(5*7);
  const detailLattice = new Float32Array(17*23);
  for (let y = 0; y<7; y++) {
    for (let x = 0; x<5; x++)broadLattice[y*5+x] = hash(x, y);
  }
  for (let y = 0; y<23; y++) {
    for (let x = 0; x<17; x++)detailLattice[y*17+x] = hash(x+53, y+41);
  }

  for (let y = 0; y<size; y++) {
    for (let x = 0; x<size; x++) {
      const i = y*size+x, u = x/size, v = y/size;
      const tone = (noise(u, v, 5, 7, broadLattice)-0.5)*0.10+
      (noise(u, v, 17, 23, detailLattice)-0.5)*0.035;
      color[i*3] = 0.425+tone;
      color[i*3+1] = 0.306+tone*0.84;
      color[i*3+2] = 0.178+tone*0.68;
      coarse[i] = p.baseHeight;
      roughness[i] = 0.943;
    }
  }
  const width = p.sheafWidth*size, lengthBase = p.sheafLength*size;
  // Each course is hand-staggered. The layout is fixed but never a grid
  // of identical capsules or symmetric periodic clumps.
  for (let row = 0; row<p.rows; row++) {
    for (let col = 0; col<p.columns; col++) {
      const r = hash(col, row), phase = hash(col+200, row+50);
      const x0 = (col+0.48+(r-0.5)*0.84)/p.columns*size;
      const y0 = (row-0.30+(phase-0.5)*1.6)/p.rows*size;
      const length = lengthBase*(0.81+0.42*hash(col+777, row));
      const half = width*(0.72+0.56*hash(col, row+100));
      const lean = size*(hash(col+2, row+20)-0.5)*0.025;
      const bow = size*(hash(col+6, row+8)-0.5)*0.01;
      const groupTone = (hash(col+3, row+42)-0.5)*0.075;
      // Broad, low-amplitude compressed bundles form the geometry silhouette.
      for (let step = 0; step<Math.ceil(length); step++) {
        const t = step/length, envelope = fade(t*9)*fade((1-t)*7);
        const cx = x0+lean*t+bow*Math.sin(t*Math.PI);
        const iy = wrap(Math.floor(y0+step), size);
        const radius = Math.ceil(half)+1;
        for (let dx = -radius; dx<=radius; dx++) {
          const across = Math.abs(dx)/(half+0.25);
          if (across>=1)continue;
          const crown = (1-across*across)**2*envelope;
          const ix = wrap(Math.floor(cx+dx), size), i = iy*size+ix;
          coarse[i] = Math.max(coarse[i], p.baseHeight+p.bundleLift*crown);
        }
      }
      // Dense, individually tinted overlapping stalks: no repeated strand array.
      for (let stalk = 0; stalk<p.fibers; stalk++) {
        const spread = (stalk+0.35+hash(stalk, col+row*19)*0.5)/p.fibers-0.5;
        const k = col*73+stalk, wav = hash(k, row+1), wob = hash(k+99, row+20);
        const sx = x0+spread*half*2.35;
        const sy = y0+(hash(k, row+59)-0.5)*length*0.23;
        const fl = length*(0.72+0.4*hash(k+38, row+11));
        const curve = (wav-0.5)*size*0.009;
        const stalkLean = lean+(wob-0.5)*size*0.008;
        const strokeWidth = Math.max(0.5, size*(0.00043+hash(k+88, row)*0.00036));
        const palette = p.pigments[Math.floor(hash(k, row+240)*p.pigments.length)];
        const tone = (hash(k+400, row)-0.5)*0.105+groupTone;
        const tipRange = 0.42+0.27*hash(k, row+780);
        const dryRoughness = 0.89+0.04*hash(k, row+305);
        for (let step = 0; step<Math.ceil(fl); step++) {
          const t = step/fl, taper = fade(t*24)*fade((1-t)*tipRange*22);
          if (taper<=0)continue;
          const center = sx+stalkLean*t+curve*Math.sin(t*Math.PI);
          const iy = wrap(Math.floor(sy+step), size);
          const radius = Math.ceil(strokeWidth+1);
          const baseX = Math.floor(center);
          const filament = 0.012*Math.sin(t*TAU*2+wav*TAU);
          const leanSlope = (stalkLean + curve*Math.PI*Math.cos(t*Math.PI)) / fl;

          for (let dx = -radius; dx<=radius; dx++) {
            const ix = baseX+dx, d = Math.abs((ix+0.5)-center);
            const coverage = clamp(strokeWidth+0.5-d)*taper;
            if (coverage<=0)continue;
            const i = iy*size+wrap(ix, size), o = i*3, alpha = 0.72*coverage;
            for (let c = 0; c<3; c++) {
              const multiplier = c===0?1: c===1?0.82: 0.67;
              const goal = palette[c]+(tone+filament)*multiplier;
              color[o+c]+=(goal-color[o+c])*alpha;
            }
            const cross = clamp(1-d/(strokeWidth+0.6));
            fiberRelief[i] = Math.max(fiberRelief[i], p.strandLift*cross*taper);

            // A reed is rounded across its width. Preserve the direction
            // of the visible stalk while keeping this out of displacement.
            const across = clamp((ix + 0.5 - center) / (strokeWidth + 0.6), -1, 1);
            const radial = across * 0.75 * taper;

            microNormalX[i] += (radial - microNormalX[i]) * alpha;
            microNormalY[i] += (radial * leanSlope - microNormalY[i]) * alpha;

            roughness[i] = Math.min(roughness[i], dryRoughness);
          }
        }
      }
    }
  }
  // Keep long fibers in normals, but keep vertex displacement largely
  // independent of the irregular individual stalks.
  const height = new Float32Array(n);
  for (let y = 0; y<size; y++) {
    const row = y*size;
    for (let x = 0; x<size; x++) {
      const i = row+x;
      const smoothFiber = (fiberRelief[row+wrap(x-1, size)]+
      2*fiberRelief[i]+fiberRelief[row+wrap(x+1, size)])/4;
      height[i] = coarse[i]+smoothFiber*0.35;
    }
  }
  // Remove any net tilt introduced by overdraw ordering. A repeating mat
  // of vertical straw must not tilt the entire material to one side.
  let averageX = 0;
  let averageY = 0;

  for (let i = 0; i < n; i++) {
    averageX += microNormalX[i];
    averageY += microNormalY[i];
  }

  averageX /= n;
  averageY /= n;

  for (let i = 0; i < n; i++) {
    microNormalX[i] -= averageX;
    microNormalY[i] -= averageY;
  }

  return { color, height, coarse, roughness, microNormalX, microNormalY };
}
