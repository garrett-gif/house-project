import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    host: '127.0.0.1',
    // The chat server holds the API key. The browser only ever calls /api on this dev server.
    proxy: { '/api': 'http://127.0.0.1:8787' },
    // Never serve server code or env files to the browser.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**'] },
  },
})
