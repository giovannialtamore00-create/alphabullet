import { expect, test } from '@playwright/test';

test('loads, starts a bot match, runs without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__game?.world?.tick > 60, null, { timeout: 30_000 });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: 'test-results/smoke.png' });
  const state = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { tick: w.tick, players: w.players.length, alive: w.players.filter((p: any) => p.alive).length };
  });
  expect(state.players).toBe(8);
  expect(errors).toEqual([]);
});
