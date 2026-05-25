import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { loadRepoTemplates, parseRepoTemplatesYaml, saveRepoTemplates, serializeRepoTemplatesYaml } from './repo-templates'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function makeProject(): Promise<{ projectPath: string, storageDir: string }> {
  const projectPath = await mkdtemp(join(tmpdir(), 'ghfs-repo-templates-'))
  tempDirs.push(projectPath)
  const storageDir = join(projectPath, '.ghfs')
  await mkdir(storageDir, { recursive: true })
  return { projectPath, storageDir }
}

describe('parseRepoTemplatesYaml', () => {
  it('parses a top-level list', () => {
    const result = parseRepoTemplatesYaml(`
- title: Thanks
  body: Thanks for the report!
- title: Repro
  body: Could you share a repro?
`)
    expect(result.warnings).toEqual([])
    expect(result.templates).toEqual([
      { title: 'Thanks', body: 'Thanks for the report!' },
      { title: 'Repro', body: 'Could you share a repro?' },
    ])
  })

  it('also accepts a `replies:` key', () => {
    const result = parseRepoTemplatesYaml(`
replies:
  - title: Hi
    body: Hello
`)
    expect(result.templates).toEqual([{ title: 'Hi', body: 'Hello' }])
  })

  it('returns empty templates for an empty file', () => {
    expect(parseRepoTemplatesYaml('')).toEqual({ templates: [], warnings: [] })
    expect(parseRepoTemplatesYaml('   \n\n')).toEqual({ templates: [], warnings: [] })
  })

  it('drops entries missing title or body with warnings', () => {
    const result = parseRepoTemplatesYaml(`
- title: ''
  body: no title
- title: no body
  body: ''
- title: Good
  body: Good
`)
    expect(result.templates).toEqual([{ title: 'Good', body: 'Good' }])
    expect(result.warnings.length).toBe(2)
  })

  it('warns and returns empty on malformed YAML', () => {
    const result = parseRepoTemplatesYaml(': : :')
    expect(result.templates).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('warns when the top-level shape is wrong', () => {
    const result = parseRepoTemplatesYaml(`title: not a list`)
    expect(result.templates).toEqual([])
    expect(result.warnings.length).toBe(1)
  })

  it('truncates oversized body / title with a warning', () => {
    const result = parseRepoTemplatesYaml(`
- title: ${'t'.repeat(300)}
  body: ${'b'.repeat(20_000)}
`)
    expect(result.templates[0]!.title.length).toBe(200)
    expect(result.templates[0]!.body.length).toBe(10_000)
    expect(result.warnings.length).toBeGreaterThanOrEqual(2)
  })

  it('preserves multi-line bodies', () => {
    const result = parseRepoTemplatesYaml(`
- title: multi
  body: |
    Line one.

    Line two.
`)
    expect(result.templates).toEqual([{ title: 'multi', body: 'Line one.\n\nLine two.\n' }])
  })
})

describe('serializeRepoTemplatesYaml', () => {
  it('round-trips through parse', () => {
    const input = [
      { title: 'Thanks', body: 'Thanks!' },
      { title: 'multi', body: 'Line one.\n\nLine two.' },
    ]
    const yaml = serializeRepoTemplatesYaml(input)
    const parsed = parseRepoTemplatesYaml(yaml)
    expect(parsed.templates).toEqual(input)
  })
})

describe('loadRepoTemplates', () => {
  it('returns empty when .github/replies.yml is missing', async () => {
    const { projectPath, storageDir } = await makeProject()
    const cache = await loadRepoTemplates(projectPath, storageDir)
    expect(cache.templates).toEqual([])
    expect(cache.mtimeMs).toBeNull()
  })

  it('reads templates from .github/replies.yml', async () => {
    const { projectPath, storageDir } = await makeProject()
    await mkdir(join(projectPath, '.github'), { recursive: true })
    await writeFile(
      join(projectPath, '.github', 'replies.yml'),
      `- title: Hi\n  body: Hello\n`,
      'utf8',
    )
    const cache = await loadRepoTemplates(projectPath, storageDir)
    expect(cache.templates).toEqual([{ title: 'Hi', body: 'Hello' }])
    expect(cache.mtimeMs).not.toBeNull()
  })
})

describe('saveRepoTemplates', () => {
  it('creates .github/replies.yml on first save', async () => {
    const { projectPath, storageDir } = await makeProject()
    const templates = [{ title: 'Hi', body: 'Hello' }]
    const cache = await saveRepoTemplates(projectPath, storageDir, templates)
    expect(cache.templates).toEqual(templates)
    const written = await readFile(join(projectPath, '.github', 'replies.yml'), 'utf8')
    expect(written).toContain('title: Hi')
    expect(written).toContain('body: Hello')
  })

  it('drops empty/blank entries and trims titles', async () => {
    const { projectPath, storageDir } = await makeProject()
    const cache = await saveRepoTemplates(projectPath, storageDir, [
      { title: '  Hi  ', body: 'Hello' },
      { title: '', body: 'orphan' },
      { title: 'orphan', body: '' },
    ])
    expect(cache.templates).toEqual([{ title: 'Hi', body: 'Hello' }])
  })
})
