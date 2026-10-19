import * as THREE from 'three';

const MIN_EDGE = 0.35;

export function newBuilding() {
  return {
    version: 1,
    name: 'Reed-roof workshop',
    footprint: [
      { x: -4, z: -3 },
      { x: 4, z: -3 },
      { x: 4, z: 3 },
      { x: -4, z: 3 },
    ],
    floors: 2,
    floorHeight: 2.9,
    foundationHeight: 0.45,
    wallThickness: 0.24,
    roof: { type: 'gable', pitch: 44, overhang: 0.45, thickness: 0.18, ridge: 'auto' },
    frame: { enabled: true, spacing: 2.0, thickness: 0.16 },
    openings: [
      { edge: 0, floor: 0, type: 'door', at: 0.5, width: 1.25, height: 2.25, sill: 0 },
      { edge: 0, floor: 1, type: 'window', at: 0.28, width: 1.15, height: 1.22, sill: 0.9 },
      { edge: 0, floor: 1, type: 'window', at: 0.72, width: 1.15, height: 1.22, sill: 0.9 },
      { edge: 1, floor: 0, type: 'window', at: 0.5, width: 1.08, height: 1.3, sill: 0.9 },
      { edge: 2, floor: 0, type: 'window', at: 0.32, width: 1.0, height: 1.2, sill: 0.92 },
    ],
  };
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const length = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

function intersects(a, b, c, d) {
  const ab1 = cross(a, b, c);
  const ab2 = cross(a, b, d);
  const cd1 = cross(c, d, a);
  const cd2 = cross(c, d, b);

  return ab1 * ab2 < 0 && cd1 * cd2 < 0;
}

export function footprintBounds(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}

export function isRectangle(points) {
  if (points.length !== 4) return false;

  const bounds = footprintBounds(points);
  const corners = [
    [bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ],
  ];

  return points.every((p) => corners.some(([x, z]) =>
    Math.abs(p.x - x) < 0.001 && Math.abs(p.z - z) < 0.001
  ));
}

export function validateBuilding(building) {
  if (!building || !Array.isArray(building.footprint)) return 'Missing footprint';

  const points = building.footprint;
  if (points.length < 3 || points.length > 32) return 'Use between 3 and 32 footprint vertices';
  if (points.some((p) => !p || !finite(p.x) || !finite(p.z) ||
    Math.abs(p.x) > 200 || Math.abs(p.z) > 200)) return 'Invalid footprint coordinates';

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    if (length(a, b) < MIN_EDGE) return 'Footprint edges must be at least 0.35 m';
    area += a.x * b.z - b.x * a.z;

    for (let j = i + 2; j < points.length; j++) {
      if ((j + 1) % points.length === i) continue;

      if (intersects(a, b, points[j], points[(j + 1) % points.length])) {
        return 'Footprint edges must not intersect';
      }
    }
  }

  if (Math.abs(area) < 1) return 'Footprint area must exceed 0.5 m²';
  if (!Number.isInteger(building.floors) || building.floors < 1 || building.floors > 5) {
    return 'Floors must be between 1 and 5';
  }

  if (!finite(building.floorHeight) || building.floorHeight < 2 || building.floorHeight > 6) {
    return 'Floor height must be between 2 and 6 m';
  }

  if (!finite(building.foundationHeight) || building.foundationHeight < 0.1 ||
    building.foundationHeight > 2) return 'Invalid foundation height';

  if (!finite(building.wallThickness) || building.wallThickness < 0.1 ||
    building.wallThickness > 0.7) return 'Invalid wall thickness';

  const roof = building.roof;
  if (!roof || !['gable', 'shed', 'flat'].includes(roof.type)) return 'Unknown roof type';
  if (roof.type === 'gable' && !isRectangle(points)) {
    return 'Gable roofs currently require a rectangular footprint; use Shed or Flat';
  }
  if (!finite(roof.pitch) || roof.pitch < 5 || roof.pitch > 65 ||
    !finite(roof.overhang) || roof.overhang < 0 || roof.overhang > 1.5 ||
    !finite(roof.thickness) || roof.thickness < 0.05 || roof.thickness > 0.5) {
    return 'Invalid roof dimensions';
  }

  if (!['auto', 'x', 'z'].includes(roof.ridge)) return 'Invalid ridge direction';

  if (roof.type !== 'gable' && roof.overhang > 0) {
    const eaves = expandedPolygon(points, roof.overhang);

    for (let i = 0; i < eaves.length; i++) {
      const a = eaves[i], b = eaves[(i + 1) % eaves.length];

      for (let j = i + 2; j < eaves.length; j++) {
        if ((j + 1) % eaves.length === i) continue;
        if (intersects(a, b, eaves[j], eaves[(j + 1) % eaves.length])) {
          return 'Roof overhang would intersect itself; reduce overhang';
        }
      }
    }
  }
  const frame = building.frame;
  if (!frame || typeof frame.enabled !== 'boolean' || !finite(frame.spacing) ||
    frame.spacing < 0.8 || frame.spacing > 5 ||
    !finite(frame.thickness) || frame.thickness < 0.08 || frame.thickness > 0.4) {
    return 'Invalid timber-frame properties';
  }

  if (!Array.isArray(building.openings) || building.openings.length > 100) {
    return 'Invalid openings';
  }

  const perEdge = new Map();
  for (const opening of building.openings) {
    if (!opening || !Number.isInteger(opening.edge) || opening.edge < 0 ||
      opening.edge >= points.length || !Number.isInteger(opening.floor) ||
      opening.floor < 0 || opening.floor >= building.floors ||
      !['door', 'window'].includes(opening.type) || !finite(opening.at) ||
      !finite(opening.width) || !finite(opening.sill) || !finite(opening.height)) {
      return 'Invalid door or window properties';
    }

    const wallLength = length(points[opening.edge], points[(opening.edge + 1) % points.length]);
    const left = opening.at * wallLength - opening.width / 2;
    const right = opening.at * wallLength + opening.width / 2;
    if (opening.width < 0.5 || left < 0.2 || right > wallLength - 0.2 ||
      opening.sill < 0 || opening.height < 0.5 ||
      opening.sill + opening.height > building.floorHeight - 0.12) {
      return 'Opening must fit inside its wall and floor';
    }
    if (opening.type === 'door' && opening.sill !== 0) return 'Doors must start at floor level';

    const key = opening.edge + ':' + opening.floor;
    const existing = perEdge.get(key) || [];
    for (const other of existing) {
      if (left < other.right + 0.14 && right > other.left - 0.14 &&
        opening.sill < other.top + 0.14 &&
        opening.sill + opening.height > other.bottom - 0.14) {
        return 'Overlapping openings on the same wall';
      }
    }
    existing.push({ left, right, bottom: opening.sill, top: opening.sill + opening.height });
    perEdge.set(key, existing);
  }

  return null;
}

// Physical-space UVs prevent the same texture stretching across a 1 m
// post and an 8 m wall. Material maps share these UV coordinates in GLB.
function texturedBox(width, height, depth) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const positions = geo.getAttribute('position');
  const normals = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const texelMetres = 2;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = normals.getX(i);
    const ny = normals.getY(i);

    if (Math.abs(nx) > 0.5) {
      uv.setXY(i, z / texelMetres, y / texelMetres);
    } else if (Math.abs(ny) > 0.5) {
      uv.setXY(i, x / texelMetres, z / texelMetres);
    } else {
      uv.setXY(i, x / texelMetres, y / texelMetres);
    }
  }

  uv.needsUpdate = true;
  return geo;
}

function beam(group, a, b, thickness, depth, material, name) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const distance = delta.length();
  if (distance < 0.02) return;

  const mesh = new THREE.Mesh(texturedBox(thickness, distance, depth), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.name = name;
  group.add(mesh);
}

function rectangleSolid(group, edge, left, right, bottom, top, depth, material, name) {
  if (right - left < 0.015 || top - bottom < 0.015) return;
  const mesh = new THREE.Mesh(texturedBox(right - left, top - bottom, depth), material);
  const u = (left + right) / 2 / edge.distance;

  mesh.position.set(
    edge.a.x + edge.dx * u,
    (bottom + top) / 2,
    edge.a.z + edge.dz * u,
  );
  mesh.rotation.y = -Math.atan2(edge.dz, edge.dx);
  mesh.name = name;
  group.add(mesh);
}

function polygonSlab(points, upper, thickness, material, name) {
  const group = new THREE.Group();
  group.name = name;
  const positions = [];
  const uvs = [];
  const indices = [];
  const scale = 1 / 2.2;

  function quad(a, b, c, d) {
    const start = positions.length / 3;
    for (const p of [a, b, c, d]) {
      positions.push(p.x, p.y, p.z);
      uvs.push(p.x * scale, p.z * scale);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  const outline = points.map((p) => new THREE.Vector2(p.x, p.z));
  const triangles = THREE.ShapeUtils.triangulateShape(outline, []);

  for (const [i, j, k] of triangles) {
    const top = [points[i], points[j], points[k]].map((p) =>
      ({ x: p.x, y: upper(p), z: p.z })
    );
    // Double-sided slab with its own underside.
    quad(top[0], top[1], top[2], top[2]);
    const bottom = top.map((p) => ({ ...p, y: p.y - thickness }));
    quad(bottom[2], bottom[1], bottom[0], bottom[0]);
  }

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ah = upper(a), bh = upper(b);
    quad(
      { x: a.x, z: a.z, y: ah }, { x: b.x, z: b.z, y: bh },
      { x: b.x, z: b.z, y: bh - thickness },
      { x: a.x, z: a.z, y: ah - thickness },
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  group.add(mesh);
  return group;
}

function roofSlab(group, four, thickness, material, name) {
  const positions = [];
  const uv = [];
  const indices = [];
  const faces = [
    [0, 1, 2, 3],
    [7, 6, 5, 4],
    [0, 4, 5, 1], [1, 5, 6, 2],
    [2, 6, 7, 3], [3, 7, 4, 0],
  ];
  const points = [...four, ...four.map((p) => ({ ...p, y: p.y - thickness }))];

  for (const f of faces) {
    const base = positions.length / 3;
    for (const index of f) {
      const p = points[index];
      positions.push(p.x, p.y, p.z);
      uv.push(p.x / 2, p.z / 2);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  group.add(mesh);
}

function gableRoof(group, building, mats, roofBase) {
  const bounds = footprintBounds(building.footprint);
  const alongX = building.roof.ridge === 'x' ||
    (building.roof.ridge === 'auto' &&
      bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ);
  const { pitch, overhang, thickness } = building.roof;
  const slope = Math.tan(pitch * Math.PI / 180);

  const uMin = alongX ? bounds.minX : bounds.minZ;
  const uMax = alongX ? bounds.maxX : bounds.maxZ;
  const vMin = alongX ? bounds.minZ : bounds.minX;
  const vMax = alongX ? bounds.maxZ : bounds.maxX;
  const mid = (vMin + vMax) / 2;
  const rise = (vMax - vMin) / 2 * slope;
  const locate = (u, v, y) => alongX ? { x: u, z: v, y } : { x: v, z: u, y };

  for (const side of [-1, 1]) {
    const eave = side < 0 ? vMin - overhang : vMax + overhang;
    roofSlab(group, [
      locate(uMin - overhang, eave, roofBase - overhang * slope),
      locate(uMax + overhang, eave, roofBase - overhang * slope),
      locate(uMax + overhang, mid, roofBase + rise),
      locate(uMin - overhang, mid, roofBase + rise),
    ], thickness, mats.roof, 'Reed roof slope');
  }

  // The triangular gable faces are real walls, not a texture or backdrop.
  for (const u of [uMin, uMax]) {
    const a = locate(u, vMin, roofBase);
    const b = locate(u, vMax, roofBase);
    const top = locate(u, mid, roofBase + rise);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      a.x, a.y, a.z, b.x, b.y, b.z, top.x, top.y, top.z,
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, (vMax - vMin) / 2, 0, (mid - vMin) / 2, rise / 2,
    ], 2));
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, mats.wall));

    if (building.frame.enabled) {
      const wood = building.frame.thickness;
      beam(group, [a.x, a.y, a.z], [top.x, top.y, top.z], wood, wood, mats.timber, 'Gable brace');
      beam(group, [top.x, top.y, top.z], [b.x, b.y, b.z], wood, wood, mats.timber, 'Gable brace');
    }
  }
}

function expandedPolygon(points, overhang) {
  // Mitered offset edges. Limited miters avoid huge spikes at concave corners.
  let signedArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    signedArea += a.x * b.z - b.x * a.z;
  }
  const orientation = Math.sign(signedArea);
  return points.map((p, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const a = { x: p.x - prev.x, z: p.z - prev.z };
    const b = { x: next.x - p.x, z: next.z - p.z };
    const al = Math.hypot(a.x, a.z), bl = Math.hypot(b.x, b.z);
    const n1 = { x: orientation * a.z / al, z: -orientation * a.x / al };
    const n2 = { x: orientation * b.z / bl, z: -orientation * b.x / bl };
    const avg = { x: n1.x + n2.x, z: n1.z + n2.z };
    const denominator = Math.max(0.5, 1 + n1.x * n2.x + n1.z * n2.z);
    const miter = Math.min(overhang * 2, overhang * 2 / denominator);
    return { x: p.x + avg.x * miter, z: p.z + avg.z * miter };
  });
}

function generalRoof(group, building, mats, roofBase) {
  const { overhang, type, thickness, pitch } = building.roof;
  const outline = expandedPolygon(building.footprint, overhang);
  const bounds = footprintBounds(outline);
  const span = Math.max(0.5, bounds.maxX - bounds.minX);
  const rise = type === 'flat' ? 0 : span * Math.tan(pitch * Math.PI / 180) * 0.33;
  const upper = (p) => roofBase + (p.x - bounds.minX) / span * rise;

  group.add(polygonSlab(outline, upper, thickness, mats.roof,
    type === 'flat' ? 'Flat roof' : 'Shed roof'));
}

export function buildBuilding(building, materials) {
  const error = validateBuilding(building);
  if (error) throw new RangeError(error);

  const group = new THREE.Group();
  group.name = building.name || 'Building';
  const footprint = building.footprint;
  const floorBase = building.foundationHeight;
  const roofBase = floorBase + building.floors * building.floorHeight;
  const frame = building.frame;
  let area = 0;

  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    area += a.x * b.z - b.x * a.z;
  }

  const orientation = Math.sign(area);
  const foundation = new THREE.Group();
  foundation.name = 'Foundation';
  group.add(foundation);

  foundation.add(polygonSlab(footprint, () => floorBase, floorBase,
    materials.stone, 'Stone foundation slab'));

  const walls = new THREE.Group();
  walls.name = 'Exterior walls and apertures';
  group.add(walls);
  const framing = new THREE.Group();
  framing.name = 'Timber structure';
  group.add(framing);
  const openingsGroup = new THREE.Group();
  openingsGroup.name = 'Door and window assemblies';
  group.add(openingsGroup);

  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const distance = length(a, b);
    const outwardX = orientation * dz / distance;
    const outwardZ = -orientation * dx / distance;
    const trimOffset = building.wallThickness / 2 + frame.thickness * 0.35;
    const along = (station, y) => [
      a.x + dx * station / distance + outwardX * trimOffset,
      y,
      a.z + dz * station / distance + outwardZ * trimOffset,
    ];
    const edgeOpenings = building.openings.filter((o) => o.edge === i);

    for (let floor = 0; floor < building.floors; floor++) {
      const y0 = floorBase + floor * building.floorHeight;
      const y1 = y0 + building.floorHeight;
      const onFloor = edgeOpenings.filter((o) => o.floor === floor).map((o) => ({
        ...o,
        left: o.at * distance - o.width / 2,
        right: o.at * distance + o.width / 2,
        bottom: y0 + o.sill,
        top: y0 + o.sill + o.height,
      }));
      const cuts = Array.from(new Set([0, distance,
        ...onFloor.flatMap((o) => [o.left, o.right])])).sort((x, y) => x - y);

      for (let j = 0; j < cuts.length - 1; j++) {
        const left = cuts[j], right = cuts[j + 1];
        const station = (left + right) / 2;
        const slot = onFloor.find((o) => station > o.left && station < o.right);

        if (slot) {
          rectangleSolid(walls, { a, dx, dz, distance }, left, right,
            y0, slot.bottom, building.wallThickness, materials.wall, 'Wall under opening');
          rectangleSolid(walls, { a, dx, dz, distance }, left, right,
            slot.top, y1, building.wallThickness, materials.wall, 'Wall over opening');
        } else {
          rectangleSolid(walls, { a, dx, dz, distance }, left, right,
            y0, y1, building.wallThickness, materials.wall, 'Solid exterior wall');
        }
      }

      for (const o of onFloor) {
        const beamDepth = building.wallThickness + 0.07;
        const beamSize = frame.thickness * 0.65;
        for (const x of [o.left, o.right]) {
          beam(openingsGroup, along(x, o.bottom), along(x, o.top),
            beamSize, beamDepth, materials.timber, 'Opening jamb');
        }
        beam(openingsGroup, along(o.left, o.top), along(o.right, o.top),
          beamSize, beamDepth, materials.timber, 'Opening lintel');

        if (o.type === 'window') {
          beam(openingsGroup, along(o.left, o.bottom), along(o.right, o.bottom),
            beamSize, beamDepth, materials.timber, 'Window sill');
          rectangleSolid(openingsGroup, { a, dx, dz, distance },
            o.left + 0.065, o.right - 0.065, o.bottom + 0.06, o.top - 0.06,
            0.025, materials.glass, 'Window glass');
          beam(openingsGroup, along((o.left + o.right) / 2, o.bottom),
            along((o.left + o.right) / 2, o.top), beamSize * 0.45,
            beamDepth, materials.timber, 'Window mullion');
        } else {
          rectangleSolid(openingsGroup, { a, dx, dz, distance },
            o.left + 0.055, o.right - 0.055, o.bottom + 0.04, o.top - 0.12,
            0.07, materials.timber, 'Wooden door');
        }
      }

      if (frame.enabled) {
        beam(framing, along(0, y0), along(distance, y0),
          frame.thickness, frame.thickness, materials.timber, 'Sill beam');
        beam(framing, along(0, y1), along(distance, y1),
          frame.thickness, frame.thickness, materials.timber, 'Floor ring beam');

        const bayCount = Math.max(1, Math.ceil(distance / frame.spacing));
        const stations = Array.from({ length: bayCount + 1 },
          (_, j) => distance * j / bayCount);

        for (const station of stations) {
          const crossesOpening = onFloor.some((o) =>
            station > o.left - frame.thickness * 0.5 &&
            station < o.right + frame.thickness * 0.5
          );
          if (!crossesOpening) {
            beam(framing, along(station, y0), along(station, y1),
              frame.thickness, frame.thickness, materials.timber, 'Vertical post');
          }
        }

        for (let j = 0; j < stations.length - 1; j++) {
          const start = stations[j], end = stations[j + 1];
          if (onFloor.some((o) => o.left < end && o.right > start)) continue;
          beam(framing, along(start + frame.thickness / 2, y0 + 0.26),
            along(Math.min(end - frame.thickness / 2, start + (end - start) * 0.65),
              y0 + building.floorHeight * 0.72),
            frame.thickness * 0.73, frame.thickness,
            materials.timber, 'Diagonal timber brace');
        }
      }
    }
  }

  // Solid intermediate floors and ceilings are separate, useful meshes.
  for (let floor = 1; floor < building.floors; floor++) {
    const y = floorBase + floor * building.floorHeight;
    group.add(polygonSlab(footprint, () => y, 0.18, materials.timber,
      'Floor slab ' + (floor + 1)));
  }

  const roof = new THREE.Group();
  roof.name = 'Roof construction';
  group.add(roof);
  if (building.roof.type === 'gable') {
    gableRoof(roof, building, materials, roofBase);
  } else {
    generalRoof(roof, building, materials, roofBase);
  }

  return group;
}
