import {defineConfig} from 'eslint/config';
import createConfig from '@blockquote/eslint-config';

const eslintConfig = defineConfig(createConfig({tsconfigRootDir: import.meta.dirname}));
export default eslintConfig;
