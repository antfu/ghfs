import { shallowRef, useWorkspaceFolders, watchEffect } from 'reactive-vscode'
import { config } from '../meta'
import { runSync } from '../sync'

export function useAutoSync(): void {
  const workspaceFolders = useWorkspaceFolders()
  const isSyncing = shallowRef(false)

  async function doSync(cwd: string): Promise<void> {
    if (isSyncing.value)
      return
    isSyncing.value = true
    try {
      await runSync({ cwd })
    }
    catch {
      // auto-sync errors are silently ignored
    }
    finally {
      isSyncing.value = false
    }
  }

  watchEffect((onCleanup) => {
    if (!config.autoSync.enabled || !workspaceFolders.value)
      return

    const intervalMs = Math.max(1, config.autoSync.intervalMinutes) * 60_000
    const timers = workspaceFolders.value.map((folder) => {
      const cwd = folder.uri.path

      return setInterval(() => doSync(cwd), intervalMs)
    })

    onCleanup(() => timers.forEach(clearInterval))
  })
}
