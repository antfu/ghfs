import process from 'node:process'
import { cac } from 'cac'
import { registerExecuteCommand } from './commands/execute'
import { registerStatusCommand } from './commands/status'
import { registerSyncCommand } from './commands/sync'
import { registerUiCommand } from './commands/ui'
import { CLI_NAME, CLI_VERSION } from './meta'

export function createCli() {
  const cli = cac(CLI_NAME)

  registerSyncCommand(cli)
  registerExecuteCommand(cli)
  registerStatusCommand(cli)
  registerUiCommand(cli)

  cli.help()
  cli.version(CLI_VERSION)

  return cli
}

export function runCli(argv = process.argv): void {
  createCli().parse(argv)
}
