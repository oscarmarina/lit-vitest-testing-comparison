import {defineConfig} from 'vite';
import {nodeExternals} from 'rollup-plugin-node-externals';
import {globSync} from 'tinyglobby';

const ENTRIES_DIR = 'src';
const ENTRIES_GLOB = [`${ENTRIES_DIR}/**/*.ts`];

// https://github.com/vitejs/vite/discussions/1736#discussioncomment-5126923
const entries = Object.fromEntries(
  globSync(ENTRIES_GLOB).map((file) => {
    const [key] = file.match(new RegExp(`(?<=${ENTRIES_DIR}\/).*`)) || [];
    return [key?.replace(/\.[^.]*$/, ''), file];
  })
);

export default defineConfig({
  plugins: [nodeExternals()],
  build: {
    rolldownOptions: {
      transform: {
        target: ['es2022'],
        assumptions: {
          setPublicClassFields: true,
        },
        typescript: {
          removeClassFieldsWithoutInitializer: true,
        },
        decorator: {
          legacy: true,
        },
      },
      treeshake: true,
    },
    minify: false,
    lib: {
      entry: entries,
      formats: ['es'],
    },
  },
});
