import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { pathExists } from './fs'
import { ensureGitignoreEntry } from './gitignore'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function makeProject(options: { withGit?: boolean, withGitignore?: string } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-gitignore-'))
  tempDirs.push(dir)
  if (options.withGit)
    await mkdir(join(dir, '.git'), { recursive: true })
  if (options.withGitignore !== undefined)
    await writeFile(join(dir, '.gitignore'), options.withGitignore, 'utf8')
  return dir
}

describe('ensureGitignoreEntry', () => {
  it('creates .gitignore when missing in a git project', async () => {
    const cwd = await makeProject({ withGit: true })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('.ghfs\n')
  })

  it('appends entry to existing .gitignore', async () => {
    const cwd = await makeProject({ withGit: true, withGitignore: 'node_modules\n' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('node_modules\n.ghfs\n')
  })

  it('adds a trailing newline before appending when missing', async () => {
    const cwd = await makeProject({ withGit: true, withGitignore: 'node_modules' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('node_modules\n.ghfs\n')
  })

  it('is a no-op when entry already present (bare)', async () => {
    const cwd = await makeProject({ withGit: true, withGitignore: 'node_modules\n.ghfs\n' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('node_modules\n.ghfs\n')
  })

  it('is a no-op when entry present with trailing slash', async () => {
    const cwd = await makeProject({ withGit: true, withGitignore: '.ghfs/\n' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('.ghfs/\n')
  })

  it('is a no-op when entry present with leading slash', async () => {
    const cwd = await makeProject({ withGit: true, withGitignore: '/.ghfs\n' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('/.ghfs\n')
  })

  it('ignores commented-out matches', async () => {
    const cwd = await makeProject({ withGit: true, withGitignore: '# .ghfs\n' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('# .ghfs\n.ghfs\n')
  })

  it('uses the configured directory name', async () => {
    const cwd = await makeProject({ withGit: true })

    await ensureGitignoreEntry({ cwd, directory: '.cache/ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('.cache/ghfs\n')
  })

  it('does nothing when no .git and no .gitignore exist', async () => {
    const cwd = await makeProject()

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(pathExists(join(cwd, '.gitignore'))).resolves.toBe(false)
  })

  it('writes to existing .gitignore even without .git', async () => {
    const cwd = await makeProject({ withGitignore: 'node_modules\n' })

    await ensureGitignoreEntry({ cwd, directory: '.ghfs' })

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('node_modules\n.ghfs\n')
  })

  it('does nothing when storage directory is outside cwd', async () => {
    const cwd = await makeProject({ withGit: true })
    const outside = await mkdtemp(join(tmpdir(), 'ghfs-outside-'))
    tempDirs.push(outside)

    await ensureGitignoreEntry({ cwd, directory: outside })

    await expect(pathExists(join(cwd, '.gitignore'))).resolves.toBe(false)
  })

  it('does nothing when storage directory resolves to cwd itself', async () => {
    const cwd = await makeProject({ withGit: true })

    await ensureGitignoreEntry({ cwd, directory: '.' })

    await expect(pathExists(join(cwd, '.gitignore'))).resolves.toBe(false)
  })
})
