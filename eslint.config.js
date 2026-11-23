import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'data/**'],
  },
  {
    // scripts/ is node-only tooling (downloads, backtests); the app never ships it
    files: ['web/**/*.{ts,tsx}', 'lib/**/*.ts', 'api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/scripts/**'], message: 'scripts/ is node-only tooling.' },
          ],
        },
      ],
      // the server and the browser never read an anthropic key from the
      // environment; only scripts/ may (npm run eval:live, run by hand)
      'no-restricted-syntax': [
        'error',
        ...[
          "Identifier[name='ANTHROPIC_API_KEY']",
          "Literal[value='ANTHROPIC_API_KEY']",
          'TemplateElement[value.raw=/ANTHROPIC_API_KEY/]',
        ].map((selector) => ({
          selector,
          message:
            'ANTHROPIC_API_KEY is for scripts/ only (eval:live). Users bring their own key in the browser.',
        })),
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
