/** Mulberry32. Separate streams keep decorative randomness out of the course. */
export class Rng {
  private state: number;
  constructor(readonly seed: number) { this.state = seed >>> 0; }
  reset(): void { this.state = this.seed >>> 0; }
  next(): number {
    let t = this.state = (this.state + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
}
