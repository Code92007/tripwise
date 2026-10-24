import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleRequest } from '../worker/index'

const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const port = Number(process.env.PORT || 8093)
const host = process.env.HOST || '127.0.0.1'
const origins = process.env.ALLOWED_ORIGINS || 'https://tuheng.wannafly.cn,https://code92007.github.io,https://localhost,http://localhost:5173,http://127.0.0.1:5173'
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
}

const windows = new Map<string, { start: number; count: number }>()
function limit(key: string, max: number) {
  const now = Date.now()
  const current = windows.get(key)
  const window = !current || now - current.start >= 10000 ? { start: now, count: 0 } : current
  window.count += 1
  windows.set(key, window)
  return { success: window.count <= max }
}
const env = {
  AMAP_WEB_KEY: process.env.AMAP_WEB_KEY,
  ALLOWED_ORIGINS: origins,
  ROUTE_LIMIT: { async limit({ key }: { key: string }) { return limit(key, 2) } },
  LOOKUP_LIMIT: { async limit({ key }: { key: string }) { return limit(key, 12) } },
}

async function serveApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 2048) {
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: '请求过长' }))
      return
    }
    chunks.push(chunk)
  }
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  })
  const response = await handleRequest(request, env)
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => { responseHeaders[key] = value })
  res.writeHead(response.status, responseHeaders)
  res.end(Buffer.from(await response.arrayBuffer()))
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  const file = resolve(dist, `.${path === '/' ? '/index.html' : path}`)
  if (!file.startsWith(`${dist}${sep}`)) {
    res.writeHead(403)
    res.end()
    return
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file')
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const task = url.pathname === '/health' || url.pathname.startsWith('/api/')
    ? serveApi(req, res, url)
    : serveStatic(req, res, url)
  task.catch(() => {
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).listen(port, host, () => console.log(`Tripwise listening on ${host}:${port}`))
