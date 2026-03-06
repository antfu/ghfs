import type { CAC } from 'cac'
import process from 'node:process'
import { resolve } from 'pathe'
import { getExecuteFile, getStorageDirAbsolute, resolveConfig } from '../../config/load'
import { ensureExecuteArtifacts } from '../../execute/schema'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { createUiServer } from '../ui/server'
import { createWsServer } from '../ui/ws'

export interface UiCommandOptions {
  host?: string
  port?: number
}

export interface UiCommandDependencies {
  createCliPrinter: typeof createCliPrinter
  resolveConfig: typeof resolveConfig
  ensureExecuteArtifacts: typeof ensureExecuteArtifacts
  createUiServer: typeof createUiServer
  createWsServer: typeof createWsServer
}

const defaultDependencies: UiCommandDependencies = {
  createCliPrinter,
  resolveConfig,
  ensureExecuteArtifacts,
  createUiServer,
  createWsServer,
}

export function registerUiCommand(cli: CAC): void {
  cli
    .command('ui', 'Serve local Web UI for synced mirror and execute queue')
    .option('--host <host>', 'Host for local UI server', { default: '127.0.0.1' })
    .option('--port <port>', 'Port for local UI server', { default: 3589 })
    .action(withErrorHandling(async (options: UiCommandOptions) => {
      await runUiCommand(options)
    }))
}

export async function runUiCommand(
  options: UiCommandOptions,
  dependencies: UiCommandDependencies = defaultDependencies,
): Promise<void> {
  const printer = dependencies.createCliPrinter('ui')
  const host = options.host || '127.0.0.1'
  const parsedPort = Number(options.port)
  const port = Number.isFinite(parsedPort) && parsedPort >= 0
    ? parsedPort
    : 3589

  const config = await dependencies.resolveConfig()
  const storageDirAbsolute = getStorageDirAbsolute(config)
  const executeFilePath = resolve(config.cwd, getExecuteFile(config))
  const uiDir = resolve(config.cwd, 'dist/ui')

  await dependencies.ensureExecuteArtifacts(executeFilePath)

  const ws = await dependencies.createWsServer({
    host,
    config,
    executeFilePath,
    storageDirAbsolute,
  })

  let http: Awaited<ReturnType<typeof createUiServer>>
  try {
    http = await dependencies.createUiServer({
      host,
      port,
      uiDir,
      getMetadata: ws.getMetadata,
    })
  }
  catch (error) {
    await ws.close().catch(() => {})
    throw error
  }

  printer.success(`Web UI ready at ${http.url}`)
  printer.info(`RPC websocket listening on ${ws.getMetadata().websocket}`)
  printer.info('Press Ctrl+C to stop.')

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown)
      return

    shuttingDown = true
    await Promise.allSettled([
      http.close(),
      ws.close(),
    ])
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown()
  })
  process.once('SIGTERM', () => {
    void shutdown()
  })
}
