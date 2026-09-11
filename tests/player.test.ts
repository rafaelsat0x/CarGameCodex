import { expect, it } from 'vitest';
import { Scene } from 'three';
import { Player } from '../src/entities/Player';
it('buffers exactly one move and keeps the player at z=0', () => {
  const player = new Player(new Scene()); player.move(-1, 0); player.move(1, 0.03); player.move(1, 0.04);
  for (let i = 0; i < 60; i++) player.update(1 / 120, 18, i / 120);
  expect(player.lane).toBe(1); expect(player.group.position.x).toBe(0); expect(player.group.position.z).toBe(0);
});
it('bumps at the edge and resets tweens and near-miss history', () => {
  const player = new Player(new Scene()); let bumps = 0; player.onBump = () => bumps++;
  player.move(-1, 0); player.update(0.15, 18, 0.15); player.move(-1, 0.16);
  expect(bumps).toBe(1); expect(player.lane).toBe(0); player.reset();
  expect(player.lane).toBe(1); expect(player.switching).toBe(false); expect(player.leftLaneAt[1]).toBe(-Infinity);
});
