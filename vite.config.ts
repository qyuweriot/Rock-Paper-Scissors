/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages のリポジトリ名サブパス配信 (PLAN §1)
  base: '/Rock-Paper-Scissors/',
  plugins: [react()],
  test: {
    // engine は React・DOM に依存しない純粋な TypeScript (PLAN §3.1)。
    // Phase 6 で UI テストを足すときは test.projects で src/ui のみ jsdom に切り替える。
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
