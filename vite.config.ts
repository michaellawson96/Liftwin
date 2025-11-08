import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages needs base set to your repo name
export default defineConfig({
  plugins: [react()],
  base: '/Liftwin/',
  build: { outDir: 'docs' },
})