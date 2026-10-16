import { field, fbm, hash } from '../../random.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;

function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// Individual stones share one geological family, but differ in mineral
// inclusions, weathering and the orientation of their fractured faces.
const geology = [
  { stone: [175, 157, 128], cool: [197, 192, 177], warm: [183, 151, 109], mortar: [144, 128, 105] },
  { stone: [151, 151, 144], cool: [172, 180, 175], warm: [159, 142, 122], mortar: [124, 122, 114] },
  { stone: [175, 150, 118], cool: [192, 177, 150], warm: [188, 135, 96], mortar: [145, 124, 106] },
  { stone: [127, 124, 115], cool: [166, 167, 155], warm: [149, 123, 99], mortar: [119, 111, 99] },
];

export function makeSurface({ structure, pigment, weather, seeds, grammar }) {
  const rock = pigment.pick(geology);
  const mortarType = pigment.range(0.82, 1.11);
  const weatherLevel = weather.range(0.04, 0.29);
  const broadContrast = pigment.range(0.75, 1.3);
  const profiles = new Map();

  function identity(stone) {
    let p = profiles.get(stone.id);
    if (p) return p;

    const mineral = hash(stone.id, 2, seeds.pigment);
    const lightness = 0.83 + hash(stone.id, 3, seeds.pigment) * 0.33;

    p = {
      mineral,
      lightness,
      color: rock.stone.map((channel, i) =>
        mix(channel, (mineral > 0.57 ? rock.cool : rock.warm)[i],
          Math.abs(mineral - 0.5) * 0.83) * lightness
      ),
      roughness: 0.71 + hash(stone.id, 4, seeds.structure) * 0.13,
      crack: hash(stone.id, 5, seeds.structure) > 0.58,
      fractureAngle: hash(stone.id, 6, seeds.structure) * Math.PI,
      fractureOffset: (hash(stone.id, 7, seeds.structure) - 0.5) * 0.42,
      fractureDepth: 0.044 + hash(stone.id, 8, seeds.structure) * 0.067,
      secondAngle: hash(stone.id, 10, seeds.structure) * Math.PI,
      secondOffset: (hash(stone.id, 11, seeds.structure) - 0.5) * 0.65,
      stratum: hash(stone.id, 12, seeds.structure) < 0.28,
      blockRelief: 0.4 + hash(stone.id, 13, seeds.structure) * 1.15,
      weather: hash(stone.id, 9, seeds.weather),
      structureSeed: seeds.structure ^ Math.imul(stone.id + 1, 0x9e3779b9),
      pigmentSeed: seeds.pigment ^ Math.imul(stone.id + 1, 0x85ebca6b),
    };

    profiles.set(stone.id, p);
    return p;
  }

  return (u, v, placement) => {
    const { stone, x, y, distance } = placement;
    const g = Math.max(0, distance);
    const mortarBody = fbm(u, v, 23, 21, seeds.structure ^ 0x3264dc81, 3);
    const mortarGrit = field(u, v, 131, 127, seeds.structure ^ 0x51da7c3b);
    const mortarStain = Math.max(0,
      fbm(u, v, 7, 8, seeds.weather ^ 0x08ac135d, 3)) * weatherLevel;
    const mortarHeight = 0.33 + mortarBody * 0.017 + mortarGrit * 0.007;
    const edgeShadow = 1 - smooth(-0.001, 0.014, Math.abs(distance));
    const mortarColor = rock.mortar.map((channel) =>
      channel * mortarType + mortarBody * 18 + mortarGrit * 13 -
      mortarStain * 29 - edgeShadow * 57
    );
    const mortarRoughness = clamp(
      0.88 + Math.abs(mortarGrit) * 0.09 + mortarStain * 0.14
    );

    // Broad mortar pockets are a real material, not dark outlines on a cell.
    if (distance < -0.004) {
      return {
        color: mortarColor,
        height: mortarHeight,
        roughness: mortarRoughness,
        edge: edgeShadow * 0.14,
        detail: mortarGrit * 0.13,
      };
    }

    const p = identity(stone);
    const faceNoise = fbm(x, y, 4, 5, p.structureSeed, 4);
    const fractured = fbm(x, y, 13, 11, p.structureSeed ^ 0x583a6b21, 3);
    const fine = field(x, y, 67, 59, p.structureSeed ^ 0x94bea231);
    const grain = field(u, v, 180, 171, seeds.structure ^ 0xba79e161);
    const chippedEdge = field(x, y, 11, 9, p.structureSeed ^ 0x10933ada) * 0.0034;
    const inset = distance + chippedEdge;
    const inRock = smooth(-0.0018, 0.0015, inset);
    const bevel = smooth(0, 0.014, inset);

    const axisX = Math.cos(p.fractureAngle);
    const axisY = Math.sin(p.fractureAngle);
    const localX = x - 0.5;
    const localY = y - 0.5;
    const cutCoordinate = localX * axisX + localY * axisY + p.fractureOffset;
    const cut = smooth(-0.058, 0.055, cutCoordinate + faceNoise * 0.08) - 0.5;
    const bedding = Math.sin(
      (y * (5.3 + p.blockRelief * 2.6) + faceNoise * 0.27 +
        stone.orientation) * Math.PI * 2
    );
    const strata = p.stratum || stone.face === 'stacked-slate'
      ? bedding * (stone.face === 'stacked-slate' ? 0.025 : 0.015) : 0;
    const secondCoord = localX * Math.cos(p.secondAngle) +
      localY * Math.sin(p.secondAngle) + p.secondOffset;
    const secondCut = smooth(-0.045, 0.065, secondCoord + fractured * 0.08) - 0.5;
    const chips = smooth(0.10, 0.43, fractured * 0.68 + fine * 0.32) * stone.wear;
    const porous = smooth(0.13, 0.53, fine * 0.45 + fractured * 0.55);
    const crack = p.crack
      ? (1 - smooth(0.008, 0.023,
        Math.abs(cutCoordinate + fractured * 0.03))) *
        (1 - smooth(0.12, 0.47, Math.abs(localY)))
      : 0;
    const slope = stone.orientation * localY * 0.04;

    const shape = 0.61 + stone.proud + slope +
      (cut * p.fractureDepth + secondCut * p.fractureDepth * 0.6) *
      (stone.face === 'weathered-rubble' ? 0.48 : 1) +
      faceNoise * 0.075 * stone.slab + fractured * 0.049 +
      fine * 0.017 + grain * 0.008 +
      strata - chips * 0.048 - porous * 0.029 - crack * 0.056;
    const stoneHeight = shape * (0.69 + bevel * 0.31);
    const height = mix(mortarHeight, stoneHeight, inRock);

    const mineralZones = fbm(x, y, 7, 8, p.pigmentSeed, 4);
    const speckles = field(x, y, 83, 79, p.pigmentSeed ^ 0x197ac482);
    const lamina = stone.face === 'stacked-slate' ||
      stone.face === 'bedded-limestone'
      ? Math.sin((y * 9.4 + mineralZones * 0.38) * Math.PI * 2) * 6.5 : 0;
    const sediment = Math.max(0,
      fbm(u, v, 8, 6, seeds.weather ^ 0xd7a31fb8, 3)) * weatherLevel;
    const dirt = sediment * (0.8 + 0.35 * p.weather) +
      Math.max(0, field(u, v, 14, 3, seeds.weather ^ 0x6194bc13)) *
      weatherLevel * 0.24;
    const mineral = mineralZones * 20 * broadContrast +
      speckles * 11 * grammar.detail + lamina;
    const cavity = 1 - smooth(0.0005, 0.012, g);

    const color = p.color.map((channel, i) => {
      const stoneColor = channel +
        mineral * (i === 2 ? 0.84 : 1) +
        faceNoise * 16 + cut * 13 -
        porous * 32 - chips * 29 - crack * 36 -
        dirt * 85 - cavity * 44 + secondCut * 15;

      return mix(mortarColor[i], stoneColor, inRock);
    });

    const roughness = clamp(mix(
      mortarRoughness,
      p.roughness + Math.abs(fine) * 0.09 +
      porous * 0.13 + chips * 0.14 + dirt * 0.16,
      inRock
    ));

    return {
      color,
      height,
      roughness,
      edge: cavity * 0.16,
      detail: mineralZones * 0.11,
    };
  };
}
