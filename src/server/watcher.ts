import type { FSWatcher } from 'node:fs'
import { mkdir, watch } from 'node:fs/promises'
import { EXECUTE_FILE_NAME, EXECUTE_MD_FILE_NAME, SYNC_STATE_FILE_NAME } from '../constants'

export interface CreateWatcherOptions {
  storageDirAbsolute: string
  debounceMs?: number
  onSyncStateChange: () => void
  onQueueChange: () => void
}

export interface GhfsWatcherHandle {
  close: () => Promise<void>
}

export async function createGhfsWatcher(options: CreateWatcherOptions): Promise<GhfsWatcherHandle> {
  const { storageDirAbsolute, onSyncStateChange, onQueueChange } = options
  const debounceMs = options.debounceMs ?? 150

  await mkdir(storageDirAbsolute, { recursive: true })

  let syncTimer: ReturnType<typeof setTimeout> | undefined
  let queueTimer: ReturnType<typeof setTimeout> | undefined

  const flushSync = () => {
    syncTimer = undefined
    try {
      onSyncStateChange()
    }
    catch {
      // swallow errors from handlers; server broadcast will retry next tick
    }
  }
  const flushQueue = () => {
    queueTimer = undefined
    try {
      onQueueChange()
    }
    catch {
      // swallow
    }
  }

  const scheduleSync = () => {
    if (syncTimer)
      clearTimeout(syncTimer)
    syncTimer = setTimeout(flushSync, debounceMs)
  }
  const scheduleQueue = () => {
    if (queueTimer)
      clearTimeout(queueTimer)
    queueTimer = setTimeout(flushQueue, debounceMs)
  }

  const controller = new AbortController()
  const iterator = watch(storageDirAbsolute, { recursive: true, signal: controller.signal })

  const pump = async () => {
    try {
      for await (const event of iterator) {
        const filename = event.filename ? event.filename.replace(/\\/g, '/') : ''
        if (!filename)
          continue

        const basename = filename.split('/').pop() ?? ''

        if (basename === SYNC_STATE_FILE_NAME) {
          scheduleSync()
          scheduleQueue()
          continue
        }

        if (basename === EXECUTE_FILE_NAME || basename === EXECUTE_MD_FILE_NAME) {
          scheduleQueue()
          continue
        }

        if (basename.endsWith('.md')) {
          scheduleQueue()
        }
      }
    }
    catch (error) {
      const name = (error as { name?: string }).name
      if (name !== 'AbortError')
        throw error
    }
  }

  pump()

  return {
    close: async () => {
      controller.abort()
      if (syncTimer)
        clearTimeout(syncTimer)
      if (queueTimer)
        clearTimeout(queueTimer)
    },
  }
}

/** Exposed for tests. */
export type { FSWatcher }
