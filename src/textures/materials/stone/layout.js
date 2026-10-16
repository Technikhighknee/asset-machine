import { fbm } from '../../random.js';

const wrap = (value) => ((value % 1) + 1) % 1;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const masonry = [
  // Different building traditions, not different color palettes for the same pattern.
  { name: 'coarse-rubble', area: [0.07, 0.13], inset: [0.055, 0.11], corners: [0.07, 0.19], horizontal: 0.43, pinnings: 0.04 },
  { name: 'fieldstone', area: [0.035, 0.075], inset: [0.06, 0.12], corners: [0.16, 0.28], horizontal: 0.49, pinnings: 0.035 },
  { name: 'rough-bedded', area: [0.045, 0.085], inset: [0.035, 0.085], corners: [0.055, 0.17], horizontal: 0.77, pinnings: 0.075 },
  { name: 'mortar-rich', area: [0.075, 0.14], inset: [0.095, 0.165], corners: [0.12, 0.24], horizontal: 0.55, pinnings: 0.015 },
];

function outline(random, inset, corners, irregularity, character) {
  if (character.name === 'fieldstone') {
    const vertices = random.int(10, 14);
    const phase = random.range(0, Math.PI * 2);

    return Array.from({ length: vertices }, (_, i) => {
      const angle = phase + (i / vertices) * Math.PI * 2;
      const radial = random.range(0.77, 1.04);
      return [
        clamp(0.5 + Math.cos(angle) * (0.5 - inset) * radial, 0.025, 0.975),
        clamp(0.5 + Math.sin(angle) * (0.5 - inset) * radial, 0.025, 0.975),
      ];
    });
  }

  const margin = () => clamp(inset * random.range(0.7, 1.4), 0.012, 0.25);
  const top = margin();
  const bottom = margin();
  const left = margin();
  const right = margin();
  const notch = () => random.range(...corners);
  const [tl, tr, br, bl] = [notch(), notch(), notch(), notch()];
  const jiggle = () => random.range(-0.045, 0.045) * irregularity;
  const coord = (value) => clamp(value, 0.005, 0.995);

  return [
    [coord(left + tl), coord(top + jiggle())],
    [coord(0.38 + jiggle()), coord(top + jiggle())],
    [coord(0.68 + jiggle()), coord(top + jiggle())],
    [coord(1 - right - tr), coord(top + jiggle())],
    [coord(1 - right + jiggle()), coord(top + tr)],
    [coord(1 - right + jiggle()), coord(0.44 + jiggle())],
    [coord(1 - right + jiggle()), coord(0.69 + jiggle())],
    [coord(1 - right - br), coord(1 - bottom + jiggle())],
    [coord(0.66 + jiggle()), coord(1 - bottom + jiggle())],
    [coord(0.31 + jiggle()), coord(1 - bottom + jiggle())],
    [coord(left + bl), coord(1 - bottom + jiggle())],
    [coord(left + jiggle()), coord(1 - bottom - bl)],
    [coord(left + jiggle()), coord(0.66 + jiggle())],
    [coord(left + jiggle()), coord(0.34 + jiggle())],
    [coord(left + jiggle()), coord(top + tl)],
  ];
}

function makeStone(random, id, character, irregularity) {
  const inset = random.range(...character.inset);

  return {
    id,
    polygon: outline(random, inset, character.corners, irregularity, character),
    protrusion: random.range(-0.035, 0.055),
    slopeX: random.range(-0.055, 0.055),
    slopeY: random.range(-0.04, 0.04),
    shape: random.range(0.55, 1.35),
    // The stone finish follows the masonry tradition, not a universal noise preset.
    facetStrength: character.name === 'coarse-rubble' ? random.range(1.0, 1.55)
      : character.name === 'rough-bedded' ? random.range(0.7, 1.1)
        : character.name === 'fieldstone' ? random.range(0.3, 0.7)
          : random.range(0.65, 1.15),
    faceProfile: character.name === 'rough-bedded' ? 'stratified'
      : character.name === 'fieldstone' ? 'rounded' : 'fractured',
    wear: random.range(0.25, 1),
  };
}

function polygonDistance(vertices, x, y, width, height) {
  let inside = false;
  let squared = Infinity;
  const px = x * width;
  const py = y * height;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const ax = vertices[j][0] * width;
    const ay = vertices[j][1] * height;
    const bx = vertices[i][0] * width;
    const by = vertices[i][1] * height;
    const vx = bx - ax;
    const vy = by - ay;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
    const dx = px - ax - t * vx;
    const dy = py - ay - t * vy;

    squared = Math.min(squared, dx * dx + dy * dy);

    if ((ay > py) !== (by > py) && px < ax + vx * (py - ay) / vy) {
      inside = !inside;
    }
  }

  return Math.sqrt(squared) * (inside ? 1 : -1);
}

export function buildWall(random, grammar, seed) {
  const character = random.pick(masonry);
  const target = random.range(...character.area) / grammar.density;
  const stones = [];
  const offsetX = random.float();
  const offsetY = random.float();
  const irregularity = Math.min(1.5, grammar.irregularity);
  let nextId = 0;

  // The mortar is allowed to occupy space. Stone regions are only guides for
  // laying differently sized blocks; their outlines need not fill the guides.
  function lay(region, depth = 0) {
    const width = region.x1 - region.x0;
    const height = region.y1 - region.y0;
    const aspect = width / height;
    const finished = depth >= 2 && aspect > 0.5 && aspect < 2.9 &&
      width * height < target * random.range(0.74, 1.8);

    if (finished || depth >= 9 || (width < 0.085 && height < 0.095)) {
      stones.push({ ...makeStone(random, nextId++, character, irregularity), ...region });
      return;
    }

    const horizontal = height > width * 1.4 ||
      (height >= width * 0.56 && random.float() < character.horizontal);
    const fraction = random.range(0.29, 0.71);

    if (horizontal) {
      const split = region.y0 + height * fraction;
      lay({ ...region, y1: split }, depth + 1);
      lay({ ...region, y0: split }, depth + 1);
    } else {
      const split = region.x0 + width * fraction;
      lay({ ...region, x1: split }, depth + 1);
      lay({ ...region, x0: split }, depth + 1);
    }
  }

  lay({ x0: 0, x1: 1, y0: 0, y1: 1 });

  // Only rare pinnings: mortar intentionally fills the other irregular voids.
  const corners = new Set();
  const pinnings = [];

  for (const large of stones) {
    for (const [x, y] of [[large.x0, large.y0], [large.x1, large.y0],
      [large.x0, large.y1], [large.x1, large.y1]]) {
      const key = Math.round(x * 100000) + ':' + Math.round(y * 100000);
      if (corners.has(key)) continue;
      corners.add(key);
      if (random.float() >= character.pinnings) continue;

      pinnings.push({
        x: wrap(x),
        y: wrap(y),
        radius: random.range(0.012, 0.023),
        stone: makeStone(random, nextId++, masonry[1], irregularity),
      });
    }
  }

  return {
    type: character.name,
    count: nextId,
    sample(u, v) {
      // One periodic warp applies to both stones and mortar boundaries.
      const x = wrap(u + offsetX + fbm(u, v, 8, 7, seed ^ 0x5171aef2, 3) * 0.012);
      const y = wrap(v + offsetY + fbm(u, v, 7, 9, seed ^ 0x5a2f3197, 3) * 0.014);
      const large = stones.find((s) => x >= s.x0 && x < s.x1 && y >= s.y0 && y < s.y1);
      const width = large.x1 - large.x0;
      const height = large.y1 - large.y0;
      const localX = (x - large.x0) / width;
      const localY = (y - large.y0) / height;
      const distance = polygonDistance(large.polygon, localX, localY, width, height);

      if (distance < 0.002) {
        for (const pin of pinnings) {
          const dx = wrap(x - pin.x + 0.5) - 0.5;
          const dy = wrap(y - pin.y + 0.5) - 0.5;
          if (Math.abs(dx) > pin.radius || Math.abs(dy) > pin.radius) continue;

          const sx = 0.5 + dx / (pin.radius * 2);
          const sy = 0.5 + dy / (pin.radius * 2);
          const pinDistance = polygonDistance(pin.stone.polygon, sx, sy, pin.radius * 2, pin.radius * 2);

          if (pinDistance > distance && pinDistance > -0.002) {
            return { stone: pin.stone, x: sx, y: sy, distance: pinDistance };
          }
        }
      }

      return { stone: large, x: localX, y: localY, distance };
    },
  };
}
