const fs = require('node:fs');

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : null,
  process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    : null,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      url: (process.env.LIGHTHOUSE_PUBLIC_ONLY === '1'
        ? ['/', '/login']
        : ['/', '/login', '/dashboard']
      ).map((path) => `http://127.0.0.1:4173${path}`),
      ...(chromePath ? { chromePath } : {}),
      puppeteerScript: './scripts/lighthouse-auth.cjs',
      puppeteerLaunchOptions: {
        ...(chromePath ? { executablePath: chromePath } : {}),
        args: ['--no-sandbox'],
      },
      settings: { disableStorageReset: true },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 3000, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: './artifacts/lighthouse' },
  },
};
