import js from '@eslint/js';
import {configs as wc} from 'eslint-plugin-wc';
import {configs as lit} from 'eslint-plugin-lit';
import {default as litA11y} from 'eslint-plugin-lit-a11y';
import {flatConfigs as importPlugin} from 'eslint-plugin-import';
import {configs as tseslint, parser as tsParser} from 'typescript-eslint';
import htmlEslint from '@html-eslint/eslint-plugin';
import htmlEslintParser from '@html-eslint/parser';
import eslintPluginHtml from 'eslint-plugin-html';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const fileTypes = '{js,ts,mjs}';

//
// ──────────────────────────────────────────────────────────────
// Base config
// ──────────────────────────────────────────────────────────────
//
const baseConfig = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2023,
        ...globals.mocha,
      },
    },
  },
];

//
// ──────────────────────────────────────────────────────────────
// eslint-plugin-import
// ──────────────────────────────────────────────────────────────
//
const importFilesConfig = [importPlugin.recommended, importPlugin.typescript].map((conf) => ({
  ...conf,
  files: [`**/*.${fileTypes}`],
  languageOptions: {
    ...conf.languageOptions,
    parser: tsParser,
  },
}));

const importFilesRules = {
  files: [`**/*.${fileTypes}`],
  rules: {
    'import/extensions': ['error', 'always', {ignorePackages: true}],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          `**/test/**/*.${fileTypes}`,
          `**/*.config.${fileTypes}`,
          `**/*.conf.${fileTypes}`,
        ],
      },
    ],
    'import/no-unresolved': 'off',
    'import/prefer-default-export': 'off',
  },
};

//
// ──────────────────────────────────────────────────────────────
// eslint-plugin-lit-a11y
// ──────────────────────────────────────────────────────────────
//
// @ts-ignore
const litA11yFilesConfig = [litA11y.configs.recommended].map((conf) => ({
  ...conf,
  files: [`**/*.${fileTypes}`],
}));

const litA11yFilesRules = {
  files: [`**/*.${fileTypes}`],
  rules: {
    'lit-a11y/no-autofocus': 'off',
    'lit-a11y/anchor-is-valid': 'off',
    'lit-a11y/click-events-have-key-events': 'off',
  },
};

//
// ──────────────────────────────────────────────────────────────
// eslint-plugin-wc
// ──────────────────────────────────────────────────────────────
//
const wcFilesConfig = [wc['flat/recommended']].map((conf) => ({
  ...conf,
  files: [`**/*.${fileTypes}`],
}));

const wcFilesRules = {
  files: [`**/*.${fileTypes}`],
  rules: {
    'wc/no-constructor-attributes': 'warn',
  },
};

//
// ──────────────────────────────────────────────────────────────
// eslint-plugin-lit
// ──────────────────────────────────────────────────────────────
//
const litFilesConfig = [lit['flat/recommended']].map((conf) => ({
  ...conf,
  files: [`**/*.${fileTypes}`],
}));

const litFilesRules = {
  files: [`**/*.${fileTypes}`],
  rules: {
    'lit/lifecycle-super': 'error',
    'lit/no-native-attributes': 'off',
    'lit/no-useless-template-literals': 'off',
    'lit/binding-positions': 'off',
    'lit/no-invalid-html': 'off',
  },
};

//
// ──────────────────────────────────────────────────────────────
// typescript-eslint
// ──────────────────────────────────────────────────────────────
//
const tsFilesConfig = [...tseslint.strict, ...tseslint.stylistic].map((conf) => ({
  ...conf,
  files: ['**/*.ts'],
  // @ts-ignore
  ...(conf.languageOptions && {
    languageOptions: {
      // @ts-ignore
      ...conf.languageOptions,
      parserOptions: {
        // @ts-ignore
        ...conf.languageOptions.parserOptions,
        projectService: {
          allowDefaultProject: [
            `test/*.${fileTypes}`,
            `*.config.${fileTypes}`,
            `*.conf.${fileTypes}`,
          ],
        },
      },
    },
  }),
}));

const tsFilesRules = {
  files: ['**/*.ts'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/class-literal-property-style': 'off',
    '@typescript-eslint/no-unused-expressions': 'off',
  },
};

//
// ──────────────────────────────────────────────────────────────
// HTML
// ──────────────────────────────────────────────────────────────
//
// @ts-ignore
const htmlFilesConfig = [htmlEslint.configs['flat/recommended']].map((conf) => ({
  ...conf,
  files: ['**/*.html'],
  plugins: {
    ...conf.plugins,
    '@html-eslint': htmlEslint,
  },
  languageOptions: {
    ...conf.languageOptions,
    parser: htmlEslintParser,
  },
}));

const htmlFilesRules = {
  files: ['**/*.html'],
  rules: {
    '@html-eslint/indent': 'off',
    '@html-eslint/require-closing-tags': 'off',
    '@html-eslint/no-extra-spacing-attrs': 'off',
    '@html-eslint/attrs-newline': 'off',
  },
};

const eslintPluginHtmlConfig = {
  files: ['**/*.html'],
  plugins: {eslintPluginHtml},
};

//
// ──────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────
//
export default [
  {
    ignores: [
      '**/.idea',
      '**/.tmp',
      '**/.vscode',
      '**/.wireit',
      '**/_site',
      '**/build',
      '**/coverage',
      '**/dev',
      '**/dist',
      '**/reports',
      '**/storybook-static',
      '**/*screenshots*',
      '**/*snapshots*',
      '**/*.config.*',
      '**/*.d.ts',
      '**/*.min.js',
      '**/*.workspace.*',
    ],
  },

  ...baseConfig,

  ...importFilesConfig,
  importFilesRules,

  ...litA11yFilesConfig,
  litA11yFilesRules,

  ...wcFilesConfig,
  wcFilesRules,

  ...litFilesConfig,
  litFilesRules,

  ...tsFilesConfig,
  tsFilesRules,

  ...htmlFilesConfig,
  htmlFilesRules,
  eslintPluginHtmlConfig,

  eslintConfigPrettier,

  {
    rules: {
      'no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],
      'no-empty-function': 'error',
    },
  },

  {
    files: [`**/test/**/*.${fileTypes}`],
    rules: {
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
