import { oak } from './materials/oak.js';
import { stone } from './materials/stone.js';
import { deriveSeed, random } from './random.js';
import { styles } from './styles.js';

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

export function textureCatalog() {
  return {
    materials: Object.entries(materials).map(([id, material]) => ({
      id,
      label: material.label,
    })),
    styles: Object.entries(styles).map(([id, style]) => ({
      id,
      label: style.label,
    })),
    maps: ['albedo', 'normal', 'roughness'],
  };
}

export function generateTexture({
  material: materialId,
  style: styleId = 'stylized-realism',
  seed = 0,
  seeds: overrides = {},
  size = 256,
} = {}) {
  const material = materials[materialId];
  const style = styles[styleId];

  if (!material) throw new RangeError('Unknown material');
  if (!style) throw new RangeError('Unknown artstyle');

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
    style,
    seeds,
  });

  const step = style.pixelSize;
  const resolution = size / step;
  const pixels = resolution * resolution;

  const albedo = new Uint8Array(pixels * 4);
  const roughness = new Uint8Array(pixels * 4);
  const normals = new Uint8Array(pixels * 4);
  const heights = new Float32Array(pixels);

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const index = y * resolution + x;
      const u = x / resolution;
      const v = y / resolution;
      const surface = sample(u, v);

      const color = style.paint(surface, {
        x,
        y,
        u,
        v,
        pigmentSeed: seeds.pigment,
      });

      setPixel(albedo, index, color);

      const rough = clamp(surface.roughness * 255);
      setPixel(roughness, index, [rough, rough, rough]);

      heights[index] = surface.height;
    }
  }

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const index = y * resolution + x;
      const left = heights[y * resolution + (x + resolution - 1) % resolution];
      const right = heights[y * resolution + (x + 1) % resolution];
      const up = heights[((y + resolution - 1) % resolution) * resolution + x];
      const down = heights[((y + 1) % resolution) * resolution + x];

      const dx = (left - right) * style.normalStrength;
      const dy = (up - down) * style.normalStrength;
      const length = Math.hypot(dx, dy, 1);

      setPixel(normals, index, [
        (dx / length * 0.5 + 0.5) * 255,
        (dy / length * 0.5 + 0.5) * 255,
        (1 / length * 0.5 + 0.5) * 255,
      ]);
    }
  }

  const maps = { albedo, normal: normals, roughness };

  if (step === 1) {
    return { width: size, height: size, maps };
  }

  const expanded = {};

  for (const [name, pixels] of Object.entries(maps)) {
    const image = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const source = (Math.floor(y / step) * resolution + Math.floor(x / step)) * 4;
        image.set(pixels.subarray(source, source + 4), (y * size + x) * 4);
      }
    }

    expanded[name] = image;
  }

  return { width: size, height: size, maps: expanded };
}
