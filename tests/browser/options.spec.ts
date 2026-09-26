import { test, expect } from '@playwright/test';
import { networkInterfaces } from 'node:os';

test('two players join the same Wi-Fi host and LAN stays connected without internet', async ({
  browser,
}) => {
  const ip = Object.values(networkInterfaces())
    .flat()
    .find((n) => n?.family === 'IPv4' && !n.internal && n.address.startsWith('192.168.'))?.address;
  test.skip(!ip, 'A private Wi-Fi interface is required for this integration check.');
  const a = await browser.newContext(),
    b = await browser.newContext();
  const host = await a.newPage(),
    guest = await b.newPage();
  for (const p of [host, guest]) {
    await p.goto('/');
    await p.getByRole('button', { name: 'SAME WI-FI / ONLINE SERVER' }).click();
    await p.getByRole('button', { name: 'SAME WI-FI', exact: true }).click();
    await p.getByLabel('HOST COMPUTER ADDRESS').fill(`${ip}:3001`);
    await p.getByRole('button', { name: 'CONNECT TO SERVER' }).click();
    await expect(p.getByRole('button', { name: 'PLAY NOW' })).toBeEnabled();
  }
  await host.getByLabel('YOUR NAME').fill('WiFiHost');
  await host.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
  await host.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  await expect(host.locator('.room-code strong')).toBeVisible();
  const code = await host.locator('.room-code strong').innerText();
  await guest.getByLabel('YOUR NAME').fill('WiFiGuest');
  await guest.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await guest.getByLabel('ROOM CODE').fill(code);
  await guest.getByRole('button', { name: 'JOIN THE CHAOS' }).click();
  await expect(host.getByText('WiFiGuest', { exact: true })).toBeVisible();
  await expect(guest.locator('.room-code strong')).toHaveText(code);
  await guest.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  // Socket.IO may reconnect its transport after the browser's offline hint.
  await guest.waitForTimeout(1000);
  await expect(guest.locator('.connection')).toHaveClass(/online/);
  await expect(guest.locator('.room-code strong')).toHaveText(code);
  await host.getByRole('button', { name: 'START MATCH' }).click();
  await expect(guest.locator('canvas')).toBeVisible();
  await guest.reload();
  await expect(guest.locator('canvas')).toBeVisible();
  await a.close();
  await b.close();
});

test('test ads are optional, persistent, clearly labelled and removed in a room', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Test advertisement')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Test ads').check();
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  await expect(page.getByText('TEST AD PREVIEW', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('TEST AD PREVIEW', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  await expect(page.getByRole('button', { name: 'START MATCH' })).toBeVisible();
  await expect(page.getByLabel('Test advertisement')).toHaveCount(0);
});

test('connection chooser rejects unsafe endpoints and restores the website server', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'SAME WI-FI / ONLINE SERVER' }).click();
  await page.getByRole('button', { name: 'SAME WI-FI', exact: true }).click();
  await page.getByLabel('HOST COMPUTER ADDRESS').fill('8.8.8.8');
  await page.getByRole('button', { name: 'CONNECT TO SERVER' }).click();
  await expect(page.getByRole('alert')).toContainText('Wi-Fi IPv4');
  await page.getByRole('button', { name: 'ONLINE', exact: true }).click();
  await page.getByLabel('ONLINE SERVER ADDRESS').fill('http://untrusted.example');
  await page.getByRole('button', { name: 'CONNECT TO SERVER' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTPS');
  await page.getByRole('button', { name: 'USE THIS WEBSITE’S DEFAULT SERVER' }).click();
  await expect(page.getByRole('button', { name: 'PLAY NOW' })).toBeEnabled();
});
