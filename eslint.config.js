import js from '@eslint/js';
import {configs as wc} from 'eslint-plugin-wc';
import {configs as lit} from 'eslint-plugin-lit';
import litA11y from 'eslint-plugin-lit-a11y';
import {flatConfigs as importPlugin} from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';
import htmlEslint from '@html-eslint/eslint-plugin';
import htmlEslintParser from '@html-eslint/parser';
import eslintPluginHtml from 'eslint-plugin-html';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const fileTypes = '{js,ts,mjs}';

// eslint-plugin-import
const importFilesConfig = [importPlugin.recommended, importPlugin.typescript].map((conf) => ({
  ...conf,
  files: [`**/*.${fileTypes}`],
  languageOptions: {
    parser: tsParser,
  },
}));

const importFilesRules = {
  files: [`**/*.${fileTypes}`],
  rules: {
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

// eslint-plugin-lit-a11y
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

// eslint-plugin-wc
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

// eslint-plugin-lit
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

// @html-eslint/typescript-eslint
const tsFilesConfig = [...tseslint.configs.strict, ...tseslint.configs.stylistic].map((conf) => ({
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
    '@typescript-eslint/class-literal-property-style': 'off',
  },
};

// @html-eslint/eslint-plugin
const htmlFilesConfig = [htmlEslint.configs['flat/recommended']].map((conf) => ({
  ...conf,
  files: ['**/*.html'],
  plugins: {
    '@html-eslint': htmlEslint,
  },
  languageOptions: {
    parser: htmlEslintParser,
  },
}));

const htmlFilesRules = {
  files: ['**/*.html'],
  rules: {
    '@html-eslint/indent': ['error', 2],
    '@html-eslint/require-closing-tags': 'off',
    '@html-eslint/no-extra-spacing-attrs': 'off',
    '@html-eslint/attrs-newline': 'off',
  },
};

// @eslint-plugin-html
const eslintPluginHtmlConfig = {
  files: ['**/*.html'],
  plugins: {eslintPluginHtml},
};

// eslint-config
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
  js.configs.recommended,
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
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.mocha,
      },
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
          ignoredNodes: ['PropertyDefinition', 'TemplateLiteral *'],
        },
      ],
      'no-empty-function': 'error',
    },
  },
  {
    files: [`**/test/**/*.${fileTypes}`],
    rules: {
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
];
