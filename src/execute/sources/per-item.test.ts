import type { SyncState } from '../../types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { saveSyncState } from '../../sync/state'
import { loadPerItemSource } from './per-item'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('loadPerItemSource', () => {
  it('generates reopen/remove-labels/clear-milestone from frontmatter diff', async () => {
    const dir = await createTempDir()
    await mkdir(join(dir, 'issues'), { recursive: true })
    await saveSyncState(dir, createSyncState({
      state: 'closed',
      labels: ['bug'],
      milestone: 'v1',
    }))

    await writeFile(join(dir, 'issues/00001-issue.md'), [
      '---',
      'title: Old title',
      'state: open',
      'labels: []',
      'assignees: []',
      'milestone: null',
      '---',
      '',
    ].join('\n'), 'utf8')

    const source = await loadPerItemSource(dir)
    expect(source.ops).toEqual([
      {
        action: 'reopen',
        number: 1,
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'remove-labels',
        number: 1,
        labels: ['bug'],
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'clear-milestone',
        number: 1,
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('emits warnings for missing markdown and invalid frontmatter', async () => {
    const dir = await createTempDir()
    await mkdir(join(dir, 'issues'), { recursive: true })
    await saveSyncState(dir, createSyncState())

    const sourceMissing = await loadPerItemSource(dir)
    expect(sourceMissing.warnings[0]).toContain('missing markdown')

    await writeFile(join(dir, 'issues/00001-issue.md'), 'not-frontmatter', 'utf8')
    const sourceInvalid = await loadPerItemSource(dir)
    expect(sourceInvalid.warnings[0]).toContain('invalid or missing frontmatter')
  })
})

function createSyncState(overrides: Partial<{ state: 'open' | 'closed', labels: string[], milestone: string | null }> = {}): SyncState {
  return {
    version: 2,
    executions: [],
    items: {
      1: {
        number: 1,
        kind: 'issue',
        state: overrides.state ?? 'open',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        lastSyncedAt: '2026-01-01T00:00:00.000Z',
        filePath: 'issues/00001-issue.md',
        data: {
          item: {
            number: 1,
            kind: 'issue',
            state: overrides.state ?? 'open',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            closedAt: null,
            title: 'Old title',
            body: 'Body',
            author: 'user',
            labels: overrides.labels ?? [],
            assignees: [],
            milestone: overrides.milestone ?? null,
            url: 'https://github.com/owner/repo/issues/1',
          },
          comments: [],
        },
      },
    },
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-exec-per-item-test-'))
  tempDirs.push(dir)
  return dir
}
