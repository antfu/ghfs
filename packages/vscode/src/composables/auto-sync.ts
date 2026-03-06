import { shallowRef, useWindowState, useWorkspaceFolders, watchEffect } from 'reactive-vscode'
import { config } from '../meta'
import { runSync } from '../sync'

export function useAutoSync(): void {
  const workspaceFolders = useWorkspaceFolders()
  const { focused, active } = useWindowState()

  const isSyncing = shallowRef(false)
  const pendingFolders = new Set<string>()

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

  function syncIfActive(cwd: string): void {
    if (focused.value && active.value) {
      pendingFolders.delete(cwd)
      doSync(cwd)
    }
    else {
      pendingFolders.add(cwd)
    }
  }

  watchEffect(() => {
    if (!focused.value || !active.value)
      return
    for (const cwd of pendingFolders) {
      pendingFolders.delete(cwd)
      doSync(cwd)
    }
  })

  watchEffect((onCleanup) => {
    if (!config.autoSync.enabled || !workspaceFolders.value)
      return

    const intervalMs = Math.max(1, config.autoSync.intervalMinutes) * 60_000
    const timers = workspaceFolders.value.map((folder) => {
      const cwd = folder.uri.path
      return setInterval(() => syncIfActive(cwd), intervalMs)
    })

    onCleanup(() => timers.forEach(clearInterval))
  })
}
