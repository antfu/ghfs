import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { loadHubConfig, resolveHubConfigPath, saveHubConfig } from './config'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function makeHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-hub-home-'))
  tempDirs.push(dir)
  return dir
}

describe('hub config', () => {
  it('returns empty when no file exists', async () => {
    const homeDir = await makeHome()
    const entry = await loadHubConfig({ hubCwd: '/projects', homeDir })
    expect(entry.enabledProjects).toEqual([])
  })

  it('round-trips enabled projects keyed by hub cwd', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      hubCwd: '/projects',
      homeDir,
      enabledProjects: [
        { path: '/projects/foo' },
        { path: '/projects/bar' },
      ],
    })
    const entry = await loadHubConfig({ hubCwd: '/projects', homeDir })
    expect(entry.enabledProjects).toEqual([
      { path: '/projects/foo' },
      { path: '/projects/bar' },
    ])
    expect(entry.lastScanAt).toBeTypeOf('string')

    const raw = await readFile(resolveHubConfigPath({ homeDir }), 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.hubs['/projects']).toBeDefined()
  })

  it('keeps other hubs untouched when saving', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      hubCwd: '/projects-a',
      homeDir,
      enabledProjects: [{ path: '/projects-a/foo' }],
    })
    await saveHubConfig({
      hubCwd: '/projects-b',
      homeDir,
      enabledProjects: [{ path: '/projects-b/bar' }],
    })
    const a = await loadHubConfig({ hubCwd: '/projects-a', homeDir })
    const b = await loadHubConfig({ hubCwd: '/projects-b', homeDir })
    expect(a.enabledProjects).toEqual([{ path: '/projects-a/foo' }])
    expect(b.enabledProjects).toEqual([{ path: '/projects-b/bar' }])
  })
})
