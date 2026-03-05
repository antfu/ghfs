import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureExecuteArtifacts, EXECUTE_FILE_PLACEHOLDER, getExecuteSchemaPath } from './schema'
import { readAndValidateExecuteFile } from './validate'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('ensureExecuteArtifacts', () => {
  it('creates execute file and schema when missing', async () => {
    const dir = await createTempDir()
    const executeFilePath = join(dir, 'execute.yml')
    const { schemaPath } = await ensureExecuteArtifacts(executeFilePath)

    expect(schemaPath).toBe(getExecuteSchemaPath(dir))
    await expect(readFile(executeFilePath, 'utf8')).resolves.toBe(EXECUTE_FILE_PLACEHOLDER)
    await expect(readAndValidateExecuteFile(executeFilePath)).resolves.toEqual([])
    await expect(readFile(schemaPath, 'utf8')).resolves.toContain('"$id": "https://ghfs.dev/schema/execute.json"')
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
