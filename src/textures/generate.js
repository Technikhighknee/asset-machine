import { oak } from './materials/oak.js';
import { stone } from './materials/stone.js';
import { deriveSeed, field, random } from './random.js';

const materials = Object.freeze({
  'oak-wood': oak,
  'rubble-stone': stone,
});

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));

function setPixel(image, index, color) {
  const offset = index * 4;

  image[offset] = clamp(color[0]);
  image[offset + 1] = clamp(color[1]);
  image[offset + 2] = clamp(color[2]);
  image[offset + 3] = 255;
}

// Keep the outermost texels identical in both axes, including the corner.
function closeEdges(image, resolution) {
  const last = resolution - 1;
  const rowBytes = resolution * 4;

  for (let y = 0; y < last; y++) {
    const row = y * rowBytes;
    image.set(image.subarray(row, row + 4), row + last * 4);
  }

  image.set(image.subarray(0, rowBytes), last * rowBytes);
}

export function textureCatalog() {
  return {
    materials: Object.entries(materials).map(([id, material]) => ({
      id,
      label: material.label,
    })),
    maps: ['albedo', 'normal', 'roughness', 'height'],
  };
}

export function generateTexture({
  material: materialId,
  seed = 0,
  seeds: overrides = {},
  size = 256,
} = {}) {
  const material = materials[materialId];

  if (!material) throw new RangeError('Unknown material');

  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be an unsigned 32-bit integer');
  }

  if (![128, 256, 512].includes(size)) {
    throw new RangeError('Texture size must be 128, 256, or 512');
  }

  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('Seeds must be an object');
  }

  const roles = ['structure', 'pigment', 'weather'];

  if (Object.keys(overrides).some((role) => !roles.includes(role))) {
    throw new RangeError('Unknown seed role');
  }

  const seeds = {};

  for (const role of roles) {
    const value = overrides[role] ?? deriveSeed(seed, materialId + ':' + role);

    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError('Each seed must be an unsigned 32-bit integer');
    }

    seeds[role] = value;
  }

  const sample = material.create({
    structure: random(seeds.structure),
    pigment: random(seeds.pigment),
    weather: random(seeds.weather),
    seeds,
  });

  const resolution = size;
  const period = resolution - 1;
  const pixels = resolution * resolution;

  const albedo = new Uint8Array(pixels * 4);
  const roughness = new Uint8Array(pixels * 4);
  const normals = new Uint8Array(pixels * 4);
  const heightMap = new Uint8Array(pixels * 4);
  const heights = new Float32Array(pixels);

  for (let y = 0; y < period; y++) {
    for (let x = 0; x < period; x++) {
      const index = y * resolution + x;
      const u = x / period;
      const v = y / period;
      const surface = sample(u, v);

      const broad = field(u, v, 7, 9, seeds.pigment ^ 0x89144d31) * 8;
      const fine = field(u, v, 43, 39, seeds.pigment) * 4;
      const tone = (surface.height - 0.5) * 15 + broad + fine - surface.edge * 7;
      const color = surface.color.map((channel) => clamp(channel + tone));

      setPixel(albedo, index, color);

      const rough = clamp(surface.roughness * 255);
      setPixel(roughness, index, [rough, rough, rough]);

      heights[index] = surface.height;
      const height = clamp(surface.height * 255);
      setPixel(heightMap, index, [height, height, height]);
    }
  }

  for (let y = 0; y < period; y++) {
    for (let x = 0; x < period; x++) {
      const index = y * resolution + x;
      const left = heights[y * resolution + (x + period - 1) % period];
      const right = heights[y * resolution + (x + 1) % period];
      const up = heights[((y + period - 1) % period) * resolution + x];
      const down = heights[((y + 1) % period) * resolution + x];

      const dx = (left - right) * 3.2;
      const dy = (up - down) * 3.2;
      const length = Math.hypot(dx, dy, 1);

      setPixel(normals, index, [
        (dx / length * 0.5 + 0.5) * 255,
        (dy / length * 0.5 + 0.5) * 255,
        (1 / length * 0.5 + 0.5) * 255,
      ]);
    }
  }

  const maps = { albedo, normal: normals, roughness, height: heightMap };

  for (const image of Object.values(maps)) {
    closeEdges(image, resolution);
  }

  return { width: size, height: size, maps };
}
