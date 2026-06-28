// ============================================================
// Procedural Texture Generator
// ============================================================

export function createProceduralTextures(gl) {
  return {
    concrete:   makeConcreteTexture(gl),
    asphalt:    makeAsphaltTexture(gl),
    glass:      makeGlassTexture(gl),
    metal:      makeMetalTexture(gl),
    grass:      makeGrassTexture(gl),
    carBody:    makeCarBodyTexture(gl),
    tire:       makeTireTexture(gl),
    roadLines:  makeRoadLineTexture(gl),
  };
}

function makeTexture(gl, size, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

function noise2D(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function fbmCanvas(ctx, size, scale, octaves, r, g, b) {
  const imageData = ctx.createImageData(size, size);
  const d = imageData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, freq = scale;
      for (let o = 0; o < octaves; o++) {
        v += amp * noise2D(x * freq / size, y * freq / size);
        amp *= 0.5; freq *= 2;
      }
      const i = (y * size + x) * 4;
      d[i]   = Math.min(255, r * v * 2);
      d[i+1] = Math.min(255, g * v * 2);
      d[i+2] = Math.min(255, b * v * 2);
      d[i+3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function makeConcreteTexture(gl) {
  return makeTexture(gl, 512, (ctx, s) => {
    fbmCanvas(ctx, s, 4, 5, 165, 160, 155);
    // Cracks
    ctx.strokeStyle = 'rgba(100,95,90,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random()*s, Math.random()*s);
      for (let j = 0; j < 5; j++) ctx.lineTo(Math.random()*s, Math.random()*s);
      ctx.stroke();
    }
  });
}

function makeAsphaltTexture(gl) {
  return makeTexture(gl, 512, (ctx, s) => {
    fbmCanvas(ctx, s, 8, 6, 55, 52, 50);
    // Road surface grain
    const imageData = ctx.getImageData(0, 0, s, s);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const grain = (Math.random() - 0.5) * 15;
      d[i]   = Math.max(0, Math.min(255, d[i]   + grain));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + grain));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + grain));
    }
    ctx.putImageData(imageData, 0, 0);
  });
}

function makeGlassTexture(gl) {
  return makeTexture(gl, 256, (ctx, s) => {
    // Gradient glass
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0,   'rgba(120,160,200,1)');
    grad.addColorStop(0.5, 'rgba(180,210,240,1)');
    grad.addColorStop(1,   'rgba(100,140,180,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    // Reflections
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random()*0.1})`;
      ctx.fillRect(Math.random()*s*0.5, Math.random()*s, s*0.3, s*0.05);
    }
    // Window frames
    ctx.strokeStyle = 'rgba(80,80,80,0.5)';
    ctx.lineWidth = 3;
    for (let y = 0; y < s; y += 48) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(s,y); ctx.stroke();
    }
    for (let x = 0; x < s; x += 48) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,s); ctx.stroke();
    }
  });
}

function makeMetalTexture(gl) {
  return makeTexture(gl, 256, (ctx, s) => {
    fbmCanvas(ctx, s, 2, 4, 180, 170, 160);
    // Brushed metal lines
    for (let y = 0; y < s; y += 3) {
      const alpha = (Math.random() * 0.08).toFixed(2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, y, s, 1);
    }
  });
}

function makeGrassTexture(gl) {
  return makeTexture(gl, 512, (ctx, s) => {
    fbmCanvas(ctx, s, 6, 5, 55, 100, 45);
    // Variation
    const id = ctx.getImageData(0,0,s,s);
    const d = id.data;
    for (let i = 0; i < d.length; i+=4) {
      const v = (Math.random()-0.5)*20;
      d[i]   = Math.max(0,Math.min(255, d[i]+v));
      d[i+1] = Math.max(0,Math.min(255, d[i+1]+v*1.5));
      d[i+2] = Math.max(0,Math.min(255, d[i+2]+v));
    }
    ctx.putImageData(id, 0, 0);
  });
}

function makeCarBodyTexture(gl) {
  return makeTexture(gl, 256, (ctx, s) => {
    // Deep red metallic
    const grad = ctx.createLinearGradient(0,0,s,s);
    grad.addColorStop(0,   '#cc2222');
    grad.addColorStop(0.4, '#ee4444');
    grad.addColorStop(1,   '#991111');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    // Metallic flakes
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(255,200,200,${Math.random()*0.15})`;
      ctx.fillRect(Math.random()*s, Math.random()*s, 2, 2);
    }
  });
}

function makeTireTexture(gl) {
  return makeTexture(gl, 128, (ctx, s) => {
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, s, s);
    // Tread pattern
    ctx.fillStyle = '#282828';
    for (let y = 0; y < s; y += 8) {
      ctx.fillRect(0, y, s, 4);
    }
  });
}

function makeRoadLineTexture(gl) {
  return makeTexture(gl, 128, (ctx, s) => {
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, s, s);
    // Center line
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(s/2-3, 0, 6, s);
    // Edge lines
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 0, 4, s);
    ctx.fillRect(s-6, 0, 4, s);
  });
}

// Create normal maps procedurally
export function createNormalMap(gl, size, bumpFn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const id = ctx.createImageData(size, size);
  const d = id.data;
  const eps = 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = bumpFn(x-eps, y);
      const hR = bumpFn(x+eps, y);
      const hD = bumpFn(x, y-eps);
      const hU = bumpFn(x, y+eps);
      const nx = (hL-hR) * 0.5 + 0.5;
      const ny = (hD-hU) * 0.5 + 0.5;
      const nz = 0.5 + 0.5;
      const i = (y*size+x)*4;
      d[i]   = nx*255;
      d[i+1] = ny*255;
      d[i+2] = nz*255;
      d[i+3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}
