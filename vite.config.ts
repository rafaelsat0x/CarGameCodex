import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '0.0.0.0' },
  build: {
    target: 'es2022',
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'three-core', test: /three[\\/]build[\\/]three.core/ },
      { name: 'three-renderer', test: /three[\\/]build[\\/]three.module/ },
    ] } } },
  },
});
