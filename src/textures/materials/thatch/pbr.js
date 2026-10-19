// PBR maps are derived from the same authored surface, never color noise.
const clamp = (value, a = 0, b = 1) => Math.max(a, Math.min(b, value));
const wrap = (value, size) => ((value % size) + size) % size;

function gray(map, offset, value) {
  const byte = Math.round(clamp(value) * 255);

  map[offset] = byte;
  map[offset + 1] = byte;
  map[offset + 2] = byte;
  map[offset + 3] = 255;
}

export function makeReedPbr(surface, size) {
  const count = size * size;
  const maps = {
    albedo: new Uint8Array(count * 4),
    normal: new Uint8Array(count * 4),
    roughness: new Uint8Array(count * 4),
    height: new Uint8Array(count * 4),
    ao: new Uint8Array(count * 4),
    cavity: new Uint8Array(count * 4),
  };
  const height16 = new Uint16Array(count);
  const h = surface.height;
  const at = (x, y) => h[wrap(y, size) * size + wrap(x, size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const offset = i * 4;

      for (let c = 0; c < 3; c++) {
        maps.albedo[offset + c] = Math.round(
          clamp(surface.color[i * 3 + c]) * 255);
      }
      maps.albedo[offset + 3] = 255;

      // Neutral height is 0.5; extra range makes usable 16-bit displacement
      // without changing the intentionally shallow physical surface.
      const packedHeight = clamp(0.5 + (h[i] - 0.5105) * 16);
      height16[i] = Math.round(packedHeight * 65535);

      gray(maps.height, offset, packedHeight);
      gray(maps.roughness, offset, surface.roughness[i]);

      const left = at(x - 1, y);
      const right = at(x + 1, y);
      const up = at(x, y - 1);
      const down = at(x, y + 1);

      // OpenGL (+Y), using derivatives in normalized material coordinates.
      const sx = (right - left) * size * 0.035;
      const sy = (down - up) * size * 0.035;
      const invLength = 1 / Math.hypot(sx, sy, 1);

      maps.normal[offset] = Math.round((1 - sx * invLength) * 127.5);
      maps.normal[offset + 1] = Math.round((1 - sy * invLength) * 127.5);
      maps.normal[offset + 2] = Math.round((1 + invLength) * 127.5);
      maps.normal[offset + 3] = 255;

      const nearby = (
        left + right + up + down +
        at(x - 1, y - 1) + at(x + 1, y - 1) +
        at(x - 1, y + 1) + at(x + 1, y + 1)
      ) / 8;

      gray(maps.cavity, offset,
        clamp(1 - Math.max(0, nearby - h[i]) * 23, 0.68, 1));

      // Approximate shallow fiber self-occlusion at three material scales.
      let shadow = 0;

      for (const radius of [5, 18, 45]) {
        const surrounding = (
          at(x - radius, y) + at(x + radius, y) +
          at(x, y - radius) + at(x, y + radius)
        ) / 4;

        shadow += Math.max(0, surrounding - h[i]) /
          (0.025 + radius / size * 0.32);
      }

      gray(maps.ao, offset, clamp(1 - shadow * 0.38, 0.62, 1));
    }
  }

  return { width: size, height: size, maps, height16 };
}
