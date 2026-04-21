import type { CAC } from 'cac'
import process from 'node:process'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { getExecuteFile, resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { ensureExecuteArtifacts } from '../../execute/schema'
import { createUiServer } from '../../server'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { promptForToken, promptRepoChoice } from '../prompts'

export interface UiCommandOptions {
  repo?: string
  port?: number
  host?: string
  open?: boolean
}

export function registerUiCommand(cli: CAC): void {
  cli
    .command('ui', 'Launch a local web UI for the mirror')
    .option('--repo <repo>', 'GitHub repository in owner/name format')
    .option('--port <port>', 'Port to listen on', { default: 7710 })
    .option('--host <host>', 'Host to bind', { default: '127.0.0.1' })
    .option('--no-open', 'Do not open the browser automatically')
    .action(withErrorHandling(async (options: UiCommandOptions) => {
      const printer = createCliPrinter('ui')
      const config = await resolveConfig()
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

      const port = typeof options.port === 'number' ? options.port : Number(options.port ?? 7710)
      const host = options.host ?? '127.0.0.1'

      const server = await createUiServer({
        config,
        repo: repo.repo,
        initialToken,
        port,
        host,
        devMode: process.env.GHFS_UI_DEV === '1',
        onRequestToken: async () => resolveAuthToken({
          token: config.auth.token,
          interactive: Boolean(process.stdin.isTTY),
          promptForToken,
        }),
      })

      printer.info(`ghfs UI running at ${server.url}`)
      if (!initialToken)
        printer.info('No GitHub token yet; sync/execute will prompt or fail until one is available.')

      if (options.open !== false) {
        const { default: open } = await import('open')
        await open(server.url)
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
