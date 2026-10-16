import { field } from './random.js';

const clamp = (value) => Math.max(0, Math.min(255, value));

function realism(surface, { u, v, pigmentSeed }) {
  const broad = field(u, v, 7, 9, pigmentSeed ^ 0x89144d31) * 8;
  const fine = field(u, v, 43, 39, pigmentSeed) * 4;
  const tone = (surface.height - 0.5) * 15 + broad + fine - surface.edge * 7;

  return surface.color.map((channel) => clamp(channel + tone));
}

function painted(surface, { u, v, pigmentSeed }) {
  // Painted volumes, warm highlights and cool recesses rather than photographic
  // grain with a small saturation/quantization adjustment.
  const mass = field(u, v, 7, 6, pigmentSeed ^ 0x9718ab32);
  const washes = field(u, v, 15, 12, pigmentSeed ^ 0x1de63a51);
  const longBrush = field(u, v, 39, 17, pigmentSeed ^ 0xa8b3c941);
  const shortBrush = field(u, v, 67, 49, pigmentSeed ^ 0x51b7142d);
  const luminance = surface.color[0] * 0.299 +
    surface.color[1] * 0.587 + surface.color[2] * 0.114;
  const shadow = Math.max(0, (0.53 - surface.height) * 2.4);
  const highlight = Math.max(0, (surface.height - 0.46) * 1.65);
  const contour = Math.min(1, surface.edge * 1.3);
  const brush = mass * 21 + washes * 16 + longBrush * 10 + shortBrush * 3;
  const volume = highlight * 38 - shadow * 33 - contour * 24;
  const paintedValue = Math.round((luminance + brush + volume) / 13) * 13;
  const warm = Math.min(1, highlight + Math.max(0, mass) * 0.27);
  const cool = Math.min(1, shadow + contour * 0.5);

  return surface.color.map((channel, i) => {
    const chroma = (channel - luminance) * 1.36;
    const temperature = [16, 8, -11][i] * warm +
      [-16, -3, 23][i] * cool;

    return clamp(paintedValue + chroma + temperature);
  });
}

const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function retro(surface, { x, y }) {
  const dither = (bayer[y % 4][x % 4] / 15 - 0.5) * 20;
  const tone = (surface.height - 0.5) * 20 - surface.edge * 12;

  return surface.color.map((channel) => {
    const value = (channel - 128) * 1.05 + 128 + tone + dither;
    return clamp(Math.round(value / 32) * 32);
  });
}

export const styles = Object.freeze({
  'stylized-realism': {
    label: 'Stylized Realism',
    pixelSize: 1,
    grammar: { density: 1, irregularity: 1, edgeWidth: 1, detail: 1 },
    paint: realism,
    normalStrength: 3.2,
  },
  'hand-painted-fantasy': {
    label: 'Hand-Painted Fantasy',
    pixelSize: 1,
    grammar: { density: 0.8, irregularity: 1.45, edgeWidth: 1.45, detail: 0.28, painted: true },
    paint: painted,
    normalStrength: 1.4,
  },
  'retro-3d': {
    label: 'Retro 3D',
    pixelSize: 4,
    grammar: { density: 0.56, irregularity: 0.5, edgeWidth: 1.7, detail: 0.28 },
    paint: retro,
    normalStrength: 1.4,
  },
});
