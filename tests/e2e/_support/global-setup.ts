import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { buildRepoFixture } from './build-fixture'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES_ROOT = join(here, '..', 'fixtures')

async function setupSingleFixture(): Promise<void> {
  const dir = join(FIXTURES_ROOT, 'single')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await buildRepoFixture({
    cwd: dir,
    repo: 'ghfs-test/single',
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'enhancement', color: 'a2eeef' },
      { name: 'documentation', color: '0075ca' },
    ],
    items: [
      {
        number: 1,
        kind: 'issue',
        title: 'First single-repo issue',
        body: 'Body of the first issue.',
        labels: ['bug'],
      },
      {
        number: 2,
        kind: 'issue',
        title: 'Second single-repo issue',
        body: 'Body of the second issue.',
        labels: ['enhancement'],
      },
      {
        number: 3,
        kind: 'issue',
        title: 'Third single-repo issue',
        body: 'Third issue body.',
      },
      {
        number: 10,
        kind: 'pull',
        title: 'First pull request',
        body: 'PR description body.',
        labels: ['enhancement'],
      },
      {
        number: 11,
        kind: 'pull',
        title: 'Second pull request',
      },
    ],
    executeMd: '# example queue file\n',
    executeYml: '[]\n',
  })
}

async function setupHubFixtures(): Promise<void> {
  const hubDir = join(FIXTURES_ROOT, 'hub')
  const altDir = join(FIXTURES_ROOT, 'hub-alt')
  await Promise.all([
    rm(hubDir, { recursive: true, force: true }),
    rm(altDir, { recursive: true, force: true }),
  ])
  await mkdir(join(hubDir, '_home', '.config', 'ghfs'), { recursive: true })
  await mkdir(altDir, { recursive: true })

  await buildRepoFixture({
    cwd: join(hubDir, 'project-a'),
    repo: 'ghfs-test/project-a',
    // Older activity than project-b so it sorts second on the dashboard.
    syncedAt: '2026-01-01T00:00:00.000Z',
    items: [
      { number: 1, kind: 'issue', title: 'Project A bug report', labels: ['bug'] },
      { number: 2, kind: 'issue', title: 'Project A feature ask', labels: ['enhancement'] },
      { number: 20, kind: 'pull', title: 'Project A pull request' },
    ],
    executeMd: '',
    executeYml: '[]\n',
  })

  await buildRepoFixture({
    cwd: join(hubDir, 'project-b'),
    repo: 'ghfs-test/project-b',
    // Newer activity → sorts first on the dashboard.
    syncedAt: '2026-04-01T12:00:00.000Z',
    items: [
      { number: 1, kind: 'issue', title: 'Project B starter issue' },
      { number: 30, kind: 'pull', title: 'Project B pull request', labels: ['bug'] },
    ],
    executeMd: '',
    executeYml: '[]\n',
  })

  await buildRepoFixture({
    cwd: join(altDir, 'project-c'),
    repo: 'ghfs-test/project-c',
    items: [
      { number: 1, kind: 'issue', title: 'Alt hub project C issue' },
    ],
    executeMd: '',
    executeYml: '[]\n',
  })

  // Seed a single shared `_home/.config/ghfs/hub.json` with both roots and
  // all three projects enabled so the hub launches non-interactively and
  // every fixture project appears together on /hub.
  const { saveHubConfig } = await import('../../../src/hub/config')
  await saveHubConfig({
    homeDir: join(hubDir, '_home'),
    config: {
      roots: [hubDir, altDir],
      enabledProjects: [
        { path: join(hubDir, 'project-a') },
        { path: join(hubDir, 'project-b') },
        { path: join(altDir, 'project-c') },
      ],
    },
  })
}

export default async function globalSetup(): Promise<void> {
  await mkdir(FIXTURES_ROOT, { recursive: true })
  await setupSingleFixture()
  await setupHubFixtures()
}
