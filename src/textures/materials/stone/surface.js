import { field, fbm, hash } from '../../random.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Cohesive geology: one wall is made from one kind of stone, not five unrelated colors.
const rockFamilies = [
  { base: [145, 139, 125], mineral: [165, 155, 133], mortar: [113, 106, 93] },
  { base: [135, 138, 135], mineral: [154, 147, 131], mortar: [108, 110, 107] },
  { base: [153, 132, 108], mineral: [174, 149, 118], mortar: [115, 103, 88] },
  { base: [127, 123, 115], mineral: [145, 139, 124], mortar: [98, 96, 90] },
];

export function makeSurface({ structure, pigment, weather, seeds, grammar }) {
  const geology = pigment.pick(rockFamilies);
  const joint = structure.range(0.0012, 0.0028) * grammar.edgeWidth;
  const bevel = structure.range(0.009, 0.021) * grammar.edgeWidth;
  const age = weather.range(0.12, 0.43);
  const mineralStrength = pigment.range(0.45, 1);
  const profiles = new Map();

  function identity(stone) {
    let p = profiles.get(stone.id);

    if (!p) {
      p = {
        tone: (hash(stone.id, 1, seeds.pigment) - 0.5) * 20,
        warmth: (hash(stone.id, 2, seeds.pigment) - 0.5) * 7,
        vein: hash(stone.id, 3, seeds.structure) > 0.64,
        roughness: hash(stone.id, 4, seeds.structure) * 0.09,
        weather: hash(stone.id, 5, seeds.weather),
        rockSeed: seeds.structure ^ Math.imul(stone.id + 1, 0x9e3779b9),
        colorSeed: seeds.pigment ^ Math.imul(stone.id + 1, 0x85ebca6b),
      };
      profiles.set(stone.id, p);
    }

    return p;
  }

  return (u, v, shape) => {
    const { stone, x, y, distance } = shape;
    const p = identity(stone);
    const irregularEdge = field(x, y, 8, 9, p.rockSeed ^ 0x16fa937b) * joint * 0.55;
    const edge = distance + irregularEdge;
    const inRock = smooth(-joint, joint, edge);
    const bevelFactor = smooth(-joint, bevel, edge);
    const voidFactor = 1 - inRock;
    const coarse = fbm(x, y, 5, 6, p.rockSeed, 4);
    const mid = fbm(x, y, 16, 18, p.rockSeed ^ 0x16aefd81, 4);
    const fine = field(x, y, 54, 59, p.rockSeed ^ 0x72931bfa);
    const erosion = smooth(0.15, 0.6, mid * 0.62 + fine * 0.38) * stone.chip;
    const plane = stone.tiltX * (x - 0.5) + stone.tiltY * (y - 0.5);
    const broad = Math.sin((x + stone.tiltX * y) * 6.28318) * stone.facet * 0.014;
    const relief = (0.63 + stone.lift + plane + broad + coarse * 0.062 + mid * 0.026 + fine * 0.012) * bevelFactor -
      erosion * 0.028 * inRock;
    const mortarRough = field(u, v, 43, 43, seeds.structure ^ 0x526411c3);
    const height = relief * inRock + (0.32 + mortarRough * 0.015) * voidFactor;

    // Surface pigments derive from geological inclusions, not pixelwise RGB randomness.
    const pigmentBroad = fbm(x, y, 8, 10, p.colorSeed, 3);
    const grain = field(x, y, 46, 49, p.colorSeed ^ 0x58adb116);
    const inclusions = Math.max(0, pigmentBroad * 0.65 + grain * 0.35 - 0.18);
    const vein = p.vein ? Math.max(0, 1 - Math.abs(y - 0.38 - pigmentBroad * 0.12) / 0.026) : 0;
    const sediment = Math.max(0, fbm(u, v, 6, 11, seeds.weather ^ 0x491617a3, 3));
    const rain = Math.max(0, field(u, v, 13, 3, seeds.weather ^ 0x392af171) - 0.22);
    const dirt = (sediment * 0.65 + rain * 0.35) * age * (0.7 + p.weather * 0.6);
    const cavity = 1 - smooth(joint, bevel * 2, edge);
    const shade = p.tone + coarse * 10 + grain * 7 * grammar.detail -
      inclusions * 14 * mineralStrength - vein * 9 - dirt * 36 - cavity * 5;
    const color = geology.base.map((channel, i) => {
      const stoneColor = channel + shade + (i === 0 ? p.warmth : i === 2 ? -p.warmth : 0) +
        (geology.mineral[i] - channel) * inclusions * mineralStrength;
      const mortarColor = geology.mortar[i] + mortarRough * 9 - dirt * 15;
      return stoneColor * inRock + mortarColor * voidFactor;
    });

    const roughness = clamp((0.78 + p.roughness + Math.abs(fine) * 0.07 + erosion * 0.08 + dirt * 0.12) * inRock +
      (0.9 + mortarRough * 0.025) * voidFactor - cavity * 0.02);

    return { color, height, roughness, edge: cavity * 0.35, detail: pigmentBroad * 0.1 };
  };
}
