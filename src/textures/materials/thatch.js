// Original overlapping reed-bundle texture, kept independent of artstyle presets.
// Native raster: 512 px. Preview resolutions are box-filtered from that raster.

const SIZE = 512;

const fract = (value) => value - Math.floor(value);
const wrap = (value, size) => ((value % size) + size) % size;
const mix = (a, b, t) => a * (1 - t) + b * t;
const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));
const smooth = (value) => value * value * (3 - 2 * value);

function hash(x, y, seed) {
  let value = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;

  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

// Tileable noise adds fine fiber dust and weathering, without roof-tile rows.
function periodicNoise(x, y, cells, seed) {
  const u = x * cells / SIZE;
  const v = y * cells / SIZE;
  const cx = Math.floor(u);
  const cy = Math.floor(v);
  const fx = smooth(fract(u));
  const fy = smooth(fract(v));
  const a = hash(wrap(cx, cells), wrap(cy, cells), seed);
  const b = hash(wrap(cx + 1, cells), wrap(cy, cells), seed);
  const c = hash(wrap(cx, cells), wrap(cy + 1, cells), seed);
  const d = hash(wrap(cx + 1, cells), wrap(cy + 1, cells), seed);

  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

// Independent bundles of tapered straw overlap instead of forming courses.
function renderThatch(seeds) {
  const count = SIZE * SIZE;
  const albedo = new Float32Array(count * 3);
  const height = new Float32Array(count);
  const roughness = new Float32Array(count);
  const pattern = seeds.pattern >>> 0;
  const color = seeds.color >>> 0;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = y * SIZE + x;
      const broad = periodicNoise(x, y, 7, color ^ 0x56430b2d) - 0.5;
      const medium = periodicNoise(x, y, 29, color ^ 0x4e8a16cc) - 0.5;
      const fine = periodicNoise(x, y, 79, pattern ^ 0x193ae587) - 0.5;
      const grain = hash(x, y, color ^ 0x72de20f3) - 0.5;
      const tone = broad * 0.17 + medium * 0.075 + fine * 0.044 + grain * 0.037;

      albedo[index * 3] = 0.49 + tone;
      albedo[index * 3 + 1] = 0.36 + tone * 0.80;
      albedo[index * 3 + 2] = 0.215 + tone * 0.65;
      height[index] = 0.16 + medium * 0.055 + fine * 0.038;
      roughness[index] = 0.91 + medium * 0.05 + fine * 0.025 + grain * 0.02;
    }
  }

  let state = (pattern ^ 0xa56be231) >>> 0;

  function random() {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  for (let bundle = 0; bundle < 1850; bundle++) {
    const cx = random() * SIZE;
    const cy = random() * SIZE;
    const spread = 5 + random() * 12;
    const tilt = (random() - 0.5) * 0.24;
    const sway = (random() - 0.5) * 6;
    const bundleTone = (hash(bundle, 0, color ^ 0x8f1a4dc7) - 0.5) * 0.21;
    const strands = 8 + Math.floor(random() * 10);

    for (let fiber = 0; fiber < strands; fiber++) {
      const startX = cx + (random() - 0.5) * spread;
      const startY = cy + (random() - 0.5) * 18;
      const length = 18 + random() * 72;
      const bend = (random() - 0.5) * 4;
      const width = 0.46 + random() * 1.05;
      const strandTone = bundleTone + (hash(bundle, fiber, color) - 0.5) * 0.18;
      const red = clamp(0.48 + strandTone, 0.25, 0.72);
      const green = clamp(0.36 + strandTone * 0.81, 0.18, 0.60);
      const blue = clamp(0.20 + strandTone * 0.66, 0.09, 0.40);
      const ridge = 0.27 + random() * 0.20;
      const direction = tilt + (random() - 0.5) * 0.14;
      const steps = Math.ceil(length);

      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const tip = Math.min(1, step / 4, (steps - step) / 8);

        if (tip <= 0) continue;

        const y = wrap(Math.floor(startY + step), SIZE);
        const centerX = startX + direction * step + (sway + bend) * Math.sin(t * Math.PI);
        const minX = Math.floor(centerX - width - 1);
        const maxX = Math.ceil(centerX + width + 1);

        for (let x = minX; x <= maxX; x++) {
          const distance = Math.abs((x + 0.5) - centerX);
          const coverage = clamp(width + 0.5 - distance, 0, 1) * tip;

          if (coverage <= 0) continue;

          const index = y * SIZE + wrap(x, SIZE);
          const alpha = coverage * 0.74;
          const offset = index * 3;

          albedo[offset] = mix(albedo[offset], red, alpha);
          albedo[offset + 1] = mix(albedo[offset + 1], green, alpha);
          albedo[offset + 2] = mix(albedo[offset + 2], blue, alpha);

          const center = 1 - clamp(distance / (width + 0.25), 0, 1);
          height[index] = mix(height[index], 0.18 + ridge * center, alpha * 0.8);
          roughness[index] = mix(roughness[index], 0.86 + strandTone * 0.10, alpha * 0.65);
        }
      }
    }
  }

  return { albedo, height, roughness };
}

let lastThatch = null;

function thatchData(seeds) {
  if (!lastThatch ||
      lastThatch.pattern !== seeds.structure ||
      lastThatch.color !== seeds.pigment) {
    lastThatch = {
      pattern: seeds.structure,
      color: seeds.pigment,
      data: renderThatch({ pattern: seeds.structure, color: seeds.pigment }),
    };
  }

  return lastThatch.data;
}

function packTextures(source, size) {
  // Filter the native 512 px raster for lower-resolution previews.
  const step = SIZE / size;
  const count = size * size;
  const albedo = new Uint8Array(count * 4);
  const roughness = new Uint8Array(count * 4);
  const height = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const heights = new Float32Array(count);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const dst = p * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let z = 0;
      let rough = 0;

      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const src = (y * step + dy) * SIZE + x * step + dx;

          r += source.albedo[src * 3];
          g += source.albedo[src * 3 + 1];
          b += source.albedo[src * 3 + 2];
          z += source.height[src];
          rough += source.roughness[src];
        }
      }

      const samples = step * step;
      albedo[dst] = Math.round(clamp(r / samples * 255));
      albedo[dst + 1] = Math.round(clamp(g / samples * 255));
      albedo[dst + 2] = Math.round(clamp(b / samples * 255));
      heights[p] = z / samples;
      const heightByte = Math.round(clamp(heights[p] * 255));
      const roughnessByte = Math.round(clamp(rough / samples, 0, 1) * 255);

      for (let channel = 0; channel < 3; channel++) {
        height[dst + channel] = heightByte;
        roughness[dst + channel] = roughnessByte;
      }

      albedo[dst + 3] = 255;
      height[dst + 3] = 255;
      roughness[dst + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = heights[y * size + wrap(x - 1, size)];
      const right = heights[y * size + wrap(x + 1, size)];
      const up = heights[wrap(y - 1, size) * size + x];
      const down = heights[wrap(y + 1, size) * size + x];
      const dx = (right - left) * 1.8;
      const dy = (down - up) * 1.8;
      const length = Math.hypot(dx, dy, 1);
      const dst = (y * size + x) * 4;

      normal[dst] = Math.round((1 - dx / length) * 127.5);
      normal[dst + 1] = Math.round((1 - dy / length) * 127.5);
      normal[dst + 2] = Math.round((1 + 1 / length) * 127.5);
      normal[dst + 3] = 255;
    }
  }

  return { width: size, height: size, maps: { albedo, normal, roughness, height } };
}

export const thatch = {
  label: 'Reed Thatch',

  generate({ size, seeds }) {
    return packTextures(thatchData(seeds), size);
  },
};
