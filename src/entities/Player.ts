import * as THREE from 'three';
import { CONFIG } from '../config';
import { buildCar } from './CarBuilder';
import { clamp, easeOut, lerp } from '../utils/math';
export class Player {
  readonly model = buildCar(CONFIG.colors.player, true);
  readonly group = this.model.group;
  lane = 1; private fromX = 0; private switchTime = 0; private direction = 0;
  private buffered = 0; private bumpTime = 0;
  readonly leftLaneAt = new Float64Array(CONFIG.lanes.count).fill(-Infinity);
  onSwitch: () => void = () => {}; onBump: () => void = () => {};
  get switching(): boolean { return this.switchTime > 0; }
  constructor(scene: THREE.Scene) { scene.add(this.group); }
  reset(): void {
    this.lane = 1; this.fromX = 0; this.switchTime = 0; this.direction = 0; this.buffered = 0;
    this.bumpTime = 0; this.group.position.set(0, 0, 0); this.group.rotation.set(0, 0, 0); this.leftLaneAt.fill(-Infinity);
  }
  clearBuffer(): void { this.buffered = 0; }
  move(direction: number, time: number): void {
    if (this.switching) { this.buffered = direction; return; }
    const target = clamp(this.lane + direction, 0, CONFIG.lanes.count - 1);
    if (target === this.lane) { this.bumpTime = CONFIG.lanes.bumpDuration; this.direction = direction; this.onBump(); return; }
    this.leftLaneAt[this.lane] = time; this.lane = target; this.fromX = this.group.position.x;
    this.direction = direction; this.switchTime = CONFIG.lanes.switchDuration; this.onSwitch();
  }
  update(dt: number, speed: number, time: number): void {
    for (const wheel of this.model.wheels) wheel.rotation.x -= speed * dt / CONFIG.car.wheelRadius;
    if (this.switchTime > 0) {
      this.switchTime = Math.max(0, this.switchTime - dt);
      if (this.switchTime < 1e-9) this.switchTime = 0;
      const t = 1 - this.switchTime / CONFIG.lanes.switchDuration;
      this.group.position.x = lerp(this.fromX, (this.lane - 1) * CONFIG.lanes.width, easeOut(t));
      this.group.rotation.y = -this.direction * CONFIG.lanes.yaw * Math.sin(Math.PI * t);
      this.group.rotation.z = -this.direction * CONFIG.lanes.roll * Math.sin(Math.PI * t);
      if (!this.switchTime && this.buffered) { const buffered = this.buffered; this.buffered = 0; this.move(buffered, time); }
    } else if (this.bumpTime > 0) {
      this.bumpTime = Math.max(0, this.bumpTime - dt);
      this.group.rotation.z = this.direction * CONFIG.lanes.bumpAmount * Math.sin(this.bumpTime / CONFIG.lanes.bumpDuration * Math.PI * 2);
    } else { this.group.rotation.y = 0; this.group.rotation.z = 0; }
    this.group.position.z = 0;
  }
}
