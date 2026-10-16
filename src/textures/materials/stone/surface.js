import { field, fbm, hash } from '../../random.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;

function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

const geology = [
  { stone: [159, 145, 125], inclusion: [173, 152, 125], mortar: [123, 116, 103] },
  { stone: [145, 145, 136], inclusion: [161, 157, 146], mortar: [117, 117, 108] },
  { stone: [163, 138, 108], inclusion: [172, 146, 118], mortar: [118, 107, 95] },
  { stone: [142, 133, 119], inclusion: [158, 141, 120], mortar: [112, 106, 98] },
];

export function makeSurface({ structure, pigment, weather, seeds, grammar }) {
  const family = pigment.pick(geology);
  const seam = structure.range(0.001, 0.002) * grammar.edgeWidth;
  const bevelWidth = structure.range(0.006, 0.014) * grammar.edgeWidth;
  const age = weather.range(0.05, 0.3);
  const profiles = new Map();

  function identity(stone) {
    if (profiles.has(stone.id)) return profiles.get(stone.id);

    const facetAngle = hash(stone.id, 11, seeds.structure) * Math.PI * 2;
    const fissureAngle = facetAngle + (hash(stone.id, 12, seeds.structure) - 0.5) * 1.3;
    const data = {
      facetX: Math.cos(facetAngle),
      facetY: Math.sin(facetAngle),
      facetOffset: (hash(stone.id, 13, seeds.structure) - 0.5) * 0.35,
      facetDepth: 0.028 + hash(stone.id, 14, seeds.structure) * 0.045,
      fissureX: Math.cos(fissureAngle),
      fissureY: Math.sin(fissureAngle),
      fractured: hash(stone.id, 15, seeds.structure) > 0.52,
      offset: (hash(stone.id, 1, seeds.pigment) - 0.5) * 38,
      warmth: (hash(stone.id, 2, seeds.pigment) - 0.5) * 12,
      roughness: hash(stone.id, 3, seeds.structure) * 0.09,
      weather: hash(stone.id, 4, seeds.weather),
      structureSeed: seeds.structure ^ Math.imul(stone.id + 1, 0x9e3779b9),
      pigmentSeed: seeds.pigment ^ Math.imul(stone.id + 1, 0x85ebca6b),
    };

    profiles.set(stone.id, data);
    return data;
  }

  return (u, v, placement) => {
    const { stone, x, y, distance } = placement;
    const identityData = identity(stone);
    const rawEdge = field(x, y, 8, 8, identityData.structureSeed ^ 0x192bd531) * seam * 0.5;
    const inset = distance + rawEdge;
    const inStone = smooth(-seam, seam, inset);
    const bevel = smooth(-seam, bevelWidth, inset);
    const stoneCoarse = fbm(x, y, 3, 4, identityData.structureSeed, 4);
    const stoneMid = fbm(x, y, 13, 16, identityData.structureSeed ^ 0x51612c3d, 3);
    const stoneFine = field(x, y, 56, 59, identityData.structureSeed ^ 0x5d7c193a);
    const erosion = Math.max(0, stoneMid * 0.65 + stoneFine * 0.35 - 0.16) * stone.wear;
    const dx = x - 0.5;
    const dy = y - 0.5;
    const facet = dx * identityData.facetX + dy * identityData.facetY + identityData.facetOffset;
    const facetWarp = stoneCoarse * 0.085;
    const fracture = smooth(-0.085, 0.085, facet + facetWarp) - 0.5;
    const crackPosition = dx * identityData.fissureX + dy * identityData.fissureY - 0.11 + stoneMid * 0.045;
    const crack = identityData.fractured
      ? (1 - smooth(0.008, 0.024, Math.abs(crackPosition))) *
        smooth(0.38, 0.2, Math.abs(dy)) : 0;
    const porous = Math.max(0, stoneMid * 0.5 + stoneFine * 0.5 - 0.09) *
      Math.max(0, stoneCoarse + 0.28);
    const plane = stone.slopeX * (x - 0.5) + stone.slopeY * (y - 0.5);
    const stoneHeight = 0.56 + stone.protrusion + plane +
      fracture * identityData.facetDepth + stoneCoarse * 0.058 * stone.shape +
      stoneMid * 0.029 * stone.shape + stoneFine * 0.007 -
      erosion * 0.042 - porous * 0.075 - crack * 0.055;
    const mortarTexture = field(u, v, 63, 59, seeds.structure ^ 0x618fac31);
    const height = mix(0.38 + mortarTexture * 0.014, stoneHeight * (0.65 + 0.35 * bevel), inStone);

    // Stone color is tied to a single geological family and local inclusions.
    const pigmentMacro = fbm(x, y, 4, 5, identityData.pigmentSeed, 4);
    const mineral = fbm(x, y, 18, 19, identityData.pigmentSeed ^ 0xb372916f, 3);
    const grain = field(x, y, 75, 72, identityData.pigmentSeed ^ 0x126c95f7);
    const sediment = Math.max(0, fbm(u, v, 5, 7, seeds.weather ^ 0x34b1d2f5, 3));
    const rain = Math.max(0, field(u, v, 9, 3, seeds.weather ^ 0xc52b381e));
    const dirt = age * (sediment * 0.62 + rain * 0.38) *
      (0.6 + 0.4 * identityData.weather) * (0.75 + y * 0.25);
    const inclusion = smooth(0.02, 0.32, mineral + pigmentMacro * 0.32);
    const cavity = 1 - smooth(0, bevelWidth * 2, inset);
    const color = family.stone.map((channel, i) => {
      const pigmentVariation = pigmentMacro * 13 + mineral * 11 + grain * 4 * grammar.detail;
      const rocky = channel + identityData.offset + pigmentVariation +
        inclusion * (family.inclusion[i] - channel) * 0.7 - dirt * 36 -
        cavity * 8 + stoneCoarse * 8 + fracture * 12 - crack * 20 - porous * 28 +
        (i === 0 ? identityData.warmth : -identityData.warmth * 0.3);
      const mortar = family.mortar[i] + mortarTexture * 6 - dirt * 10;
      return mix(mortar, rocky, inStone);
    });

    const roughness = clamp(mix(0.9 + mortarTexture * 0.02,
      0.72 + identityData.roughness + Math.abs(stoneFine) * 0.07 + erosion * 0.14 +
      porous * 0.14 + crack * 0.05 + dirt * 0.14,
      inStone));

    return { color, height, roughness, edge: cavity * 0.15, detail: mineral * 0.12 };
  };
}
