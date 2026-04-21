import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { saveSyncState } from '../sync/state'
import { buildQueueState } from './queue-builder'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-queue-'))
  tempDirs.push(dir)
  return dir
}

describe('buildQueueState', () => {
  it('returns empty queue when no sources exist', async () => {
    const dir = await createTempDir()
    const queue = await buildQueueState({
      storageDirAbsolute: dir,
      executeFilePath: join(dir, 'execute.yml'),
    })
    expect(queue.entries).toEqual([])
    expect(queue.upCount).toBe(0)
  })

  it('tags entries with their source', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '- action: close\n  number: 1\n', 'utf8')
    await writeFile(join(dir, 'execute.md'), 'close #2\n', 'utf8')

    const queue = await buildQueueState({
      storageDirAbsolute: dir,
      executeFilePath: join(dir, 'execute.yml'),
    })

    expect(queue.entries).toHaveLength(2)
    expect(queue.entries[0].source).toBe('execute.yml')
    expect(queue.entries[0].op).toMatchObject({ action: 'close', number: 1 })
    expect(queue.entries[1].source).toBe('execute.md')
    expect(queue.entries[1].op).toMatchObject({ action: 'close', number: 2 })
  })

  it('derives per-item entries from markdown frontmatter diffs', async () => {
    const dir = await createTempDir()
    await mkdir(join(dir, 'issues'), { recursive: true })
    const filePath = 'issues/00005-sample.md'
    await writeFile(join(dir, filePath), [
      '---',
      'repo: owner/repo',
      'number: 5',
      'kind: issue',
      'url: https://github.com/owner/repo/issues/5',
      'state: closed',
      'title: Sample',
      'author: alice',
      'labels: []',
      'assignees: []',
      'milestone: null',
      'created_at: 2026-01-01T00:00:00Z',
      'updated_at: 2026-01-01T00:00:00Z',
      'closed_at: null',
      'last_synced_at: 2026-01-01T00:00:00Z',
      '---',
      '',
      '# Sample',
      '',
    ].join('\n'), 'utf8')

    await saveSyncState(dir, {
      version: 2,
      repo: 'owner/repo',
      items: {
        5: {
          number: 5,
          kind: 'issue',
          state: 'open',
          lastUpdatedAt: '2026-01-01T00:00:00Z',
          lastSyncedAt: '2026-01-01T00:00:00Z',
          filePath,
          data: {
            item: {
              number: 5,
              kind: 'issue',
              state: 'open',
              updatedAt: '2026-01-01T00:00:00Z',
              createdAt: '2026-01-01T00:00:00Z',
              closedAt: null,
              title: 'Sample',
              body: null,
              author: 'alice',
              labels: [],
              assignees: [],
              milestone: null,
            },
            comments: [],
          },
        },
      },
      executions: [],
    })

    const queue = await buildQueueState({
      storageDirAbsolute: dir,
      executeFilePath: join(dir, 'execute.yml'),
    })

    expect(queue.entries.length).toBeGreaterThanOrEqual(1)
    const perItem = queue.entries.find(e => e.source === 'per-item')
    expect(perItem).toBeDefined()
    expect(perItem?.op).toMatchObject({ action: 'close', number: 5 })
    expect(perItem?.filePath).toBe(filePath)
  })

  it('assigns stable ids based on content and source', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'execute.yml'), '- action: close\n  number: 1\n', 'utf8')
    const first = await buildQueueState({
      storageDirAbsolute: dir,
      executeFilePath: join(dir, 'execute.yml'),
    })
    const second = await buildQueueState({
      storageDirAbsolute: dir,
      executeFilePath: join(dir, 'execute.yml'),
    })
    expect(first.entries[0].id).toBe(second.entries[0].id)
  })
})
