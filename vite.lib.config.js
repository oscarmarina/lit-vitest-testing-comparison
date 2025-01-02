import {defineConfig} from 'vite';
import {nodeExternals} from 'rollup-plugin-node-externals';
import {globSync} from 'tinyglobby';

const entriesDir = 'src';
const entriesGlob = `${entriesDir}/**/*.ts`;

// https://github.com/vitejs/vite/discussions/1736#discussioncomment-5126923
const entries = Object.fromEntries(
  globSync(entriesGlob).map((file) => {
    const [key] = file.match(new RegExp(`(?<=${entriesDir}\/).*`)) || [];
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
    minify: false,
  },
});
