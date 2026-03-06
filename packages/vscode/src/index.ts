import { defineExtension, useCommand } from 'reactive-vscode'
import { sync } from './commands/sync'
import { useAutoSync } from './composables/auto-sync'
import { commands } from './generated-meta'

export const { activate, deactivate } = defineExtension(() => {
  useCommand(commands.sync, sync)
  useAutoSync()
})
