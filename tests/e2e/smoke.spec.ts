import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const tick = (page: Page) => page.evaluate(() => (window as any).__game?.world?.tick ?? -1);

test('loads, starts a bot match, runs without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play vs bots' }).click();
  await page.waitForFunction(() => (window as any).__game?.world?.tick > 60, null, { timeout: 30_000 });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: 'test-results/smoke.png' });
  const state = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { players: w.players.length, bots: w.players.filter((p: any) => p.isBot).length };
  });
  expect(state).toEqual({ players: 8, bots: 7 });
  expect(errors).toEqual([]);
});

test('full flow: menu -> match -> pause -> end screen -> play again -> menu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Music')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Play vs bots' }).click();
  await page.waitForFunction(() => (window as any).__game?.world?.tick > 30, null, { timeout: 30_000 });
  // Esc pauses a solo match.
  await page.keyboard.press('Escape');
  await expect(page.getByText('Paused')).toBeVisible();
  const t0 = await tick(page);
  await page.waitForTimeout(400);
  expect(await tick(page)).toBe(t0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await tick(page)).toBeGreaterThan(t0);
  // Force the match to end: erase all bots.
  await page.evaluate(() => {
    for (const p of (window as any).__game.world.players) if (p.isBot) { p.letters = [p.active]; p.lives = 1; p.hp = -1; }
  });
  await expect(page.getByText('You are the last letter standing!')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('#1 of 8')).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await page.waitForFunction(() => (window as any).__game?.world?.tick > 10 && !(window as any).__game.world.over, null, { timeout: 30_000 });
  // Local player dies first: spectating, then the match ends when one bot remains.
  await page.evaluate(() => { const p = (window as any).__game.world.players[0]; p.letters = [p.active]; p.lives = 1; p.hp = -1; });
  await expect(page.getByText(/You placed #8/)).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    for (const p of (window as any).__game.world.players.slice(2)) { p.letters = [p.active]; p.lives = 1; p.hp = -1; }
  });
  await expect(page.getByRole('button', { name: 'Back to menu' })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'test-results/end.png' });
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await expect(page.getByRole('button', { name: 'Play vs bots' })).toBeVisible();
  await page.screenshot({ path: 'test-results/menu.png' });
  expect(errors).toEqual([]);
});
