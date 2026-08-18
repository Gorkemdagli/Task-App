module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      url: [
        'http://127.0.0.1:4173/',
        'http://127.0.0.1:4173/login',
        'http://127.0.0.1:4173/dashboard',
      ],
      puppeteerScript: './scripts/lighthouse-auth.cjs',
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
