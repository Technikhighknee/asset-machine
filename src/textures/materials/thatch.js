// Original overlapping reed-bundle texture, kept independent of artstyle presets.
// Native raster: 512 px. Preview resolutions are box-filtered from that raster.

const SIZE = 512;
const fract = (x) => x - Math.floor(x);
const wrap = (n, size) => ((n % size) + size) % size;
const mix = (a, b, t) => a * (1 - t) + b * t;
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const hash = (x, y, seed) => {
  let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^seed)>>>0;
  n=Math.imul(n^(n>>>13),1274126177)>>>0;
  return ((n^(n>>>16))>>>0)/4294967295;
};
// Tileable value noise prevents a visible seam when the material repeats.
// Fine scales supply fiber dust and weathering, not rows of shingles.
function periodicNoise(x, y, cells, seed) {
  const u=x*cells/SIZE,v=y*cells/SIZE;
  const cx=Math.floor(u),cy=Math.floor(v),fx=smooth(fract(u)),fy=smooth(fract(v));
  const a=hash(wrap(cx,cells),wrap(cy,cells),seed);
  const b=hash(wrap(cx+1,cells),wrap(cy,cells),seed);
  const c=hash(wrap(cx,cells),wrap(cy+1,cells),seed);
  const d=hash(wrap(cx+1,cells),wrap(cy+1,cells),seed);
  return mix(mix(a,b,fx),mix(c,d,fx),fy);
}


function renderThatch(seeds) {
  const count = SIZE * SIZE;
  const albedo = new Float32Array(count * 3);
  const height = new Float32Array(count);
  const roughness = new Float32Array(count);
  const pattern = seeds.pattern >>> 0;
  const color = seeds.color >>> 0;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x;
    const broad=periodicNoise(x,y,7,color^0x56430b2d)-.5;
    const medium=periodicNoise(x,y,29,color^0x4e8a16cc)-.5;
    const fine=periodicNoise(x,y,79,pattern^0x193ae587)-.5;
    const grain=hash(x,y,color^0x72de20f3)-.5;
    const t=broad*.17+medium*.075+fine*.044+grain*.037;
    albedo[i*3]=.49+t;
    albedo[i*3+1]=.36+t*.80;
    albedo[i*3+2]=.215+t*.65;
    height[i]=.16+medium*.055+fine*.038;
    roughness[i]=.91+medium*.05+fine*.025+grain*.02;
  }

  // Structure and color have separate seeded streams.
  let state = (pattern ^ 0xa56be231) >>> 0;
  const random = () => {
    state=(state+0x6d2b79f5)>>>0;
    let z=state;
    z=Math.imul(z^(z>>>15),z|1);
    z^=z+Math.imul(z^(z>>>7),z|61);
    return ((z^(z>>>14))>>>0)/4294967296;
  };
  for (let bundle = 0; bundle < 1850; bundle++) {
    const cx=random()*SIZE,cy=random()*SIZE;
    const spread=5+random()*12;
    const tilt=(random()-.5)*.24;
    const sway=(random()-.5)*6;
    const bundleTone=(hash(bundle,0,color^0x8f1a4dc7)-.5)*.21;
    const strands=8+Math.floor(random()*10);
    for (let fiber = 0; fiber < strands; fiber++) {
      const startX=cx+(random()-.5)*spread;
      const startY=cy+(random()-.5)*18;
      const length=18+random()*72;
      const bend=(random()-.5)*4;
      const width=.46+random()*1.05;
      const strandTone=bundleTone+(hash(bundle,fiber,color)-.5)*.18;
      const red=clamp(.48+strandTone,.25,.72);
      const green=clamp(.36+strandTone*.81,.18,.60);
      const blue=clamp(.20+strandTone*.66,.09,.40);
      const ridge=.27+random()*.20;
      const direction=tilt+(random()-.5)*.14;
      const steps=Math.ceil(length);
      for (let step = 0; step <= steps; step++) {
        const t=step/steps;
        const tip=Math.min(1,step/4,(steps-step)/8);
        if(tip<=0)continue;
        const yy=wrap(Math.floor(startY+step),SIZE);
        const xx=startX+direction*step+(sway+bend)*Math.sin(t*Math.PI);
        const minX=Math.floor(xx-width-1),maxX=Math.ceil(xx+width+1);
        for (let x = minX; x <= maxX; x++) {
          const distance=Math.abs((x+.5)-xx);
          const coverage=clamp(width+.5-distance,0,1)*tip;
          if(coverage<=0)continue;
          const i=yy*SIZE+wrap(x,SIZE);
          const alpha=coverage*.74;
          const offset=i*3;
          albedo[offset]=mix(albedo[offset],red,alpha);
          albedo[offset+1]=mix(albedo[offset+1],green,alpha);
          albedo[offset+2]=mix(albedo[offset+2],blue,alpha);
          const center=1-clamp(distance/(width+.25),0,1);
          height[i]=mix(height[i],.18+ridge*center,alpha*.8);
          roughness[i]=mix(roughness[i],.86+strandTone*.10,alpha*.65);
        }
      }
    }
  }
  return { albedo, height, roughness };
}

let lastThatch = null;

function thatchData(seeds) {
  if (!lastThatch ||
      lastThatch.pattern !== seeds.structure ||
      lastThatch.color !== seeds.pigment) {
    lastThatch = {
      pattern: seeds.structure,
      color: seeds.pigment,
      data: renderThatch({ pattern: seeds.structure, color: seeds.pigment }),
    };
  }

  return lastThatch.data;
}

function packTextures(source, size) {
  // Filter the native 512 px raster for lower-resolution previews.
  const step = SIZE / size;
  const count = size * size;
  const albedo = new Uint8Array(count * 4);
  const roughness = new Uint8Array(count * 4);
  const height = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const heights = new Float32Array(count);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const dst = p * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let z = 0;
      let rough = 0;

      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const src = (y * step + dy) * SIZE + x * step + dx;

          r += source.albedo[src * 3];
          g += source.albedo[src * 3 + 1];
          b += source.albedo[src * 3 + 2];
          z += source.height[src];
          rough += source.roughness[src];
        }
      }

      const samples = step * step;
      albedo[dst] = Math.round(clamp(r / samples * 255));
      albedo[dst + 1] = Math.round(clamp(g / samples * 255));
      albedo[dst + 2] = Math.round(clamp(b / samples * 255));
      heights[p] = z / samples;
      const heightByte = Math.round(clamp(heights[p] * 255));
      const roughnessByte = Math.round(clamp(rough / samples, 0, 1) * 255);

      for (let channel = 0; channel < 3; channel++) {
        height[dst + channel] = heightByte;
        roughness[dst + channel] = roughnessByte;
      }

      albedo[dst + 3] = 255;
      height[dst + 3] = 255;
      roughness[dst + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = heights[y * size + wrap(x - 1, size)];
      const right = heights[y * size + wrap(x + 1, size)];
      const up = heights[wrap(y - 1, size) * size + x];
      const down = heights[wrap(y + 1, size) * size + x];
      const dx = (right - left) * 1.8;
      const dy = (down - up) * 1.8;
      const length = Math.hypot(dx, dy, 1);
      const dst = (y * size + x) * 4;

      normal[dst] = Math.round((1 - dx / length) * 127.5);
      normal[dst + 1] = Math.round((1 - dy / length) * 127.5);
      normal[dst + 2] = Math.round((1 + 1 / length) * 127.5);
      normal[dst + 3] = 255;
    }
  }

  return { width: size, height: size, maps: { albedo, normal, roughness, height } };
}

export const thatch = {
  label: 'Reed Thatch',

  generate({ size, seeds }) {
    return packTextures(thatchData(seeds), size);
  },
};
