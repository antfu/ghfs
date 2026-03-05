import type { PendingFile, PendingOp } from './types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'pathe'
import * as v from 'valibot'
import { parse, stringify } from 'yaml'

const ACTIONS = [
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
] as const

const LOCK_REASONS = ['resolved', 'off-topic', 'too heated', 'too-heated', 'spam'] as const

const executeOpSchema = v.looseObject({
  number: v.number(),
  action: v.picklist(ACTIONS),
  ifUnchangedSince: v.optional(v.string()),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  labels: v.optional(v.array(v.string())),
  assignees: v.optional(v.array(v.string())),
  milestone: v.optional(v.union([v.string(), v.number()])),
  reviewers: v.optional(v.array(v.string())),
  reason: v.optional(v.picklist(LOCK_REASONS)),
})

const executeFileSchema = v.array(executeOpSchema)

export async function readAndValidateExecuteFile(path: string): Promise<PendingFile> {
  const raw = await readFile(path, 'utf8')
  let parsed: unknown
  try {
    parsed = parse(raw)
  }
  catch (error) {
    throw new Error(`Failed to parse execute YAML: ${(error as Error).message}`)
  }

  const parsedResult = v.safeParse(executeFileSchema, parsed)
  if (!parsedResult.success) {
    const message = parsedResult.issues
      .map((issue) => {
        const path = issue.path?.map(segment => String(segment.key)).join('.')
        return `${path ? `${path}: ` : ''}${issue.message}`
      })
      .join('; ')
    throw new Error(`Invalid execute file: ${message}`)
  }

  const pending = parsedResult.output as PendingFile
  const customErrors = validateExecuteRules(pending)
  if (customErrors.length)
    throw new Error(`Invalid execute file: ${customErrors.join('; ')}`)

  return pending
}

export async function writeExecuteFile(path: string, pending: PendingFile): Promise<void> {
  const content = stringify(pending)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

export function validateExecuteRules(pending: PendingFile): string[] {
  const errors: string[] = []

  for (const [index, op] of pending.entries()) {
    const key = `[${index}]`
    errors.push(...validateOperationRules(key, op))
  }

  return errors
}

function validateOperationRules(key: string, op: PendingOp): string[] {
  const errors: string[] = []

  if (!Number.isInteger(op.number) || op.number <= 0)
    errors.push(`${key}: number must be a positive integer`)

  switch (op.action) {
    case 'set-title':
      if (!isNonEmptyString(op.title))
        errors.push(`${key}: set-title requires title`)
      break

    case 'set-body':
    case 'add-comment':
      if (!isNonEmptyString(op.body))
        errors.push(`${key}: ${op.action} requires body`)
      break

    case 'add-labels':
    case 'remove-labels':
    case 'set-labels':
      if (!isStringArray(op.labels))
        errors.push(`${key}: ${op.action} requires labels[]`)
      break

    case 'add-assignees':
    case 'remove-assignees':
    case 'set-assignees':
      if (!isStringArray(op.assignees))
        errors.push(`${key}: ${op.action} requires assignees[]`)
      break

    case 'set-milestone':
      if (!(typeof op.milestone === 'string' || typeof op.milestone === 'number'))
        errors.push(`${key}: set-milestone requires milestone`)
      break

    case 'request-reviewers':
    case 'remove-reviewers':
      if (!isStringArray(op.reviewers))
        errors.push(`${key}: ${op.action} requires reviewers[]`)
      break

    default:
      break
  }

  if (op.ifUnchangedSince && Number.isNaN(Date.parse(op.ifUnchangedSince)))
    errors.push(`${key}: ifUnchangedSince must be a valid datetime`)

  return errors
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string') && value.length > 0
}
