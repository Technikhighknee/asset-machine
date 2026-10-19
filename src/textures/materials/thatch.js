// Original overlapping reed-bundle texture, kept independent of artstyle presets.
// Native raster: 2048 px. Smaller previews are box-filtered from it.

const BASE_SIZE = 512;
const SIZE = 2048;
const SCALE = SIZE / BASE_SIZE;

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
  const coverage = new Float32Array(count);
  const pattern = seeds.pattern >>> 0;
  const color = seeds.color >>> 0;
  const weather = seeds.weather >>> 0;

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
      // Material relief depends on the structure seed, never the pigment.
      const bedding = periodicNoise(x, y, 29, pattern ^ 0x4e8a16cc) - 0.5;
      const fibers = periodicNoise(x, y, 79, pattern ^ 0x193ae587) - 0.5;
      const weathering = periodicNoise(x, y, 21, weather ^ 0x7cbf9ab3) - 0.5;

      height[index] = 0.16 + bedding * 0.042 + fibers * 0.022;
      roughness[index] = clamp(0.89 + bedding * 0.035 + weathering * 0.070, 0.72, 0.99);
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
    const spread = (5 + random() * 12) * SCALE;
    const tilt = (random() - 0.5) * 0.24;
    const sway = (random() - 0.5) * 6 * SCALE;
    const bundleTone = (hash(bundle, 0, color ^ 0x8f1a4dc7) - 0.5) * 0.21;
    const strands = 8 + Math.floor(random() * 10);

    for (let fiber = 0; fiber < strands; fiber++) {
      const startX = cx + (random() - 0.5) * spread;
      const startY = cy + (random() - 0.5) * 18 * SCALE;
      const length = (18 + random() * 72) * SCALE;
      const bend = (random() - 0.5) * 4 * SCALE;
      const width = (0.46 + random() * 1.05) * SCALE;
      const strandTone = bundleTone + (hash(bundle, fiber, color) - 0.5) * 0.18;
      const red = clamp(0.48 + strandTone, 0.25, 0.72);
      const green = clamp(0.36 + strandTone * 0.81, 0.18, 0.60);
      const blue = clamp(0.20 + strandTone * 0.66, 0.09, 0.40);
      const ridge = 0.27 + random() * 0.20;
      const direction = tilt + (random() - 0.5) * 0.14;
      const steps = Math.ceil(length);

      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const tip = Math.min(1, step / (4 * SCALE), (steps - step) / (8 * SCALE));

        if (tip <= 0) continue;

        const y = wrap(Math.floor(startY + step), SIZE);
        const centerX = startX + direction * step + (sway + bend) * Math.sin(t * Math.PI);
        const minX = Math.floor(centerX - width - SCALE);
        const maxX = Math.ceil(centerX + width + SCALE);

        for (let x = minX; x <= maxX; x++) {
          const distance = Math.abs((x + 0.5) - centerX);
          const coverage = clamp((width + SCALE * 0.5 - distance) / SCALE, 0, 1) * tip;

          if (coverage <= 0) continue;

          const index = y * SIZE + wrap(x, SIZE);
          const alpha = coverage * 0.74;
          const offset = index * 3;

          albedo[offset] = mix(albedo[offset], red, alpha);
          albedo[offset + 1] = mix(albedo[offset + 1], green, alpha);
          albedo[offset + 2] = mix(albedo[offset + 2], blue, alpha);

          const center = 1 - clamp(distance / (width + 0.25 * SCALE), 0, 1);
          // The raised fiber cross-section is the common source of the PBR relief.
          height[index] = mix(height[index], 0.18 + ridge * center, alpha * 0.8);
          coverage[index] = mix(coverage[index], 1, alpha);
          roughness[index] = mix(
            roughness[index],
            0.87 - center * 0.045 + (1 - tip) * 0.065,
            alpha * 0.65,
          );
        }
      }
    }
  }

  return { albedo, height, roughness, coverage };
}

let lastThatch = null;

function thatchData(seeds) {
  if (!lastThatch ||
      lastThatch.pattern !== seeds.structure ||
      lastThatch.color !== seeds.pigment ||
      lastThatch.weather !== seeds.weather) {
    lastThatch = {
      pattern: seeds.structure,
      color: seeds.pigment,
      weather: seeds.weather,
      data: renderThatch({
        pattern: seeds.structure,
        color: seeds.pigment,
        weather: seeds.weather,
      }),
    };
  }

  return lastThatch.data;
}

function packTextures(source, size) {
  const step = SIZE / size;

  if (!Number.isInteger(step) || step < 1) {
    throw new RangeError('Thatch resolution must divide 2048');
  }

  const count = size * size;
  const albedo = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const roughness = new Uint8Array(count * 4);
  const height = new Uint8Array(count * 4);
  const ao = new Uint8Array(count * 4);
  const cavity = new Uint8Array(count * 4);
  const height16 = new Uint16Array(count);
  const heights = new Float32Array(count);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const dst = p * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let level = 0;
      let rough = 0;
      let exposed = 0;

      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const src = (y * step + dy) * SIZE + x * step + dx;

          red += source.albedo[src * 3];
          green += source.albedo[src * 3 + 1];
          blue += source.albedo[src * 3 + 2];
          level += source.height[src];
          rough += source.roughness[src];
          exposed += source.coverage[src];
        }
      }

      const samples = step * step;
      heights[p] = level / samples;
      height16[p] = Math.round(clamp(heights[p], 0, 1) * 65535);

      albedo[dst] = Math.round(clamp(red / samples * 255));
      albedo[dst + 1] = Math.round(clamp(green / samples * 255));
      albedo[dst + 2] = Math.round(clamp(blue / samples * 255));

      // Exposed strands are slightly less rough than the compressed bedding.
      const roughnessValue = clamp(
        rough / samples + (1 - exposed / samples) * 0.045, 0.68, 0.99,
      );
      const roughnessByte = Math.round(roughnessValue * 255);
      const heightByte = Math.round(clamp(heights[p], 0, 1) * 255);

      for (let channel = 0; channel < 3; channel++) {
        roughness[dst + channel] = roughnessByte;
        height[dst + channel] = heightByte;
      }

      albedo[dst + 3] = 255;
      roughness[dst + 3] = 255;
      height[dst + 3] = 255;
    }
  }

  // All spatial derivatives use the same full-precision height surface.
  // Wrapped neighbors keep the maps tileable without artificially welding edges.
  const at = (x, y) => heights[wrap(y, size) * size + wrap(x, size)];
  const normalStrength = 1.8 * size / BASE_SIZE;
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const dst = p * 4;
      const center = heights[p];

      const left = at(x - 1, y);
      const right = at(x + 1, y);
      const up = at(x, y - 1);
      const down = at(x, y + 1);
      const dx = (right - left) * normalStrength;
      const dy = (down - up) * normalStrength;
      const length = Math.hypot(dx, dy, 1);

      // OpenGL convention (+Y), as used by Blender and Three.js.
      normal[dst] = Math.round((1 - dx / length) * 127.5);
      normal[dst + 1] = Math.round((1 - dy / length) * 127.5);
      normal[dst + 2] = Math.round((1 + 1 / length) * 127.5);
      normal[dst + 3] = 255;

      // Small-scale concavity and broader horizon occlusion are approximated
      // from the height field; neither is baked into base color.
      let localRecess = 0;
      let horizon = 0;

      for (const [sx, sy] of directions) {
        const nearby = at(x + sx, y + sy);
        localRecess += Math.max(0, nearby - center);

        for (const radius of [4, 16, 48]) {
          const distant = at(x + sx * radius, y + sy * radius);
          horizon += Math.max(0, distant - center) / (0.024 + radius * 0.0035);
        }
      }

      const cavityValue = clamp(1 - localRecess / 8 * 9.5, 0.28, 1);
      const aoValue = clamp(1 - horizon / (directions.length * 3) * 0.47, 0.35, 1);
      const cavityByte = Math.round(cavityValue * 255);
      const aoByte = Math.round(aoValue * 255);

      for (let channel = 0; channel < 3; channel++) {
        cavity[dst + channel] = cavityByte;
        ao[dst + channel] = aoByte;
      }

      cavity[dst + 3] = 255;
      ao[dst + 3] = 255;
    }
  }

  return {
    width: size,
    height: size,
    maps: { albedo, normal, roughness, height, ao, cavity },
    height16,
  };
}

export const thatch = {
  label: 'Reed Thatch',

  generate({ size, seeds }) {
    return packTextures(thatchData(seeds), size);
  },
};
