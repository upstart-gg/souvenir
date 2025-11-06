import { defineConfig } from 'bunup';

export default defineConfig({
  entries: [
    {
      input: './src/index.ts',
      outdir: './dist',
      name: 'index',
      target: 'node',
      formats: ['esm', 'cjs'],
    },
    {
      input: './src/tools/index.ts',
      outdir: './dist/tools',
      name: 'index',
      target: 'node',
      formats: ['esm', 'cjs'],
    },
  ],
  declaration: true,
  clean: true,
  external: ['ai', 'zod', 'postgres', '@chonkiejs/core'],
});
