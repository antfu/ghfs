import { beforeEach, describe, expect, it, vi } from 'vitest'

const scanGitReposMock = vi.hoisted(() => vi.fn())
const resolveScannedRepoMock = vi.hoisted(() => vi.fn())

vi.mock('./scanner', () => ({ scanGitRepos: scanGitReposMock }))
vi.mock('./scanned-repo', () => ({ resolveScannedRepo: resolveScannedRepoMock }))

async function loadModule() {
  return import('./scan-projects')
}

beforeEach(() => {
  scanGitReposMock.mockReset()
  resolveScannedRepoMock.mockReset()
  resolveScannedRepoMock.mockResolvedValue({ repo: 'antfu/ghfs' })
})

describe('scanProjectDirectories', () => {
  it('scans every root and keeps a directory that appears in two of them once', async () => {
    scanGitReposMock.mockImplementation(async (root: string) => root === '/a'
      ? [{ path: '/a/one', name: 'one' }, { path: '/a/two', name: 'two' }]
      : [{ path: '/a/two', name: 'two' }, { path: '/b/three', name: 'three' }])
    const { scanProjectDirectories } = await loadModule()

    const projects = await scanProjectDirectories(['/a', '/b'])

    expect(projects.map(p => p.path)).toEqual(['/a/one', '/a/two', '/b/three'])
    expect(resolveScannedRepoMock).toHaveBeenCalledTimes(3)
  })

  it('keeps the reason for a directory that cannot be resolved', async () => {
    scanGitReposMock.mockResolvedValue([{ path: '/a/fork', name: 'fork' }])
    resolveScannedRepoMock.mockResolvedValue({ repo: null, error: 'Repo mismatch detected.' })
    const { scanProjectDirectories } = await loadModule()

    await expect(scanProjectDirectories(['/a'])).resolves.toEqual([
      { path: '/a/fork', name: 'fork', repo: null, error: 'Repo mismatch detected.' },
    ])
  })

  it('keeps going when one root cannot be read', async () => {
    scanGitReposMock.mockImplementation(async (root: string) => {
      if (root === '/missing')
        throw new Error('EACCES')
      return [{ path: '/a/one', name: 'one' }]
    })
    const { scanProjectDirectories } = await loadModule()

    const projects = await scanProjectDirectories(['/missing', '/a'])

    expect(projects.map(p => p.path)).toEqual(['/a/one'])
  })
})
