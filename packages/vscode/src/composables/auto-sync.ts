import type { Uri } from 'vscode'
import { computed, shallowRef, useWindowState, watchEffect } from 'reactive-vscode'
import { workspace } from 'vscode'
import { config, logger } from '../meta'
import { runSync } from '../sync'
import { isValidWorkspace } from '../utils/fs'

export function useAutoSync(): void {
  const { focused, active } = useWindowState()

  const isSyncing = shallowRef(false)
  const intervalMs = computed(() => Math.max(1, config.autoSync.intervalMinutes) * 60_000)

  const pendingFolders = new Set<string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  async function doSync(cwd: string) {
    if (isSyncing.value)
      return
    isSyncing.value = true
    try {
      await runSync({ cwd })
      timers.set(cwd, setTimeout(() => syncIfActive(cwd), intervalMs.value))
    }
    catch (err) {
      logger.error(`[auto-sync] error: `, err)
    }
    finally {
      isSyncing.value = false
    }
  }

  function syncIfActive(cwd: string) {
    if (focused.value && active.value) {
      pendingFolders.delete(cwd)
      doSync(cwd)
    }
    else {
      pendingFolders.add(cwd)
    }
  }

  async function addFolder(cwd: Uri) {
    if (timers.has(cwd.path))
      return

    if (await isValidWorkspace(cwd))
      return

    syncIfActive(cwd.path)
  }

  function removeFolder(cwd: string) {
    const timer = timers.get(cwd)
    if (timer) {
      clearInterval(timer)
      timers.delete(cwd)
    }
    pendingFolders.delete(cwd)
  }

  function clearAllTimers() {
    for (const cwd of timers.keys())
      removeFolder(cwd)
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
    if (!config.autoSync.enabled) {
      clearAllTimers()
      return
    }

    logger.info('[auto-sync] setup')

    for (const folder of workspace.workspaceFolders ?? [])
      addFolder(folder.uri)

    const disposable = workspace.onDidChangeWorkspaceFolders((e) => {
      logger.info('[auto-sync] workspace folders changed')
      for (const added of e.added)
        addFolder(added.uri)
      for (const removed of e.removed)
        removeFolder(removed.uri.path)
    })

    onCleanup(() => {
      disposable.dispose()
      clearAllTimers()
      logger.info('[auto-sync] cleanup')
    })
  })
}
