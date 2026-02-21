import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mockApiPlugin from './mock-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  server: {
    // Port 5173 is default, but we can be explicit if needed
    port: 5173
  }
})
