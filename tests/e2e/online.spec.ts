import { expect, test } from '@playwright/test';

// Uses the public PeerJS broker: needs internet. Skips (not fails) when it is unreachable.
test('host and client play an online match over PeerJS', async ({ browser }) => {
  const errors: string[] = [];
  const hostCtx = await browser.newContext();
  const clientCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const client = await clientCtx.newPage();
  for (const p of [host, client]) p.on('pageerror', (e) => errors.push(String(e)));

  await host.goto('/');
  await host.getByRole('button', { name: 'Host' }).click();
  await host.getByRole('button', { name: 'Create room' }).click();
  const codeEl = host.locator('.code');
  const ok = await codeEl.waitFor({ timeout: 20_000 }).then(() => true, () => false);
  test.skip(!ok, 'PeerJS broker unreachable from this machine');
  const code = (await codeEl.textContent())!.trim();

  await client.goto('/');
  await client.getByRole('button', { name: 'Join' }).click();
  await client.getByPlaceholder('CODE').fill(code);
  await client.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(host.locator('.plist li')).toHaveCount(2, { timeout: 20_000 });
  await expect(client.getByText('Waiting for the host')).toBeVisible();

  await host.getByRole('button', { name: 'Start match' }).click();
  await client.waitForFunction(() => (window as any).__game?.world?.tick > 30, null, { timeout: 20_000 });
  const info = await client.evaluate(() => {
    const g = (window as any).__game;
    return { local: g.localId, humans: g.world.players.filter((p: any) => !p.isBot).length, total: g.world.players.length };
  });
  expect(info).toEqual({ local: 1, humans: 2, total: 8 });
  // Snapshots arrive on the unreliable fast channel, not the reliable fallback.
  const fastIn = await client.evaluate(() => (window as any).__game.net.client.conn.fastReceived());
  expect(fastIn).toBeGreaterThan(20);

  // Client input reaches the host's authoritative sim.
  const x0 = await host.evaluate(() => (window as any).__game.world.players[1].x);
  await client.keyboard.down('ArrowLeft');
  await client.waitForTimeout(1500);
  await client.keyboard.up('ArrowLeft');
  const x1 = await host.evaluate(() => (window as any).__game.world.players[1].x);
  expect(x0 - x1).toBeGreaterThan(150);
  // Client mirror tracks the host.
  await client.waitForTimeout(300);
  const [hx, cx] = [await host.evaluate(() => (window as any).__game.world.players[0].x), await client.evaluate(() => (window as any).__game.world.players[0].x)];
  expect(Math.abs(hx - cx)).toBeLessThan(80);
  await client.screenshot({ path: 'test-results/online-client.png' });

  // Host quits: client gets a clear message.
  await host.keyboard.press('Escape');
  await host.getByRole('button', { name: 'Quit to menu' }).click();
  await expect(client.getByText('Disconnected')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
  await hostCtx.close();
  await clientCtx.close();
});
