import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

const buildTime = new Date().toISOString()
const gitCommit = readGitCommit()

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // 部署在 /idmp/ 等子目录时，资源地址必须在构建时带上该前缀；默认仍为根目录。
    base: normalizePublicBase(env.VITE_PUBLIC_BASE),
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
  }
})

function readGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function normalizePublicBase(value) {
  const path = String(value || '/').trim()
  if (!path || path === '/') return '/'
  return `/${path.replace(/^\/+|\/+$/g, '')}/`
}
