import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets work at a GitHub Pages project path as well as a domain root.
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/src/') || id.includes('node_modules/three/build/')) return 'three-core';
          if (id.includes('node_modules/three/examples/jsm/loaders/') || id.includes('meshopt_decoder')) return 'model-loaders';
        },
      },
    },
  },
});
