// ============================================================
// Main Game Engine - Orchestrates all systems
// ============================================================
import { Renderer }       from './engine/renderer.js';
import { InputManager }   from './engine/input.js';
import { Physics, PlayerController, VehicleController } from './engine/physics.js';
import { Mat4, Vec3 }     from './engine/math.js';
import { NoiseGen, generateTerrain, generateCityBuildings, generateCar, generateWheel, generateGroundPlane, generateRoad } from './engine/world.js';
import { createProceduralTextures } from './engine/textures.js';
import {
  GBufferVS, GBufferFS,
  LightingVS, LightingFS,
  ShadowVS, ShadowFS,
  SSAOVS, SSAOFS,
  BloomFS, BlurFS, BrightFS
} from './engine/shaders.js';

export class Game {
  constructor(canvas) {
    this.canvas   = canvas;
    this.renderer = new Renderer(canvas);
    this.input    = new InputManager(canvas);
    this.physics  = new Physics();
    this.noise    = new NoiseGen(42);
    this.time     = 0;
    this.running  = false;

    // Scene objects
    this.meshes    = [];
    this.vehicles  = [];
    this.player    = null;

    // Shader programs
    this.prog = {};

    this._initShaders();
    this._initScene();
  }

  _initShaders() {
    const r = this.renderer;
    this.prog.gbuffer  = r.createProgram(GBufferVS, GBufferFS);
    this.prog.lighting = r.createProgram(LightingVS, LightingFS);
    this.prog.shadow   = r.createProgram(ShadowVS, ShadowFS);
    this.prog.ssao     = r.createProgram(SSAOVS, SSAOFS);
    this.prog.blur     = r.createProgram(LightingVS, BlurFS);
    this.prog.bright   = r.createProgram(LightingVS, BrightFS);
    this.prog.bloom    = r.createProgram(LightingVS, BloomFS);

    // Cache uniform locations
    this._cacheUniforms();
  }

  _cacheUniforms() {
    const gl = this.renderer.gl;
    const prog = this.prog;

    this.uloc = {
      gbuf: {
        model: gl.getUniformLocation(prog.gbuffer, 'uModel'),
        view:  gl.getUniformLocation(prog.gbuffer, 'uView'),
        proj:  gl.getUniformLocation(prog.gbuffer, 'uProj'),
        normalMatrix: gl.getUniformLocation(prog.gbuffer, 'uNormalMatrix'),
        albedo:   gl.getUniformLocation(prog.gbuffer, 'uAlbedo'),
        metallic: gl.getUniformLocation(prog.gbuffer, 'uMetallic'),
        roughness:gl.getUniformLocation(prog.gbuffer, 'uRoughness'),
        ao:       gl.getUniformLocation(prog.gbuffer, 'uAO'),
        albedoMap:   gl.getUniformLocation(prog.gbuffer, 'uAlbedoMap'),
        hasAlbedoMap:gl.getUniformLocation(prog.gbuffer, 'uHasAlbedoMap'),
        hasNormalMap:gl.getUniformLocation(prog.gbuffer, 'uHasNormalMap'),
        hasRoughnessMap: gl.getUniformLocation(prog.gbuffer, 'uHasRoughnessMap'),
      },
      light: {
        gAlbedo:   gl.getUniformLocation(prog.lighting, 'gAlbedo'),
        gNormal:   gl.getUniformLocation(prog.lighting, 'gNormal'),
        gMaterial: gl.getUniformLocation(prog.lighting, 'gMaterial'),
        gDepth:    gl.getUniformLocation(prog.lighting, 'gDepth'),
        invViewProj: gl.getUniformLocation(prog.lighting, 'uInvViewProj'),
        cameraPos:   gl.getUniformLocation(prog.lighting, 'uCameraPos'),
        sunDir:    gl.getUniformLocation(prog.lighting, 'uSunDir'),
        sunColor:  gl.getUniformLocation(prog.lighting, 'uSunColor'),
        ambient:   gl.getUniformLocation(prog.lighting, 'uAmbient'),
        shadowMap: gl.getUniformLocation(prog.lighting, 'uShadowMap'),
        shadowMatrix: gl.getUniformLocation(prog.lighting, 'uShadowMatrix'),
        shadowBias:   gl.getUniformLocation(prog.lighting, 'uShadowBias'),
      },
      shadow: {
        lightMVP: gl.getUniformLocation(prog.shadow, 'uLightMVP'),
      }
    };
  }

  _initScene() {
    const r = this.renderer;
    const gl = r.gl;
    const noise = this.noise;

    // Textures
    this.textures = createProceduralTextures(gl);

    // Terrain chunks
    this.terrainMeshes = [];
    const chunkSize = 200;
    const gridRes   = 80;
    for (let cx = -2; cx <= 1; cx++) {
      for (let cz = -2; cz <= 1; cz++) {
        const geo = generateTerrain(noise, cx*chunkSize, cz*chunkSize, chunkSize, gridRes);
        const mesh = r.createMesh(geo.positions, geo.normals, geo.uvs, geo.tangents, geo.indices);
        this.terrainMeshes.push({ mesh, material: { albedo:[0.3,0.5,0.2], metallic:0.0, roughness:0.9, ao:1.0, tex: this.textures.grass } });
      }
    }

    // Roads
    const roadGeo = generateRoad(noise);
    const roadMesh = r.createMesh(roadGeo.positions, roadGeo.normals, roadGeo.uvs, roadGeo.tangents, roadGeo.indices);
    this.roadMesh = { mesh: roadMesh, material: { albedo:[0.15,0.15,0.15], metallic:0.0, roughness:0.95, ao:1.0, tex: this.textures.asphalt } };

    // Buildings
    this.buildingMeshes = [];
    const buildings = generateCityBuildings(noise);
    buildings.forEach(b => {
      const mesh = r.createMesh(b.mesh.positions, b.mesh.normals, b.mesh.uvs, b.mesh.tangents, b.mesh.indices);
      let tex = this.textures.concrete;
      if (b.metallic > 0.5) tex = this.textures.glass;
      else if (b.metallic > 0.2) tex = this.textures.metal;
      this.buildingMeshes.push({ mesh, material: { albedo: b.albedo, metallic: b.metallic, roughness: b.roughness, ao: 1.0, tex } });
    });

    // Vehicles (parked cars)
    this.vehicleMeshes = [];
    this.wheelMesh     = null;
    const carGeo   = generateCar(0, 0);
    const wheelGeo = generateWheel();
    const carMesh  = r.createMesh(carGeo.positions, carGeo.normals, carGeo.uvs, carGeo.tangents, carGeo.indices);
    this.wheelMesh = r.createMesh(wheelGeo.positions, wheelGeo.normals, wheelGeo.uvs, wheelGeo.tangents, wheelGeo.indices);

    // Create driveable vehicles
    const carPositions = [
      { x: 15, z: 10 }, { x: -20, z: 30 }, { x: 40, z: -15 },
      { x: -35, z: -20 }, { x: 25, z: -45 }, { x: -10, z: 60 }
    ];
    carPositions.forEach((p, i) => {
      const vc = new VehicleController(this.physics, p.x, p.z);
      vc.angle = (i * 1.1) % (Math.PI * 2);
      this.vehicles.push(vc);
      this.vehicleMeshes.push({ mesh: carMesh, vehicle: vc, color: this._carColor(i) });
    });

    // Player
    this.player = new PlayerController(this.physics);

    // Sun
    this.sunDir = new Vec3(-0.5, -1, -0.7).normalize();
    this.sunColor = [1.8, 1.6, 1.3];
  }

  _carColor(i) {
    const colors = [
      [0.8,0.1,0.1], [0.1,0.1,0.8], [0.1,0.5,0.1],
      [0.7,0.6,0.1], [0.5,0.5,0.5], [0.8,0.4,0.1]
    ];
    return colors[i % colors.length];
  }

  getTerrainHeight(wx, wz) {
    const noise = this.noise;
    const h = noise.fbm(wx * 0.008, wz * 0.008, 7) * 22;
    const dist = Math.sqrt(wx*wx + wz*wz);
    const flatBlend = Math.max(0, 1 - dist / 120);
    return h * (1 - flatBlend * 0.85);
  }

  start() {
    this.running = true;
    this._lastTime = performance.now();
    requestAnimationFrame(t => this._loop(t));
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this._lastTime) / 1000, 0.033);
    this._lastTime = now;
    this.time += dt;

    this._update(dt);
    this._render();

    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    const input = this.input;

    // Check enter/exit vehicle
    if (input.consumeInteract()) {
      if (this.player.inVehicle) {
        // Exit vehicle
        const v = this.player.inVehicle;
        v.driver = null;
        this.player.inVehicle = null;
        const vp = v.body.position;
        this.player.body.position = new Vec3(vp.x + 3, vp.y + 1, vp.z);
      } else {
        // Try enter nearest vehicle
        const pp = this.player.body.position;
        let nearest = null, minDist = 5;
        for (const v of this.vehicles) {
          const d = pp.sub(v.body.position).length();
          if (d < minDist) { minDist = d; nearest = v; }
        }
        if (nearest) {
          this.player.inVehicle = nearest;
          nearest.driver = this.player;
        }
      }
    }

    // Update player / active vehicle
    if (this.player.inVehicle) {
      this.player.inVehicle.update(input, dt);
      // Player camera yaw follows vehicle
      this.player.yaw   += input.mouseDeltaX * 0.002;
      this.player.pitch += input.mouseDeltaY * 0.002;
      this.player.pitch  = Math.max(-0.8, Math.min(0.5, this.player.pitch));
      input.mouseDeltaX = 0;
      input.mouseDeltaY = 0;
    } else {
      this.player.update(input, dt);
    }

    // Update idle vehicles physics
    for (const v of this.vehicles) {
      if (!v.driver) {
        // Still apply gravity via physics
        this.physics.update(dt, (x,z) => this.getTerrainHeight(x,z));
        break;
      }
    }
    this.physics.update(dt, (x,z) => this.getTerrainHeight(x,z));

    // Keep player/vehicle on terrain
    for (const v of this.vehicles) {
      const gh = this.getTerrainHeight(v.body.position.x, v.body.position.z) + 0.5;
      if (v.body.position.y < gh) v.body.position.y = gh;
    }
  }

  _render() {
    const r = this.renderer;
    const gl = r.gl;
    const w = r.width, h = r.height;

    // Camera matrices
    let camPos, camTarget;
    if (this.player.inVehicle) {
      camPos    = this.player.inVehicle.getCameraPosition();
      camTarget = this.player.inVehicle.getCameraTarget();
    } else {
      camPos    = this.player.getCameraPosition();
      camTarget = this.player.getCameraTarget();
    }

    const view = Mat4.lookAt(camPos, camTarget, new Vec3(0,1,0));
    const proj = Mat4.perspective(Math.PI/3, w/h, 0.3, 800);
    const viewProj = proj.multiply(view);
    const invViewProj = viewProj.invert();

    // ---- Shadow Pass ----
    const shadowRange = 120;
    const lightPos = camPos.sub(this.sunDir.scale(80));
    const lightView = Mat4.lookAt(lightPos, camPos, new Vec3(0,1,0));
    const lightProj = Mat4.ortho(-shadowRange, shadowRange, -shadowRange, shadowRange, 0.1, 300);
    const lightVP   = lightProj.multiply(lightView);
    const shadowMat = lightVP;

    gl.bindFramebuffer(gl.FRAMEBUFFER, r.shadowFBO.fbo);
    gl.viewport(0, 0, r.shadowFBO.size, r.shadowFBO.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.prog.shadow);
    this._renderShadowScene(lightVP);

    // ---- GBuffer Pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.gBuffer.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.prog.gbuffer);
    this._renderGBufferScene(view, proj);

    // ---- Lighting Pass (to scene FBO) ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.sceneFBO.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.prog.lighting);

    const ul = this.uloc.light;
    gl.uniform1i(ul.gAlbedo,   0);  r.bindTexture(0, r.gBuffer.albedo);
    gl.uniform1i(ul.gNormal,   1);  r.bindTexture(1, r.gBuffer.normal);
    gl.uniform1i(ul.gMaterial, 2);  r.bindTexture(2, r.gBuffer.material);
    gl.uniform1i(ul.gDepth,    3);  r.bindTexture(3, r.gBuffer.depthTex);
    gl.uniform1i(ul.shadowMap, 4);  r.bindTexture(4, r.shadowFBO.shadowTex);
    gl.uniformMatrix4fv(ul.invViewProj, false, invViewProj.m);
    gl.uniform3f(ul.cameraPos, camPos.x, camPos.y, camPos.z);
    gl.uniform3f(ul.sunDir, this.sunDir.x, this.sunDir.y, this.sunDir.z);
    gl.uniform3fv(ul.sunColor, this.sunColor);
    gl.uniform1f(ul.ambient, 0.06);
    gl.uniformMatrix4fv(ul.shadowMatrix, false, shadowMat.m);
    gl.uniform1f(ul.shadowBias, 0.002);
    r.drawQuad();

    // ---- Bloom ----
    // Bright extract (half-res)
    const bw = Math.floor(w/2), bh = Math.floor(h/2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.bloomFBOs[0].fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(this.prog.bright);
    gl.uniform1i(gl.getUniformLocation(this.prog.bright, 'uScene'), 0);
    r.bindTexture(0, r.sceneFBO.tex);
    r.drawQuad();

    // Blur ping-pong (2 passes)
    for (let pass = 0; pass < 4; pass++) {
      const src = r.bloomFBOs[pass % 2];
      const dst = r.bloomFBOs[(pass+1) % 2];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(this.prog.blur);
      gl.uniform1i(gl.getUniformLocation(this.prog.blur, 'uTex'), 0);
      gl.uniform1i(gl.getUniformLocation(this.prog.blur, 'uHorizontal'), pass % 2 === 0 ? 1 : 0);
      r.bindTexture(0, src.tex);
      r.drawQuad();
    }

    // ---- Final composite to screen ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog.bloom);
    gl.uniform1i(gl.getUniformLocation(this.prog.bloom, 'uScene'), 0);
    gl.uniform1i(gl.getUniformLocation(this.prog.bloom, 'uBloom'), 1);
    r.bindTexture(0, r.sceneFBO.tex);
    r.bindTexture(1, r.bloomFBOs[1].tex);
    r.drawQuad();
  }

  _setGBufferUniforms(model, albedo, metallic, roughness, ao, tex) {
    const gl = this.renderer.gl;
    const ug = this.uloc.gbuf;
    gl.uniformMatrix4fv(ug.model, false, model.m);
    gl.uniformMatrix3fv(ug.normalMatrix, false, model.normalMatrix());
    gl.uniform3fv(ug.albedo, albedo);
    gl.uniform1f(ug.metallic, metallic);
    gl.uniform1f(ug.roughness, roughness);
    gl.uniform1f(ug.ao, ao);
    gl.uniform1i(ug.hasAlbedoMap, tex ? 1 : 0);
    gl.uniform1i(ug.hasNormalMap, 0);
    gl.uniform1i(ug.hasRoughnessMap, 0);
    if (tex) {
      gl.uniform1i(ug.albedoMap, 0);
      this.renderer.bindTexture(0, tex);
    }
  }

  _renderGBufferScene(view, proj) {
    const gl = this.renderer.gl;
    const ug = this.uloc.gbuf;
    gl.uniformMatrix4fv(ug.view, false, view.m);
    gl.uniformMatrix4fv(ug.proj, false, proj.m);

    // Terrain
    for (const t of this.terrainMeshes) {
      const model = new Mat4();
      this._setGBufferUniforms(model, t.material.albedo, t.material.metallic, t.material.roughness, t.material.ao, t.material.tex);
      this._drawMesh(t.mesh);
    }

    // Roads
    {
      const rm = this.roadMesh;
      const model = new Mat4();
      this._setGBufferUniforms(model, rm.material.albedo, rm.material.metallic, rm.material.roughness, rm.material.ao, rm.material.tex);
      this._drawMesh(rm.mesh);
    }

    // Buildings
    for (const b of this.buildingMeshes) {
      const model = new Mat4();
      this._setGBufferUniforms(model, b.material.albedo, b.material.metallic, b.material.roughness, b.material.ao, b.material.tex);
      this._drawMesh(b.mesh);
    }

    // Vehicles
    for (let i = 0; i < this.vehicles.length; i++) {
      const vc = this.vehicles[i];
      const vm = this.vehicleMeshes[i];
      const p = vc.body.position;

      const model = Mat4.translation(p).multiply(Mat4.rotationY(vc.angle));
      this._setGBufferUniforms(model, vm.color, 0.8, 0.15, 1.0, this.textures.metal);
      this._drawMesh(vm.mesh);

      // Wheels: FL, FR, RL, RR
      const wheelOffsets = [
        new Vec3(-1.2, 0.0,  0.95),
        new Vec3(-1.2, 0.0, -0.95),
        new Vec3( 1.1, 0.0,  0.95),
        new Vec3( 1.1, 0.0, -0.95),
      ];
      for (let w = 0; w < 4; w++) {
        const wo = wheelOffsets[w];
        const rotatedOffset = new Vec3(
          wo.x * Math.cos(vc.angle) - wo.z * Math.sin(vc.angle),
          wo.y,
          wo.x * Math.sin(vc.angle) + wo.z * Math.cos(vc.angle)
        );
        const wpos = p.add(rotatedOffset);
        const groundH = this.getTerrainHeight(wpos.x, wpos.z) + 0.38;
        wpos.y = Math.max(wpos.y, groundH);

        const steerRot = (w < 2) ? Mat4.rotationY(vc.steerAngle) : new Mat4();
        const spinRot  = Mat4.rotationX(vc.wheelSpin);
        // Left side wheels flip Z
        const sideFlip = (w % 2 === 1) ? Mat4.scale(new Vec3(1,1,-1)) : new Mat4();
        const wmodel   = Mat4.translation(wpos).multiply(Mat4.rotationY(vc.angle)).multiply(steerRot).multiply(spinRot).multiply(sideFlip);

        this._setGBufferUniforms(wmodel, [0.1,0.1,0.1], 0.0, 0.95, 1.0, this.textures.tire);
        this._drawMesh(this.wheelMesh);
      }
    }
  }

  _renderShadowScene(lightVP) {
    const gl = this.renderer.gl;
    gl.uniformMatrix4fv(this.uloc.shadow.lightMVP, false, lightVP.m);

    // Draw terrain
    for (const t of this.terrainMeshes) {
      gl.uniformMatrix4fv(this.uloc.shadow.lightMVP, false,
        lightVP.multiply(new Mat4()).m);
      this._drawMesh(t.mesh);
    }

    // Buildings
    for (const b of this.buildingMeshes) {
      gl.uniformMatrix4fv(this.uloc.shadow.lightMVP, false, lightVP.m);
      this._drawMesh(b.mesh);
    }

    // Vehicles
    for (let i = 0; i < this.vehicles.length; i++) {
      const vc = this.vehicles[i];
      const vm = this.vehicleMeshes[i];
      const p = vc.body.position;
      const model = Mat4.translation(p).multiply(Mat4.rotationY(vc.angle));
      gl.uniformMatrix4fv(this.uloc.shadow.lightMVP, false, lightVP.multiply(model).m);
      this._drawMesh(vm.mesh);
    }
  }

  _drawMesh(mesh) {
    const gl = this.renderer.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}
