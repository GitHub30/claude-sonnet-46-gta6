// ============================================================
// Math Utilities (Matrix4, Vector3, Quaternion)
// ============================================================

export class Vec3 {
  constructor(x=0, y=0, z=0){ this.x=x; this.y=y; this.z=z; }
  clone(){ return new Vec3(this.x, this.y, this.z); }
  add(v){ return new Vec3(this.x+v.x, this.y+v.y, this.z+v.z); }
  sub(v){ return new Vec3(this.x-v.x, this.y-v.y, this.z-v.z); }
  scale(s){ return new Vec3(this.x*s, this.y*s, this.z*s); }
  dot(v){ return this.x*v.x + this.y*v.y + this.z*v.z; }
  cross(v){ return new Vec3(this.y*v.z-this.z*v.y, this.z*v.x-this.x*v.z, this.x*v.y-this.y*v.x); }
  length(){ return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z); }
  normalize(){
    const l = this.length();
    return l > 0 ? this.scale(1/l) : new Vec3();
  }
  addSelf(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  scaleSelf(s){ this.x*=s; this.y*=s; this.z*=s; return this; }
  toArray(){ return [this.x, this.y, this.z]; }
  static fromArray(a){ return new Vec3(a[0],a[1],a[2]); }
  static lerp(a,b,t){ return new Vec3(a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t, a.z+(b.z-a.z)*t); }
}

export class Mat4 {
  constructor(){ this.m = new Float32Array(16); this.identity(); }

  identity(){
    const m = this.m;
    m[0]=1;m[1]=0;m[2]=0;m[3]=0;
    m[4]=0;m[5]=1;m[6]=0;m[7]=0;
    m[8]=0;m[9]=0;m[10]=1;m[11]=0;
    m[12]=0;m[13]=0;m[14]=0;m[15]=1;
    return this;
  }

  clone(){ const n = new Mat4(); n.m.set(this.m); return n; }

  static perspective(fov, aspect, near, far){
    const m = new Mat4();
    const f = 1.0 / Math.tan(fov / 2);
    m.m[0] = f / aspect;
    m.m[5] = f;
    m.m[10] = (far + near) / (near - far);
    m.m[11] = -1;
    m.m[14] = (2 * far * near) / (near - far);
    m.m[15] = 0;
    return m;
  }

  static ortho(l,r,b,t,n,f){
    const m = new Mat4();
    m.m[0]  = 2/(r-l); m.m[5]  = 2/(t-b); m.m[10] = -2/(f-n);
    m.m[12] = -(r+l)/(r-l);
    m.m[13] = -(t+b)/(t-b);
    m.m[14] = -(f+n)/(f-n);
    return m;
  }

  static lookAt(eye, center, up){
    const m = new Mat4();
    const f = center.sub(eye).normalize();
    const s = f.cross(up).normalize();
    const u = s.cross(f);
    m.m[0]=s.x;  m.m[4]=s.y;  m.m[8]=s.z;  m.m[12]=-s.dot(eye);
    m.m[1]=u.x;  m.m[5]=u.y;  m.m[9]=u.z;  m.m[13]=-u.dot(eye);
    m.m[2]=-f.x; m.m[6]=-f.y; m.m[10]=-f.z; m.m[14]=f.dot(eye);
    m.m[3]=0;    m.m[7]=0;    m.m[11]=0;    m.m[15]=1;
    return m;
  }

  static translation(v){
    const m = new Mat4();
    m.m[12]=v.x; m.m[13]=v.y; m.m[14]=v.z;
    return m;
  }

  static scale(v){
    const m = new Mat4();
    m.m[0]=v.x; m.m[5]=v.y; m.m[10]=v.z;
    return m;
  }

  static rotationY(angle){
    const m = new Mat4();
    const c=Math.cos(angle), s=Math.sin(angle);
    m.m[0]=c; m.m[2]=s; m.m[8]=-s; m.m[10]=c;
    return m;
  }

  static rotationX(angle){
    const m = new Mat4();
    const c=Math.cos(angle), s=Math.sin(angle);
    m.m[5]=c; m.m[6]=-s; m.m[9]=s; m.m[10]=c;
    return m;
  }

  multiply(b){
    const a = this.m, bm = b.m;
    const r = new Mat4();
    const rm = r.m;
    for(let i=0; i<4; i++){
      for(let j=0; j<4; j++){
        let sum=0;
        for(let k=0; k<4; k++) sum += a[i+k*4] * bm[k+j*4];
        rm[i+j*4] = sum;
      }
    }
    return r;
  }

  invert(){
    const m = this.m;
    const inv = new Float32Array(16);
    inv[0]  =  m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
    inv[4]  = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
    inv[8]  =  m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    inv[1]  = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
    inv[5]  =  m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
    inv[9]  = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
    inv[13] =  m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    inv[2]  =  m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
    inv[6]  = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
    inv[10] =  m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    inv[3]  = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
    inv[7]  =  m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
    inv[15] =  m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
    if(det === 0) return this;
    det = 1/det;
    const result = new Mat4();
    for(let i=0; i<16; i++) result.m[i] = inv[i]*det;
    return result;
  }

  normalMatrix(){
    // Return upper-left 3x3 of inverse transpose
    const inv = this.invert();
    const m = inv.m;
    return new Float32Array([
      m[0],m[4],m[8],
      m[1],m[5],m[9],
      m[2],m[6],m[10]
    ]);
  }

  transformVec3(v){
    const m = this.m;
    const x = m[0]*v.x + m[4]*v.y + m[8]*v.z  + m[12];
    const y = m[1]*v.x + m[5]*v.y + m[9]*v.z  + m[13];
    const z = m[2]*v.x + m[6]*v.y + m[10]*v.z + m[14];
    return new Vec3(x, y, z);
  }
}
