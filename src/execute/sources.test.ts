import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { loadExecuteSources } from './sources'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('loadExecuteSources', () => {
  it('loads actions from execute.yml and execute.md', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '- action: close\n  number: 1\n', 'utf8')
    await writeFile(join(dir, 'execute.md'), [
      'close #2 #3',
      'set-title #4 "new title"',
      'add-tag #5 foo, bar',
      '',
    ].join('\n'), 'utf8')

    const loaded = await loadExecuteSources(join(dir, 'execute.yml'))
    expect(loaded.ops).toEqual([
      { action: 'close', number: 1 },
      { action: 'close', number: 2 },
      { action: 'close', number: 3 },
      { action: 'set-title', number: 4, title: 'new title' },
      { action: 'add-labels', number: 5, labels: ['foo', 'bar'] },
    ])
  })

  it('keeps unrecognized lines and emits warnings', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '[]\n', 'utf8')
    await writeFile(join(dir, 'execute.md'), [
      'close #1',
      'foo bar',
      'set-title #2',
      '',
    ].join('\n'), 'utf8')

    const loaded = await loadExecuteSources(join(dir, 'execute.yml'))
    expect(loaded.ops).toEqual([
      { action: 'close', number: 1 },
    ])
    expect(loaded.warnings).toHaveLength(2)
    expect(loaded.warnings[0]).toContain('line 2')
    expect(loaded.warnings[1]).toContain('line 3')

    await loaded.writeRemaining(new Set([0]))
    await expect(readFile(join(dir, 'execute.md'), 'utf8')).resolves.toContain('foo bar')
  })

  it('writes back partial progress for multi-number simple actions', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '[]\n', 'utf8')
    await writeFile(join(dir, 'execute.md'), 'close #10 #11 #12\n', 'utf8')

    const loaded = await loadExecuteSources(join(dir, 'execute.yml'))
    expect(loaded.ops).toHaveLength(3)

    await loaded.writeRemaining(new Set([1]))
    await expect(readFile(join(dir, 'execute.md'), 'utf8')).resolves.toBe('close #11\n')
  })

  it('returns placeholder warning for details.md source', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '[]\n', 'utf8')
    await writeFile(join(dir, 'details.md'), 'some future syntax\n', 'utf8')

    const loaded = await loadExecuteSources(join(dir, 'execute.yml'))
    expect(loaded.warnings).toContain('details-md source is currently a placeholder and not executed yet')
  })
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-exec-sources-test-'))
  tempDirs.push(dir)
  return dir
}
