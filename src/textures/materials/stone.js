import { field, fbm, hash } from '../random.js';

const families = [
  [[148, 137, 119], [126, 126, 120], [166, 150, 129], [118, 115, 107], [149, 140, 127]],
  [[141, 146, 145], [116, 126, 130], [160, 153, 139], [104, 112, 116], [145, 139, 130]],
  [[162, 143, 120], [124, 113, 98], [156, 137, 112], [126, 122, 115], [174, 155, 131]],
  [[135, 127, 116], [114, 116, 111], [157, 153, 141], [130, 124, 109], [102, 106, 107]],
];

const clamp = (v) => Math.max(0, Math.min(1, v));
const wrap = (v) => ((v % 1) + 1) % 1;
const mix = (a, b, t) => a + (b - a) * t;

function smooth(a, b, v) {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function courses(structure, density, seed) {
  const rows = Math.max(3, Math.round(structure.int(4, 9) * density));
  const rowWeights = Array.from({ length: rows }, () => structure.range(0.6, 1.45));
  const totalHeight = rowWeights.reduce((a, b) => a + b);
  const rowsData = [];
  let top = 0;

  for (let y = 0; y < rows; y++) {
    const bottom = y === rows - 1 ? 1 : top + rowWeights[y] / totalHeight;
    const count = Math.max(2, Math.round(structure.int(3, 9) * density));
    const widths = Array.from({ length: count }, () => structure.range(0.45, 1.8));
    const totalWidth = widths.reduce((a, b) => a + b);
    const stones = [];
    let left = 0;

    for (let x = 0; x < count; x++) {
      const right = left + widths[x] / totalWidth;
      stones.push({ left, right, id: y * 100 + x });
      left = right;
    }

    rowsData.push({ top, bottom, stones, shift: structure.float() });
    top = bottom;
  }

  return (u, v) => {
    const yy = wrap(v);
    const rowIndex = rowsData.findIndex((r) => yy < r.bottom);
    const row = rowsData[rowIndex];
    const xx = wrap(u + row.shift);
    const stone = row.stones.find((s) => xx < s.right) || row.stones.at(-1);
    const left = (xx - stone.left) / (stone.right - stone.left);
    const across = (yy - row.top) / (row.bottom - row.top);
    const edge = Math.min(left, 1 - left, across, 1 - across);
    const corner = Math.min(left, 1 - left) + Math.min(across, 1 - across);

    return { id: stone.id, edge: Math.min(edge, corner * 0.64), positionX: left, positionY: across };
  };
}

function irregularStones(structure, density, seed, rounded) {
  const cols = Math.max(3, Math.round(structure.int(4, rounded ? 7 : 10) * density));
  const rows = Math.max(3, Math.round(structure.int(4, rounded ? 7 : 9) * density));
  const aspect = structure.range(0.85, rounded ? 1.14 : 1.48);
  const centers = [];
  let id = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (structure.float() < 0.2) continue;

      centers.push({
        x: (x + 0.5 + structure.range(-0.43, 0.43)) / cols,
        y: (y + 0.5 + structure.range(-0.43, 0.43)) / rows,
        radius: structure.range(0.55, 1.7),
        id: id++,
      });
    }
  }

  return (u, v) => {
    let first = Infinity;
    let second = Infinity;
    let chosen = centers[0];
    let nearestDx = 0;
    let nearestDy = 0;

    for (const center of centers) {
      const dx = wrap(u - center.x + 0.5) - 0.5;
      const dy = wrap(v - center.y + 0.5) - 0.5;
      const scaledX = dx * cols / aspect;
      const scaledY = dy * rows * aspect;
      const distance = Math.hypot(scaledX, scaledY) / center.radius;

      if (distance < first) {
        second = first;
        first = distance;
        chosen = center;
        nearestDx = scaledX;
        nearestDy = scaledY;
      } else if (distance < second) {
        second = distance;
      }
    }

    return {
      id: chosen.id,
      edge: (second - first) * 0.58,
      positionX: nearestDx,
      positionY: nearestDy,
    };
  };
}

export const stone = {
  label: 'Rubble Masonry',

  create({ structure, pigment, weather, style, seeds }) {
    const grammar = style.grammar;
    const layout = structure.int(0, 2);
    const findStone = layout === 0
      ? courses(structure, grammar.density, seeds.structure)
      : irregularStones(structure, grammar.density, seeds.structure, layout === 2);

    const width = structure.range(0.008, 0.017) * grammar.edgeWidth;
    const bevelSize = structure.range(0.055, 0.095);
    const warpStrength = structure.range(0.022, 0.058) * grammar.irregularity;
    const colors = pigment.pick(families);
    const mortarTone = pigment.range(0.66, 0.74);
    const mortar = colors[0].map((c) => c * mortarTone);
    const aging = weather.range(0.07, 0.26);

    const profiles = new Map();

    function profile(id) {
      if (profiles.has(id)) return profiles.get(id);

      const color = colors[Math.floor(hash(id, 0, seeds.pigment ^ 0x852dad2b) * colors.length)];
      const lightness = mix(0.86, 1.12, hash(id, 1, seeds.pigment));
      const rocky = hash(id, 0, seeds.structure ^ 0x135127ab);
      const angle = hash(id, 1, seeds.structure ^ 0x3ad9f276) * Math.PI * 2;
      const data = {
        color: color.map((c) => c * lightness),
        rockiness: rocky,
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        pitting: hash(id, 3, seeds.structure ^ 0xf27a5109),
        cracked: hash(id, 4, seeds.structure ^ 0x61f927ad) > 0.7 ? 1 : 0,
        striation: hash(id, 5, seeds.structure ^ 0x27b167da),
      };

      profiles.set(id, data);
      return data;
    }

    return (u, v) => {
      const macroX = fbm(u, v, 7, 8, seeds.structure ^ 0x7151e6b2, 3);
      const macroY = fbm(u, v, 8, 7, seeds.structure ^ 0x59375db9, 3);
      const micro = field(u, v, 45, 43, seeds.structure ^ 0x863b7f14);
      const warpedU = u + macroX * warpStrength + micro * 0.004;
      const warpedV = v + macroY * warpStrength + micro * 0.004;
      const shape = findStone(warpedU, warpedV);
      const p = profile(shape.id);

      const broken = field(u, v, 63, 65, seeds.structure ^ 0x64f782b1);
      const gap = Math.max(0, shape.edge + broken * width * 0.45);
      const joint = 1 - smooth(width * 0.38, width, gap);
      const bevel = smooth(width * 0.75, width + bevelSize, gap);

      const roughMacro = fbm(u, v, 23, 26, seeds.structure ^ 0x1487b2a9, 5);
      const roughMid = fbm(u, v, 77, 71, seeds.structure ^ 0x57f2179a, 3);
      const roughFine = field(u, v, 189, 173, seeds.structure ^ 0xb6520a39);
      const lineX = shape.positionX - (layout === 0 ? 0.5 : 0);
      const lineY = shape.positionY - (layout === 0 ? 0.5 : 0);
      const along = lineX * p.cos + lineY * p.sin;
      const across = -lineX * p.sin + lineY * p.cos;
      const lineWarp = field(lineX, lineY, 13, 14, seeds.structure ^ Math.imul(shape.id, 0x41fba269));
      const crackLine = Math.abs(across + lineWarp * 0.065);
      const crack = (1 - smooth(0.009, 0.024, crackLine)) *
        (1 - smooth(0.15, 0.53, Math.abs(along))) * p.cracked;
      const pits = Math.max(0, roughMid - 0.26) * p.pitting;
      const localRelief = fbm(shape.positionX, shape.positionY, 17, 18, seeds.structure ^ Math.imul(shape.id, 0x31e45a77), 4);
      const stoneHeight = 0.51 + bevel * (0.23 + p.rockiness * 0.1) +
        roughMacro * 0.095 + roughMid * 0.06 + roughFine * 0.033 +
        localRelief * 0.1 - pits * 0.065 - crack * 0.13;

      const pigmentMacro = fbm(u, v, 16, 19, seeds.pigment ^ 0x2e81a549, 4);
      const grain = fbm(u, v, 105, 97, seeds.pigment ^ 0x7ad61b93, 3);
      const vein = Math.max(0, Math.abs(grain * 0.55 + pigmentMacro * 0.4) - 0.31);
      const stains = Math.max(0, fbm(u, v, 9, 8, seeds.weather ^ 0xe728691c, 3)) * aging;
      const localBands = fbm(shape.positionX, shape.positionY, 4, 6, seeds.pigment ^ Math.imul(shape.id, 0x623a09e7), 4);
      const localDetails = fbm(shape.positionX, shape.positionY, 21, 24, seeds.pigment ^ Math.imul(shape.id, 0x3ae28179), 4);
      const layers = Math.sin((along * 15 + localBands * 0.6) * Math.PI);
      const strata = layers * Math.max(0, p.striation - 0.77) * 30;
      const mineral = (pigmentMacro * 15 + grain * 26 * grammar.detail - vein * 20 +
        localBands * 23 + localDetails * 20 + strata) *
        (0.8 + p.rockiness * 0.4);

      const stoneColor = p.color.map((channel, index) => {
        const shade = (mineral - stains * 56 + roughMacro * 14) * (index === 2 ? 0.82 : 1);
        return channel + shade - (1 - bevel) * 10 - crack * 32;
      });
      const mortarNoise = field(u, v, 83, 87, seeds.weather ^ 0x128fa76b) * 12;
      const color = stoneColor.map((channel, index) =>
        mix(channel, mortar[index] + mortarNoise - stains * 14, joint)
      );

      return {
        color,
        height: mix(stoneHeight, 0.27 + roughFine * 0.025, joint),
        roughness: clamp(0.79 + Math.abs(roughMid) * 0.12 +
          Math.max(0, roughFine) * 0.14 + stains * 0.2 + joint * 0.08),
        edge: joint,
        detail: grain * 0.2,
      };
    };
  },
};
