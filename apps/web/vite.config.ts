import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root — load VITE_* from @metadata/.env (not only apps/web). */
const monorepoRoot = path.resolve(root, '../..')

/** Dev-only: clean paths → multi-page HTML entry files. */
function cleanUrlPlugin() {
  const map: Record<string, string> = {
    '/app': '/app.html',
    '/console': '/docs.html',
    '/pricing': '/pricing.html',
    '/stats': '/stats.html',
    '/settings': '/settings.html',
    '/legal': '/legal.html',
    '/feedback': '/feedback.html',
  }
  return {
    name: 'metadata-clean-urls',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        const raw = req.url || '/'
        const q = raw.indexOf('?')
        const pathname = q >= 0 ? raw.slice(0, q) : raw
        const search = q >= 0 ? raw.slice(q) : ''
        if (map[pathname]) {
          req.url = map[pathname] + search
          return next()
        }
        const consoleMatch = pathname.match(/^\/console\/([^/]+)\/?$/)
        if (consoleMatch) {
          // Serve docs; client reads vertical from path
          req.url = '/docs.html' + search
          return next()
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: '.',
  envDir: monorepoRoot,
  plugins: [cleanUrlPlugin()],
  server: {
    port: 5177,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.METADATA_API_PORT || process.env.API_PORT || 8787}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(root, 'index.html'),
        app: path.resolve(root, 'app.html'),
        docs: path.resolve(root, 'docs.html'),
        legal: path.resolve(root, 'legal.html'),
        pricing: path.resolve(root, 'pricing.html'),
        stats: path.resolve(root, 'stats.html'),
        feedback: path.resolve(root, 'feedback.html'),
        settings: path.resolve(root, 'settings.html'),
      },
    },
  },
})
