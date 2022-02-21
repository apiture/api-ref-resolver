const ERROR = 2;
const WARN = 1;
const OFF = 0;

module.exports = {
  ignorePatterns: ["/*.*", "!src/**/*", "!test/**/*"],
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    curly: ERROR,
    'no-prototype-builtins': OFF,
    'import/order': [
      WARN,
      {
        groups: ['builtin', 'external', ['internal', 'parent', 'sibling', 'index']],
        pathGroups: [
          {
            pattern: '@apiture/**/*',
            group: 'external',
            position: 'after',
          },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
  },
};
