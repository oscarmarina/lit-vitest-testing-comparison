import {defineWorkspace} from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'Chromium',
      browser: {
        name: 'chromium',
      },
    },
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'Webkit',
      browser: {
        name: 'webkit',
        headless: true,
      },
    },
  },
]);
