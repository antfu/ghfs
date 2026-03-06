import type { Server } from 'node:http'
import type { ConnectionMeta } from './contracts'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, normalize, resolve } from 'pathe'

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export interface CreateUiServerOptions {
  host: string
  port: number
  uiDir: string
  getMetadata: () => ConnectionMeta
}

export async function createUiServer(options: CreateUiServerOptions): Promise<{
  server: Server
  close: () => Promise<void>
  url: string
}> {
  const uiRoot = resolve(options.uiDir)
  const uiRootPrefix = `${uiRoot}/`
  const indexPath = resolve(uiRoot, 'index.html')
  await assertFile(indexPath)

  const server = createServer(async (req, res) => {
    try {
      const pathname = normalizeRequestPath(req.url || '/')
      if (pathname === '/api/metadata.json') {
        const body = `${JSON.stringify(options.getMetadata())}\n`
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(body)
        return
      }

      const requestedPath = pathname === '/' ? '/index.html' : pathname
      const filePath = resolve(uiRoot, `.${requestedPath}`)
      const isSafe = filePath === uiRoot || filePath.startsWith(uiRootPrefix)
      const resolvedFilePath = isSafe && await isFile(filePath)
        ? filePath
        : indexPath

      const body = await readFile(resolvedFilePath)
      res.statusCode = 200
      res.setHeader('Content-Type', mimeTypeFor(resolvedFilePath))
      res.end(body)
    }
    catch (error) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`Internal Server Error: ${toErrorMessage(error)}`)
    }
  })

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => {
      resolvePromise()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Failed to start UI HTTP server')

  const displayHost = address.address === '127.0.0.1' ? 'localhost' : address.address

  return {
    server,
    close: () => {
      return new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolvePromise()
        })
      })
    },
    url: `http://${displayHost}:${address.port}`,
  }
}

function normalizeRequestPath(raw: string): string {
  const pathOnly = raw.split('?')[0].split('#')[0] || '/'
  let decodedPath = pathOnly
  try {
    decodedPath = decodeURIComponent(pathOnly)
  }
  catch {
    decodedPath = pathOnly
  }
  const normalized = normalize(decodedPath)
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

async function assertFile(path: string): Promise<void> {
  if (!await isFile(path))
    throw new Error(`UI assets not found at ${path}`)
}

async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isFile()
  }
  catch {
    return false
  }
}

function mimeTypeFor(path: string): string {
  const ext = extname(path)
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}
