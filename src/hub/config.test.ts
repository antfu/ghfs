import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addHubRoot,
  loadHubConfig,
  removeHubRoot,
  resolveHubConfigPath,
  saveHubConfig,
  setEnabledProjects,
  setHubAutoSyncInterval,
  setHubCommentTemplates,
  setHubSwrSettings,
} from './config'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function makeHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-hub-home-'))
  tempDirs.push(dir)
  return dir
}

async function writeRawConfig(homeDir: string, raw: unknown): Promise<void> {
  const path = resolveHubConfigPath({ homeDir })
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
}

describe('hub config', () => {
  it('returns empty defaults when no file exists', async () => {
    const homeDir = await makeHome()
    const config = await loadHubConfig({ homeDir })
    expect(config).toEqual({ roots: [], enabledProjects: [] })
  })

  it('round-trips the flat shape', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      homeDir,
      config: {
        roots: ['/Users/me/work', '/Users/me/oss'],
        enabledProjects: [
          { path: '/Users/me/work/repo-a' },
          { path: '/Users/me/oss/repo-c' },
        ],
        autoSyncIntervalMs: 120_000,
      },
    })
    const config = await loadHubConfig({ homeDir })
    expect(config).toEqual({
      roots: ['/Users/me/work', '/Users/me/oss'],
      enabledProjects: [
        { path: '/Users/me/work/repo-a' },
        { path: '/Users/me/oss/repo-c' },
      ],
      autoSyncIntervalMs: 120_000,
    })

    const raw = JSON.parse(await readFile(resolveHubConfigPath({ homeDir }), 'utf8'))
    expect(raw).toEqual({
      roots: ['/Users/me/work', '/Users/me/oss'],
      enabledProjects: [
        { path: '/Users/me/work/repo-a' },
        { path: '/Users/me/oss/repo-c' },
      ],
      autoSyncIntervalMs: 120_000,
    })
  })

  it('omits autoSyncIntervalMs from disk when undefined', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      homeDir,
      config: { roots: ['/a'], enabledProjects: [] },
    })
    const raw = JSON.parse(await readFile(resolveHubConfigPath({ homeDir }), 'utf8'))
    expect(raw).toEqual({ roots: ['/a'], enabledProjects: [] })
    expect('autoSyncIntervalMs' in raw).toBe(false)
  })

  it('addHubRoot appends and dedupes', async () => {
    const homeDir = await makeHome()
    let config = await addHubRoot({ homeDir, path: '/a' })
    expect(config.roots).toEqual(['/a'])
    config = await addHubRoot({ homeDir, path: '/b' })
    expect(config.roots).toEqual(['/a', '/b'])
    config = await addHubRoot({ homeDir, path: '/a' })
    expect(config.roots).toEqual(['/a', '/b'])
  })

  it('removeHubRoot removes the root AND prunes enabled projects under it', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      homeDir,
      config: {
        roots: ['/a', '/b'],
        enabledProjects: [
          { path: '/a' }, // exact match
          { path: '/a/repo-1' }, // under /a
          { path: '/b/repo-2' }, // under /b — keep
          { path: '/other/repo-3' }, // unrelated — keep
        ],
      },
    })
    const config = await removeHubRoot({ homeDir, path: '/a' })
    expect(config.roots).toEqual(['/b'])
    expect(config.enabledProjects).toEqual([
      { path: '/b/repo-2' },
      { path: '/other/repo-3' },
    ])
  })

  it('removeHubRoot is a no-op when the root is absent', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      homeDir,
      config: { roots: ['/a'], enabledProjects: [{ path: '/a/x' }] },
    })
    const config = await removeHubRoot({ homeDir, path: '/missing' })
    expect(config.roots).toEqual(['/a'])
    expect(config.enabledProjects).toEqual([{ path: '/a/x' }])
  })

  it('setEnabledProjects overwrites and dedupes', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({ homeDir, config: { roots: ['/a'], enabledProjects: [{ path: '/a/old' }] } })
    const config = await setEnabledProjects({
      homeDir,
      paths: ['/a/x', '/a/y', '/a/x'],
    })
    expect(config.enabledProjects).toEqual([
      { path: '/a/x' },
      { path: '/a/y' },
    ])
    expect(config.roots).toEqual(['/a'])
  })

  it('setHubAutoSyncInterval updates the global field', async () => {
    const homeDir = await makeHome()
    await addHubRoot({ homeDir, path: '/a' })
    const config = await setHubAutoSyncInterval({ homeDir, intervalMs: 180_000 })
    expect(config.autoSyncIntervalMs).toBe(180_000)
    const reloaded = await loadHubConfig({ homeDir })
    expect(reloaded.autoSyncIntervalMs).toBe(180_000)
  })

  it('round-trips commentTemplates', async () => {
    const homeDir = await makeHome()
    const templates = [
      { title: 'Thanks', body: 'Thanks for the report!' },
      { title: 'Repro?', body: 'Could you share a minimal reproduction?' },
    ]
    const config = await setHubCommentTemplates({ homeDir, templates })
    expect(config.commentTemplates).toEqual(templates)
    const reloaded = await loadHubConfig({ homeDir })
    expect(reloaded.commentTemplates).toEqual(templates)
  })

  it('setHubCommentTemplates trims titles and drops empty entries', async () => {
    const homeDir = await makeHome()
    const config = await setHubCommentTemplates({
      homeDir,
      templates: [
        { title: '  Thanks  ', body: 'Thanks!' },
        { title: '', body: 'no title' },
        { title: 'no body', body: '' },
        { title: 'Hi', body: 'Hello' },
      ],
    })
    expect(config.commentTemplates).toEqual([
      { title: 'Thanks', body: 'Thanks!' },
      { title: 'Hi', body: 'Hello' },
    ])
  })

  it('omits commentTemplates from disk when never set', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({ homeDir, config: { roots: ['/a'], enabledProjects: [] } })
    const raw = JSON.parse(await readFile(resolveHubConfigPath({ homeDir }), 'utf8'))
    expect('commentTemplates' in raw).toBe(false)
  })

  it('preserves commentTemplates when other fields are mutated', async () => {
    const homeDir = await makeHome()
    await setHubCommentTemplates({ homeDir, templates: [{ title: 'Hi', body: 'Hello' }] })
    await setHubAutoSyncInterval({ homeDir, intervalMs: 120_000 })
    const reloaded = await loadHubConfig({ homeDir })
    expect(reloaded.commentTemplates).toEqual([{ title: 'Hi', body: 'Hello' }])
    expect(reloaded.autoSyncIntervalMs).toBe(120_000)
  })

  it('distinguishes never-set (undefined) from explicitly-empty commentTemplates', async () => {
    const homeDir = await makeHome()
    // Never set: field absent from JSON.
    await saveHubConfig({ homeDir, config: { roots: ['/a'], enabledProjects: [] } })
    const initial = await loadHubConfig({ homeDir })
    expect(initial.commentTemplates).toBeUndefined()

    // Explicit empty: field present but empty.
    await setHubCommentTemplates({ homeDir, templates: [] })
    const cleared = await loadHubConfig({ homeDir })
    expect(cleared.commentTemplates).toEqual([])
  })

  it('setHubSwrSettings round-trips both fields', async () => {
    const homeDir = await makeHome()
    await addHubRoot({ homeDir, path: '/a' })
    const config = await setHubSwrSettings({ homeDir, swrSyncEnabled: false, swrCacheTimeoutMs: 600_000 })
    expect(config.swrSyncEnabled).toBe(false)
    expect(config.swrCacheTimeoutMs).toBe(600_000)
    const reloaded = await loadHubConfig({ homeDir })
    expect(reloaded.swrSyncEnabled).toBe(false)
    expect(reloaded.swrCacheTimeoutMs).toBe(600_000)
  })

  it('addHubRoot preserves autoSync and SWR fields', async () => {
    const homeDir = await makeHome()
    await setHubAutoSyncInterval({ homeDir, intervalMs: 180_000 })
    await setHubSwrSettings({ homeDir, swrSyncEnabled: false, swrCacheTimeoutMs: 600_000 })
    const config = await addHubRoot({ homeDir, path: '/new-root' })
    expect(config.autoSyncIntervalMs).toBe(180_000)
    expect(config.swrSyncEnabled).toBe(false)
    expect(config.swrCacheTimeoutMs).toBe(600_000)
  })

  it('setHubAutoSyncInterval does not clobber SWR fields', async () => {
    const homeDir = await makeHome()
    await setHubSwrSettings({ homeDir, swrSyncEnabled: false, swrCacheTimeoutMs: 600_000 })
    const config = await setHubAutoSyncInterval({ homeDir, intervalMs: 180_000 })
    expect(config.autoSyncIntervalMs).toBe(180_000)
    expect(config.swrSyncEnabled).toBe(false)
    expect(config.swrCacheTimeoutMs).toBe(600_000)
  })

  it('omits SWR fields from disk when undefined', async () => {
    const homeDir = await makeHome()
    await saveHubConfig({
      homeDir,
      config: { roots: ['/a'], enabledProjects: [] },
    })
    const raw = JSON.parse(await readFile(resolveHubConfigPath({ homeDir }), 'utf8'))
    expect('swrSyncEnabled' in raw).toBe(false)
    expect('swrCacheTimeoutMs' in raw).toBe(false)
  })

  it('migrates a legacy hubs file on load', async () => {
    const homeDir = await makeHome()
    await writeRawConfig(homeDir, {
      hubs: {
        '/projects-a': {
          enabledProjects: [{ path: '/projects-a/foo' }],
          lastScanAt: '2026-01-01T00:00:00.000Z',
          autoSyncIntervalMs: 120_000,
        },
        '/projects-b': {
          enabledProjects: [
            { path: '/projects-b/bar' },
            { path: '/projects-a/foo' }, // duplicate path across hubs — should dedupe
          ],
          autoSyncIntervalMs: 300_000,
        },
      },
    })

    const config = await loadHubConfig({ homeDir })
    expect(config.roots).toEqual(['/projects-a', '/projects-b'])
    expect(config.enabledProjects).toEqual([
      { path: '/projects-a/foo' },
      { path: '/projects-b/bar' },
    ])
    // Should hoist the max per-hub interval.
    expect(config.autoSyncIntervalMs).toBe(300_000)
  })

  it('writes the new shape (no `hubs`) after migration', async () => {
    const homeDir = await makeHome()
    await writeRawConfig(homeDir, {
      hubs: {
        '/projects-a': { enabledProjects: [{ path: '/projects-a/foo' }] },
      },
    })
    const config = await loadHubConfig({ homeDir })
    await saveHubConfig({ homeDir, config })
    const raw = JSON.parse(await readFile(resolveHubConfigPath({ homeDir }), 'utf8'))
    expect('hubs' in raw).toBe(false)
    expect(raw.roots).toEqual(['/projects-a'])
    expect(raw.enabledProjects).toEqual([{ path: '/projects-a/foo' }])
  })
})
