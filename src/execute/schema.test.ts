import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { ACTION_INPUTS } from './actions'
import { ensureExecuteArtifacts, EXECUTE_FILE_PLACEHOLDER, EXECUTE_MD_FILE_PLACEHOLDER, getExecuteSchemaPath } from './schema'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('ensureExecuteArtifacts', () => {
  it('creates execute file and schema when missing', async () => {
    const dir = await createTempDir()
    const executeFilePath = join(dir, 'execute.yml')
    const { schemaPath } = await ensureExecuteArtifacts(executeFilePath)
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as { items: { properties: { action: { enum: string[] } } } }

    expect(schemaPath).toBe(getExecuteSchemaPath(dir))
    await expect(readFile(executeFilePath, 'utf8')).resolves.toBe(EXECUTE_FILE_PLACEHOLDER)
    await expect(readFile(join(dir, 'execute.md'), 'utf8')).resolves.toBe(EXECUTE_MD_FILE_PLACEHOLDER)
    await expect(readFile(schemaPath, 'utf8')).resolves.toContain('\"$id\": \"https://ghfs.dev/schema/execute.json\"')
    expect(schema.items.properties.action.enum).toEqual([...ACTION_INPUTS])
  })

  it('does not overwrite existing execute file and schema', async () => {
    const dir = await createTempDir()
    const executeFilePath = join(dir, 'execute.yml')
    const schemaPath = getExecuteSchemaPath(dir)

    const executeContent = '- action: close\n  number: 1\n'
    const schemaContent = '{"custom": true}\n'

    await writeFile(executeFilePath, executeContent, 'utf8')
    await mkdir(join(dir, 'schema'), { recursive: true })
    await writeFile(schemaPath, schemaContent, 'utf8')

    await ensureExecuteArtifacts(executeFilePath)

    await expect(readFile(executeFilePath, 'utf8')).resolves.toBe(executeContent)
    await expect(readFile(schemaPath, 'utf8')).resolves.toBe(schemaContent)
  })
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-exec-schema-test-'))
  tempDirs.push(dir)
  return dir
}
