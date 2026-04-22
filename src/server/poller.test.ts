import type { RepositoryProvider } from '../types/provider'
import { describe, expect, it, vi } from 'vitest'
import { createRemotePoller } from './poller'

function createProvider(counts: { issues: number, pulls: number } = { issues: 0, pulls: 0 }): RepositoryProvider {
  return {
    countUpdatedSince: vi.fn(async () => counts),
  } as unknown as RepositoryProvider
}

describe('createRemotePoller', () => {
  it('returns stale=true when no sync has happened yet', async () => {
    const onUpdate = vi.fn()
    const poller = createRemotePoller({
      intervalMs: 60_000,
      getProvider: async () => createProvider({ issues: 3, pulls: 2 }),
      getSince: () => undefined,
      onUpdate,
    })
    const status = await poller.checkNow()
    expect(status.stale).toBe(true)
    expect(status.downCount).toBe(0)
    poller.close()
  })

  it('returns counts from provider when since is known', async () => {
    const onUpdate = vi.fn()
    const provider = createProvider({ issues: 3, pulls: 2 })
    const poller = createRemotePoller({
      intervalMs: 60_000,
      getProvider: async () => provider,
      getSince: () => '2026-01-01T00:00:00Z',
      onUpdate,
    })
    const status = await poller.checkNow()
    expect(status.stale).toBe(false)
    expect(status.downCount).toBe(5)
    expect(provider.countUpdatedSince).toHaveBeenCalledWith('2026-01-01T00:00:00Z')
    expect(onUpdate).toHaveBeenCalledWith(status)
    poller.close()
  })

  it('marks stale when no provider is available', async () => {
    const poller = createRemotePoller({
      intervalMs: 60_000,
      getProvider: async () => null,
      getSince: () => '2026-01-01T00:00:00Z',
      onUpdate: () => {},
    })
    const status = await poller.checkNow()
    expect(status.stale).toBe(true)
    expect(status.message).toContain('token')
    poller.close()
  })

  it('marks stale and keeps previous downCount on provider error', async () => {
    let call = 0
    const provider: RepositoryProvider = {
      countUpdatedSince: vi.fn(async () => {
        call += 1
        if (call === 1)
          return { issues: 4, pulls: 1 }
        throw new Error('rate limited')
      }),
    } as unknown as RepositoryProvider
    const poller = createRemotePoller({
      intervalMs: 60_000,
      getProvider: async () => provider,
      getSince: () => '2026-01-01T00:00:00Z',
      onUpdate: () => {},
    })
    const first = await poller.checkNow()
    expect(first.downCount).toBe(5)
    expect(first.stale).toBe(false)
    const second = await poller.checkNow()
    expect(second.stale).toBe(true)
    expect(second.downCount).toBe(5)
    expect(second.message).toContain('rate limited')
    poller.close()
  })
})
