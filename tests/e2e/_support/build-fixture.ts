import type { SyncItemState, SyncState } from '../../../src/types'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { GHFS_VERSION } from '../../../src/meta'
import { renderIssueMarkdown } from '../../../src/sync/markdown'

export interface FixtureItemInput {
  number: number
  kind: 'issue' | 'pull'
  state?: 'open' | 'closed'
  title: string
  body?: string
  author?: string
  labels?: string[]
  assignees?: string[]
  comments?: Array<{ id: number, author: string, body: string }>
}

export interface FixtureRepoInput {
  /** Absolute path to the repo's working directory. */
  cwd: string
  repo: string
  items?: FixtureItemInput[]
  executeMd?: string
  executeYml?: string
  /** Override sync timestamp (defaults to a fixed value). */
  syncedAt?: string
  /** Repository labels surfaced to the UI. */
  labels?: Array<{ name: string, color: string, description?: string | null }>
}

const FIXED_TS = '2026-01-01T00:00:00.000Z'

function padNumber(n: number): string {
  return String(n).padStart(5, '0')
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function buildItemState(
  repo: string,
  input: FixtureItemInput,
  syncedAt: string,
): { item: SyncItemState, markdown: string, relativePath: string } {
  const state = input.state ?? 'open'
  const kind = input.kind
  const slug = slugify(input.title) || 'item'
  const fileName = `${padNumber(input.number)}-${slug}.md`
  const dir = kind === 'issue'
    ? (state === 'open' ? 'issues' : 'issues/closed')
    : (state === 'open' ? 'pulls' : 'pulls/closed')
  const relativePath = `${dir}/${fileName}`

  const author = input.author ?? 'octocat'
  const body = input.body ?? ''

  const markdown = renderIssueMarkdown({
    repo,
    number: input.number,
    kind,
    url: `https://github.com/${repo}/${kind === 'pull' ? 'pull' : 'issues'}/${input.number}`,
    state,
    title: input.title,
    body,
    author,
    labels: input.labels ?? [],
    assignees: input.assignees ?? [],
    milestone: null,
    createdAt: syncedAt,
    updatedAt: syncedAt,
    closedAt: state === 'closed' ? syncedAt : null,
    lastSyncedAt: syncedAt,
    comments: (input.comments ?? []).map(c => ({
      id: c.id,
      author: c.author,
      body: c.body,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    })),
    pr: kind === 'pull'
      ? {
          isDraft: false,
          merged: false,
          mergedAt: null,
          baseRef: 'main',
          headRef: `feature/${slug}`,
          requestedReviewers: [],
        }
      : undefined,
  })

  const item: SyncItemState = {
    number: input.number,
    kind,
    state,
    lastUpdatedAt: syncedAt,
    lastSyncedAt: syncedAt,
    filePath: relativePath,
    data: {
      item: {
        number: input.number,
        kind,
        url: `https://github.com/${repo}/${kind === 'pull' ? 'pull' : 'issues'}/${input.number}`,
        state,
        updatedAt: syncedAt,
        createdAt: syncedAt,
        closedAt: state === 'closed' ? syncedAt : null,
        title: input.title,
        body: body || null,
        author,
        labels: input.labels ?? [],
        assignees: input.assignees ?? [],
        milestone: null,
      },
      comments: (input.comments ?? []).map(c => ({
        id: c.id,
        body: c.body,
        createdAt: syncedAt,
        updatedAt: syncedAt,
        author: c.author,
      })),
      ...(kind === 'pull'
        ? {
            pull: {
              isDraft: false,
              merged: false,
              mergedAt: null,
              baseRef: 'main',
              headRef: `feature/${slug}`,
              requestedReviewers: [],
            },
          }
        : {}),
    },
  }

  return { item, markdown, relativePath }
}

export async function buildRepoFixture(input: FixtureRepoInput): Promise<void> {
  const syncedAt = input.syncedAt ?? FIXED_TS
  const ghfsDir = join(input.cwd, '.ghfs')
  await mkdir(ghfsDir, { recursive: true })
  await mkdir(join(input.cwd, '.git'), { recursive: true })
  // Minimal .git so the repo is detected as a git project by the hub scanner.
  await writeFile(join(input.cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8')
  await writeFile(join(input.cwd, '.git', 'config'), `[remote "origin"]\n\turl = git@github.com:${input.repo}.git\n`, 'utf8')

  const items: Record<string, SyncItemState> = {}
  for (const itemInput of input.items ?? []) {
    const { item, markdown, relativePath } = buildItemState(input.repo, itemInput, syncedAt)
    items[String(itemInput.number)] = item
    const target = join(ghfsDir, relativePath)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, markdown, 'utf8')
  }

  const syncState: SyncState = {
    version: 2,
    ghfsVersion: GHFS_VERSION,
    repo: input.repo,
    lastSyncedAt: syncedAt,
    lastRepoUpdatedAt: syncedAt,
    items,
    executions: [],
  }
  await writeFile(join(ghfsDir, '.sync.json'), `${JSON.stringify(syncState, null, 2)}\n`, 'utf8')

  // Repo snapshot — used by the UI for labels/currentUser metadata.
  const repoJson = {
    repo: input.repo,
    syncedAt,
    labels: input.labels ?? [
      { name: 'bug', color: 'd73a4a', description: null },
      { name: 'enhancement', color: 'a2eeef', description: null },
    ],
  }
  await writeFile(join(ghfsDir, 'repo.json'), `${JSON.stringify(repoJson, null, 2)}\n`, 'utf8')

  if (input.executeMd !== undefined)
    await writeFile(join(ghfsDir, 'execute.md'), input.executeMd, 'utf8')
  if (input.executeYml !== undefined)
    await writeFile(join(ghfsDir, 'execute.yml'), input.executeYml, 'utf8')

  // Minimal ghfs.config.ts so config resolution picks up the repo without
  // hitting git remote detection.
  await writeFile(
    join(input.cwd, 'ghfs.config.ts'),
    `export default { repo: '${input.repo}' }\n`,
    'utf8',
  )
}
