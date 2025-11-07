import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// GitHub Pages needs base set to your repo name
export default defineConfig({
  plugins: [react(), tailwind()],
  base: '/Liftwin/',
  build: { outDir: 'docs' },
})