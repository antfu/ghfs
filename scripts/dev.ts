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

async function isPortFreeOn(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (err: NodeJS.ErrnoException) => {
      // EADDRINUSE → port really is busy on this stack. Anything else
      // (e.g. EAFNOSUPPORT on a system with IPv6 disabled) means we can't
      // bind here at all — so the cross-stack collision the probe is
      // looking for is impossible. Treat that as "free" so we don't
      // dead-end. A genuinely broken bind will still fail loudly at the
      // child-process level.
      resolve(err.code !== 'EADDRINUSE')
    })
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

// Probe both IPv4 (127.0.0.1) and IPv6 (::1). On macOS these are
// independent sockets, so a port can be busy on one and free on the
// other — but browsers resolving `localhost` try ::1 first and fall
// through to 127.0.0.1. A wrong neighbour on ::1 (e.g. another
// workspace's Nuxt) hijacks the WS connection that should reach our
// 127.0.0.1-bound ghfs server. Requiring both stacks free prevents that.
async function isPortFree(port: number): Promise<boolean> {
  for (const host of ['127.0.0.1', '::1']) {
    if (!(await isPortFreeOn(port, host)))
      return false
  }
  return true
}

async function findFreePort(preferred: number, fallbackStart: number, fallbackEnd: number): Promise<number> {
  if (await isPortFree(preferred))
    return preferred
  for (let p = fallbackStart; p <= fallbackEnd; p++) {
    if (await isPortFree(p))
      return p
  }
  throw new Error(`No free port available near ${preferred}`)
}

// User-facing Nuxt dev server. Stays in the familiar low range so URLs
// like `localhost:7711` are short and memorable.
const nuxtPort = await findFreePort(7711, 7712, 7799)

// ghfs RPC/WebSocket server. In dev the SPA is hosted by Nuxt, so this
// port is only reached internally (proxied through the Nitro route at
// `ui/server/routes/__connection.json.ts`). Push it into a high range
// that doesn't compete with Nuxt, Vite, or other common dev tools — the
// user never types or sees this number.
const ghfsPort = await findFreePort(47710, 47711, 47999)

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
