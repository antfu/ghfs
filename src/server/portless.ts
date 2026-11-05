import { execFile } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Diagnostic } from 'nostics'
import { dirname, resolve } from 'pathe'
import { diagnostics } from '../logger'

const execFileAsync = promisify(execFile)

export function isPortlessUnavailableError(error: unknown): error is Diagnostic {
  return error instanceof Diagnostic && error.name === 'GHFS0206'
}

export interface RegisterPortlessRouteOptions {
  subdomain: string
  namespace?: string
  port: number
  tld?: string
}

export interface PortlessRoute {
  hostname: string
  url: string
  unregister: () => Promise<void>
}

export function slugifyRepoName(repo: string): string {
  const lastSegment = repo.includes('/') ? repo.slice(repo.lastIndexOf('/') + 1) : repo
  const sanitized = lastSegment
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || 'app'
}

function resolvePortlessCliPath(): string | undefined {
  try {
    const resolved = import.meta.resolve('portless')
    const mainPath = fileURLToPath(resolved)
    return resolve(dirname(mainPath), 'cli.js')
  }
  catch {
    return undefined
  }
}

async function runPortless(args: string[]): Promise<string> {
  const cliPath = resolvePortlessCliPath()
  if (!cliPath)
    throw diagnostics.GHFS0206({ detail: 'portless package is not installed' })

  try {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    return stdout
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string, stdout?: string }
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim()
    throw diagnostics.GHFS0206({
      detail: detail ? `portless failed: ${detail}` : 'portless failed',
      cause: error,
    })
  }
}

interface ProxyEndpoint {
  port: number
  tls: boolean
}

function parseProxyEndpoint(url: string): ProxyEndpoint | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return undefined
  }
  const tls = parsed.protocol === 'https:'
  const port = parsed.port ? Number(parsed.port) : (tls ? 443 : 80)
  return { port, tls }
}

function probeProxy(endpoint: ProxyEndpoint): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: endpoint.port,
        path: '/',
        method: 'HEAD',
        timeout: 1000,
      },
      (res) => {
        res.resume()
        resolve(res.headers['x-portless'] === '1')
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

async function ensureProxyRunning(url: string): Promise<void> {
  const endpoint = parseProxyEndpoint(url)
  if (!endpoint || await probeProxy(endpoint))
    return

  const args = ['proxy', 'start', '--port', String(endpoint.port)]
  if (!endpoint.tls)
    args.push('--no-tls')
  await runPortless(args)
}

export async function registerPortlessRoute(
  options: RegisterPortlessRouteOptions,
): Promise<PortlessRoute> {
  const namespace = options.namespace ?? 'ghfs'
  const tld = options.tld ?? 'localhost'
  const hostname = `${options.subdomain}.${namespace}`
  const fallbackUrl = `https://${hostname}.${tld}`

  await runPortless(['alias', hostname, String(options.port)])

  let url = fallbackUrl
  try {
    const stdout = await runPortless(['get', hostname])
    const resolved = stdout.trim().split(/\r?\n/).pop()?.trim()
    if (resolved && /^https?:\/\//.test(resolved))
      url = resolved
  }
  catch {
    // If `portless get` fails we still return the best-effort fallback URL.
  }

  try {
    await ensureProxyRunning(url)
  }
  catch (error) {
    try {
      await runPortless(['alias', '--remove', hostname])
    }
    catch {
      // shutdown should not block on portless
    }
    throw error
  }

  let unregistered = false
  return {
    hostname,
    url,
    async unregister() {
      if (unregistered)
        return
      unregistered = true
      try {
        await runPortless(['alias', '--remove', hostname])
      }
      catch {
        // shutdown should not block on portless
      }
    },
  }
}
