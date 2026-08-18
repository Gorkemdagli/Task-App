module.exports = async function prepareLighthouse(browser, { url }) {
  const page = await browser.newPage();
  const target = new URL(url);

  if (target.pathname === '/dashboard') {
    const email = process.env.PERF_EMAIL;
    const password = process.env.PERF_PASSWORD;
    if (!email || !password) throw new Error('PERF_EMAIL and PERF_PASSWORD are required for dashboard audit');
    await page.goto(`${target.origin}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.type('#email', email);
    await page.type('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="dashboard-page"]', { timeout: 30_000 });
    if (!page.url().includes('/dashboard')) throw new Error(`Dashboard login failed: ${page.url()}`);
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.deleteCookie(...(await page.cookies()));
  }
  await page.close();
};
