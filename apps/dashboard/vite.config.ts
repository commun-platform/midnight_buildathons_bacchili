import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  plugins: [wasm()],
  resolve: {
    alias: {
      assert: 'assert/',
      'isomorphic-ws': path.join(directory, 'src/isomorphic-ws-browser.ts'),
    },
  },
  build: {
    target: 'esnext',
    // Vite 8's library minification can replace a wasm-bindgen helper with
    // `void 0`, causing the real browser module to fail before Wallet connect.
    minify: false,
    sourcemap: false,
    emptyOutDir: false,
    outDir: path.join(directory, 'public'),
    lib: {
      entry: path.join(directory, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'device-flow.js',
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/device-[name]-[hash].js',
        assetFileNames: 'assets/device-[name]-[hash][extname]',
      },
    },
  },
});
