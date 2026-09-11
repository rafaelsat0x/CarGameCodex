import { describe, expect, it } from 'vitest';
import { Score } from '../src/systems/Score';
describe('score and combo', () => {
  it('rewards pickups, builds multiplier, and multiplies distance too', () => {
    const score = new Score(); score.update(1, 18); expect(score.points).toBe(18);
    expect(score.reward('coin')).toBe(25); score.reward('coin'); score.reward('nearMiss');
    expect(score.multiplier).toBe(2); expect(score.coins).toBe(2);
    expect(score.reward('nearMiss')).toBe(100); score.update(0.1, 10); expect(score.points).toBe(238);
  });
  it('caps at x5 and decays one step per three seconds', () => {
    const score = new Score(); for (let i = 0; i < 50; i++) score.reward('coin'); expect(score.multiplier).toBe(5);
    score.update(2.99, 0); expect(score.multiplier).toBe(5); score.update(0.02, 0); expect(score.multiplier).toBe(4);
    score.update(6, 0); expect(score.multiplier).toBe(2); score.update(100, 0); expect(score.multiplier).toBe(1); expect(score.timer).toBe(0);
  });
  it('refreshes decay and clears all state on restart', () => {
    const score = new Score(); for (let i = 0; i < 3; i++) score.reward('coin'); score.update(2, 20);
    score.reward('nearMiss'); score.update(2, 0); expect(score.multiplier).toBe(2);
    score.reset(); expect(score.points + score.distance + score.coins + score.timer).toBe(0); expect(score.multiplier).toBe(1);
  });
});
