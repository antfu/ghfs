import type { CAC } from 'cac'
import type { GhfsDevframeFlags } from '../../devframe/define'
import type { CliPrinter } from '../printer'
import process from 'node:process'
import { createDevServer, resolveDevServerPort } from 'devframe/adapters/dev'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { ghfsDevframe } from '../../devframe/define'
import {
  clearDaemonState,
  DaemonStartupError,
  readDaemonState,
  resolveDaemonLogPath,
  spawnHubDaemon,
  stopHubDaemon,
  writeDaemonState,
} from '../../hub/daemon'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { promptForToken } from '../prompts'

export interface HubCommandOptions {
  port?: number
  host?: string
  open?: boolean
  cwd?: string
  timeout?: number
}

type HubAction = 'start' | 'stop' | 'restart'
const HUB_ACTIONS: ReadonlySet<HubAction> = new Set(['start', 'stop', 'restart'])

export function registerHubCommand(cli: CAC): void {
  cli
    .command('hub [action]', 'Multi-project web UI for ghfs (foreground by default; actions: start, stop, restart)')
    .option('--port <port>', 'Port to listen on (foreground / start / restart)', { default: 7710 })
    .option('--host <host>', 'Host to bind (foreground / start / restart)', { default: '127.0.0.1' })
    .option('--open', 'Open the browser once the daemon is ready (start / restart)')
    .option('--no-open', 'Foreground: do not open the browser')
    .option('--cwd <cwd>', 'Hub root directory (parent of the projects, defaults to current directory)')
    .option('--timeout <ms>', 'stop / restart: ms to wait for graceful shutdown before SIGKILL', { default: 5000 })
    .example('  $ ghfs hub             # run in the foreground')
    .example('  $ ghfs hub start       # start as a background daemon')
    .example('  $ ghfs hub stop        # stop the daemon')
    .example('  $ ghfs hub restart     # restart the daemon')
    .action(withErrorHandling(async (action: string | undefined, options: HubCommandOptions) => {
      if (action === undefined) {
        await runHubServer(options, { openByDefault: true })
        return
      }
      if (!HUB_ACTIONS.has(action as HubAction)) {
        const printer = createCliPrinter('hub')
        printer.error(`Unknown hub action: '${action}'. Valid actions: start, stop, restart (or omit for foreground).`)
        process.exit(1)
      }

      if (action === 'start') {
        await startHubDaemon(options)
        return
      }
      if (action === 'stop') {
        await stopHubDaemonCommand(options)
        return
      }
      // restart
      const printer = createCliPrinter('hub')
      const stopResult = await stopHubDaemon({ timeoutMs: options.timeout })
      if (stopResult.stopped) {
        if (stopResult.forced)
          printer.warn(`Forced shutdown of previous daemon (pid ${stopResult.pid}).`)
        else
          printer.info(`Stopped previous daemon (pid ${stopResult.pid}).`)
      }
      await startHubDaemon(options, printer)
    }))
}

interface RunHubServerOptions {
  /** Whether to open the browser when --no-open isn't explicitly set. */
  openByDefault: boolean
}

async function runHubServer(options: HubCommandOptions, runOpts: RunHubServerOptions): Promise<void> {
  const printer = createCliPrinter('hub')
  const hubCwd = resolve(options.cwd ? resolve(options.cwd) : process.cwd())
  const isTty = Boolean(process.stdin.isTTY)
  const daemonStatePath = process.env.GHFS_HUB_DAEMON_STATE_FILE

  printer.header(`hub: ${hubCwd}`)

  const initialToken = await resolveAuthToken({
    interactive: false,
    promptForToken,
  }).catch(() => '')

  const preferredPort = typeof options.port === 'number' ? options.port : Number(options.port ?? 7710)
  const host = options.host ?? '127.0.0.1'
  const port = await resolveDevServerPort(ghfsDevframe, { host, defaultPort: preferredPort })

  const flags: GhfsDevframeFlags = {
    mode: 'hub',
    cwd: hubCwd,
    hubOptions: {
      cwd: hubCwd,
      initialToken,
      onRequestToken: async () => resolveAuthToken({
        interactive: isTty,
        promptForToken,
      }),
    },
  }

  const server = await createDevServer(ghfsDevframe, {
    host,
    port,
    flags,
    openBrowser: false,
  })

  const urlHost = host === '0.0.0.0' ? 'localhost' : host
  const directUrl = `http://${urlHost}:${port}/`
  printer.info(`ghfs hub running at ${directUrl}`)
  if (!initialToken)
    printer.info('No GitHub token yet; sync/execute will prompt or fail until one is available.')

  if (daemonStatePath) {
    await writeDaemonState({
      pid: process.pid,
      host,
      port,
      cwd: hubCwd,
      startedAt: new Date().toISOString(),
    }, { path: daemonStatePath })
  }

  if (runOpts.openByDefault && options.open !== false) {
    const { default: open } = await import('open')
    await open(directUrl)
  }

  const shutdown = async () => {
    if (daemonStatePath)
      await clearDaemonState({ path: daemonStatePath })
    await server.close().catch(() => {})
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  await new Promise<void>(() => { /* keep the process alive */ })
}

async function startHubDaemon(options: HubCommandOptions, printer?: CliPrinter): Promise<void> {
  const out = printer ?? createCliPrinter('hub')
  const hubCwd = resolve(options.cwd ? resolve(options.cwd) : process.cwd())
  const host = options.host ?? '127.0.0.1'
  const preferredPort = typeof options.port === 'number' ? options.port : Number(options.port ?? 7710)

  const existing = await readDaemonState()
  if (existing) {
    const urlHost = existing.host === '0.0.0.0' ? 'localhost' : existing.host
    out.error(`ghfs hub is already running (pid ${existing.pid}) at http://${urlHost}:${existing.port}/`)
    out.info(`Use 'ghfs hub restart' to restart it, or 'ghfs hub stop' first.`)
    process.exit(1)
  }

  let state
  try {
    state = await spawnHubDaemon({ host, port: preferredPort, cwd: hubCwd })
  }
  catch (err) {
    if (err instanceof DaemonStartupError) {
      out.error(err.message)
      if (err.logTail)
        out.note(err.logTail, 'hub.log (tail)')
      out.info(`Log file: ${resolveDaemonLogPath()}`)
      process.exit(1)
    }
    throw err
  }

  const urlHost = state.host === '0.0.0.0' ? 'localhost' : state.host
  const directUrl = `http://${urlHost}:${state.port}/`
  out.success(`ghfs hub daemon started (pid ${state.pid}) at ${directUrl}`)
  out.info(`Log file: ${resolveDaemonLogPath()}`)

  if (options.open === true) {
    const { default: open } = await import('open')
    await open(directUrl)
  }
}

async function stopHubDaemonCommand(options: HubCommandOptions): Promise<void> {
  const printer = createCliPrinter('hub')
  const result = await stopHubDaemon({ timeoutMs: options.timeout })
  if (!result.stopped) {
    printer.info('No ghfs hub daemon is currently running.')
    return
  }
  if (result.forced)
    printer.warn(`ghfs hub daemon (pid ${result.pid}) did not exit in time; sent SIGKILL.`)
  else
    printer.success(`ghfs hub daemon (pid ${result.pid}) stopped.`)
}
