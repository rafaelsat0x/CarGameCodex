import { CONFIG } from '../config';
import { clamp } from '../utils/math';
export class Difficulty {
  static speed(t: number): number {
    return CONFIG.speed.max - (CONFIG.speed.max - CONFIG.speed.base) * Math.exp(-Math.max(0, t) / CONFIG.speed.rampTime);
  }
  static normalized(t: number): number { return clamp(t / CONFIG.difficulty.fullAt, 0, 1); }
  /** Analytic integral; prediction and simulation use the very same curve. */
  static distance(t: number): number {
    const time = Math.max(0, t);
    return CONFIG.speed.max * time - (CONFIG.speed.max - CONFIG.speed.base) * CONFIG.speed.rampTime * (1 - Math.exp(-time / CONFIG.speed.rampTime));
  }
  static travel(from: number, to: number, trafficSpeed = 0, override?: number): number {
    return (override === undefined ? this.distance(to) - this.distance(from) : override * (to - from)) - trafficSpeed * (to - from);
  }
}
