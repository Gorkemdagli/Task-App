import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 204 }));
});

test('renders the public login route', async ({ page }) => {
  const refreshResponse = page.waitForResponse('**/api/v1/auth/refresh');
  const response = await page.goto('/login');

  expect(response?.status()).toBe(200);
  expect((await refreshResponse).status()).toBe(204);
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
});

test('serves the protected deep link through the SPA shell', async ({ page }) => {
  const refreshResponse = page.waitForResponse('**/api/v1/auth/refresh');
  const response = await page.goto('/dashboard');

  expect(response?.status()).toBe(200);
  expect((await refreshResponse).status()).toBe(204);
  await expect(page).toHaveTitle(/TaskFlow/);
});
