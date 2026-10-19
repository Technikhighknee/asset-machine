// Geometry and shading channels derived from the same surface.

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}

function wrap(v,n){return ((v%n)+n)%n}

function gray(map,o,v){
 const byte=Math.round(clamp(v)*255);
 map[o]=byte;map[o+1]=byte;map[o+2]=byte;map[o+3]=255;
}

export function makeReedPbr(surface,size){
 const n=size*size,h=surface.height,c=surface.color,rough=surface.roughness;
 const maps={};
 for(const name of ["albedo","normal","roughness","height","ao","cavity"]){
  maps[name]=new Uint8Array(n*4);
 }
 const height16=new Uint16Array(n);
 const at=(x,y)=>h[wrap(y,size)*size+wrap(x,size)];
 for(let y=0;y<size;y++){
  for(let x=0;x<size;x++){
   const i=y*size+x,o=i*4,level=h[i];
   maps.albedo[o]=Math.round(clamp(c[i*3])*255);
   maps.albedo[o+1]=Math.round(clamp(c[i*3+1])*255);
   maps.albedo[o+2]=Math.round(clamp(c[i*3+2])*255);
   maps.albedo[o+3]=255;
   const packed=clamp(0.5+(level-0.503)*18);
   height16[i]=Math.round(packed*65535);
   gray(maps.height,o,packed);
   gray(maps.roughness,o,rough[i]);
   const left=at(x-1,y),right=at(x+1,y),up=at(x,y-1),down=at(x,y+1);
   const dx=(right-left)*size*0.032;
   const dy=(down-up)*size*0.032;
   const inv=1/Math.hypot(dx,dy,1);
   maps.normal[o]=Math.round((1-dx*inv)*127.5);
   maps.normal[o+1]=Math.round((1-dy*inv)*127.5);
   maps.normal[o+2]=Math.round((1+inv)*127.5);
   maps.normal[o+3]=255;
   const neighborhood=(left+right+up+down+
    at(x-2,y)+at(x+2,y))/6;
   gray(maps.cavity,o,clamp(1-Math.max(0,neighborhood-level)*28,0.7,1));
   let horizon=0;
   for(const radius of [8,27]){
    const surrounding=(at(x-radius,y)+at(x+radius,y)+
     at(x,y-radius)+at(x,y+radius))/4;
    horizon+=Math.max(0,surrounding-level)/(0.022+radius/size*0.22);
   }
   const indent=Math.max(0,0.505-surface.coarse[i])*2;
   gray(maps.ao,o,clamp(1-horizon*0.42-indent,0.6,1));
  }
 }
 return {width:size,height:size,maps,height16};
}

