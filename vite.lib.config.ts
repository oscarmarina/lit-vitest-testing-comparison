/// <reference types="vitest/config" />

import {defineConfig} from 'vite';
import {nodeExternals} from 'rollup-plugin-node-externals';
import {globSync} from 'tinyglobby';

const srcDir = 'src';
const srcGlob = `${srcDir}/**/*.ts`;

// https://github.com/vitejs/vite/discussions/1736#discussioncomment-5126923
const entries = Object.fromEntries(
  globSync(srcGlob).map((file) => {
    const [key] = file.match(new RegExp(`(?<=${srcDir}\/).*`)) || [];
    return [key?.replace(/\.[^.]*$/, ''), file];
  })
);

export default defineConfig({
  plugins: [nodeExternals()],
  build: {
    target: ['es2022'],
    lib: {
      entry: entries,
      formats: ['es'],
    },
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
    },
  },
});
