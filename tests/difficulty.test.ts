import { describe, expect, it } from 'vitest';
import { Difficulty } from '../src/systems/Difficulty';
import { CONFIG } from '../src/config';
describe('speed and difficulty', () => {
  it('starts at base, rises monotonically, and stays capped', () => {
    expect(Difficulty.speed(0)).toBe(CONFIG.speed.base); let last: number = CONFIG.speed.base;
    for (let t = 0; t < 10000; t += 0.2) { const speed = Difficulty.speed(t); expect(speed).toBeGreaterThanOrEqual(last); expect(speed).toBeLessThanOrEqual(CONFIG.speed.max); last = speed; }
    expect(Difficulty.speed(-10)).toBe(CONFIG.speed.base);
  });
  it('normalizes and clamps difficulty', () => { expect(Difficulty.normalized(-1)).toBe(0); expect(Difficulty.normalized(90)).toBe(0.5); expect(Difficulty.normalized(1800)).toBe(1); });
  it('has the same integrated distance at 60 Hz and 144 Hz', () => {
    const run = (hz: number): number => { let sum = 0; for (let i = 0; i < hz * 180; i++) sum += Difficulty.travel(i / hz, (i + 1) / hz); return sum; };
    expect(run(60)).toBeCloseTo(run(144), 7); expect(run(60)).toBeCloseTo(Difficulty.distance(180), 7);
    expect(Difficulty.travel(1, 1.001) / 0.001).toBeCloseTo(Difficulty.speed(1), 2);
  });
});
