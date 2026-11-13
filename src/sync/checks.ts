import type { SyncContext } from './sync-repository-types'
import { readdir, rmdir } from 'node:fs/promises'
import { join } from 'pathe'
import { CLOSED_DIR_NAME, PULL_DIR_NAME } from '../constants'
import { removePath, writeFileEnsured } from '../utils/fs'
import { getItemFileName } from './paths'

export async function refreshPullChecks(context: SyncContext, selectedNumbers: Set<number>, targeted: boolean): Promise<void> {
  if (!context.config.sync.pulls)
    return
  for (const tracked of Object.values(context.syncState.items)) {
    if (tracked.kind !== 'pull')
      continue
    if (targeted ? !selectedNumbers.has(tracked.number) : tracked.state !== 'open' && !selectedNumbers.has(tracked.number))
      continue
    tracked.data.checks = await context.provider.fetchPullChecks(tracked.number)
    tracked.lastSyncedAt = context.syncedAt
  }
}

export async function materializePullChecks(context: SyncContext): Promise<void> {
  if (!context.config.sync.pulls)
    return
  for (const tracked of Object.values(context.syncState.items)) {
    if (tracked.kind !== 'pull' || !tracked.data.checks)
      continue
    const directory = join(
      context.storageDirAbsolute,
      PULL_DIR_NAME,
      tracked.state === 'closed' ? CLOSED_DIR_NAME : '',
      getItemFileName(tracked.number, tracked.data.item.title).replace(/\.md$/, ''),
    )
    await writeFileEnsured(join(directory, 'checks.json'), `${JSON.stringify(tracked.data.checks, null, 2)}\n`)
    await removePullChecks(context.storageDirAbsolute, tracked.number, directory)
  }
}

export async function removePullChecks(storageDir: string, number: number, keepDirectory?: string): Promise<void> {
  const prefix = `${String(number).padStart(5, '0')}-`
  for (const stateDirectory of ['', CLOSED_DIR_NAME]) {
    const parent = join(storageDir, PULL_DIR_NAME, stateDirectory)
    const entries = await readdir(parent, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT')
        return []
      throw error
    })
    for (const entry of entries) {
      const directory = join(parent, entry.name)
      if (!entry.isDirectory() || !entry.name.startsWith(prefix) || directory === keepDirectory)
        continue
      await removePath(join(directory, 'checks.json'))
      await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT')
          throw error
      })
    }
  }
}
