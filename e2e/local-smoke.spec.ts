import { expect, test } from '@playwright/test';

test('renders the public login route', async ({ page }) => {
  const response = await page.goto('/login');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
});

test('serves the protected deep link through the SPA shell', async ({ page }) => {
  const response = await page.goto('/dashboard');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/TaskFlow/);
});
