import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/nyc-charter-schools/',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // The map library gets its own chunk so it stays cached between releases.
        codeSplitting: {
          groups: [{ debugName: 'maplibre', name: (id) => (/node_modules[\\/](maplibre-gl|react-map-gl|@vis\.gl)/.test(id) ? 'maplibre' : null) }],
        },
      },
    },
  },
});
