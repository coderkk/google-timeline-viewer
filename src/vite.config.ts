import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative base keeps every asset path portable across host subpaths
  // (GitHub Pages project sites deploy under /<repo>/). No server-side path
  // rewrites are needed because the app routes with a HashRouter.
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
