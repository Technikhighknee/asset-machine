// One deliberately composed thatched-roof surface. No seeds or random state.
// Recipe dimensions are normalized, so preview and export show the same layout.
const REED = Object.freeze({
  columns: 46,
  courses: 13,
  strandOffsets: [
    -0.48, -0.42, -0.36, -0.30, -0.24, -0.18, -0.12, -0.06,
    0, 0.06, 0.12, 0.18, 0.24, 0.30, 0.36, 0.42, 0.48,
  ],
  bundleWidth: 0.033,
  bundleLength: 0.155,
  strandWidth: 0.00105,
  bundleLift: 0.008,
  strandLift: 0.0045,
  baseHeight: 0.5,
  baseColor: [0.403, 0.298, 0.168],
  strawColor: [0.483, 0.362, 0.214],
  baseRoughness: 0.925,
});

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const wrap = (v, size) => ((v % size) + size) % size;
const smooth = (t) => t * t * (3 - 2 * t);

export function makeReedSurface(size) {
  const count = size * size;
  const color = new Float32Array(count * 3);
  const height = new Float32Array(count);
  const roughness = new Float32Array(count);
  const exposure = new Float32Array(count);
  const p = REED;

  // Broad pigment and faded patches belong to color, not to geometry.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const tone = 0.078 * Math.sin(TAU * (u * 3 + v * 2)) +
        0.036 * Math.sin(TAU * (u * 9 - v * 5)) +
        0.012 * Math.cos(TAU * (u * 17 + v * 13));

      color[i * 3] = p.baseColor[0] + tone;
      color[i * 3 + 1] = p.baseColor[1] + tone * 0.84;
      color[i * 3 + 2] = p.baseColor[2] + tone * 0.64;
      height[i] = p.baseHeight;
      roughness[i] = p.baseRoughness;
    }
  }

  const span = p.bundleWidth * size;
  const lengthBase = p.bundleLength * size;

  for (let course = 0; course < p.courses; course++) {
    for (let column = 0; column < p.columns; column++) {
      const drift = Math.sin(course * 2.17 + column * 1.31);
      const x0 = (column + 0.45 + 0.13 * drift) / p.columns * size;
      const y0 = (course + 0.24 * Math.sin(column * 0.87 + course * 1.61)) /
        p.courses * size;
      const length = lengthBase * (0.88 + 0.2 *
        (0.5 + 0.5 * Math.sin(column * 1.44 + course * 2.58)));
      const lean = size * 0.006 * Math.sin(course * 1.37 + column * 0.71);
      const bow = size * 0.0025 * Math.sin(course * 1.95 + column * 2.36);

      // One shallow, continuous crown per sheaf. Bundle overlaps never
      // accumulate as random stacks or jagged height spikes.
      const extent = Math.ceil(length);
      const radius = Math.ceil(span * 0.52);

      for (let step = 0; step < extent; step++) {
        const t = step / extent;
        const fade = smooth(clamp(t * 9)) * smooth(clamp((1 - t) * 7));
        const centerX = x0 + lean * t + bow * Math.sin(t * Math.PI);
        const cy = wrap(Math.floor(y0 + step), size);

        for (let dx = -radius; dx <= radius; dx++) {
          const across = Math.abs(dx) / (radius + 0.5);
          const crown = Math.pow(clamp(1 - across * across), 2) * fade;

          if (crown <= 0) continue;

          const cx = wrap(Math.floor(centerX + dx), size);
          const i = cy * size + cx;
          height[i] = Math.max(height[i], p.baseHeight + crown * p.bundleLift);
        }
      }

      // Fibers follow the sheaf; fixed offsets are art-directed, not sampled.
      for (let fiber = 0; fiber < p.strandOffsets.length; fiber++) {
        const across = p.strandOffsets[fiber];
        const phase = fiber * 2.399 + column * 0.613 + course * 1.057;
        const fx = x0 + across * span + size * 0.00055 * Math.sin(phase);
        const fy = y0 + length * 0.045 * Math.sin(phase * 1.7);
        const fl = length * (0.88 + 0.13 * Math.cos(phase));
        const lateral = lean + size * 0.0018 * Math.sin(phase * 0.7);
        const curve = bow + size * 0.0012 * Math.sin(phase * 1.1);
        const width = Math.max(0.6, p.strandWidth * size *
          (0.84 + 0.32 * (0.5 + 0.5 * Math.sin(phase * 1.9))));
        const pigment = 0.08 * Math.sin(phase * 1.4) +
          0.035 * Math.cos(phase * 2.3);
        const samples = Math.ceil(fl);

        for (let step = 0; step <= samples; step++) {
          const t = step / samples;
          const tip = smooth(clamp(t * 15)) * smooth(clamp((1 - t) * 10));

          if (tip <= 0) continue;

          const cy = wrap(Math.floor(fy + step), size);
          const cx = fx + lateral * t + curve * Math.sin(t * Math.PI);
          const radius = Math.ceil(width + 1);

          for (let dx = -radius; dx <= radius; dx++) {
            const x = Math.floor(cx + dx);
            const dist = Math.abs((x + 0.5) - cx);
            const coverage = clamp(width + 0.5 - dist) * tip;

            if (coverage <= 0) continue;

            const i = cy * size + wrap(x, size);
            const offset = i * 3;
            const alpha = coverage * 0.57;
            const fiberTone = pigment + 0.009 * Math.sin(t * TAU * 2 + phase);

            for (let c = 0; c < 3; c++) {
              const tint = c === 0 ? 1 : c === 1 ? 0.82 : 0.62;
              const pigmentColor = p.strawColor[c] + fiberTone * tint;

              color[offset + c] += (pigmentColor - color[offset + c]) * alpha;
            }

            // The fiber ridge is part of the same envelope as the sheaf.
            // Max composition deliberately prevents additive micro-spikes.
            const transverse = clamp(1 - dist / (width + 0.5));
            const ridge = p.strandLift * transverse * transverse * tip;
            const crown = p.bundleLift *
              Math.pow(clamp(1 - Math.pow(across * 1.65, 2)), 2);

            height[i] = Math.max(height[i],
              p.baseHeight + crown + ridge);
            exposure[i] = Math.max(exposure[i], coverage);
          }
        }
      }
    }
  }

  for (let i = 0; i < count; i++) {
    roughness[i] = clamp(p.baseRoughness - exposure[i] * 0.035, 0.82, 0.98);
  }

  // Smooth the geometric ridge edges across the straw, then farther along
  // each fiber. Pigment stays untouched and every axis wraps at the tile edge.
  const horizontal = new Float32Array(count);

  for (let y = 0; y < size; y++) {
    const row = y * size;

    for (let x = 0; x < size; x++) {
      horizontal[row + x] = (
        height[row + wrap(x - 2, size)] +
        height[row + wrap(x - 1, size)] * 4 +
        height[row + x] * 6 +
        height[row + wrap(x + 1, size)] * 4 +
        height[row + wrap(x + 2, size)]
      ) / 16;
    }
  }

  for (let y = 0; y < size; y++) {
    const above2 = wrap(y - 2, size) * size;
    const above1 = wrap(y - 1, size) * size;
    const below1 = wrap(y + 1, size) * size;
    const below2 = wrap(y + 2, size) * size;

    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      height[i] = (
        horizontal[above2 + x] +
        horizontal[above1 + x] * 4 +
        horizontal[i] * 6 +
        horizontal[below1 + x] * 4 +
        horizontal[below2 + x]
      ) / 16;
    }
  }

  return { color, height, roughness };
}
