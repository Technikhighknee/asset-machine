// Stones are placed in staggered courses before any surface is sampled.
// Every course is periodic horizontally; the course sequence is periodic vertically.
const wrap = (value) => ((value % 1) + 1) % 1;

function proportions(count, random, spread) {
  const weights = Array.from({ length: count }, () => random.range(1 - spread, 1 + spread));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const edges = [0];

  for (const weight of weights) {
    edges.push(edges.at(-1) + weight / total);
  }

  edges[edges.length - 1] = 1;
  return edges;
}

function stoneOutline(random, type) {
  // A polygon inside one masonry slot. Wide load-bearing bottoms and
  // softened, sometimes chipped corners keep it from reading as Voronoi cells.
  const round = type === 'fieldstone';
  const corner = round ? random.range(0.12, 0.26) : random.range(0.045, 0.14);
  const rim = round ? random.range(0.022, 0.065) : random.range(0.008, 0.026);
  const tilt = random.range(-0.06, 0.06);
  const wobble = () => random.range(-0.035, 0.035);

  const limit = (value) => Math.max(0.01, Math.min(0.99, value));

  return [
    [corner, rim + tilt + wobble()],
    [0.47 + wobble(), rim + wobble()],
    [1 - corner, rim - tilt + wobble()],
    [1 - rim + wobble(), corner],
    [1 - rim + wobble(), 0.52 + wobble()],
    [1 - rim + wobble(), 1 - corner],
    [1 - corner, 1 - rim + tilt + wobble()],
    [0.52 + wobble(), 1 - rim + wobble()],
    [corner, 1 - rim - tilt + wobble()],
    [rim + wobble(), 1 - corner],
    [rim + wobble(), 0.48 + wobble()],
    [rim + wobble(), corner],
  ].map(([x, y]) => [limit(x), limit(y)]);
}

function makeStone(random, x0, x1, id, type) {
  return {
    id,
    x0,
    x1,
    width: x1 - x0,
    outline: stoneOutline(random, type),
    lift: random.range(-0.035, 0.035),
    tiltX: random.range(-0.055, 0.055),
    tiltY: random.range(-0.055, 0.055),
    facet: random.range(0.4, 1),
    chip: random.range(0.1, 0.75),
  };
}

function polygonDistance(stone, x, y, height) {
  // Signed distance to the actual stone polygon in tile units.
  // Local slot coords are used only to select its geometry.
  const outline = stone.outline;
  let inside = false;
  let distanceSquared = Infinity;

  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const ax = outline[j][0] * stone.width;
    const ay = outline[j][1] * height;
    const bx = outline[i][0] * stone.width;
    const by = outline[i][1] * height;
    const px = x * stone.width;
    const py = y * height;
    const dx = bx - ax;
    const dy = by - ay;
    const fraction = Math.max(0, Math.min(1,
      ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    ));
    const qx = ax + fraction * dx - px;
    const qy = ay + fraction * dy - py;
    distanceSquared = Math.min(distanceSquared, qx * qx + qy * qy);

    if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) {
      inside = !inside;
    }
  }

  return (inside ? 1 : -1) * Math.sqrt(distanceSquared);
}

export function buildWall(structure, grammar) {
  const type = structure.pick(['coursed', 'rough', 'fieldstone']);
  const count = Math.max(3, Math.round(structure.int(7, 10) * grammar.density));
  const heights = proportions(count, structure, type === 'rough' ? 0.48 : 0.29);
  const courses = [];
  const verticalOffset = structure.range(0.025, 0.09);
  const boundaries = Array.from({ length: count - 1 }, (_, index) => {
    const steps = structure.int(5, 12);
    const amplitude = Math.min(heights[index + 1] - heights[index],
      heights[index + 2] - heights[index + 1]) * (type === 'coursed' ? 0.1 : 0.2);

    return {
      phase: structure.float(),
      values: Array.from({ length: steps }, () => structure.range(-amplitude, amplitude)),
    };
  });

  function courseBoundary(index, u) {
    if (index === 0) return 0;
    if (index === count) return 1;

    const boundary = boundaries[index - 1];
    const value = wrap(u + boundary.phase) * boundary.values.length;
    const cell = Math.floor(value);
    const t = value - cell;
    const next = boundary.values[(cell + 1) % boundary.values.length];
    const blend = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
    const eased = blend * blend * (3 - 2 * blend);

    return heights[index] + boundary.values[cell] * (1 - eased) + next * eased;
  }

  let identity = 0;

  for (let row = 0; row < count; row++) {
    const y0 = heights[row];
    const y1 = heights[row + 1];
    const amount = Math.max(3, Math.round(
      structure.int(type === 'rough' ? 5 : 4, type === 'rough' ? 9 : 7) * grammar.density
    ));
    const widths = proportions(amount, structure, type === 'rough' ? 0.73 : 0.48);
    const shift = structure.float();
    const slots = [];

    for (let col = 0; col < amount; col++) {
      const x0 = widths[col];
      const x1 = widths[col + 1];
      const filler = type === 'rough' && (x1 - x0) > 0.08 && structure.float() < 0.21;

      if (filler) {
        const divide = structure.range(0.42, 0.58);
        const middle = y0 + (y1 - y0) * divide;
        slots.push({ x1, split: middle,
          lower: makeStone(structure, x0, x1, identity++, type),
          upper: makeStone(structure, x0, x1, identity++, type),
        });
      } else {
        slots.push({ x1, single: makeStone(structure, x0, x1, identity++, type) });
      }
    }

    courses.push({ index: row, y1, y0, shift, slots });
  }

  return {
    type,
    count: identity,
    sample(u, v) {
      const yy = wrap(v + verticalOffset);
      const xxWorld = wrap(u);
      const course = courses.find((row) => yy < courseBoundary(row.index + 1, xxWorld)) || courses.at(-1);
      const ceiling = courseBoundary(course.index, xxWorld);
      const floor = courseBoundary(course.index + 1, xxWorld);
      const height = floor - ceiling;
      const xx = wrap(u + course.shift);
      const slot = course.slots.find((cell) => xx < cell.x1) || course.slots.at(-1);
      const vertical = (yy - ceiling) / height;
      const split = slot.split ? (slot.split - course.y0) / (course.y1 - course.y0) : 0;
      const stone = slot.single || (vertical < split ? slot.lower : slot.upper);
      const x = (xx - stone.x0) / stone.width;
      const y = slot.single
        ? vertical
        : stone === slot.lower ? vertical / split : (vertical - split) / (1 - split);
      const stoneHeight = slot.single ? height : height * (stone === slot.lower ? split : 1 - split);

      return { stone, x, y, distance: polygonDistance(stone, x, y, stoneHeight) };
    },
  };
}
