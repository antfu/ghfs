import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { EXECUTE_MD_FILE_NAME, EXECUTE_SCHEMA_RELATIVE_PATH } from '../constants'
import { pathExists } from '../utils/fs'

export const executeSchema = {
  $id: 'https://ghfs.dev/schema/execute.json',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: true,
    required: ['number', 'action'],
    properties: {
      number: { type: 'number' },
      action: {
        type: 'string',
        enum: [
          'close',
          'reopen',
          'set-title',
          'set-body',
          'add-comment',
          'add-labels',
          'remove-labels',
          'set-labels',
          'add-assignees',
          'remove-assignees',
          'set-assignees',
          'set-milestone',
          'clear-milestone',
          'lock',
          'unlock',
          'request-reviewers',
          'remove-reviewers',
          'mark-ready-for-review',
          'convert-to-draft',
        ],
      },
      ifUnchangedSince: {
        type: 'string',
        format: 'date-time',
      },
      title: { type: 'string' },
      body: { type: 'string' },
      labels: {
        type: 'array',
        items: { type: 'string' },
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
      },
      milestone: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      reviewers: {
        type: 'array',
        items: { type: 'string' },
      },
      reason: {
        type: 'string',
        enum: ['resolved', 'off-topic', 'too heated', 'too-heated', 'spam'],
      },
    },
  },
} as const

export const EXECUTE_FILE_PLACEHOLDER = [
  `# yaml-language-server: $schema=./${EXECUTE_SCHEMA_RELATIVE_PATH}`,
  '# Add operations as YAML list items, then run: ghfs execute --run',
  '# - action: close',
  '#   number: 123',
  '[]',
  '',
].join('\n')

export const EXECUTE_MD_FILE_PLACEHOLDER = [
  '# Add one action per line, then run: ghfs execute --run',
  '# close #123 #124',
  '# set-title #123 "new title"',
  '# add-tag #123 foo, bar',
  '',
].join('\n')

export async function writeExecuteSchema(storageDirAbsolute: string): Promise<string> {
  const schemaPath = getExecuteSchemaPath(storageDirAbsolute)
  await mkdir(dirname(schemaPath), { recursive: true })
  await writeFile(schemaPath, `${JSON.stringify(executeSchema, null, 2)}\n`, 'utf8')
  return schemaPath
}

export async function ensureExecuteArtifacts(executeFilePath: string): Promise<{
  executeFilePath: string
  schemaPath: string
}> {
  const storageDirAbsolute = dirname(executeFilePath)
  const [schemaPath] = await Promise.all([
    ensureExecuteSchema(storageDirAbsolute),
    ensureExecuteFile(executeFilePath),
    ensureExecuteMdFile(storageDirAbsolute),
  ])

  return {
    executeFilePath,
    schemaPath,
  }
}

async function ensureExecuteSchema(storageDirAbsolute: string): Promise<string> {
  const schemaPath = getExecuteSchemaPath(storageDirAbsolute)
  if (await pathExists(schemaPath))
    return schemaPath

  return writeExecuteSchema(storageDirAbsolute)
}

async function ensureExecuteFile(executeFilePath: string): Promise<void> {
  if (await pathExists(executeFilePath))
    return

  await mkdir(dirname(executeFilePath), { recursive: true })
  await writeFile(executeFilePath, EXECUTE_FILE_PLACEHOLDER, 'utf8')
}

async function ensureExecuteMdFile(storageDirAbsolute: string): Promise<void> {
  const executeMdPath = join(storageDirAbsolute, EXECUTE_MD_FILE_NAME)
  if (await pathExists(executeMdPath))
    return

  await mkdir(dirname(executeMdPath), { recursive: true })
  await writeFile(executeMdPath, EXECUTE_MD_FILE_PLACEHOLDER, 'utf8')
}

export function getExecuteSchemaPath(storageDirAbsolute: string): string {
  return join(storageDirAbsolute, EXECUTE_SCHEMA_RELATIVE_PATH)
}
