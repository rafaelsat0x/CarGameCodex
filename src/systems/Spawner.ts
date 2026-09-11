import { CONFIG } from '../config';
import { Rng } from '../core/Rng';
import { lerp } from '../utils/math';
import { Difficulty } from './Difficulty';

export type ObstacleType = 'barrier' | 'cones' | 'car' | 'truck' | 'changer';
export type Pattern = 'single' | 'double' | 'zigzag' | 'staggered' | 'tunnel';
export interface Row {
  id: number; spawnAt: number; arrival: number; speed: number; type: ObstacleType;
  blocked: number; free: number; reachable: number; gap: number; clearance: number;
  pattern: Pattern; changeFrom: number; changeTo: number; coinLane: number; coinEndLane: number;
  coinCount: number; colorIndex: number;
}
const ALL_LANES = (1 << CONFIG.lanes.count) - 1;
export function reachableMask(previous: number, next: number, gap: number): number {
  const moves = Math.floor((gap - CONFIG.spawn.reactionTime + Number.EPSILON) / CONFIG.lanes.switchDuration);
  let result = 0;
  for (let a = 0; a < CONFIG.lanes.count; a++) for (let b = 0; b < CONFIG.lanes.count; b++) {
    if ((previous & (1 << a)) && (next & (1 << b)) && Math.abs(a - b) <= moves) result |= 1 << b;
  }
  return result;
}

/**
 * A schedule is expressed in arrival time, never just distance between spawn rows.
 * Integrating the accelerating speed curve prevents a fast-closing static row from
 * catching slower traffic. Every row also reserves its entire longitudinal extent
 * (including the player's length and coins), plus 10% extra reaction/movement time.
 * Reachable lanes are propagated through the whole run, not reset to every free lane.
 * Lane changers reserve BOTH source and destination for their entire lifetime; coins
 * and the guaranteed route use the third lane. They finish merging before arrival.
 * Only planning allocates a Row, once per row; the simulation uses fixed object pools.
 */
export class Spawner {
  private previous?: Row;
  private index = 0;
  private pendingLane = -1;
  constructor(private readonly rng: Rng) {}
  reset(): void { this.previous = undefined; this.index = 0; this.pendingLane = -1; this.rng.reset(); }
  next(now: number, difficulty = Difficulty.normalized(now), override?: number): Row {
    const s = CONFIG.spawn;
    const moving = this.rng.next() < s.trafficChance;
    const speed = moving ? CONFIG.speed.base * this.rng.range(s.trafficMin, s.trafficMax) : 0;
    let type: ObstacleType = moving ? 'car' : this.rng.next() < s.staticBarrierChance ? 'barrier' : 'cones';
    if (moving && now >= CONFIG.difficulty.truckAt && this.rng.next() < s.truckChance) type = 'truck';
    if (moving && now >= CONFIG.difficulty.changerAt && this.rng.next() < s.changerChance) type = 'changer';
    const gap = (lerp(s.rowGapEasy, s.rowGapHard, difficulty) + this.rng.range(0, s.jitter)) * (1 + s.safetyMargin);
    const coinCount = this.rng.next() < CONFIG.coins.chance ? this.rng.int(CONFIG.coins.min, CONFIG.coins.max) : 0;
    const halfLength = type === 'truck' ? CONFIG.car.truckLength / 2 : CONFIG.car.length / 2;
    const extent = Math.max(halfLength + CONFIG.car.length / 2, (coinCount - 1) * CONFIG.coins.spacing / 2 + CONFIG.collision.coinRadius);
    // Base closing speed is a conservative bound even when the player accelerates.
    // Refine using speed at earliest spawn: later arrival can only have more clearance.
    const closing = (override ?? Difficulty.speed(now)) - speed;
    const clearance = extent / closing;
    const earliest = this.arrivalAt(now + (this.previous ? 0 : s.initialDelay), speed, override);
    const arrival = Math.max(earliest, this.previous ? this.previous.arrival + this.previous.clearance + clearance + gap : 0);
    const spawnAt = this.spawnForArrival(now, arrival, speed, override);
    const usableGap = this.previous ? arrival - this.previous.arrival - this.previous.clearance - clearance : arrival;
    const previousMask = this.previous?.reachable ?? (1 << 1);
    let blocked = 0, free = 0, reachable = 0, changeFrom = -1, changeTo = -1;
    let pattern: Pattern = 'single';
    const pairLane = this.pendingLane; this.pendingLane = -1;
    for (let attempt = 0; attempt < s.attempts; attempt++) {
      const lane = pairLane >= 0 ? pairLane : this.rng.int(0, CONFIG.lanes.count - 1);
      blocked = 1 << lane; changeFrom = -1; changeTo = -1; pattern = 'single';
      if (type === 'changer') {
        changeFrom = lane;
        changeTo = lane === 0 ? 1 : lane === 2 ? 1 : this.rng.next() < 0.5 ? 0 : 2;
        blocked |= 1 << changeTo; pattern = 'staggered';
      } else if (pairLane >= 0) {
        pattern = 'staggered';
      } else if (now >= CONFIG.difficulty.singlesUntil) {
        // Weighted library: doubles/tunnels become more common with difficulty.
        const choice = this.rng.next();
        if (choice < lerp(s.doubleEasy, s.doubleHard, difficulty)) {
          free = 1 << lane; blocked = ALL_LANES ^ free;
          pattern = lane === 1 ? 'tunnel' : 'double';
        } else if (choice < s.zigzagCutoff && this.previous) {
          pattern = 'zigzag';
          // Alternate edges across successive zigzag rows.
          blocked = this.previous.blocked & 1 ? 4 : 1;
        } else pattern = 'staggered';
      }
      free = ALL_LANES ^ blocked;
      reachable = reachableMask(previousMask, free, usableGap);
      if (reachable) break;
    }
    // Deterministic fallback preserves one previously reachable lane.
    if (!reachable) {
      const lane = this.firstLane(previousMask); blocked = 1 << ((lane + 1) % CONFIG.lanes.count);
      free = ALL_LANES ^ blocked; reachable = reachableMask(previousMask, free, usableGap);
      type = moving ? 'car' : 'barrier'; changeFrom = -1; changeTo = -1; pattern = 'single';
    }
    const coinLane = this.randomLane(reachable);
    // A staggered pair really is two scheduled rows: its adjacent follow-up still
    // goes through the same arrival and reachability validation on the next call.
    if (pattern === 'staggered' && pairLane < 0 && type !== 'changer') this.pendingLane = (this.firstLane(blocked) + 1) % CONFIG.lanes.count;
    let coinEndLane = coinLane;
    if (this.rng.next() < CONFIG.coins.arcChance) {
      const adjacent = free & ((1 << (coinLane + 1)) | (coinLane > 0 ? 1 << (coinLane - 1) : 0));
      if (adjacent) coinEndLane = this.firstLane(adjacent);
    }
    const row: Row = { id: this.index++, spawnAt, arrival, speed, type, blocked, free, reachable,
      gap: usableGap, clearance, pattern, changeFrom, changeTo, coinLane, coinEndLane, coinCount,
      colorIndex: this.rng.int(0, CONFIG.colors.traffic.length - 1) };
    this.previous = row;
    return row;
  }
  private firstLane(mask: number): number { for (let lane = 0; lane < CONFIG.lanes.count; lane++) if (mask & (1 << lane)) return lane; return 1; }
  private randomLane(mask: number): number {
    const start = this.rng.int(0, CONFIG.lanes.count - 1);
    for (let i = 0; i < CONFIG.lanes.count; i++) { const lane = (start + i) % CONFIG.lanes.count; if (mask & (1 << lane)) return lane; }
    return 1;
  }
  private arrivalAt(spawn: number, speed: number, override?: number): number {
    let lo = spawn, hi = spawn + CONFIG.spawn.maxFlightTime;
    for (let i = 0; i < CONFIG.spawn.solveIterations; i++) {
      const mid = (lo + hi) / 2;
      if (Difficulty.travel(spawn, mid, speed, override) < CONFIG.spawn.distance) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  private spawnForArrival(now: number, arrival: number, speed: number, override?: number): number {
    let lo = now, hi = arrival;
    for (let i = 0; i < CONFIG.spawn.solveIterations; i++) {
      const mid = (lo + hi) / 2;
      if (Difficulty.travel(mid, arrival, speed, override) > CONFIG.spawn.distance) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
}
