import { test, expect, type Page } from '@playwright/test';

test('a moved guest session leaves the original tab able to join again', async ({ browser }) => {
  const original = await browser.newContext();
  const page = await original.newPage();
  await create(page, 'Guest');
  const first = await state(page);
  const session = await page.evaluate(() => sessionStorage.getItem('bp.session'));
  const replacement = await browser.newContext();
  await replacement.addInitScript((value) => sessionStorage.setItem('bp.session', value!), session);
  const other = await replacement.newPage();
  await other.goto('/');
  await expect.poll(async () => (await state(other)).id).toBe(first.id);
  await expect(page.getByRole('button', { name: 'CREATE PRIVATE ROOM' })).toBeVisible();
  await expect.poll(async () => (await state(page)).connected).toBe(true);
  expect((await state(page)).snapshot).toBeNull();
  await original.close();
  await replacement.close();
});
async function state(page: Page) {
  return page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => new URL(n).pathname === '/client/network.ts')!;
    const { net } = await import(url);
    return {
      snapshot: net.snapshot,
      id: net.id,
      predicted: net.predicted,
      pending: net.pending.length,
      ping: net.ping,
      connected: net.socket.connected,
    };
  });
}
async function create(page: Page, name = 'Tester') {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'PLAY NOW' })).toBeEnabled();
  await page.getByLabel('YOUR NAME').fill(name);
  await page.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
  await page.locator('select').nth(1).selectOption('60');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  await expect(page.getByRole('button', { name: 'START MATCH' })).toBeVisible();
  return (await state(page)).snapshot.code as string;
}
test('two real browsers: movement, recovery, full match results and rematch', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const page = await a.newPage(),
    rival = await b.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  rival.on('pageerror', (e) => errors.push(e.message));
  const code = await create(page, 'Alpha');
  await rival.goto(`/join/${code}`);
  await rival.getByLabel('YOUR NAME').fill('Bravo');
  await rival.getByRole('button', { name: 'JOIN THE CHAOS' }).click();
  await expect(page.getByText('Bravo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ ADD A BOT TO PRACTICE' }).click();
  await page.getByRole('button', { name: 'START MATCH' }).click();
  await expect.poll(async () => (await state(page)).snapshot.phase).toBe('playing');
  const first = await state(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(450);
  await page.keyboard.up('d');
  await expect
    .poll(async () => (await state(rival)).snapshot.players.find((p: any) => p.id === first.id).x)
    .toBeGreaterThan(first.predicted.x + 35);
  await page.reload();
  await expect.poll(async () => (await state(page)).id).toBe(first.id);
  await expect(page.locator('canvas')).toBeVisible();
  await a.setOffline(true);
  await expect(page.getByText('RECONNECTING…', { exact: true })).toBeVisible();
  await a.setOffline(false);
  await expect.poll(async () => (await state(page)).connected).toBe(true);
  await expect
    .poll(
      async () =>
        (await state(page)).snapshot.players.find((p: any) => p.id === first.id).connected,
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'SHARE RESULT' })).toBeVisible({ timeout: 70000 });
  const final = await state(page);
  expect(final.snapshot.results.rows).toHaveLength(3);
  expect(final.snapshot.results.rows.some((p: any) => p.exploded > 0)).toBe(true);
  // Host migrates while the original host reloads; rematch through the current host.
  const hostPage = final.snapshot.host === first.id ? page : rival;
  await hostPage.getByRole('button', { name: 'REMATCH' }).click();
  await expect.poll(async () => (await state(page)).snapshot.phase).toBe('countdown');
  expect(
    (await state(page)).snapshot.players.every((p: any) => p.lives === 5 && p.points === 0),
  ).toBe(true);
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
test('small-phone multitouch: movement + tag + dash, cancel and orientation', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await create(page, 'Touch');
  await page.getByRole('button', { name: '+ ADD A BOT TO PRACTICE' }).click();
  await page.getByRole('button', { name: 'START MATCH' }).click();
  await expect.poll(async () => (await state(page)).snapshot.phase).toBe('playing');
  await expect
    .poll(async () => {
      const st = await state(page);
      const p = st.snapshot.players.find((p: any) => p.id === st.id);
      return st.snapshot.now > p.protectedUntil;
    })
    .toBe(true);
  const initial = await state(page),
    stick = (await page.getByRole('group', { name: 'Movement joystick' }).boundingBox())!,
    tag = (await page.getByRole('button', { name: 'Tag', exact: true }).boundingBox())!,
    dash = (await page.getByRole('button', { name: 'Dash', exact: true }).boundingBox())!;
  const cdp = await context.newCDPSession(page),
    left = { id: 1, x: stick.x + stick.width / 2 + 28, y: stick.y + stick.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [left, { id: 2, x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 }],
  });
  await page.waitForTimeout(100);
  await expect
    .poll(async () =>
      (await state(page)).snapshot.events.some(
        (e: any) => e.type === 'tag' && e.player === initial.id,
      ),
    )
    .toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [left] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [left, { id: 3, x: dash.x + dash.width / 2, y: dash.y + dash.height / 2 }],
  });
  await page.waitForTimeout(150);
  await expect
    .poll(async () =>
      (await state(page)).snapshot.events.some(
        (e: any) => e.type === 'dash' && e.player === initial.id,
      ),
    )
    .toBe(true);
  expect((await state(page)).predicted.x).toBeGreaterThan(initial.predicted.x + 30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(300);
  const x = (await state(page)).predicted.x;
  await page.waitForTimeout(300);
  expect(Math.abs((await state(page)).predicted.x - x)).toBeLessThan(10);
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(120);
    const geometry = await page.evaluate(() => {
      const c = document.querySelector('canvas')!.getBoundingClientRect();
      const t = document.querySelector('.tag-button')!.getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollWidth > innerWidth,
        ratio: c.width / c.height,
        canvasBottom: c.bottom,
        tagBottom: t.bottom,
        height: innerHeight,
      };
    });
    expect(geometry.scroll).toBe(false);
    expect(geometry.ratio).toBeCloseTo(5 / 6, 1);
    expect(geometry.tagBottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.canvasBottom).toBeLessThanOrEqual(geometry.height);
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: 'test-results/mobile-game.png' });
  await context.close();
});
test('movement remains responsive with 150ms round-trip websocket latency', async ({ browser }) => {
  const context = await browser.newContext();
  await context.routeWebSocket('**/socket.io/**', (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => setTimeout(() => server.send(message), 75));
    server.onMessage((message) => setTimeout(() => ws.send(message), 75));
  });
  const page = await context.newPage();
  await create(page, 'LagTest');
  await page.getByRole('button', { name: '+ ADD A BOT TO PRACTICE' }).click();
  await page.getByRole('button', { name: 'START MATCH' }).click();
  await expect.poll(async () => (await state(page)).snapshot.phase).toBe('playing');
  const first = await state(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(70);
  const predicted = await state(page);
  expect(predicted.predicted.x).toBeGreaterThan(first.predicted.x + 3);
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  await page.waitForTimeout(500);
  const settled = await state(page),
    authority = settled.snapshot.players.find((p: any) => p.id === settled.id);
  expect(Math.abs(settled.predicted.x - authority.x)).toBeLessThan(14);
  expect(settled.pending).toBeLessThan(15);
  await expect.poll(async () => (await state(page)).ping).toBeGreaterThanOrEqual(140);
  await context.close();
});
