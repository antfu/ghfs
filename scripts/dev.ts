import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'

const args = process.argv.slice(2)
const mode = args[0]
if (mode !== 'ui' && mode !== 'hub') {
  console.error('Usage: tsx scripts/dev.ts <ui|hub> [--cwd <path>]')
  process.exit(1)
}

const cwdFlagIndex = args.indexOf('--cwd')
const cwd = cwdFlagIndex >= 0
  ? args[cwdFlagIndex + 1]
  : (mode === 'hub' ? '..' : undefined)

async function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function findFreePort(preferred: number, fallbackStart: number, fallbackEnd: number, host: string): Promise<number> {
  if (await isPortFree(preferred, host))
    return preferred
  for (let p = fallbackStart; p <= fallbackEnd; p++) {
    if (await isPortFree(p, host))
      return p
  }
  throw new Error(`No free port available near ${preferred} on ${host}`)
}

// ghfs server binds explicitly to 127.0.0.1; Nuxt's dev server resolves
// `localhost` (typically `::1` on macOS), so each port must be probed on
// the same host the eventual server will use.
const ghfsPort = await findFreePort(7710, 7720, 7800, '127.0.0.1')
const nuxtPort = await findFreePort(7711, 7721, 7800, 'localhost')

console.log(`ghfs ${mode}: http://localhost:${ghfsPort}`)
console.log(`Nuxt UI:    http://localhost:${nuxtPort}`)

const env = {
  ...process.env,
  GHFS_UI_DEV: '1',
  VITE_GHFS_WS_PORT: String(ghfsPort),
}

const nuxtChild = spawn(
  'pnpm',
  ['exec', 'nuxi', 'dev', '--port', String(nuxtPort)],
  { cwd: 'ui', stdio: 'inherit', env },
)

const ghfsArgs = ['src/cli.ts', mode, '--no-open', '--port', String(ghfsPort)]
if (cwd)
  ghfsArgs.push('--cwd', cwd)
const ghfsChild = spawn('tsx', ghfsArgs, { stdio: 'inherit', env })

let shuttingDown = false
function shutdown(exitCode = 0): void {
  if (shuttingDown)
    return
  shuttingDown = true
  nuxtChild.kill('SIGTERM')
  ghfsChild.kill('SIGTERM')
  setTimeout(() => process.exit(exitCode), 500).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

function watchChild(name: string, child: ChildProcess): void {
  child.on('exit', (code) => {
    if (!shuttingDown)
      console.error(`[${name}] exited with code ${code ?? 'unknown'}`)
    shutdown(code ?? 0)
  })
}

watchChild('nuxt', nuxtChild)
watchChild('ghfs', ghfsChild)
