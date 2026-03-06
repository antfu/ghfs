import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createUiServer } from './server'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('createUiServer', () => {
  it('serves metadata, static assets, and SPA fallback', async () => {
    const uiDir = await createTempDir('ghfs-ui-server-test-')
    await writeFile(join(uiDir, 'index.html'), '<!doctype html><h1>GHFS UI</h1>', 'utf8')
    await writeFile(join(uiDir, 'app.js'), 'globalThis.__ghfs = true', 'utf8')

    let server: Awaited<ReturnType<typeof createUiServer>>
    try {
      server = await createUiServer({
        host: '127.0.0.1',
        port: 0,
        uiDir,
        getMetadata: () => ({
          backend: 'websocket',
          websocket: 49321,
        }),
      })
    }
    catch (error) {
      if (isSocketPermissionError(error))
        return
      throw error
    }

    try {
      const metadataResponse = await fetch(`${server.url}/api/metadata.json`)
      expect(metadataResponse.status).toBe(200)
      await expect(metadataResponse.json()).resolves.toEqual({
        backend: 'websocket',
        websocket: 49321,
      })

      const jsResponse = await fetch(`${server.url}/app.js`)
      expect(jsResponse.status).toBe(200)
      await expect(jsResponse.text()).resolves.toContain('__ghfs = true')

      const fallbackResponse = await fetch(`${server.url}/non/existing/path`)
      expect(fallbackResponse.status).toBe(200)
      await expect(fallbackResponse.text()).resolves.toContain('GHFS UI')
    }
    finally {
      await server.close()
    }
  })

  it('throws if index.html is missing', async () => {
    const uiDir = await createTempDir('ghfs-ui-server-missing-index-')
    await expect(createUiServer({
      host: '127.0.0.1',
      port: 0,
      uiDir,
      getMetadata: () => ({
        backend: 'websocket',
        websocket: 1,
      }),
    })).rejects.toThrow('UI assets not found')
  })
})

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function isSocketPermissionError(error: unknown): boolean {
  return error instanceof Error
    && (error.message.includes('EPERM') || error.message.includes('EACCES'))
}
