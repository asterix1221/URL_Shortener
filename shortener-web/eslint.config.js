import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    // тулчинг (этот конфиг и scripts/*.mjs) живёт в Node, а не в браузере: у flat-конфига
    // globals по умолчанию пусты, и без globals.node на console/process ругается no-undef.
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } }
  }
);
