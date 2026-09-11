import * as THREE from 'three';
import { CONFIG } from '../config';
import { box, merge, mesh, paint } from '../entities/CarBuilder';
export class Road {
  private readonly tiles: THREE.Group[] = [];
  constructor(scene: THREE.Scene) {
    const w = CONFIG.world;
    const asphalt = box(w.roadWidth, 0.15, w.tileLength, 0, -0.09);
    const ground = box(w.groundWidth, 0.1, w.tileLength, 0, -0.22);
    const marks: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      marks.push(box(w.lineWidth, 0.012, w.tileLength, side * 4.7, 0.003));
      for (let z = -w.tileLength / 2; z < w.tileLength / 2; z += w.dashSpacing) marks.push(box(w.lineWidth, 0.012, w.dashLength, side * CONFIG.lanes.width / 2, 0.004, z));
    }
    const markings = merge(marks);
    const rails: THREE.BufferGeometry[] = [];
    const shoulders: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      shoulders.push(box(w.shoulderWidth, 0.06, w.tileLength, side * (w.roadWidth / 2 + w.shoulderWidth / 2), -0.04));
      rails.push(box(0.12, 0.19, w.tileLength, side * w.railX, w.railHeight));
      for (let z = -w.tileLength / 2; z < w.tileLength / 2; z += w.railPostSpacing) rails.push(box(0.14, w.railHeight, 0.14, side * w.railX, w.railHeight / 2, z));
    }
    const rail = merge(rails), shoulder = merge(shoulders);
    for (let i = 0; i < w.tileCount; i++) {
      const tile = new THREE.Group();
      tile.add(mesh(ground, paint(CONFIG.colors.grass)), mesh(asphalt, paint(CONFIG.colors.road)), mesh(markings, paint(CONFIG.colors.line)), mesh(shoulder, paint(CONFIG.colors.shoulder)), mesh(rail, paint(CONFIG.colors.rail)));
      tile.position.z = w.tileLength - i * w.tileLength;
      for (const child of tile.children) child.castShadow = false;
      scene.add(tile); this.tiles.push(tile);
    }
  }
  update(distance: number): void {
    for (const tile of this.tiles) {
      tile.position.z += distance;
      if (tile.position.z > CONFIG.world.tileLength * 1.5) tile.position.z -= CONFIG.world.tileLength * CONFIG.world.tileCount;
    }
  }
  reset(): void { for (let i = 0; i < this.tiles.length; i++) this.tiles[i].position.z = CONFIG.world.tileLength * (1 - i); }
}
