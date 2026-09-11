import { describe, expect, it } from 'vitest';
import { Spawner, reachableMask, type Row } from '../src/systems/Spawner';
import { Rng } from '../src/core/Rng';
import { Difficulty } from '../src/systems/Difficulty';
import { CONFIG } from '../src/config';

describe('arrival scheduler and whole-course reachability', () => {
  for (const d of [0, 0.25, 0.5, 0.75, 1]) {
    it(`keeps 10,000 mixed traffic rows reachable at d=${d}`, () => {
      const spawner = new Spawner(new Rng(12345));
      let previous: Row | undefined, now = 180, moving = 0, staticRows = 0, changes = 0;
      for (let i = 0; i < 10000; i++) {
        const row = spawner.next(now, d);
        expect(row.free).toBeGreaterThan(0); expect(row.blocked).not.toBe(7);
        expect(row.reachable & row.free).toBe(row.reachable);
        expect(row.reachable).toBeGreaterThan(0);
        expect(row.spawnAt).toBeGreaterThanOrEqual(now - 1e-7);
        expect(Difficulty.travel(row.spawnAt, row.arrival, row.speed)).toBeCloseTo(CONFIG.spawn.distance, 5);
        if (previous) {
          const usable = row.arrival - previous.arrival - previous.clearance - row.clearance;
          expect(usable).toBeGreaterThanOrEqual((CONFIG.spawn.rowGapEasy + (CONFIG.spawn.rowGapHard - CONFIG.spawn.rowGapEasy) * d) * (1 + CONFIG.spawn.safetyMargin) - 1e-7);
          expect(reachableMask(previous.reachable, row.free, usable)).toBe(row.reachable);
          // Arrival intervals include length of trucks, the player, and coin bands.
          expect(row.arrival - row.clearance).toBeGreaterThan(previous.arrival + previous.clearance);
        }
        expect(row.free & (1 << row.coinLane)).toBeTruthy(); expect(row.free & (1 << row.coinEndLane)).toBeTruthy();
        expect(Math.abs(row.coinLane - row.coinEndLane)).toBeLessThanOrEqual(1);
        if (row.type === 'changer') {
          changes++; expect(row.blocked & (1 << row.changeFrom)).toBeTruthy(); expect(row.blocked & (1 << row.changeTo)).toBeTruthy();
          expect(Math.abs(row.changeFrom - row.changeTo)).toBe(1);
          expect(CONFIG.spawn.changeLeadTime).toBeGreaterThan(CONFIG.spawn.signalDuration + CONFIG.spawn.changeDuration);
        }
        row.speed ? moving++ : staticRows++;
        previous = row; now = row.spawnAt;
      }
      expect(moving).toBeGreaterThan(0); expect(staticRows).toBeGreaterThan(0); expect(changes).toBeGreaterThan(0);
    });
  }
  it('restricts the opening to one lane and gates vehicle unlocks', () => {
    for (let seed = 0; seed < 200; seed++) {
      const spawner = new Spawner(new Rng(seed)); let now = 0;
      while (now < 75) {
        const row = spawner.next(now);
        if (now < 20) { expect([1, 2, 4]).toContain(row.blocked); expect(row.type).not.toBe('truck'); }
        if (now < 60) expect(row.type).not.toBe('changer');
        now = row.spawnAt + 0.01;
      }
    }
  });
  it('accounts for moving traffic under a constant debug speed', () => {
    for (const speed of [18, 35, 65]) {
      const spawner = new Spawner(new Rng(91)); let now = 180, last = 0;
      for (let i = 0; i < 1000; i++) {
        const row = spawner.next(now, 1, speed);
        expect((row.arrival - row.spawnAt) * (speed - row.speed)).toBeCloseTo(130, 5);
        expect(row.arrival).toBeGreaterThan(last); last = row.arrival; now = row.spawnAt;
      }
    }
  });
  it('does not silently reset reachable lanes at each row', () => {
    expect(reachableMask(1, 4, 0.55)).toBe(0);
    expect(reachableMask(1, 6, 0.55)).toBe(2);
    expect(reachableMask(1, 4, 0.66)).toBe(4);
  });
  it('produces identical complete courses after reset and for the same seed', () => {
    const a = new Spawner(new Rng(123)), b = new Spawner(new Rng(123)); let now = 0;
    const rows: Row[] = [];
    for (let i = 0; i < 500; i++) { const row = a.next(now); expect(row).toEqual(b.next(now)); rows.push(row); now = row.spawnAt; }
    a.reset(); now = 0;
    for (const row of rows) { expect(a.next(now)).toEqual(row); now = row.spawnAt; }
  });
});
