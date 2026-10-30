import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

export default defineConfig({
  root: here('.'),
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: here('./index.html'),
      },
    },
  },
})