import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { dirname, resolve } from 'pathe'

const execFileAsync = promisify(execFile)

export class PortlessUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'PortlessUnavailableError'
  }
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
    throw new PortlessUnavailableError('portless package is not installed')

  try {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    return stdout
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string, stdout?: string }
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim()
    throw new PortlessUnavailableError(
      detail ? `portless failed: ${detail}` : 'portless failed',
      error,
    )
  }
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
