import * as THREE from 'three';
import { CONFIG } from '../config';
import { Rng } from '../core/Rng';
interface Particle { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; size: number; }
export class Particles {
  private readonly items: Particle[] = Array.from({ length: CONFIG.particles.capacity }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0, size: 0 }));
  private readonly mesh: THREE.InstancedMesh; private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color(); private cursor = 0;
  constructor(scene: THREE.Scene, private readonly rng: Rng) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), CONFIG.particles.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh);
    for (let i = 0; i < this.items.length; i++) this.mesh.setColorAt(i, this.color.set(CONFIG.colors.gold));
  }
  burst(x: number, y: number, z: number, kind: 'coin' | 'crash' | 'exhaust'): void {
    const p = CONFIG.particles, count = kind === 'coin' ? p.coinCount : kind === 'crash' ? p.crashCount : 1;
    for (let i = 0; i < count; i++) {
      const item = this.items[this.cursor++ % this.items.length]; item.active = true;
      item.x = x; item.y = y; item.z = z; item.maxLife = kind === 'coin' ? p.coinLife : kind === 'crash' ? p.crashLife : p.exhaustLife; item.life = item.maxLife;
      item.vx = this.rng.range(-p.velocity, p.velocity); item.vy = this.rng.range(0, p.velocity); item.vz = this.rng.range(-p.velocity, p.velocity);
      item.size = kind === 'exhaust' ? p.size * 0.7 : this.rng.range(p.size * 0.5, p.size * 1.5);
    }
  }
  update(dt: number, distance: number): void {
    let index = 0;
    for (const item of this.items) if (item.active) {
      item.life -= dt; if (item.life <= 0) { item.active = false; continue; }
      item.x += item.vx * dt; item.y += item.vy * dt; item.z += item.vz * dt + distance; item.vy -= CONFIG.particles.gravity * dt;
      this.transform.position.set(item.x, Math.max(0, item.y), item.z); this.transform.rotation.set(item.life, item.life * 2, item.life);
      this.transform.scale.setScalar(item.size * item.life / item.maxLife); this.transform.updateMatrix(); this.mesh.setMatrixAt(index++, this.transform.matrix);
    }
    this.mesh.count = index; this.mesh.instanceMatrix.needsUpdate = true;
  }
  reset(): void { for (const item of this.items) item.active = false; this.mesh.count = 0; this.cursor = 0; this.rng.reset(); }
  get count(): number { return this.mesh.count; }
}
