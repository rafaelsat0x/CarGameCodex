import * as THREE from 'three';
import { CONFIG } from '../config';
import { buildCar, box, merge, mesh, paint, materials, type CarModel } from './CarBuilder';
import type { ObstacleType, Row } from '../systems/Spawner';
import { clamp, lerp } from '../utils/math';
const o = CONFIG.obstacle;
const barrierBody = merge([box(o.barrierWidth, o.barrierHeight * 0.65, o.barrierDepth, 0, o.barrierHeight * 0.6), box(o.barrierWidth * 1.06, 0.12, o.barrierDepth * 1.4, 0, 0.08)]);
const barrierStripes = merge([-2, -1, 0, 1, 2].map(i => box(0.17, 0.52, o.barrierDepth + 0.014).rotateZ(-0.45).translate(i * 0.43, o.barrierHeight * 0.6, 0)));
const cones: THREE.BufferGeometry[] = [], bands: THREE.BufferGeometry[] = [], bases: THREE.BufferGeometry[] = [];
for (let i = 0; i < o.coneCount; i++) {
  const x = (i - (o.coneCount - 1) / 2) * o.coneSpacing, z = (i % 2 - 0.5) * o.coneDepth * 0.5;
  cones.push(new THREE.ConeGeometry(o.coneRadius, o.coneHeight, 8).translate(x, o.coneHeight / 2, z));
  bands.push(new THREE.CylinderGeometry(o.coneRadius * 0.33, o.coneRadius * 0.58, o.coneHeight * 0.25, 8).translate(x, o.coneHeight * 0.54, z));
  bases.push(box(o.coneRadius * 2, 0.07, o.coneRadius * 2, x, 0.035, z));
}
const coneBody = merge(cones), coneBands = merge(bands), coneBases = merge(bases);
export class Obstacle {
  active = false; readonly group = new THREE.Group(); readonly hitbox = new THREE.Box3(); readonly helper: THREE.Box3Helper;
  type: ObstacleType = 'barrier'; lane = 1; speed = 0; arrival = 0; passed = false;
  private from = -1; private to = -1; private readonly models: Record<ObstacleType, THREE.Group>;
  private readonly car: CarModel; private readonly truck: CarModel;
  width = 0; length = 0; height = 0;
  constructor(scene: THREE.Scene, colorIndex: number, debug: boolean) {
    this.car = buildCar(CONFIG.colors.traffic[colorIndex % CONFIG.colors.traffic.length]);
    this.truck = buildCar(CONFIG.colors.traffic[colorIndex % CONFIG.colors.traffic.length], false, true);
    const barrier = new THREE.Group(); barrier.add(mesh(barrierBody, paint(CONFIG.colors.barrier)), mesh(barrierStripes, materials.white));
    const coneGroup = new THREE.Group(); coneGroup.add(mesh(coneBody, paint(CONFIG.colors.cone)), mesh(coneBands, materials.white), mesh(coneBases, materials.tire));
    this.models = { barrier, cones: coneGroup, car: this.car.group, truck: this.truck.group, changer: this.car.group };
    this.group.add(barrier, coneGroup, this.car.group, this.truck.group); this.group.visible = false; scene.add(this.group);
    this.helper = new THREE.Box3Helper(this.hitbox, 0xff6655); this.helper.visible = false;
    if (debug) scene.add(this.helper);
  }
  spawn(row: Row, lane: number, time: number, distanceSinceSpawn: number): void {
    this.active = true; this.type = row.type; this.lane = lane; this.speed = row.speed; this.arrival = row.arrival; this.passed = false;
    this.from = row.changeFrom; this.to = row.changeTo;
    for (const child of this.group.children) child.visible = false;
    this.models[this.type].visible = true; this.group.visible = true;
    this.group.position.set((lane - 1) * CONFIG.lanes.width, 0, -CONFIG.spawn.distance + distanceSinceSpawn);
    this.car.group.rotation.y = 0; this.car.signalLeft.visible = false; this.car.signalRight.visible = false;
    this.width = this.type === 'truck' ? CONFIG.car.truckWidth : this.type === 'barrier' || this.type === 'cones' ? o.barrierWidth : CONFIG.car.width;
    this.length = this.type === 'truck' ? CONFIG.car.truckLength : this.type === 'barrier' ? o.barrierDepth : this.type === 'cones' ? o.coneDepth : CONFIG.car.length;
    this.height = this.type === 'truck' ? CONFIG.car.truckHeight : CONFIG.car.height;
    const carModel = this.type === 'truck' ? this.truck : this.car;
    (carModel.group.children[0] as THREE.Mesh).material = paint(CONFIG.colors.traffic[row.colorIndex]);
    this.update(0, time);
  }
  update(distance: number, time: number): void {
    this.group.position.z += distance;
    if (this.type === 'changer') {
      const begin = this.arrival - CONFIG.spawn.changeLeadTime;
      const progress = clamp((time - begin - CONFIG.spawn.signalDuration) / CONFIG.spawn.changeDuration, 0, 1);
      this.group.position.x = lerp((this.from - 1) * CONFIG.lanes.width, (this.to - 1) * CONFIG.lanes.width, progress * progress * (3 - 2 * progress));
      this.car.group.rotation.y = -(this.to - this.from) * CONFIG.lanes.yaw * Math.sin(progress * Math.PI);
      const blinking = time >= begin && progress < 1 && Math.floor(time * CONFIG.spawn.signalHz) % 2 === 0;
      this.car.signalLeft.visible = this.to < this.from && blinking; this.car.signalRight.visible = this.to > this.from && blinking;
      this.lane = progress < 0.5 ? this.from : this.to;
    }
    const scale = 1 - CONFIG.collision.hitboxShrink, p = this.group.position;
    this.hitbox.min.set(p.x - this.width * scale / 2, 0, p.z - this.length * scale / 2);
    this.hitbox.max.set(p.x + this.width * scale / 2, this.height * scale, p.z + this.length * scale / 2);
  }
  release(): void { this.active = false; this.group.visible = false; this.helper.visible = false; }
}
