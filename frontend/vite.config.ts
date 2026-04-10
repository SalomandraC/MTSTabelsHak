import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) {
            return 'react';
          }

          if (id.includes('/node_modules/prosemirror')) {
            return 'prosemirror';
          }

          if (
            id.includes('/node_modules/@tiptap/core') ||
            id.includes('/node_modules/@tiptap/pm') ||
            id.includes('/node_modules/@tiptap/react')
          ) {
            return 'editor-core';
          }

          if (id.includes('/node_modules/@tiptap')) {
            return 'editor-extensions';
          }

          if (id.includes('/node_modules/highlight.js') || id.includes('/node_modules/lowlight')) {
            return 'highlighting';
          }

          if (id.includes('/node_modules/lucide-react')) {
            return 'icons';
          }
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
