import tseslint from 'typescript-eslint';
import html from '@html-eslint/eslint-plugin';
import globals from 'globals';
// import htmlParser from '@html-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const htmlFilesConfig = [
  html.configs['flat/recommended']
].map(conf => ({
  ...conf,
  files: ['**/*.html'],
}));

const htmlFilesRules = {
  files: ['**/*.html'],
  rules: {
    '@html-eslint/indent': ['error', 2],
    '@html-eslint/require-closing-tags': 'off',
    '@html-eslint/no-extra-spacing-attrs': 'off',
  },
};

const tsFilesConfig = [
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
].map(conf => ({
  ...conf,
  files: ['**/*.ts'],
}));

const tsFilesRules = {
  files: ['**/*.ts'],
  rules: {
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};

export default [
  {
    ignores: [
      '**/.idea',
      '**/.vscode',
      '**/.code-workspace',
      '**/coverage',
      '**/reports',
      '**/__snapshots__',
      '**/screenshots',
      '**/_site',
      '**/dist',
      '**/dev',
      '**/build',
      '**/.tmp',
      '**/*.d.ts',
      '**/storybook-static',
      '**/*.config.*',
      '**/*.workspace.*',
      '**/*.min.js',
      '**/*-styles.*',
    ],
  },
  ...compat.extends('@open-wc'),
  ...htmlFilesConfig,
  htmlFilesRules,
  ...tsFilesConfig,
  tsFilesRules,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'class-methods-use-this': 'off',
      'no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],
      'object-curly-newline': 'off',
      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
          ignoredNodes: ['PropertyDefinition', 'TemplateLiteral > *'],
        },
      ],
      'import/extensions': [
        'error',
        'always',
        {
          ignorePackages: true,
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/test/**/*.{js,ts}',
            '**/*.config.{js,ts,mjs,cjs}',
            '**/*.conf.{js,ts,mjs,cjs}',
          ],
        },
      ],
      'import/no-unresolved': 'off',
      'import/prefer-default-export': 'off',
      'lit/no-classfield-shadowing': 'off',
      'lit/no-native-attributes': 'off',
      'lit-a11y/click-events-have-key-events': 'off',
    },
  },
];
