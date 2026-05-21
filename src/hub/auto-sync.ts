import type { ProjectContext, ProjectRegistry } from '../devframe/project-context'
import { syncRepository } from '../sync'

export interface AutoSyncTimerHandle {
  /** Returns the currently scheduled interval, or undefined if disabled. */
  getInterval: () => number | undefined
  /** Update the interval. Pass `undefined` to disable. */
  setInterval: (ms: number | undefined) => void
  /** Stop the timer permanently (used during teardown). */
  close: () => void
}

export interface CreateAutoSyncTimerOptions {
  registry: ProjectRegistry
  initialIntervalMs?: number
}

const MIN_INTERVAL_MS = 60_000
const MAX_INTERVAL_MS = 3_600_000

/**
 * Schedules a `syncRepository` run for every project with a token at the
 * given interval. One timer is shared across all projects; if a project is
 * still mid-sync when the tick fires, it's skipped for that round.
 */
export function createAutoSyncTimer(options: CreateAutoSyncTimerOptions): AutoSyncTimerHandle {
  let timer: NodeJS.Timeout | null = null
  let intervalMs: number | undefined
  const running = new Set<string>()

  function schedule(ms: number | undefined): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (ms == null)
      return
    if (ms < MIN_INTERVAL_MS || ms > MAX_INTERVAL_MS)
      return
    timer = setInterval(() => {
      void tick()
    }, ms)
    if (typeof timer.unref === 'function')
      timer.unref()
  }

  async function tick(): Promise<void> {
    for (const ctx of options.registry.listProjects())
      void runOne(ctx)
  }

  async function runOne(ctx: ProjectContext): Promise<void> {
    if (running.has(ctx.id))
      return
    let token: string | null = null
    try {
      token = await ctx.getToken()
    }
    catch {
      token = null
    }
    if (!token)
      return
    running.add(ctx.id)
    try {
      await syncRepository({
        config: ctx.config,
        repo: ctx.repo,
        token,
        reporter: {
          onStageStart(event) { ctx.broadcast.onSyncStageStart({ stage: event.stage, message: event.message }) },
          onStageUpdate(event) { ctx.broadcast.onSyncProgress({ stage: event.stage, message: event.message, snapshot: event.snapshot }) },
          onStageEnd(event) { ctx.broadcast.onSyncStageEnd({ stage: event.stage, durationMs: event.durationMs }) },
          onComplete(event) { ctx.broadcast.onSyncComplete(event.summary) },
          onError(event) {
            const message = event.error instanceof Error ? event.error.message : String(event.error)
            ctx.broadcast.onSyncError(message)
          },
        },
      })
    }
    catch {
      // Sync errors are already broadcast via the reporter.onError callback
      // above, so swallow here to keep the timer alive for the next tick.
    }
    finally {
      running.delete(ctx.id)
    }
  }

  intervalMs = options.initialIntervalMs
  schedule(intervalMs)

  return {
    getInterval: () => intervalMs,
    setInterval(ms) {
      intervalMs = ms
      schedule(ms)
    },
    close() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
