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

async function setupHubFixture(): Promise<void> {
  const dir = join(FIXTURES_ROOT, 'hub')
  await rm(dir, { recursive: true, force: true })
  await mkdir(join(dir, '_home', '.config', 'ghfs'), { recursive: true })

  await buildRepoFixture({
    cwd: join(dir, 'project-a'),
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
    cwd: join(dir, 'project-b'),
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

  // Seed an enabled-projects file so the hub launches non-interactively.
  const { saveHubConfig } = await import('../../../src/hub/config')
  await saveHubConfig({
    hubCwd: dir,
    homeDir: join(dir, '_home'),
    enabledProjects: [
      { path: join(dir, 'project-a') },
      { path: join(dir, 'project-b') },
    ],
  })
}

async function setupHubAltFixture(): Promise<void> {
  // Second hub root used to exercise the "change hub root" flow.
  const dir = join(FIXTURES_ROOT, 'hub-alt')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  await buildRepoFixture({
    cwd: join(dir, 'project-c'),
    repo: 'ghfs-test/project-c',
    items: [
      { number: 1, kind: 'issue', title: 'Alt hub project C issue' },
    ],
    executeMd: '',
    executeYml: '[]\n',
  })

  const { saveHubConfig } = await import('../../../src/hub/config')
  const hubHome = join(FIXTURES_ROOT, 'hub', '_home')
  // Seed both hub roots' enabled lists in the same shared HOME so a single
  // running hub can swap between them via the UI.
  await saveHubConfig({
    hubCwd: dir,
    homeDir: hubHome,
    enabledProjects: [
      { path: join(dir, 'project-c') },
    ],
  })
}

export default async function globalSetup(): Promise<void> {
  await mkdir(FIXTURES_ROOT, { recursive: true })
  await setupSingleFixture()
  await setupHubFixture()
  await setupHubAltFixture()
}
