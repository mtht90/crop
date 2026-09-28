import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスで出力し、GitHub Pages のサブパス (/crop/) でもそのまま動くようにする
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
