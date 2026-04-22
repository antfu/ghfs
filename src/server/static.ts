import type { EventHandler } from 'h3'
import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { eventHandler, serveStatic, setResponseHeader } from 'h3'
import { dirname, resolve } from 'pathe'
import { pathExists } from '../utils/fs'

const MIME_TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml; charset=utf-8',
}

function mimeTypeFor(id: string): string | undefined {
  const dot = id.lastIndexOf('.')
  if (dot < 0)
    return undefined
  const ext = id.slice(dot + 1).toLowerCase()
  return MIME_TYPES[ext]
}

export function resolveDefaultStaticDir(importMetaUrl: string): string {
  const here = fileURLToPath(importMetaUrl)
  return resolve(dirname(here), '..', 'ui')
}

export async function createStaticHandler(staticDir: string): Promise<EventHandler> {
  async function metaFor(id: string): Promise<{ mtime?: number, size?: number, type?: string } | undefined> {
    let stats: Stats
    try {
      stats = await stat(resolve(staticDir, `.${id}`))
    }
    catch {
      return undefined
    }
    if (!stats.isFile())
      return undefined
    return { mtime: stats.mtimeMs, size: stats.size, type: mimeTypeFor(id) }
  }

  const spaFallback = await readFallback(staticDir)

  return eventHandler(async (event) => {
    const result = await serveStatic(event, {
      getContents: id => readFile(resolve(staticDir, `.${id}`)),
      getMeta: id => metaFor(id),
      indexNames: ['/index.html'],
      fallthrough: true,
    })
    if (result !== false)
      return

    if (spaFallback) {
      setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
      return spaFallback
    }

    setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return `ghfs UI assets not found at ${staticDir}. Run "pnpm build" first.\n`
  })
}

async function readFallback(staticDir: string): Promise<string | undefined> {
  for (const name of ['200.html', 'index.html']) {
    const candidate = resolve(staticDir, name)
    if (await pathExists(candidate))
      return readFile(candidate, 'utf-8')
  }
  return undefined
}
