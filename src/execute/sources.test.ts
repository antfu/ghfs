import type { SyncState } from '../types'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { saveSyncState } from '../sync/state'
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
    await expect(readFile(join(dir, 'execute.md'), 'utf8')).resolves.toBe('close #11\n\n')
  })

  it('loads per-item actions from markdown frontmatter differences', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '[]\n', 'utf8')
    await writeFile(join(dir, 'execute.md'), '', 'utf8')

    await saveSyncState(dir, createSyncState())
    await mkdir(join(dir, 'issues'), { recursive: true })
    await writeFile(join(dir, 'issues/00001-issue.md'), [
      '---',
      'number: 1',
      'state: closed',
      'title: New title',
      'labels: [enhancement]',
      'assignees: [alice]',
      'milestone: v2',
      '---',
      '',
      '# New title',
      '',
    ].join('\n'), 'utf8')

    const loaded = await loadExecuteSources(join(dir, 'execute.yml'))
    expect(loaded.ops).toEqual([
      {
        action: 'set-title',
        number: 1,
        title: 'New title',
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'close',
        number: 1,
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'set-labels',
        number: 1,
        labels: ['enhancement'],
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'set-assignees',
        number: 1,
        assignees: ['alice'],
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'set-milestone',
        number: 1,
        milestone: 'v2',
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
    ])
  })
})

function createSyncState(): SyncState {
  return {
    version: 2,
    executions: [],
    items: {
      1: {
        number: 1,
        kind: 'issue',
        state: 'open',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        lastSyncedAt: '2026-01-01T00:00:00.000Z',
        filePath: 'issues/00001-issue.md',
        data: {
          item: {
            number: 1,
            kind: 'issue',
            state: 'open',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            closedAt: null,
            title: 'Old title',
            body: 'Body',
            author: 'user',
            labels: ['bug'],
            assignees: [],
            milestone: null,
            url: 'https://github.com/owner/repo/issues/1',
          },
          comments: [],
        },
      },
    },
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-exec-sources-test-'))
  tempDirs.push(dir)
  return dir
}
