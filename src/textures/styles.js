import { field } from './random.js';

const clamp = (value) => Math.max(0, Math.min(255, value));

function realism(surface, { u, v, pigmentSeed }) {
  const broad = field(u, v, 7, 9, pigmentSeed ^ 0x89144d31) * 8;
  const fine = field(u, v, 43, 39, pigmentSeed) * 4;
  const tone = (surface.height - 0.5) * 15 + broad + fine - surface.edge * 7;

  return surface.color.map((channel) => clamp(channel + tone));
}

function painted(surface, { u, v, pigmentSeed }) {
  const wash = field(u, v, 9, 7, pigmentSeed ^ 0x9718ab32) * 15;
  const brush = field(u, v, 25, 19, pigmentSeed) * 9;
  const form = Math.round(surface.height * 6) / 6;
  const tone = (form - 0.5) * 28 + wash + brush - surface.edge * 10;

  return surface.color.map((channel) => {
    const saturated = (channel - 128) * 1.1 + 128;
    return clamp(Math.round((saturated + tone) / 7) * 7);
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
