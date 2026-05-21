import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { scanGitRepos } from './scanner'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-scanner-'))
  tempDirs.push(dir)
  return dir
}

async function makeRepo(dir: string, name: string): Promise<string> {
  const path = join(dir, name)
  await mkdir(join(path, '.git'), { recursive: true })
  await writeFile(join(path, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8')
  return path
}

describe('scanGitRepos', () => {
  it('finds immediate child repos sorted by name', async () => {
    const dir = await createTempDir()
    await makeRepo(dir, 'beta')
    await makeRepo(dir, 'alpha')
    const repos = await scanGitRepos(dir)
    expect(repos.map(r => r.name)).toEqual(['alpha', 'beta'])
  })

  it('skips dot directories and node_modules', async () => {
    const dir = await createTempDir()
    await makeRepo(dir, 'real')
    await makeRepo(dir, '.hidden')
    await makeRepo(dir, 'node_modules')
    const repos = await scanGitRepos(dir)
    expect(repos.map(r => r.name)).toEqual(['real'])
  })

  it('returns empty when parent has no git children', async () => {
    const dir = await createTempDir()
    await mkdir(join(dir, 'plain'), { recursive: true })
    const repos = await scanGitRepos(dir)
    expect(repos).toEqual([])
  })
})
