import type { CAC } from 'cac'
import type { GhfsDevframeFlags } from '../../devframe/define'
import process from 'node:process'
import { createDevServer, resolveDevServerPort } from 'devframe/adapters/dev'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { ghfsDevframe } from '../../devframe/define'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { promptForToken } from '../prompts'

export interface HubCommandOptions {
  port?: number
  host?: string
  open?: boolean
  cwd?: string
}

export function registerHubCommand(cli: CAC): void {
  cli
    .command('hub', 'Launch a multi-project web UI for ghfs')
    .option('--port <port>', 'Port to listen on', { default: 7710 })
    .option('--host <host>', 'Host to bind', { default: '127.0.0.1' })
    .option('--no-open', 'Do not open the browser automatically')
    .option('--cwd <cwd>', 'Hub root directory (parent of the projects, defaults to current directory)')
    .action(withErrorHandling(async (options: HubCommandOptions) => {
      const printer = createCliPrinter('hub')
      const hubCwd = resolve(options.cwd ? resolve(options.cwd) : process.cwd())
      const isTty = Boolean(process.stdin.isTTY)

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
      const directUrl = `http://${urlHost}:${port}/hub`
      printer.info(`ghfs hub running at ${directUrl}`)
      printer.info('Pick the projects to include from the UI (top-right "Manage projects" button).')
      if (!initialToken)
        printer.info('No GitHub token yet; sync/execute will prompt or fail until one is available.')

      if (options.open !== false) {
        const { default: open } = await import('open')
        await open(directUrl)
      }

      const shutdown = async () => {
        await server.close().catch(() => {})
        process.exit(0)
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)

      await new Promise<void>(() => { /* keep the process alive */ })
    }))
}
