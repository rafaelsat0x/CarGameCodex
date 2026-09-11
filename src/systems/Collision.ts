import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Player } from '../entities/Player';
import type { Obstacle } from '../entities/Obstacle';
import type { Coin } from '../entities/Coin';
export class Collision {
  readonly playerBox = new THREE.Box3(); readonly helper: THREE.Box3Helper;
  constructor(scene: THREE.Scene, debug: boolean) { this.helper = new THREE.Box3Helper(this.playerBox, 0x77ffbb); if (debug) scene.add(this.helper); }
  update(player: Player): void {
    const scale = 1 - CONFIG.collision.hitboxShrink, x = player.group.position.x;
    this.playerBox.min.set(x - CONFIG.car.width * scale / 2, 0, -CONFIG.car.length * scale / 2);
    this.playerBox.max.set(x + CONFIG.car.width * scale / 2, CONFIG.car.height * scale, CONFIG.car.length * scale / 2);
  }
  hits(obstacle: Obstacle): boolean { return Math.abs(obstacle.group.position.z) < CONFIG.collision.window && this.playerBox.intersectsBox(obstacle.hitbox); }
  collects(coin: Coin, playerX: number): boolean {
    const dx = coin.x - playerX;
    return !coin.collected && dx * dx + coin.z * coin.z < CONFIG.collision.coinRadius ** 2;
  }
  nearMiss(obstacle: Obstacle, player: Player, time: number): boolean {
    return player.lane !== obstacle.lane && time - player.leftLaneAt[obstacle.lane] <= CONFIG.score.nearMissWindow;
  }
}
