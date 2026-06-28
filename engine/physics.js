// ============================================================
// Physics Engine (Simple but effective)
// ============================================================
import { Vec3 } from './math.js';

export class Physics {
  constructor() {
    this.gravity = new Vec3(0, -20, 0);
    this.bodies = [];
  }

  addBody(body) {
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  update(dt, getTerrainHeight) {
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      b.velocity.addSelf(this.gravity.scale(dt));

      // Damping
      b.velocity.x *= Math.pow(0.98, dt*60);
      b.velocity.z *= Math.pow(0.98, dt*60);

      b.position.addSelf(b.velocity.scale(dt));

      // Terrain collision
      const groundY = getTerrainHeight(b.position.x, b.position.z);
      const minY = groundY + b.radius;
      if (b.position.y < minY) {
        b.position.y = minY;
        if (b.velocity.y < 0) {
          b.velocity.y *= -b.restitution;
          if (Math.abs(b.velocity.y) < 0.5) b.velocity.y = 0;
        }
        b.onGround = true;
      } else {
        b.onGround = false;
      }
    }
  }
}

export class RigidBody {
  constructor(options = {}) {
    this.position   = options.position   || new Vec3();
    this.velocity   = options.velocity   || new Vec3();
    this.radius     = options.radius     || 1.0;
    this.mass       = options.mass       || 1.0;
    this.restitution = options.restitution || 0.1;
    this.isStatic   = options.isStatic   || false;
    this.onGround   = false;
  }
}

// ---- Player Controller ----
export class PlayerController {
  constructor(physics) {
    this.physics = physics;
    this.body = physics.addBody(new RigidBody({
      position: new Vec3(0, 5, 0),
      radius: 0.9,
      mass: 80,
      restitution: 0.0
    }));
    this.yaw   = 0;   // horizontal rotation
    this.pitch = -0.2; // vertical camera angle
    this.moveSpeed = 12;
    this.jumpForce = 10;
    this.inVehicle = null;
    this.height = 1.8;
  }

  get position() { return this.body.position; }

  update(input, dt) {
    if (this.inVehicle) return;

    const speed = input.sprint ? this.moveSpeed * 1.8 : this.moveSpeed;

    // Movement directions based on yaw
    const forward = new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right   = new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let move = new Vec3();
    if (input.forward)  move.addSelf(forward);
    if (input.backward) move.addSelf(forward.scale(-1));
    if (input.left)     move.addSelf(right.scale(-1));
    if (input.right)    move.addSelf(right);

    if (move.length() > 0) {
      move = move.normalize().scale(speed);
      this.body.velocity.x = move.x;
      this.body.velocity.z = move.z;
    } else {
      this.body.velocity.x *= 0.8;
      this.body.velocity.z *= 0.8;
    }

    if (input.jump && this.body.onGround) {
      this.body.velocity.y = this.jumpForce;
    }

    // Mouse look
    this.yaw   += input.mouseDeltaX * 0.002;
    this.pitch += input.mouseDeltaY * 0.002;
    this.pitch = Math.max(-1.4, Math.min(0.5, this.pitch));
    input.mouseDeltaX = 0;
    input.mouseDeltaY = 0;
  }

  getCameraPosition() {
    const p = this.body.position;
    return new Vec3(p.x, p.y + this.height * 0.8, p.z);
  }

  getCameraTarget() {
    const cam = this.getCameraPosition();
    const dx = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const dy = Math.sin(this.pitch);
    const dz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    return cam.add(new Vec3(dx, dy, dz));
  }
}

// ---- Vehicle Controller ----
export class VehicleController {
  constructor(physics, x, z) {
    this.physics = physics;
    this.body = physics.addBody(new RigidBody({
      position: new Vec3(x, 1.0, z),
      radius: 1.0,
      mass: 1200,
      restitution: 0.0
    }));
    this.angle = 0;          // heading
    this.steerAngle = 0;
    this.speed = 0;
    this.engineForce = 0;
    this.brakeForce = 0;
    this.maxSteer = 0.6;
    this.maxSpeed = 35;
    this.acceleration = 18;
    this.braking = 30;
    this.driver = null;
    this.wheelSpin = 0;
  }

  get position() { return this.body.position; }

  update(input, dt) {
    const hasDriver = this.driver !== null;

    if (hasDriver) {
      // Throttle
      if (input.forward)  this.engineForce = this.acceleration;
      else if (input.backward) this.engineForce = -this.braking * 0.5;
      else this.engineForce = 0;

      // Brake
      if (input.brake) this.engineForce -= this.braking;

      // Steering
      const steerTarget = input.left ? -this.maxSteer : input.right ? this.maxSteer : 0;
      this.steerAngle += (steerTarget - this.steerAngle) * Math.min(1, dt * 6);
    }

    // Apply engine force to speed
    this.speed += this.engineForce * dt;

    // Drag
    this.speed *= Math.pow(0.96, dt * 60);

    // Clamp speed
    this.speed = Math.max(-this.maxSpeed * 0.4, Math.min(this.maxSpeed, this.speed));

    // Turn based on speed & steer
    if (Math.abs(this.speed) > 0.1) {
      const turnRate = (this.speed / this.maxSpeed) * this.steerAngle * 1.8;
      this.angle += turnRate * dt * Math.sign(this.speed);
    }

    // Move
    const dx = -Math.sin(this.angle) * this.speed * dt;
    const dz = -Math.cos(this.angle) * this.speed * dt;
    this.body.velocity.x = dx / dt;
    this.body.velocity.z = dz / dt;

    this.wheelSpin += this.speed * dt * 2.5;

    // Camera for driver
    if (hasDriver) {
      this.driver.yaw = this.angle;
      this.driver.body.position = this.body.position.add(new Vec3(0, 1.2, 0));
    }
  }

  getCameraPosition() {
    const p = this.body.position;
    const dist = 8, height = 3.5;
    return new Vec3(
      p.x + Math.sin(this.angle) * dist,
      p.y + height,
      p.z + Math.cos(this.angle) * dist
    );
  }

  getCameraTarget() {
    return this.body.position.add(new Vec3(0, 1, 0));
  }
}
