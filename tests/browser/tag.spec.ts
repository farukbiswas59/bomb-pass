import { test, expect } from '@playwright/test';
import { createGameServer } from '../../server/app';

test('one mobile tap passes to a marked rival during transport backpressure', async ({
  browser,
}) => {
  // Private in-process server lets the test arrange positions without a production cheat endpoint.
  const game = createGameServer();
  await new Promise<void>((resolve) => game.http.listen(0, '127.0.0.1', resolve));
  const port = (game.http.address() as { port: number }).port;
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(async (endpoint) => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === '/client/network.ts')!;
      const { net } = await import(url);
      await net.switchServer(endpoint, 'online');
    }, `http://localhost:${port}`);
    await expect(page.getByRole('button', { name: 'PLAY NOW' })).toBeEnabled();
    await page.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    await expect(page.getByRole('button', { name: 'START MATCH' })).toBeVisible();
    const room = [...game.rooms.values()][0];
    // A stationary second player on this isolated server, not a bot that can run away.
    const rival = room.add('Marked Rival', 'fixture-peer');
    await page.getByRole('button', { name: 'START MATCH' }).click();
    await expect.poll(() => room.phase).toBe('playing');
    const local = room.members.get(room.host)!;
    Object.assign(local.player, { x: 280, y: 350, dx: -1, dy: 0, protectedUntil: room.now + 1200 });
    Object.assign(rival.player, { x: 340, y: 350, protectedUntil: 0 });
    room.bombs[0].owner = local.player.id;
    room.bombs[0].detonatesAt = room.now + 10000;
    await expect(page.locator('.tag-status')).toHaveText(/WAIT/);
    await expect(page.locator('.tag-status')).toBeVisible();
    await expect(page.locator('canvas')).toHaveAttribute(
      'aria-description',
      'In tag range: Marked Rival. Tap Tag once.',
    );
    await page.screenshot({ path: 'test-results/mobile-tag-marker.png' });
    // Model a briefly busy transport: volatile packets would be discarded here.
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === '/client/network.ts')!;
      const { net } = await import(url);
      const engine = net.socket.io.engine;
      const transport = engine.transport;
      transport.writable = false;
      setTimeout(() => {
        transport.writable = true;
        engine.flush();
      }, 250);
    });
    await page.getByRole('button', { name: 'Tag', exact: true }).tap();
    await expect.poll(() => room.bombs[0].owner).toBe(rival.player.id);
    expect(local.player.passes).toBe(1);
    expect(local.player.x).toBe(280);
    expect(local.player.y).toBe(350);
    await expect(page.locator('canvas')).not.toHaveAttribute('aria-description', /In tag range/);
    await page.waitForTimeout(800);
    expect(local.player.passes).toBe(1);
  } finally {
    await context.close();
    await game.close();
  }
});
