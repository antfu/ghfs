import type { RepositoryProvider } from '../types/provider'
import type { RemoteStatus } from './types'

export interface CreatePollerOptions {
  /** Polling interval in milliseconds. */
  intervalMs?: number
  /** Returns a provider ready for API calls, or null if we cannot poll (e.g. no token). */
  getProvider: () => Promise<RepositoryProvider | null>
  /** Returns the ISO timestamp of the last successful sync, or undefined when we've never synced. */
  getSince: () => string | undefined
  /** Called after every poll (success or failure). */
  onUpdate: (status: RemoteStatus) => void
  /** Called once on setup to seed current status. */
  initial?: RemoteStatus
}

export interface RemotePollerHandle {
  getCurrent: () => RemoteStatus
  checkNow: () => Promise<RemoteStatus>
  close: () => void
}

export function createRemotePoller(options: CreatePollerOptions): RemotePollerHandle {
  const intervalMs = options.intervalMs ?? 60_000
  let current: RemoteStatus = options.initial ?? {
    downCount: 0,
    checkedAt: new Date(0).toISOString(),
    stale: true,
    message: 'Not checked yet',
  }
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let failures = 0
  let inFlight: Promise<RemoteStatus> | undefined

  function setStatus(next: RemoteStatus): RemoteStatus {
    current = next
    options.onUpdate(current)
    return current
  }

  async function doCheck(): Promise<RemoteStatus> {
    const checkedAt = new Date().toISOString()
    const since = options.getSince()
    if (!since)
      return setStatus({ downCount: 0, checkedAt, stale: true, message: 'Not synced yet' })

    let provider: RepositoryProvider | null
    try {
      provider = await options.getProvider()
    }
    catch (error) {
      return setStatus({ downCount: current.downCount, checkedAt, stale: true, message: (error as Error).message })
    }
    if (!provider)
      return setStatus({ downCount: 0, checkedAt, stale: true, message: 'Missing GitHub token' })

    try {
      const counts = await provider.countUpdatedSince(since)
      failures = 0
      return setStatus({
        downCount: counts.issues + counts.pulls,
        checkedAt,
        stale: false,
      })
    }
    catch (error) {
      failures += 1
      return setStatus({
        downCount: current.downCount,
        checkedAt,
        stale: true,
        message: (error as Error).message,
      })
    }
  }

  async function check(): Promise<RemoteStatus> {
    if (inFlight)
      return inFlight
    inFlight = doCheck()
    try {
      return await inFlight
    }
    finally {
      inFlight = undefined
      schedule()
    }
  }

  function schedule(): void {
    if (stopped)
      return
    if (timer)
      clearTimeout(timer)
    const backoff = failures === 0 ? intervalMs : Math.min(intervalMs * 2 ** Math.min(failures, 4), intervalMs * 16)
    timer = setTimeout(() => {
      check().catch(() => {})
    }, backoff)
  }

  // First check runs after 2s so startup is not blocked.
  timer = setTimeout(() => {
    check().catch(() => {})
  }, 2_000)

  return {
    getCurrent: () => current,
    checkNow: check,
    close: () => {
      stopped = true
      if (timer)
        clearTimeout(timer)
    },
  }
}
