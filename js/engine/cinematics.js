// cinematics.js — dolly shots on Catmull-Rom rails, the grand tour, and
// free-flight controls. A Shot is {pos:[...pts], look:[...pts], dur, ease}.
import * as THREE from 'three';
import { Path, clamp, smoothstep } from './util.js';

const easeInOut = (t) => t * t * (3 - 2 * t);
const easeLinear = (t) => t;

export class ShotPlayer {
  constructor(camera){
    this.camera = camera;
    this.shot = null;
    this.time = 0;
    this._p = new THREE.Vector3();
    this._l = new THREE.Vector3();
    this.playing = false;
    this.frozen = false;
  }
  play(shot){
    this.shot = {
      posPath: new Path(shot.pos),
      lookPath: new Path(shot.look),
      dur: shot.dur ?? 12,
      ease: shot.ease === 'linear' ? easeLinear : easeInOut,
    };
    this.time = 0;
    this.playing = true;
  }
  setAt(shot, t01){
    this.play(shot);
    this.time = t01 * this.shot.dur;
    this.applyAt(clamp(t01, 0, 1));
    this.playing = false;
  }
  applyAt(k){
    const e = this.shot.ease(k);
    this.shot.posPath.at(e, this._p);
    this.shot.lookPath.at(e, this._l);
    this.camera.position.copy(this._p);
    this.camera.lookAt(this._l);
  }
  update(dt){
    if (!this.shot || !this.playing || this.frozen) return false;
    this.time += dt;
    const k = clamp(this.time / this.shot.dur, 0, 1);
    this.applyAt(k);
    if (k >= 1){ this.playing = false; return true; } // finished
    return false;
  }
  get done(){ return !this.playing; }
}

// Free-flight: drag to look, WASD/QE to fly, shift for speed.
export class FreeFly {
  constructor(camera, dom){
    this.camera = camera;
    this.dom = dom;
    this.enabled = false;
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = {};
    this.baseSpeed = 18;
    this._drag = null;

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this._drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.0032;
      this.pitch = clamp(this.pitch - dy * 0.0032, -1.45, 1.45);
    });
    dom.addEventListener('pointerup', () => { this._drag = null; });
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }
  syncFromCamera(){
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = e.x;
  }
  update(dt){
    if (!this.enabled) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);
    const speed = this.baseSpeed * (this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? 4 : 1);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.add(f);
    if (this.keys['KeyS']) move.sub(f);
    if (this.keys['KeyD']) move.add(r);
    if (this.keys['KeyA']) move.sub(r);
    if (this.keys['KeyE'] || this.keys['Space']) move.y += 1;
    if (this.keys['KeyQ']) move.y -= 1;
    if (move.lengthSq() > 0){
      move.normalize().multiplyScalar(speed * dt);
      this.camera.position.add(move);
    }
  }
}
