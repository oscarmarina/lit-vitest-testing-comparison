import {defineWorkspace} from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vite.config.js',
    test: {
      name: 'Chromium',
      browser: {
        name: 'chromium',
      },
    },
  },
  {
    extends: './vite.config.js',
    test: {
      name: 'Webkit',
      browser: {
        name: 'webkit',
        headless: true,
      },
    },
  },
]);
