import {defineConfig} from 'vite';
import {globSync} from 'tinyglobby';
import copy from 'rollup-plugin-copy';
import totalBundlesize from '@blockquote/rollup-plugin-total-bundlesize';
// import {preventRewriteImportsTypeModule} from '@blockquote/vite-plugin-prevent-rewrite-imports-type-module';

const OUT_DIR = 'dev';
const ENTRIES_DIR = 'demo';
const ENTRIES_GLOB = [`${ENTRIES_DIR}/**/*.js`];

const copyConfig = {
  targets: [
    {
      src: [`${ENTRIES_DIR}/**/*.*`, `!${ENTRIES_GLOB}`],
      dest: OUT_DIR,
    },
  ],
  hook: 'writeBundle',
};

// https://github.com/vitejs/vite/discussions/1736#discussioncomment-5126923
const entries = Object.fromEntries(
  globSync(ENTRIES_GLOB).map((file) => {
    const [key] = file.match(new RegExp(`(?<=${ENTRIES_DIR}/).*`)) || [];
    return [key?.replace(/\.[^.]*$/, ''), file];
  })
);

// https://vitejs.dev/config/
// https://vite-rollup-plugins.patak.dev/
// https://github.com/vitest-dev/vitest/commit/78b62ffe#diff-d3e264f3679867e205ed7eeb7622aa3b62bb0c4b1a4aa5a5983cb3aa118fcf3c

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
          context: {},
        },
        {
          browser: 'webkit',
          launch: {},
          context: {},
        },
      ],
    },
    coverage: {
      provider: 'istanbul',
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
  plugins: [copy(copyConfig), totalBundlesize()],
  optimizeDeps: {
    exclude: ['lit', 'lit-html'],
  },
  build: {
    target: ['chrome71'],
    outDir: OUT_DIR,
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      input: entries,
      output: {
        dir: OUT_DIR,
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
  },
});
