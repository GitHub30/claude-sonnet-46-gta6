// ============================================================
// WebGL Renderer Core
// ============================================================

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Check extensions
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_float_blend');

    this.width = canvas.width;
    this.height = canvas.height;
    this._initGBuffer();
    this._initShadowMap();
    this._initSSAO();
    this._initBloom();
    this._initQuad();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this._initGBuffer();
    this._initSSAO();
    this._initBloom();
  }

  // ---- GBuffer ----
  _initGBuffer() {
    const gl = this.gl;
    const w = this.width, h = this.height;

    if (this.gBuffer) {
      gl.deleteFramebuffer(this.gBuffer.fbo);
      [this.gBuffer.albedo, this.gBuffer.normal, this.gBuffer.material].forEach(t => gl.deleteTexture(t));
      gl.deleteRenderbuffer(this.gBuffer.depth);
    }

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    const albedo   = this._createTexture(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const normal   = this._createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.FLOAT);
    const material = this._createTexture(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const depthTex = this._createTexture(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, albedo, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normal, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, material, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);

    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

    this.gBuffer = { fbo, albedo, normal, material, depthTex };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _initShadowMap() {
    const gl = this.gl;
    const size = 2048;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    const shadowTex = this._createTexture(size, size, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);

    this.shadowFBO = { fbo, shadowTex, size };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _initSSAO() {
    const gl = this.gl;
    const w = this.width, h = this.height;

    if (this.ssaoFBO) {
      gl.deleteFramebuffer(this.ssaoFBO.fbo);
      gl.deleteTexture(this.ssaoFBO.tex);
    }

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex = this._createTexture(w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    this.ssaoFBO = { fbo, tex };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // SSAO kernel
    this.ssaoKernel = [];
    for (let i = 0; i < 64; i++) {
      const s = [
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random()
      ];
      const len = Math.sqrt(s[0]*s[0]+s[1]*s[1]+s[2]*s[2]);
      const scale = (i/64) * (i/64);
      this.ssaoKernel.push(s[0]/len*scale, s[1]/len*scale, s[2]/len*scale);
    }

    // Noise texture
    const noiseData = new Float32Array(16 * 3);
    for (let i = 0; i < 16; i++) {
      noiseData[i*3]   = Math.random() * 2 - 1;
      noiseData[i*3+1] = Math.random() * 2 - 1;
      noiseData[i*3+2] = 0;
    }
    if (this.ssaoNoiseTex) gl.deleteTexture(this.ssaoNoiseTex);
    this.ssaoNoiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.ssaoNoiseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, 4, 4, 0, gl.RGB, gl.FLOAT, noiseData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  _initBloom() {
    const gl = this.gl;
    const w = Math.floor(this.width/2), h = Math.floor(this.height/2);

    if (this.bloomFBOs) {
      this.bloomFBOs.forEach(b => { gl.deleteFramebuffer(b.fbo); gl.deleteTexture(b.tex); });
    }
    if (this.sceneFBO) { gl.deleteFramebuffer(this.sceneFBO.fbo); gl.deleteTexture(this.sceneFBO.tex); }

    // Main scene HDR buffer
    const sfbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sfbo);
    const stex = this._createTexture(this.width, this.height, gl.RGBA16F, gl.RGBA, gl.FLOAT);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stex, 0);
    this.sceneFBO = { fbo: sfbo, tex: stex };

    this.bloomFBOs = [];
    for (let i = 0; i < 2; i++) {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const tex = this._createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.FLOAT);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.bloomFBOs.push({ fbo, tex });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _createTexture(w, h, internalFormat, format, type) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _initQuad() {
    const gl = this.gl;
    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    this.quadVAO = gl.createVertexArray();
    this.quadVBO = gl.createBuffer();
    gl.bindVertexArray(this.quadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  drawQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // Compile & link shader program
  createProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const vs = this._compile(gl.VERTEX_SHADER, vsSrc);
    const fs = this._compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader link error: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  _compile(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  // Upload mesh to GPU
  createMesh(positions, normals, uvs, tangents, indices) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Interleave: pos(3)+normal(3)+uv(2)+tangent(3) = 11 floats
    const count = positions.length / 3;
    const stride = 11;
    const verts = new Float32Array(count * stride);
    for (let i = 0; i < count; i++) {
      verts[i*stride]    = positions[i*3];
      verts[i*stride+1]  = positions[i*3+1];
      verts[i*stride+2]  = positions[i*3+2];
      verts[i*stride+3]  = normals[i*3];
      verts[i*stride+4]  = normals[i*3+1];
      verts[i*stride+5]  = normals[i*3+2];
      verts[i*stride+6]  = uvs ? uvs[i*2]   : 0;
      verts[i*stride+7]  = uvs ? uvs[i*2+1] : 0;
      verts[i*stride+8]  = tangents ? tangents[i*3]   : 1;
      verts[i*stride+9]  = tangents ? tangents[i*3+1] : 0;
      verts[i*stride+10] = tangents ? tangents[i*3+2] : 0;
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const byteStride = stride * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, byteStride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, byteStride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, byteStride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, byteStride, 32);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return { vao, vbo, ibo, indexCount: indices.length };
  }

  bindTexture(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }
}
