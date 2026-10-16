import { field } from './random.js';

const clamp = (value) => Math.max(0, Math.min(255, value));

function realism(surface, { u, v, pigmentSeed }) {
  const fine = field(u, v, 69, 73, pigmentSeed) * 11;
  const broad = field(u, v, 9, 11, pigmentSeed ^ 0x89144d31) * 12;
  const light = (surface.height - 0.5) * 24 + surface.detail * 8 + fine + broad;

  return surface.color.map((channel) => clamp(channel + light - surface.edge * 15));
}

function painted(surface, { u, v, pigmentSeed }) {
  const strokes = field(u, v, 28, 19, pigmentSeed) * 20;
  const brush = field(u, v, 8, 7, pigmentSeed ^ 0x9718ab32) * 24;
  const shape = Math.round((surface.height + surface.detail * 0.15) * 5) / 5;
  const lighting = (shape - 0.5) * 42 + strokes + brush - surface.edge * 32;

  return surface.color.map((channel) => {
    const saturated = (channel - 128) * 1.17 + 128;
    return clamp(Math.round((saturated + lighting) / 6) * 6);
  });
}

const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function retro(surface, { x, y }) {
  const dither = (bayer[y % 4][x % 4] / 15 - 0.5) * 22;
  const light = (surface.height - 0.5) * 28 - surface.edge * 20;

  return surface.color.map((channel) => {
    const value = (channel - 128) * 1.08 + 128 + light + dither;
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
    grammar: { density: 0.72, irregularity: 1.4, edgeWidth: 1.3, detail: 0.6 },
    paint: painted,
    normalStrength: 2.1,
  },
  'retro-3d': {
    label: 'Retro 3D',
    pixelSize: 4,
    grammar: { density: 0.56, irregularity: 0.5, edgeWidth: 1.7, detail: 0.28 },
    paint: retro,
    normalStrength: 1.4,
  },
});
