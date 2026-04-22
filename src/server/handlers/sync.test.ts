import type { ServerContext } from '../context'
import { describe, expect, it, vi } from 'vitest'
import { syncRepository } from '../../sync'

import { createSyncHandler } from './sync'

vi.mock('../../sync', () => {
  return {
    syncRepository: vi.fn(),
    appendExecutionResult: vi.fn(),
  }
})

function createCtx(overrides: Partial<ServerContext> = {}): ServerContext {
  const broadcast = {
    onSyncStageStart: vi.fn(),
    onSyncProgress: vi.fn(),
    onSyncStageEnd: vi.fn(),
    onSyncComplete: vi.fn(),
    onSyncError: vi.fn(),
    onExecuteStart: vi.fn(),
    onExecuteProgress: vi.fn(),
    onExecuteComplete: vi.fn(),
    onExecuteError: vi.fn(),
    onSyncStateChange: vi.fn(),
    onQueueChange: vi.fn(),
    onRemoteStatusChange: vi.fn(),
  }
  return {
    config: {} as ServerContext['config'],
    repo: 'owner/repo',
    storageDirAbsolute: '/tmp/.ghfs',
    executeFilePath: '/tmp/.ghfs/execute.yml',
    getToken: async () => 'test-token',
    getProvider: async () => null,
    broadcast: broadcast as unknown as ServerContext['broadcast'],
    poller: { getCurrent: () => ({ downCount: 0, checkedAt: '', stale: true }), checkNow: async () => ({ downCount: 0, checkedAt: '', stale: true }), close: () => {} },
    ...overrides,
  }
}

describe('createSyncHandler', () => {
  it('maps reporter events to broadcasts', async () => {
    const ctx = createCtx()
    vi.mocked(syncRepository).mockImplementation(async ({ reporter }) => {
      reporter?.onStageStart?.({ stage: 'metadata', message: 'Starting', snapshot: snapshot(0) })
      reporter?.onStageUpdate?.({ stage: 'metadata', snapshot: snapshot(1) })
      reporter?.onStageEnd?.({ stage: 'metadata', message: 'Done', durationMs: 10, snapshot: snapshot(1) })
      reporter?.onComplete?.({ summary: { repo: 'owner/repo' } as never, stages: {} as never })
      return { repo: 'owner/repo' } as never
    })
    const triggerSync = createSyncHandler(ctx)
    await triggerSync({})

    expect(ctx.broadcast.onSyncStageStart).toHaveBeenCalledWith({ stage: 'metadata', message: 'Starting' })
    expect(ctx.broadcast.onSyncProgress).toHaveBeenCalledWith({ stage: 'metadata', message: undefined, snapshot: snapshot(1) })
    expect(ctx.broadcast.onSyncStageEnd).toHaveBeenCalledWith({ stage: 'metadata', durationMs: 10 })
    expect(ctx.broadcast.onSyncComplete).toHaveBeenCalledOnce()
  })

  it('rejects concurrent sync calls', async () => {
    const ctx = createCtx()
    let release: () => void = () => {}
    vi.mocked(syncRepository).mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ repo: 'owner/repo' } as never)
    }))
    const triggerSync = createSyncHandler(ctx)
    const pending = triggerSync({})
    await expect(triggerSync({})).rejects.toThrow('A sync is already in progress')
    release()
    await pending
  })
})

function snapshot(processed: number) {
  return {
    scanned: processed,
    selected: processed,
    processed,
    skipped: 0,
    written: 0,
    moved: 0,
    patchesWritten: 0,
    patchesDeleted: 0,
  }
}
