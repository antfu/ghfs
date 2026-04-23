import type { PendingFile, PendingOp } from './types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'pathe'
import * as v from 'valibot'
import { parse, stringify } from 'yaml'
import { CodedError, log } from '../logger'
import { resolveActionName } from './actions'

const LOCK_REASONS = ['resolved', 'off-topic', 'too heated', 'too-heated', 'spam'] as const

const executeOpSchema = v.looseObject({
  number: v.number(),
  action: v.string(),
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
  const { ops } = await readAndValidateExecuteFileWithSource(path)
  return ops
}

export interface ReadAndValidateExecuteFileResult {
  ops: PendingFile
  sourceActions: string[]
}

export async function readAndValidateExecuteFileWithSource(path: string): Promise<ReadAndValidateExecuteFileResult> {
  const raw = await readFile(path, 'utf8')
  let parsed: unknown
  try {
    parsed = parse(raw || '[]') || []
  }
  catch (error) {
    throw new CodedError(log.GHFS_E0105({ detail: (error as Error).message }, { cause: error }))
  }

  const parsedResult = v.safeParse(executeFileSchema, parsed)
  if (!parsedResult.success) {
    const message = parsedResult.issues
      .map((issue) => {
        const path = issue.path?.map(segment => String(segment.key)).join('.')
        return `${path ? `${path}: ` : ''}${issue.message}`
      })
      .join('; ')
    throw new CodedError(log.GHFS_E0106({ detail: message }))
  }

  const { pending, sourceActions, actionErrors } = normalizeActionInputs(parsedResult.output as ExecuteInputFile)
  if (actionErrors.length)
    throw new CodedError(log.GHFS_E0107({ detail: actionErrors.join('; ') }))

  const customErrors = validateExecuteRules(pending)
  if (customErrors.length)
    throw new CodedError(log.GHFS_E0108({ detail: customErrors.join('; ') }))

  return {
    ops: pending,
    sourceActions,
  }
}

export type ExecuteWritableOp = Omit<PendingOp, 'action'> & { action: string }
export type ExecuteWritableFile = ExecuteWritableOp[]

export async function writeExecuteFile(path: string, pending: ExecuteWritableFile): Promise<void> {
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
    case 'close-with-comment':
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

interface ExecuteInputOp extends Omit<ExecuteWritableOp, 'action'> {
  action: string
}

type ExecuteInputFile = ExecuteInputOp[]

function normalizeActionInputs(pending: ExecuteInputFile): {
  pending: PendingFile
  sourceActions: string[]
  actionErrors: string[]
} {
  const normalized: PendingFile = []
  const sourceActions: string[] = []
  const actionErrors: string[] = []

  for (const [index, op] of pending.entries()) {
    const sourceAction = op.action
    sourceActions.push(sourceAction)

    const action = resolveActionName(sourceAction)
    if (!action) {
      actionErrors.push(`[${index}]: unknown action: ${sourceAction}`)
      continue
    }

    normalized.push({
      ...op,
      action,
    } as PendingOp)
  }

  return {
    pending: normalized,
    sourceActions,
    actionErrors,
  }
}
