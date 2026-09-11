import { test, expect } from '@playwright/test';
import type { Game } from '../src/core/Game';
declare global { interface Window { __SUNSET_DEBUG__: { game: Game; advance(seconds: number, render?: boolean): void } } }

test('menu, inputs, pause, coins, crashes, and 11 clean restarts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await page.goto('/?debug=1&seed=12345');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden();
  await page.screenshot({ path: '/tmp/sunset-menu-debug.png' });
  await page.keyboard.press('Space');
  await expect(page.locator('#countdown')).toBeVisible();
  await page.evaluate(() => { window.__SUNSET_DEBUG__.game.renderer.setAnimationLoop(null); window.__SUNSET_DEBUG__.advance(2.5); });
  expect(await page.evaluate(() => window.__SUNSET_DEBUG__.game.state)).toBe('PLAYING');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
  await page.evaluate(() => window.__SUNSET_DEBUG__.advance(0.4));
  expect(await page.evaluate(() => window.__SUNSET_DEBUG__.game.player.lane)).toBe(1);
  await page.keyboard.press('p');
  await expect(page.locator('#paused')).toBeVisible();
  const pausedTime = await page.evaluate(() => window.__SUNSET_DEBUG__.game.time);
  await page.evaluate(() => window.__SUNSET_DEBUG__.advance(10));
  expect(await page.evaluate(() => window.__SUNSET_DEBUG__.game.time)).toBe(pausedTime);
  await page.getByRole('button', { name: /BACK TO THE ROAD/ }).click();
  await page.keyboard.press('m');
  expect(await page.evaluate(() => localStorage.getItem('sunset-run.muted.v1'))).toBe('true');
  // Collect a real pooled coin through the same collision pass used in play.
  await page.evaluate(() => {
    const { game, advance } = window.__SUNSET_DEBUG__; const coin = game.coins.pool.acquire();
    if (coin) { coin.x = game.player.group.position.x; coin.z = -0.5; coin.speed = 0; coin.collected = false; }
    advance(0.025);
  });
  expect(await page.evaluate(() => window.__SUNSET_DEBUG__.game.score.coins)).toBe(1);
  const result = await page.evaluate(() => {
    const { game, advance } = window.__SUNSET_DEBUG__;
    const snapshots: { geometries: number; textures: number; children: number }[] = [];
    for (let run = 0; run < 11; run++) {
      game.restart(); advance(2.5);
      if (game.score.coins !== 0 || game.player.lane !== 1) throw new Error('Restart did not reset the run');
      // No artificial crash: leave the car in the center and drive into generated traffic.
      for (let i = 0; i < 120 && game.state === 'PLAYING'; i++) advance(0.5, false);
      advance(2);
      if (game.state !== 'GAME_OVER') throw new Error(`Expected natural crash, got ${game.state}`);
      snapshots.push({ geometries: game.renderer.info.memory.geometries, textures: game.renderer.info.memory.textures, children: game.scene.children.length });
    }
    return snapshots;
  });
  expect(result).toHaveLength(11);
  for (const snapshot of result.slice(1)) expect(snapshot).toEqual(result[0]);
  await expect(page.locator('#game-over')).toBeVisible();
  expect(await page.evaluate(() => Number(localStorage.getItem('sunset-run.best.v1')))).toBeGreaterThan(0);
  await page.screenshot({ path: '/tmp/sunset-game-over.png' });
  expect(errors).toEqual([]);
});

test('mobile portrait supports tapping and swiping, plus automatic pause', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:5174/?debug=1&seed=7');
  await page.locator('#debug').evaluate(node => node.style.display = 'none');
  await page.screenshot({ path: '/tmp/sunset-mobile-menu.png' });
  await page.touchscreen.tap(300, 650);
  await page.evaluate(() => { window.__SUNSET_DEBUG__.game.renderer.setAnimationLoop(null); window.__SUNSET_DEBUG__.advance(2.5); });
  await page.touchscreen.tap(60, 500);
  await page.evaluate(() => window.__SUNSET_DEBUG__.advance(0.2));
  expect(await page.evaluate(() => window.__SUNSET_DEBUG__.game.player.lane)).toBe(0);
  await page.locator('#game').dispatchEvent('pointerdown', { pointerId: 4, clientX: 100, clientY: 500 });
  await page.locator('#game').dispatchEvent('pointerup', { pointerId: 4, clientX: 230, clientY: 500 });
  await page.evaluate(() => window.__SUNSET_DEBUG__.advance(0.2));
  expect(await page.evaluate(() => window.__SUNSET_DEBUG__.game.player.lane)).toBe(1);
  await page.screenshot({ path: '/tmp/sunset-mobile-play.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#paused')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await context.close();
});

test('max difficulty is drivable with collisions enabled and bounded draw calls', async ({ page }) => {
  await page.goto('/?debug=1&seed=88');
  await page.keyboard.press('Space');
  await page.evaluate(() => { window.__SUNSET_DEBUG__.game.renderer.setAnimationLoop(null); window.__SUNSET_DEBUG__.advance(2.5); window.__SUNSET_DEBUG__.game.time = 180; });
  for (let i = 0; i < 10; i++) await page.keyboard.press('+');
  const result = await page.evaluate(() => {
    const { game, advance } = window.__SUNSET_DEBUG__;
    let peakDraws = 0;
    for (let step = 0; step < 12000 && game.state === 'PLAYING'; step++) {
      let firstArrival = Infinity;
      for (const obstacle of game.obstacles.items) if (obstacle.active && obstacle.group.position.z < obstacle.length / 2 + 2) firstArrival = Math.min(firstArrival, obstacle.arrival);
      let blocked = 0;
      for (const obstacle of game.obstacles.items) if (obstacle.active && Math.abs(obstacle.arrival - firstArrival) < 0.001) {
        if (obstacle.type === 'changer') {
          const source = Reflect.get(obstacle, 'from') as number, destination = Reflect.get(obstacle, 'to') as number;
          blocked |= (1 << source) | (1 << destination);
        } else blocked |= 1 << obstacle.lane;
      }
      if (blocked & (1 << game.player.lane)) {
        let target = game.player.lane;
        for (let lane = 0; lane < 3; lane++) if (!(blocked & (1 << lane))) { if (target === game.player.lane || Math.abs(lane - game.player.lane) < Math.abs(target - game.player.lane)) target = lane; }
        if (!game.player.switching) game.move(Math.sign(target - game.player.lane));
      }
      advance(1 / 120, false);
      if (step % 60 === 0) advance(0);
      peakDraws = Math.max(peakDraws, game.renderer.info.render.calls);
    }
    return { state: game.state, godMode: game.godMode, time: game.time, peakDraws, coins: game.score.coins };
  });
  expect(result.godMode).toBe(false); expect(result.state).toBe('PLAYING'); expect(result.time).toBeGreaterThan(279);
  // Debug collider helpers add draw calls, so production is lower than this bound.
  expect(result.peakDraws).toBeLessThan(150);
  await page.locator('#debug').evaluate(node => node.style.display = 'none');
  await page.screenshot({ path: '/tmp/sunset-play.png' });
});
