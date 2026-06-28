// ============================================================
// Procedural World Generation
// ============================================================
import { Vec3 } from './math.js';

// Simplex-like noise using permutation
class NoiseGen {
  constructor(seed = 42) {
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    // Shuffle
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = ((s >>> 0) % (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  fade(t){ return t*t*t*(t*(t*6-15)+10); }
  lerp(t,a,b){ return a+t*(b-a); }

  grad(hash, x, y, z){
    const h = hash & 15;
    const u = h<8?x:y, v = h<4?y:(h===12||h===14?x:z);
    return ((h&1)===0?u:-u)+((h&2)===0?v:-v);
  }

  noise(x, y, z){
    const p = this.p;
    const X=(Math.floor(x)&255), Y=(Math.floor(y)&255), Z=(Math.floor(z)&255);
    x-=Math.floor(x); y-=Math.floor(y); z-=Math.floor(z);
    const u=this.fade(x),v=this.fade(y),w=this.fade(z);
    const A=p[X]+Y, AA=p[A]+Z, AB=p[A+1]+Z;
    const B=p[X+1]+Y, BA=p[B]+Z, BB=p[B+1]+Z;
    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(p[AA],x,y,z),     this.grad(p[BA],x-1,y,z)),
        this.lerp(u, this.grad(p[AB],x,y-1,z),   this.grad(p[BB],x-1,y-1,z))),
      this.lerp(v,
        this.lerp(u, this.grad(p[AA+1],x,y,z-1), this.grad(p[BA+1],x-1,y,z-1)),
        this.lerp(u, this.grad(p[AB+1],x,y-1,z-1),this.grad(p[BB+1],x-1,y-1,z-1))));
  }

  fbm(x, y, octaves=6, lacunarity=2.0, gain=0.5){
    let val=0, amp=0.5, freq=1;
    for(let i=0; i<octaves; i++){
      val += amp * this.noise(x*freq, 0, y*freq);
      amp *= gain;
      freq *= lacunarity;
    }
    return val;
  }
}

export function generateTerrain(noise, cx, cz, chunkSize, gridRes) {
  const positions = [];
  const normals   = [];
  const uvs       = [];
  const tangents  = [];
  const indices   = [];

  const step = chunkSize / gridRes;
  const heightScale = 22;
  const uvScale = 0.08;

  function height(wx, wz) {
    const h = noise.fbm(wx * 0.008, wz * 0.008, 7) * heightScale;
    // Flatten city area in the center
    const dist = Math.sqrt(wx*wx + wz*wz);
    const flatBlend = Math.max(0, 1 - dist / 120);
    return h * (1 - flatBlend * 0.85);
  }

  for (let iz = 0; iz <= gridRes; iz++) {
    for (let ix = 0; ix <= gridRes; ix++) {
      const wx = cx + ix * step;
      const wz = cz + iz * step;
      const wy = height(wx, wz);

      positions.push(wx, wy, wz);
      uvs.push(wx * uvScale, wz * uvScale);

      // Normal via finite diff
      const eps = 0.5;
      const hL = height(wx-eps, wz);
      const hR = height(wx+eps, wz);
      const hD = height(wx, wz-eps);
      const hU = height(wx, wz+eps);
      const nx = hL - hR;
      const ny = 2 * eps;
      const nz = hD - hU;
      const nl = Math.sqrt(nx*nx+ny*ny+nz*nz);
      normals.push(nx/nl, ny/nl, nz/nl);
      tangents.push(1, 0, 0);
    }
  }

  for (let iz = 0; iz < gridRes; iz++) {
    for (let ix = 0; ix < gridRes; ix++) {
      const tl = iz*(gridRes+1)+ix;
      const tr = tl+1;
      const bl = tl+(gridRes+1);
      const br = bl+1;
      indices.push(tl,bl,tr, tr,bl,br);
    }
  }

  return { positions, normals, uvs, tangents, indices };
}

export function generateRoad(noise) {
  // Grid road network in the city center
  const positions = [];
  const normals   = [];
  const uvs       = [];
  const tangents  = [];
  const indices   = [];
  const roadWidth = 8;
  const roads = [];

  // Main roads
  for (let i = -3; i <= 3; i++) {
    roads.push({ x: i * 40, z: -150, dir: 'z', len: 300 });
    roads.push({ x: -150, z: i * 40, dir: 'x', len: 300 });
  }

  roads.forEach(road => {
    const base = positions.length / 3;
    if (road.dir === 'z') {
      const x = road.x;
      const z0 = road.z;
      const z1 = road.z + road.len;
      const y = 0.05;
      positions.push(
        x-roadWidth/2, y, z0,  x+roadWidth/2, y, z0,
        x-roadWidth/2, y, z1,  x+roadWidth/2, y, z1
      );
      normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
      uvs.push(0,0, 1,0, 0,road.len/roadWidth, 1,road.len/roadWidth);
      tangents.push(1,0,0, 1,0,0, 1,0,0, 1,0,0);
    } else {
      const z = road.z;
      const x0 = road.x;
      const x1 = road.x + road.len;
      const y = 0.05;
      positions.push(
        x0, y, z-roadWidth/2,  x1, y, z-roadWidth/2,
        x0, y, z+roadWidth/2,  x1, y, z+roadWidth/2
      );
      normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
      uvs.push(0,0, road.len/roadWidth,0, 0,1, road.len/roadWidth,1);
      tangents.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);
    }
    indices.push(
      base,base+2,base+1, base+1,base+2,base+3
    );
  });

  return { positions, normals, uvs, tangents, indices };
}

export function generateBuilding(x, z, w, d, h) {
  const positions = [];
  const normals   = [];
  const uvs       = [];
  const tangents  = [];
  const indices   = [];

  const y0 = 0, y1 = h;
  const verts = [
    // Front
    x,   y0, z+d,  x+w, y0, z+d,  x+w, y1, z+d,  x,   y1, z+d,
    // Back
    x+w, y0, z,    x,   y0, z,    x,   y1, z,    x+w, y1, z,
    // Left
    x,   y0, z,    x,   y0, z+d,  x,   y1, z+d,  x,   y1, z,
    // Right
    x+w, y0, z+d,  x+w, y0, z,    x+w, y1, z,    x+w, y1, z+d,
    // Top
    x,   y1, z,    x+w, y1, z,    x+w, y1, z+d,  x,   y1, z+d,
  ];

  const ns = [
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1,0,0,-1,0,0,-1,0,0,-1,
    -1,0,0,-1,0,0,-1,0,0,-1,0,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
  ];

  const ts = [
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0,-1,0,0,-1,0,0,-1,0,0,
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1,0,0,-1,0,0,-1,0,0,-1,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
  ];

  const uvScale = 0.3;
  const faceUVs = [
    0,0, w*uvScale,0, w*uvScale,h*uvScale, 0,h*uvScale,
    0,0, w*uvScale,0, w*uvScale,h*uvScale, 0,h*uvScale,
    0,0, d*uvScale,0, d*uvScale,h*uvScale, 0,h*uvScale,
    0,0, d*uvScale,0, d*uvScale,h*uvScale, 0,h*uvScale,
    0,0, w*uvScale,0, w*uvScale,d*uvScale, 0,d*uvScale,
  ];

  for (let f = 0; f < 5; f++) {
    const base = positions.length / 3;
    for (let v = 0; v < 4; v++) {
      const vi = f * 12 + v * 3;
      positions.push(verts[vi], verts[vi+1], verts[vi+2]);
      normals.push(ns[vi], ns[vi+1], ns[vi+2]);
      tangents.push(ts[vi], ts[vi+1], ts[vi+2]);
      const ui = f * 8 + v * 2;
      uvs.push(faceUVs[ui], faceUVs[ui+1]);
    }
    indices.push(base,base+1,base+2, base,base+2,base+3);
  }

  return { positions, normals, uvs, tangents, indices };
}

export function generateCityBuildings(noise) {
  const buildings = [];
  const rng = { v: 12345, next() {
    this.v = (this.v * 1664525 + 1013904223) & 0xffffffff;
    return (this.v >>> 0) / 4294967296;
  }};

  for (let bx = -5; bx <= 5; bx++) {
    for (let bz = -5; bz <= 5; bz++) {
      const cx = bx * 40;
      const cz = bz * 40;
      // Skip road areas
      if (Math.abs(bx) % 1 === 0 && Math.abs(cx) < 145) {
        const r1 = rng.next(), r2 = rng.next(), r3 = rng.next();
        const w = 12 + r1 * 16;
        const d = 12 + r2 * 16;
        const h = 8 + r3 * 55;
        const ox = cx + 5 + rng.next() * 4;
        const oz = cz + 5 + rng.next() * 4;

        // Materials: glass/concrete/metallic
        const matType = Math.floor(rng.next() * 3);
        let albedo, metallic, roughness;
        if (matType === 0) { albedo=[0.4,0.55,0.7]; metallic=0.9; roughness=0.05; } // glass
        else if(matType===1){ albedo=[0.55,0.52,0.5]; metallic=0.0; roughness=0.9; } // concrete
        else               { albedo=[0.7,0.65,0.6]; metallic=0.6; roughness=0.3; } // metal cladding

        buildings.push({ mesh: generateBuilding(ox, oz, w, d, h), albedo, metallic, roughness });
      }
    }
  }
  return buildings;
}

export function generateCar(x, z, angle = 0) {
  // Simple car geometry
  const positions = [];
  const normals   = [];
  const uvs       = [];
  const tangents  = [];
  const indices   = [];

  function addBox(px,py,pz, sx,sy,sz, albedo) {
    const x0=px-sx/2, x1=px+sx/2;
    const y0=py,      y1=py+sy;
    const z0=pz-sz/2, z1=pz+sz/2;

    const faceData = [
      // front
      [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [0,0,1],[1,0,0]],
      // back
      [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], [0,0,-1],[-1,0,0]],
      // left
      [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [-1,0,0],[0,0,1]],
      // right
      [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1], [1,0,0],[0,0,-1]],
      // top
      [[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1], [0,1,0],[1,0,0]],
      // bottom
      [[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0], [0,-1,0],[1,0,0]],
    ];

    faceData.forEach(([verts, n, t]) => {
      const base = positions.length / 3;
      verts.forEach((v,i) => {
        positions.push(v[0],v[1],v[2]);
        normals.push(n[0],n[1],n[2]);
        tangents.push(t[0],t[1],t[2]);
        const sz2 = Math.abs(sx+sz);
        uvs.push((i%2)*sz2*0.2, Math.floor(i/2)*sy*0.2);
      });
      indices.push(base,base+1,base+2, base,base+2,base+3);
    });
  }

  // Body
  addBox(0, 0.5, 0,  4.2, 0.8, 2.0);
  // Cabin
  addBox(0, 1.3, 0.1,  2.8, 0.8, 1.6);
  // Hood
  addBox(0.6, 0.5, 0,  1.4, 0.45, 1.9);
  // Trunk
  addBox(-0.8, 0.5, 0, 1.0, 0.45, 1.9);

  return { positions, normals, uvs, tangents, indices };
}

export function generateWheel() {
  const positions=[], normals=[], uvs=[], tangents=[], indices=[];
  const segs = 20;
  const R = 0.38, W = 0.22;

  // Cylinder wheel
  for (let i = 0; i <= segs; i++) {
    const a = (i/segs)*Math.PI*2;
    const c = Math.cos(a), s = Math.sin(a);
    // outer rim
    positions.push(c*R, s*R, -W/2);
    positions.push(c*R, s*R,  W/2);
    normals.push(c,s,0, c,s,0);
    uvs.push(i/segs,0, i/segs,1);
    tangents.push(-s,c,0, -s,c,0);
  }
  for (let i = 0; i < segs; i++) {
    const b = i*2, n = (i+1)*2;
    indices.push(b,n,b+1, b+1,n,n+1);
  }

  // Side caps
  const capBase = positions.length/3;
  positions.push(0,0,-W/2); normals.push(0,0,-1); uvs.push(0.5,0.5); tangents.push(1,0,0);
  positions.push(0,0, W/2); normals.push(0,0, 1); uvs.push(0.5,0.5); tangents.push(1,0,0);
  for (let i = 0; i < segs; i++) {
    const a0 = (i/segs)*Math.PI*2, a1 = ((i+1)/segs)*Math.PI*2;
    const c0=Math.cos(a0),s0=Math.sin(a0);
    const c1=Math.cos(a1),s1=Math.sin(a1);
    const e = positions.length/3;
    // Left cap
    positions.push(c0*R,s0*R,-W/2, c1*R,s1*R,-W/2);
    normals.push(0,0,-1, 0,0,-1); uvs.push(c0*0.5+0.5,s0*0.5+0.5, c1*0.5+0.5,s1*0.5+0.5);
    tangents.push(1,0,0, 1,0,0);
    indices.push(capBase, e+1, e);
    // Right cap
    const f = positions.length/3;
    positions.push(c0*R,s0*R,W/2, c1*R,s1*R,W/2);
    normals.push(0,0,1, 0,0,1); uvs.push(c0*0.5+0.5,s0*0.5+0.5, c1*0.5+0.5,s1*0.5+0.5);
    tangents.push(1,0,0, 1,0,0);
    indices.push(capBase+1, f, f+1);
  }

  return { positions, normals, uvs, tangents, indices };
}

export function generateGroundPlane() {
  const s = 600;
  return {
    positions: [-s,0,-s, s,0,-s, s,0,s, -s,0,s],
    normals:   [0,1,0, 0,1,0, 0,1,0, 0,1,0],
    uvs:       [0,0, s*0.05,0, s*0.05,s*0.05, 0,s*0.05],
    tangents:  [1,0,0, 1,0,0, 1,0,0, 1,0,0],
    indices:   [0,2,1, 0,3,2]
  };
}

export { NoiseGen };
