import type { CAC } from 'cac'
import type { GhfsDevframeFlags } from '../../devframe/define'
import process from 'node:process'
import { createDevServer, resolveDevServerPort } from 'devframe/adapters/dev'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { getExecuteFile, resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { ghfsDevframe } from '../../devframe/define'
import { ensureExecuteArtifacts } from '../../execute/schema'
import { registerPortlessRoute, slugifyRepoName } from '../../server/portless'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { promptForToken, promptRepoChoice } from '../prompts'

export interface UiCommandOptions {
  repo?: string
  port?: number
  host?: string
  open?: boolean
  portless?: boolean
  subdomain?: string
  cwd?: string
}

export function registerUiCommand(cli: CAC): void {
  cli
    .command('ui', 'Launch a local web UI for the mirror')
    .option('--repo <repo>', 'GitHub repository in owner/name format')
    .option('--port <port>', 'Port to listen on', { default: 7710 })
    .option('--host <host>', 'Host to bind', { default: '127.0.0.1' })
    .option('--no-open', 'Do not open the browser automatically')
    .option('--no-portless', 'Do not expose the UI through the portless reverse proxy')
    .option('--subdomain <slug>', 'Override the portless subdomain (defaults to the repository name)')
    .option('--cwd <cwd>', 'Project root directory (defaults to current directory)')
    .action(withErrorHandling(async (options: UiCommandOptions) => {
      const printer = createCliPrinter('ui')
      const config = await resolveConfig({
        cwd: options.cwd ? resolve(options.cwd) : undefined,
      })
      await ensureExecuteArtifacts(resolve(config.cwd, getExecuteFile(config)))

      const repo = await resolveRepo({
        cwd: config.cwd,
        cliRepo: options.repo,
        configRepo: config.repo,
        interactive: Boolean(process.stdin.isTTY),
        selectRepoChoice: promptRepoChoice,
      })

      printer.header(repo.repo)

      const initialToken = await resolveAuthToken({
        token: config.auth.token,
        interactive: false,
        promptForToken,
      }).catch(() => '')

      const preferredPort = typeof options.port === 'number' ? options.port : Number(options.port ?? 7710)
      const host = options.host ?? '127.0.0.1'
      const portlessEnabled = options.portless !== false
      const subdomain = options.subdomain?.trim() || slugifyRepoName(repo.repo)

      const port = await resolveDevServerPort(ghfsDevframe, { host, defaultPort: preferredPort })

      const flags: GhfsDevframeFlags = {
        mode: 'ui',
        cwd: config.cwd,
        uiOptions: {
          config,
          repo: repo.repo,
          initialToken,
          onRequestToken: async () => resolveAuthToken({
            token: config.auth.token,
            interactive: Boolean(process.stdin.isTTY),
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
      const directUrl = `http://${urlHost}:${port}`

      let portlessUrl: string | undefined
      let portlessUnregister: (() => Promise<void>) | undefined
      if (portlessEnabled) {
        try {
          const route = await registerPortlessRoute({ subdomain, port })
          portlessUrl = route.url
          portlessUnregister = route.unregister
        }
        catch (error) {
          const message = (error as Error).message || String(error)
          printer.info(`portless unavailable (${message}); falling back to ${directUrl}`)
        }
      }

      const openUrl = portlessUrl ?? directUrl
      if (portlessUrl) {
        printer.info(`ghfs UI running at ${portlessUrl}`)
        printer.info(`  direct: ${directUrl}`)
      }
      else {
        printer.info(`ghfs UI running at ${directUrl}`)
      }
      if (!initialToken)
        printer.info('No GitHub token yet; sync/execute will prompt or fail until one is available.')

      if (options.open !== false) {
        const { default: open } = await import('open')
        await open(openUrl)
      }

      const shutdown = async () => {
        if (portlessUnregister)
          await portlessUnregister().catch(() => {})
        await server.close().catch(() => {})
        process.exit(0)
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)

      await new Promise<void>(() => { /* keep the process alive */ })
    }))
}
