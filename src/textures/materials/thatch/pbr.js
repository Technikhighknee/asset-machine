// Geometry and shading channels derived from the same surface.

function clamp(v, a = 0, b = 1) {return Math.max(a, Math.min(b, v))}

function gray(map, o, v) {
  const byte = Math.round(clamp(v)*255);
  map[o] = byte; map[o+1] = byte; map[o+2] = byte; map[o+3] = 255;
}

export function makeReedPbr(surface, size) {
  const n = size*size, h = surface.height, c = surface.color, rough = surface.roughness;
  const maps = {};
  for (const name of ["albedo", "normal", "roughness", "height", "ao", "cavity"]) {
    maps[name] = new Uint8Array(n*4);
  }
  const height16 = new Uint16Array(n);
  const at = (x, y)=>{
    const ix = x<0?x+size: x>=size?x-size: x;
    const iy = y<0?y+size: y>=size?y-size: y;
    return h[iy*size+ix];
  };
  for (let y = 0; y<size; y++) {
    for (let x = 0; x<size; x++) {
      const i = y*size+x, o = i*4, level = h[i];
      maps.albedo[o] = Math.round(clamp(c[i*3])*255);
      maps.albedo[o+1] = Math.round(clamp(c[i*3+1])*255);
      maps.albedo[o+2] = Math.round(clamp(c[i*3+2])*255);
      maps.albedo[o+3] = 255;
      const packed = clamp(0.5+(level-0.503)*18);
      height16[i] = Math.round(packed*65535);
      gray(maps.height, o, packed);
      gray(maps.roughness, o, rough[i]);
      const left = at(x-1, y), right = at(x+1, y), up = at(x, y-1), down = at(x, y+1);
      // Height describes broad bundles; visible fibers supply independent
      // tangent slopes. Their sum is normalized as one OpenGL normal.
      // Pixel rows increase downwards, hence positive down-up is +Y.
      const nx = -(right - left) * size * 0.055 + surface.microNormalX[i];
      const ny = (down - up) * size * 0.055 + surface.microNormalY[i];
      const inv = 1 / Math.hypot(nx, ny, 1);

      maps.normal[o] = Math.round((1 + nx*inv) * 127.5);
      maps.normal[o+1] = Math.round((1 + ny*inv) * 127.5);
      maps.normal[o+2] = Math.round((1 + inv) * 127.5);
      maps.normal[o+3] = 255;
      const neighborhood = (left+right+up+down+
      at(x-2, y)+at(x+2, y))/6;
      const compression = clamp((0.508 - surface.coarse[i]) / 0.008);

      gray(maps.cavity, o, clamp(
        1 - Math.max(0, neighborhood-level)*360 - compression*0.10,
        0.63,
        1,
      ));
      const first = (at(x-8, y)+at(x+8, y)+at(x, y-8)+at(x, y+8))/4;
      const second = (at(x-27, y)+at(x+27, y)+at(x, y-27)+at(x, y+27))/4;
      const horizon = 
      Math.max(0, first-level)/(0.022+8/size*0.22)+
      Math.max(0, second-level)/(0.022+27/size*0.22);
      gray(maps.ao, o, clamp(
        1 - horizon*0.68 - compression*0.125,
        0.62,
        1,
      ));
    }
  }
  return {width: size, height: size, maps, height16};
}
