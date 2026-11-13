import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { buildRepoFixture } from './build-fixture'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES_ROOT = join(here, '..', 'fixtures')

export async function setupChecksFixture(): Promise<void> {
  const dir = join(FIXTURES_ROOT, 'checks')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await buildRepoFixture({
    cwd: dir,
    repo: 'ghfs-test/checks',
    items: [
      {
        number: 1,
        kind: 'issue',
        title: 'First single-repo issue',
        body: 'Body of the first issue.',
        labels: ['bug'],
      },
      {
        number: 10,
        kind: 'pull',
        title: 'First pull request',
        body: 'PR description body.',
        labels: ['enhancement'],
        checks: {
          headSha: 'abc1234567890',
          fetchedAt: '2026-01-01T12:00:00.000Z',
          checkRuns: [
            { id: 1, name: 'Unit tests', status: 'completed', conclusion: 'success', detailsUrl: 'https://example.com/ci/tests', startedAt: null, completedAt: null },
            { id: 2, name: 'Lint', status: 'completed', conclusion: 'failure', detailsUrl: 'https://example.com/ci/lint', startedAt: null, completedAt: null },
            { id: 3, name: 'Build', status: 'in_progress', conclusion: null, detailsUrl: null, startedAt: null, completedAt: null },
            { id: 4, name: 'Optional checks', status: 'completed', conclusion: 'neutral', detailsUrl: null, startedAt: null, completedAt: null },
          ],
          statuses: [
            { id: 1, context: 'deploy/preview', state: 'pending', description: 'Waiting for deployment', targetUrl: 'https://example.com/preview', createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' },
          ],
        },
      },
      {
        number: 11,
        kind: 'pull',
        title: 'Second pull request',
        checks: { headSha: 'def1234567890', fetchedAt: '2026-01-01T12:00:00.000Z', checkRuns: [], statuses: [] },
      },
      {
        number: 12,
        kind: 'pull',
        title: 'Pull request awaiting first check sync',
      },
    ],
    executeMd: '# example queue file\n',
    executeYml: '[]\n',
  })
}
