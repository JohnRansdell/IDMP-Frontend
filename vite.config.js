import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const buildTime = new Date().toISOString()
const gitCommit = readGitCommit()

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
    __APP_GIT_COMMIT__: JSON.stringify(gitCommit)
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000
  }
})

function readGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
