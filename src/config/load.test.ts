import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { getExecuteFile, getStorageDirAbsolute, resolveConfig } from './load'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('resolveConfig', () => {
  it('uses default execute file path when no config is present', async () => {
    const cwd = await createTempDir()

    const config = await resolveConfig({ cwd })

    expect(config.directory).toBe('.ghfs')
    expect(getStorageDirAbsolute(config)).toBe(join(cwd, '.ghfs'))
    expect(getExecuteFile(config)).toBe('.ghfs/execute.yml')
    expect(config.auth.token).toBe('')
    expect(config.repo).toBe('')
    expect(config.sync.issues).toBe(true)
    expect(config.sync.pulls).toBe(true)
    expect(config.sync.closed).toBe('existing')
    expect(config.sync.patches).toBe('open')
  })

  it('derives execute file under custom directory', async () => {
    const cwd = await createTempDir()

    const config = await resolveConfig({
      cwd,
      overrides: {
        directory: '.state',
      },
    })

    expect(config.directory).toBe('.state')
    expect(getExecuteFile(config)).toBe('.state/execute.yml')
  })

  it('loads directory/auth/sync from ghfs.config.ts', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'ghfs.config.ts'), `
export default {
  directory: '.ghfs-data',
  auth: { token: '  test-token  ' },
  sync: {
    issues: false,
    pulls: true,
    closed: false,
    patches: 'all',
  },
}
`.trimStart(), 'utf8')

    const config = await resolveConfig({ cwd })

    expect(config.directory).toBe('.ghfs-data')
    expect(getExecuteFile(config)).toBe('.ghfs-data/execute.yml')
    expect(config.auth.token).toBe('test-token')
    expect(config.sync.issues).toBe(false)
    expect(config.sync.pulls).toBe(true)
    expect(config.sync.closed).toBe(false)
    expect(config.sync.patches).toBe('all')
  })
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-config-test-'))
  tempDirs.push(dir)
  return dir
}
