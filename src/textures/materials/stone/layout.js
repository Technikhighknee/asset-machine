import { fbm } from '../../random.js';

const wrap = (value) => ((value % 1) + 1) % 1;

function outline(random, fieldstone) {
  const cut = () => random.range(fieldstone ? 0.095 : 0.03, fieldstone ? 0.2 : 0.14);
  const inset = () => random.range(fieldstone ? 0.007 : 0.004, fieldstone ? 0.035 : 0.02);
  const jitter = () => random.range(-0.085, 0.085);
  const limit = (value) => Math.max(0.005, Math.min(0.995, value));
  const [tl, tr, br, bl] = [cut(), cut(), cut(), cut()];
  const [top, bottom, left, right] = [inset(), inset(), inset(), inset()];

  return [
    [tl, limit(top + jitter())],
    [limit(0.39 + jitter()), limit(top + jitter())],
    [limit(0.68 + jitter()), limit(top + jitter())],
    [1 - tr, limit(top + jitter())],
    [limit(1 - right + jitter()), tr],
    [limit(1 - right + jitter()), limit(0.42 + jitter())],
    [limit(1 - right + jitter()), limit(0.68 + jitter())],
    [1 - br, limit(1 - bottom + jitter())],
    [limit(0.66 + jitter()), limit(1 - bottom + jitter())],
    [limit(0.29 + jitter()), limit(1 - bottom + jitter())],
    [bl, limit(1 - bottom + jitter())],
    [limit(left + jitter()), 1 - bl],
    [limit(left + jitter()), limit(0.66 + jitter())],
    [limit(left + jitter()), limit(0.34 + jitter())],
    [limit(left + jitter()), tl],
  ];
}

function stone(random, id, type) {
  return {
    id,
    polygon: outline(random, type === 'fieldstone'),
    protrusion: random.range(-0.025, 0.035),
    slopeX: random.range(-0.035, 0.035),
    slopeY: random.range(-0.028, 0.028),
    shape: random.range(0.6, 1.25),
    wear: random.range(0.3, 1),
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
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
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
  const type = random.pick(['rubble', 'fieldstone']);
  const target = (type === 'fieldstone' ? 0.028 : 0.038) / grammar.density;
  const stones = [];
  const offsetX = random.float();
  const offsetY = random.float();
  let nextId = 0;

  // Partition the wall into load-bearing stones before generating any surface detail.
  // Big regions are split before small ones; neighboring pieces share their supports.
  function lay(region, depth = 0) {
    const width = region.x1 - region.x0;
    const height = region.y1 - region.y0;
    const aspect = width / height;
    const finished = depth > 2 && aspect > 0.5 && aspect < 2.7 &&
      width * height < target * random.range(0.55, 1.7);

    if (finished || depth >= 10 || (width < 0.09 && height < 0.1)) {
      stones.push({ ...stone(random, nextId++, type), ...region });
      return;
    }

    const horizontal = height > width * 1.3 ||
      (width <= height * 1.8 && random.float() < 0.53);
    const fraction = random.range(0.32, 0.68);

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

  // Pinnings are small real stones, deliberately fitted into some mortar pockets.
  const corners = new Set();
  const pinnings = [];

  for (const large of stones) {
    for (const [x, y] of [[large.x0, large.y0], [large.x0, large.y1],
      [large.x1, large.y0], [large.x1, large.y1]]) {
      const key = Math.round(x * 100000) + ':' + Math.round(y * 100000);
      if (corners.has(key)) continue;
      corners.add(key);
      if (random.float() >= 0.48) continue;

      pinnings.push({
        x: wrap(x),
        y: wrap(y),
        radius: random.range(0.009, 0.024),
        stone: stone(random, nextId++, 'fieldstone'),
      });
    }
  }

  return {
    type,
    count: nextId,
    sample(u, v) {
      // Periodic global deformation, shared by every stone and mortar seam.
      const x = wrap(u + offsetX + fbm(u, v, 8, 7, seed ^ 0x5171aef2, 3) * 0.013);
      const y = wrap(v + offsetY + fbm(u, v, 7, 9, seed ^ 0x5a2f3197, 3) * 0.017);
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
          const d = polygonDistance(pin.stone.polygon, sx, sy, pin.radius * 2, pin.radius * 2);

          if (d > distance && d > -0.002) {
            return { stone: pin.stone, x: sx, y: sy, distance: d };
          }
        }
      }

      return { stone: large, x: localX, y: localY, distance };
    },
  };
}
