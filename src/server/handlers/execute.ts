import type { ExecutionResult } from '../../types/execution'
import type { ServerContext } from '../context'
import type { ExecuteTriggerOptions } from '../types'
import { executePendingChanges } from '../../execute'
import { CodedError, log } from '../../logger'
import { buildQueueState } from '../queue-builder'

export function createExecuteHandler(ctx: ServerContext): (options: ExecuteTriggerOptions) => Promise<ExecutionResult> {
  let running = false

  return async function executeQueue(options) {
    if (running)
      throw new CodedError(log.GHFS0201())
    running = true
    try {
      const token = await ctx.getToken()
      const selectedIndexes = await resolveSelectedIndexes(ctx, options.entryIds)
      ctx.broadcast.onExecuteStart({ planned: selectedIndexes?.length ?? -1 })
      const result = await executePendingChanges({
        config: ctx.config,
        repo: ctx.repo,
        token,
        executeFilePath: ctx.executeFilePath,
        apply: true,
        nonInteractive: true,
        continueOnError: options.continueOnError ?? true,
        selectedIndexes,
        reporter: {
          onStart(event) {
            ctx.broadcast.onExecuteStart({ planned: event.planned })
          },
          onProgress(event) {
            ctx.broadcast.onExecuteProgress({
              completed: event.completed,
              planned: event.planned,
              applied: event.applied,
              failed: event.failed,
              detail: event.detail,
            })
          },
          onComplete(event) {
            ctx.broadcast.onExecuteComplete(event.result)
          },
          onError(event) {
            const message = event.error instanceof Error
              ? event.error.message
              : String(event.error)
            ctx.broadcast.onExecuteError(message)
          },
        },
      })
      return result
    }
    finally {
      running = false
    }
  }
}

async function resolveSelectedIndexes(
  ctx: ServerContext,
  entryIds: string[] | undefined,
): Promise<number[] | undefined> {
  if (!entryIds || entryIds.length === 0)
    return undefined
  const queue = await buildQueueState({
    storageDirAbsolute: ctx.storageDirAbsolute,
    executeFilePath: ctx.executeFilePath,
  })
  const ids = new Set(entryIds)
  const indexes: number[] = []
  queue.entries.forEach((entry, globalIndex) => {
    if (ids.has(entry.id))
      indexes.push(globalIndex)
  })
  return indexes
}
