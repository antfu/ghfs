import type { SyncSummary } from '../../sync/contracts'
import type { ServerContext } from '../context'
import type { SyncTriggerOptions } from '../types'
import { CodedError, log } from '../../logger'
import { syncRepository } from '../../sync'

export function createSyncHandler(ctx: ServerContext): (options: SyncTriggerOptions) => Promise<SyncSummary> {
  let running = false

  return async function triggerSync(options) {
    if (running)
      throw new CodedError(log.GHFS_E0200())
    running = true
    try {
      const token = await ctx.getToken()
      const summary = await syncRepository({
        config: ctx.config,
        repo: ctx.repo,
        token,
        full: options.full,
        since: options.since,
        numbers: options.numbers,
        reporter: {
          onStageStart(event) {
            ctx.broadcast.onSyncStageStart({ stage: event.stage, message: event.message })
          },
          onStageUpdate(event) {
            ctx.broadcast.onSyncProgress({
              stage: event.stage,
              message: event.message,
              snapshot: event.snapshot,
            })
          },
          onStageEnd(event) {
            ctx.broadcast.onSyncStageEnd({ stage: event.stage, durationMs: event.durationMs })
          },
          onComplete(event) {
            ctx.broadcast.onSyncComplete(event.summary)
          },
          onError(event) {
            const message = event.error instanceof Error
              ? event.error.message
              : String(event.error)
            ctx.broadcast.onSyncError(message)
          },
        },
      })
      return summary
    }
    finally {
      running = false
    }
  }
}
