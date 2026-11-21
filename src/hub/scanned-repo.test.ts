import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn())
const resolveRepoMock = vi.hoisted(() => vi.fn())

vi.mock('../config/load', () => ({ resolveConfig: resolveConfigMock }))
vi.mock('../config/repo', () => ({ resolveRepo: resolveRepoMock }))

async function loadModule() {
  return import('./scanned-repo')
}

beforeEach(() => {
  resolveConfigMock.mockReset()
  resolveRepoMock.mockReset()
  resolveConfigMock.mockResolvedValue({ repo: '' })
})

describe('resolveScannedRepo', () => {
  it('returns the resolved repo when detection succeeds', async () => {
    resolveRepoMock.mockResolvedValue({ repo: 'antfu/ghfs', source: 'git', candidates: [] })
    const { resolveScannedRepo } = await loadModule()

    await expect(resolveScannedRepo('/tmp/project')).resolves.toEqual({ repo: 'antfu/ghfs' })
  })

  it('keeps the directory and reports why when git and package.json disagree', async () => {
    const diagnostic = Object.assign(new Error('Repo mismatch detected. git=0froq/ghfs package.json=antfu/ghfs.'), { code: 'GHFS0014' })
    resolveRepoMock.mockRejectedValue(diagnostic)
    const { resolveScannedRepo } = await loadModule()

    await expect(resolveScannedRepo('/tmp/project')).resolves.toEqual({
      repo: null,
      error: 'Repo mismatch detected. git=0froq/ghfs package.json=antfu/ghfs.',
    })
  })

  it('falls back to git detection when ghfs.config.ts fails to load', async () => {
    resolveConfigMock.mockRejectedValue(new Error('config blew up'))
    resolveRepoMock.mockResolvedValue({ repo: 'antfu/ghfs', source: 'git', candidates: [] })
    const { resolveScannedRepo } = await loadModule()

    await expect(resolveScannedRepo('/tmp/project')).resolves.toEqual({ repo: 'antfu/ghfs' })
    expect(resolveRepoMock).toHaveBeenCalledWith({ cwd: '/tmp/project', configRepo: undefined, interactive: false })
  })

  it('passes the config repo through when ghfs.config.ts pins one', async () => {
    resolveConfigMock.mockResolvedValue({ repo: 'antfu/ghfs' })
    resolveRepoMock.mockResolvedValue({ repo: 'antfu/ghfs', source: 'config', candidates: [] })
    const { resolveScannedRepo } = await loadModule()

    await resolveScannedRepo('/tmp/project')

    expect(resolveRepoMock).toHaveBeenCalledWith({ cwd: '/tmp/project', configRepo: 'antfu/ghfs', interactive: false })
  })

  it('reports a non-Error rejection as text instead of throwing', async () => {
    resolveRepoMock.mockRejectedValue('GHFS0015')
    const { resolveScannedRepo } = await loadModule()

    await expect(resolveScannedRepo('/tmp/project')).resolves.toEqual({ repo: null, error: 'GHFS0015' })
  })
})
