const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');

const refreshConfig = (reactRefresh && reactRefresh.configs && reactRefresh.configs.vite) || { rules: {}, plugins: {} };
const reactHookConfig = reactHooks.configs['recommended-latest'] || { rules: {} };

module.exports = [
  {
    ignores: [
      'dist',
      'node_modules',
      '.next',
      'coverage',
      'build',
      'processed_invoices/**',
      'pcs_ai_data/**',
      'public/**',
      '**/*.py',
      'repair_loop/**',
      'output_jsons/**',
      'sample_invoices_pcs/**',
      'converted/**',
    ],
  },
  {
    files: [
      'app/**/*.{js,jsx}',
      'lib/**/*.{js,jsx}',
      'src/**/*.{js,jsx}',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      ...(refreshConfig.plugins || {}),
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...(reactHookConfig.rules || {}),
      ...(refreshConfig.rules || {}),
      'react-refresh/only-export-components': 'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/tailwind.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: globals.node,
    },
  },
];
