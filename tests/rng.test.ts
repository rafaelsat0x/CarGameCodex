import { expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
it('reproduces a bounded mulberry32 stream including seed zero', () => {
  for (const seed of [0, 1, 12345, 4294967295]) {
    const a = new Rng(seed), b = new Rng(seed); const first = a.next(); expect(first).toBe(b.next());
    for (let i = 0; i < 10000; i++) { const n = a.next(); expect(n).toBe(b.next()); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
    a.reset(); expect(a.next()).toBe(first);
  }
});
