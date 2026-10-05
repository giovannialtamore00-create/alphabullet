import { test } from '@playwright/test';

// Manual visual check: VISUAL=1 npx playwright test visual
test.skip(!process.env.VISUAL, 'visual check only');

test('visual snapshot of a busy scene', async ({ page }) => {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as any).__game?.world?.tick > 10, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    const me = w.players[0];
    // Bring a bot, some letters and mobs close; put the fog edge on screen.
    w.players[1].x = me.x + 380;
    w.players[1].y = me.y - 120;
    const free = w.copies.filter((c: any) => c.state === 'pool').slice(0, 3);
    free.forEach((c: any, i: number) => {
      c.state = 'ground';
      c.x = me.x - 300 + i * 120;
      c.y = me.y + 220;
      c.upgraded = i === 2;
    });
    w.fog.x = me.x - 1200;
    w.fog.y = me.y;
    w.fog.r = 1650;
    w.fog.phase = 'done';
    for (let i = 0; i < 24; i++) {
      const kinds = ['/', '%', '#', '@', '!', '=', '(', ')', '"', '?', '£', '$', '&', '|'];
      w.mobs.push({ id: 90000 + i, kind: kinds[i % kinds.length], tier: 'medium', x: me.x + Math.cos(i) * (250 + i * 8), y: me.y + Math.sin(i) * (250 + i * 8), hp: 20, maxHp: 24, r: 16, speed: 0, dmg: 0, contactCd: 9, lastHitBy: null, lastHitCopy: null });
    }
    g.debug.hitboxes = !!(window as any).__hitboxes;
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/visual.png' });
});
