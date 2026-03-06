import type { SyncSummary } from '../../../src/sync'
import { resolve } from 'pathe'
import { getExecuteFile, resolveConfig } from '../../../src/config/load'
import { resolveRepo } from '../../../src/config/repo'
import { ensureExecuteArtifacts } from '../../../src/execute/schema'
import { syncRepository } from '../../../src/sync'
import { readTokenFromVSCode } from './auth'
import { logger } from './meta'

export interface RunSyncOptions {
  cwd: string
}

// See src/cli/commands/sync.ts
export async function runSync(options: RunSyncOptions): Promise<SyncSummary> {
  logger.info(`[sync] run at ${Date.now()}`)
  const config = await resolveConfig({ cwd: options.cwd })
  await ensureExecuteArtifacts(resolve(config.cwd, getExecuteFile(config)))

  const repo = await resolveRepo({
    cwd: config.cwd,
    configRepo: config.repo,
    interactive: false,
  })

  const token = config.auth.token?.trim() ?? await readTokenFromVSCode()

  return syncRepository({
    config,
    repo: repo.repo,
    token,
  })
}
