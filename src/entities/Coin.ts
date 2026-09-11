import * as THREE from 'three';
import { CONFIG } from '../config';
import { ObjectPool } from '../utils/ObjectPool';
import type { Row } from '../systems/Spawner';
import { lerp } from '../utils/math';
export class Coin {
  active = false; collected = false; age = 0; x = 0; z = 0; speed = 0; phase = 0;
}
/** One draw call for every coin, with fixed backing storage. */
export class Coins {
  readonly pool = new ObjectPool(CONFIG.pools.coins, () => new Coin());
  readonly mesh: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.CylinderGeometry(CONFIG.coins.radius, CONFIG.coins.radius, CONFIG.coins.thickness, 12).rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: CONFIG.colors.gold, emissive: CONFIG.colors.gold, emissiveIntensity: 0.4, metalness: 0.65, roughness: 0.27 }), CONFIG.pools.coins);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh);
  }
  spawn(row: Row, initialTravel: number): void {
    for (let i = 0; i < row.coinCount; i++) {
      const coin = this.pool.acquire(); if (!coin) break;
      const t = row.coinCount <= 1 ? 0 : i / (row.coinCount - 1);
      coin.x = lerp(row.coinLane - 1, row.coinEndLane - 1, t * t * (3 - 2 * t)) * CONFIG.lanes.width;
      coin.z = -CONFIG.spawn.distance + initialTravel + (i - (row.coinCount - 1) / 2) * CONFIG.coins.spacing;
      coin.speed = row.speed; coin.age = 0; coin.phase = i; coin.collected = false;
    }
  }
  update(dt: number, distance: number): void {
    for (const coin of this.pool.items) if (coin.active) {
      coin.z += distance - coin.speed * dt;
      if (coin.collected) { coin.age += dt; if (coin.age > CONFIG.coins.popDuration) this.pool.release(coin); }
      if (coin.z > CONFIG.spawn.recycleZ) this.pool.release(coin);
    }
  }
  render(time: number): void {
    let index = 0;
    for (const coin of this.pool.items) if (coin.active) {
      this.transform.position.set(coin.x, CONFIG.coins.height + Math.sin(time * CONFIG.coins.bobHz + coin.phase) * CONFIG.coins.bob, coin.z);
      this.transform.rotation.set(0, time * CONFIG.coins.spin + coin.phase, 0);
      const pop = coin.collected ? coin.age / CONFIG.coins.popDuration : 0;
      this.transform.scale.setScalar(coin.collected ? (1 + pop) * (1 - pop) : 1);
      this.transform.updateMatrix(); this.mesh.setMatrixAt(index++, this.transform.matrix);
    }
    this.mesh.count = index; this.mesh.instanceMatrix.needsUpdate = true;
  }
  reset(): void { this.pool.reset(); this.mesh.count = 0; }
}
