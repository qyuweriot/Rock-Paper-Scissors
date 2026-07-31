import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.npm-cache/**', 'coverage/**'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      // globals はブロックごとにマージされるため、ブラウザ系は層別ブロックで配る
      globals: globals.es2022,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    languageOptions: { globals: globals.browser },
    // v7 の flat config は configs.flat 配下にある
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
  },

  // --- 設計方針のガード (PLAN §3) -------------------------------------------

  // PLAN §3.4: 乱数はシード付きRNGに一元化する。Math.random() の直接使用を禁止
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/engine/rng.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() は使用禁止。engine/rng.ts のシード付きRNGを経由すること (PLAN §3.4)',
        },
      ],
    },
  },

  // PLAN §3.1: engine / data / ai / sim は React・DOM・ブラウザAPIに依存しない
  {
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts', 'src/ai/**/*.ts', 'src/sim/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // ブラウザAPIの参照を禁止する。TS ファイルでは typescript-eslint が no-undef を
      // 無効化するため globals では止められない。明示的に列挙して落とす。
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'location',
          'history',
          'localStorage',
          'sessionStorage',
          'alert',
          'confirm',
          'requestAnimationFrame',
          'cancelAnimationFrame',
        ].map((name) => ({
          name,
          message:
            'engine / data / ai / sim はブラウザAPIに依存してはいけない (PLAN §3.1)。Node 上で単体実行できる状態を保つこと',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', '**/ui/**'],
              message:
                'engine / data / ai / sim は React・UI に依存してはいけない (PLAN §3.1)。Node 上で単体実行できる状態を保つこと',
            },
          ],
        },
      ],
    },
  },

  // sim は Node の CLI。console 出力と process の使用を許可する
  {
    files: ['src/sim/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
