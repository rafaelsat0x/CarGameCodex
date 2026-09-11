import { CONFIG } from '../config';
export class Score {
  points = 0; distance = 0; coins = 0; multiplier = 1; timer = 0; private events = 0;
  reset(): void { this.points = 0; this.distance = 0; this.coins = 0; this.multiplier = 1; this.timer = 0; this.events = 0; }
  update(dt: number, distance: number): void {
    this.distance += distance; this.points += distance * CONFIG.score.perMeter * this.multiplier;
    this.timer -= dt;
    while (this.timer <= 0 && this.multiplier > 1) { this.multiplier--; this.events = 0; this.timer += CONFIG.score.comboDecay; }
    if (this.timer <= 0) { this.timer = 0; this.events = 0; }
  }
  reward(type: 'coin' | 'nearMiss'): number {
    if (type === 'coin') this.coins++;
    const earned = CONFIG.score[type] * this.multiplier;
    this.points += earned; this.timer = CONFIG.score.comboDecay;
    if (++this.events >= CONFIG.score.eventsPerStep) { this.multiplier = Math.min(CONFIG.score.maxMultiplier, this.multiplier + 1); this.events = 0; }
    return earned;
  }
}
