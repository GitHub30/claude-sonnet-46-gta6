// ============================================================
// Input Handler
// ============================================================

export class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.forward  = false;
    this.backward = false;
    this.left     = false;
    this.right    = false;
    this.jump     = false;
    this.sprint   = false;
    this.brake    = false;
    this.interact = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.pointerLocked = false;

    document.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      this._update();
      if (e.code === 'Space') { this.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE')  { this.interact = true; }
    });

    document.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      this._update();
      if (e.code === 'Space') this.jump = false;
      if (e.code === 'KeyE')  this.interact = false;
    });

    document.addEventListener('mousemove', e => {
      if (this.pointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });

    canvas.addEventListener('click', () => {
      canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  _update() {
    const k = this.keys;
    this.forward  = !!(k['KeyW'] || k['ArrowUp']);
    this.backward = !!(k['KeyS'] || k['ArrowDown']);
    this.left     = !!(k['KeyA'] || k['ArrowLeft']);
    this.right    = !!(k['KeyD'] || k['ArrowRight']);
    this.sprint   = !!(k['ShiftLeft'] || k['ShiftRight']);
    this.brake    = !!(k['Space']);
  }

  consumeInteract() {
    const v = this.interact;
    this.interact = false;
    return v;
  }
}
