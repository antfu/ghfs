import type { GhfsResolvedConfig } from '../../types'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createWsServer } from './ws'

const createdPaths: string[] = []

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('createWsServer', () => {
  it('registers and removes websocket channels per connection', async () => {
    const storageDirAbsolute = join(tmpdir(), `ghfs-ui-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    createdPaths.push(storageDirAbsolute)
    const executeFilePath = join(storageDirAbsolute, 'execute.yml')

    let server: Awaited<ReturnType<typeof createWsServer>>
    try {
      server = await createWsServer({
        host: '127.0.0.1',
        config: createConfig(),
        executeFilePath,
        storageDirAbsolute,
      })
    }
    catch (error) {
      if (isSocketPermissionError(error))
        return
      throw error
    }

    try {
      expect(server.getMetadata().backend).toBe('websocket')
      expect(server.rpc.clients.length).toBe(0)

      const client = new WebSocket(`ws://127.0.0.1:${server.getMetadata().websocket}`)
      await waitForOpen(client)
      await waitForCondition(() => server.rpc.clients.length === 1)

      client.close()
      await waitForCondition(() => server.rpc.clients.length === 0)
    }
    finally {
      await server.close()
    }
  })
})

function createConfig(): GhfsResolvedConfig {
  return {
    cwd: '/tmp',
    repo: 'owner/repo',
    directory: '.ghfs',
    auth: {
      token: '',
    },
    sync: {
      issues: true,
      pulls: true,
      closed: false,
      patches: 'open',
    },
  }
}

async function waitForOpen(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    ws.once('open', () => resolvePromise())
    ws.once('error', error => reject(error))
  })
}

async function waitForCondition(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error('Timed out waiting for condition')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

function isSocketPermissionError(error: unknown): boolean {
  return error instanceof Error
    && (error.message.includes('EPERM') || error.message.includes('EACCES'))
}
