import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { EXECUTE_MD_FILE_NAME, EXECUTE_SCHEMA_RELATIVE_PATH } from '../constants'
import { pathExists } from '../utils/fs'
import { ACTION_INPUTS } from './actions'

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
        enum: [...ACTION_INPUTS],
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
  '# Add operations as YAML list items, then run: `ghfs execute`, examples:',
  '#',
  '# - action: close',
  '#   number: 123',
  '',
].join('\n')

export const EXECUTE_MD_FILE_PLACEHOLDER = [
  '<!-- Add one action per line, then run: `ghfs execute`, examples: -->',
  '',
  '<!-- close #123 #124 -->',
  '<!-- label #123 bug, triage -->',
  '<!-- assign #123 antfu -->',
  '<!-- comment #123 "Need more context" -->',
  '<!-- close-comment #123 "Closing as completed" -->',
  '<!-- set-title #123 "new title" -->',
  '<!-- add-tag #123 foo, bar -->',
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
