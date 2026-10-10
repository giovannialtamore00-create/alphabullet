import { test } from '@playwright/test';
import { writeFileSync } from 'fs';

// Dev tool run: FONTCHECK=1 npx playwright test fontcheck (needs `npm run dev` on 5173)
test.skip(!process.env.FONTCHECK, 'manual tool');

test('font alignment report', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('http://localhost:5173/tools/fontcheck.html');
  await page.waitForFunction(() => (window as any).__fontReport, null, { timeout: 30_000 });
  const report = await page.evaluate(() => (window as any).__fontReport);
  writeFileSync('test-results/fontreport.json', JSON.stringify(report, null, 1));
  for (const id of ['helvetica', 'arial', 'times', 'comic', 'courier', 'papyrus', 'impact', 'chalkduster'])
    await page.locator(`#sheet-${id}`).screenshot({ path: `test-results/sheet-${id}.png` });
});
