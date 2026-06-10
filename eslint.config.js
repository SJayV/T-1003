import globals from 'globals';

export default [
  {
    files: ['src/**/*.js', 'main.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
      'eqeqeq': 'error',
      'no-var': 'error',
    },
  },
];
