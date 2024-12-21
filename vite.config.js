import {defineConfig} from 'vite';
import copy from 'rollup-plugin-copy';
import multi from '@rollup/plugin-multi-entry';
import totalBundlesize from '@blockquote/rollup-plugin-total-bundlesize';
import externalizeSourceDependencies from '@blockquote/rollup-plugin-externalize-source-dependencies';

const copyConfig = {
  targets: [
    {
      src: 'demo/*.html',
      dest: 'dev/',
    },
  ],
  hook: 'writeBundle',
};

// https://vitejs.dev/config/
// https://vite-rollup-plugins.patak.dev/

export default defineConfig({
  test: {
    onConsoleLog(log, type) {
      if (type === 'stderr' && log.includes('in dev mode')) {
        return false;
      }
    },
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    browser: {
      enabled: true,
      headless: false,
      name: 'chromium',
      provider: 'playwright',
      screenshotFailures: false,
      viewport: {width: 1920, height: 1080},
      instances: [
        {
          browser: 'chromium',
          launch: {
            devtools: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
          },
        },
      ],
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'test/coverage/',
      reporter: ['lcov', 'json', 'text-summary', 'html'],
      enabled: true,
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: ['**/src/**/*'],
      exclude: ['**/src/**/index.*', '**/src/styles/'],
    },
  },
  plugins: [
    externalizeSourceDependencies(['/__web-dev-server__web-socket.js']),
    copy(copyConfig),
    multi({entryFileName: 'entry.js'}),
    totalBundlesize(),
  ],
  optimizeDeps: {
    exclude: ['lit', 'lit-html'],
  },
  build: {
    target: ['chrome71'],
    outDir: 'dev',
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      input: ['demo/*.js'],
      output: {
        dir: 'dev/',
        format: 'es',
      },
    },
  },
});
