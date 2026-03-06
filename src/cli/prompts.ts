import type { ExecutePrompts } from '../execute'
import type { PendingOp } from '../execute/types'
import type { RepoDetectionCandidate } from '../types'
import { cancel, confirm, isCancel, multiselect, password, select } from '@clack/prompts'
import { describeCliOperation } from './action-color'

export async function promptForToken(): Promise<string | undefined> {
  const result = await password({
    message: 'Enter a GitHub token (PAT) for ghfs:',
    validate: value => value?.trim().length ? undefined : 'Token is required',
  })

  if (isCancel(result)) {
    cancel('Token prompt cancelled')
    return undefined
  }

  return result.trim()
}

export async function promptRepoChoice(
  gitCandidate: RepoDetectionCandidate,
  pkgCandidate: RepoDetectionCandidate,
): Promise<string | undefined> {
  const result = await select<string>({
    message: 'Detected conflicting GitHub repositories. Which one should ghfs use?',
    options: [
      {
        label: `${gitCandidate.repo} (${gitCandidate.detail})`,
        value: gitCandidate.repo,
      },
      {
        label: `${pkgCandidate.repo} (${pkgCandidate.detail})`,
        value: pkgCandidate.repo,
      },
    ],
    initialValue: gitCandidate.repo,
  })

  if (isCancel(result)) {
    cancel('Repository selection cancelled')
    return undefined
  }

  return result
}

export interface CreateExecutePromptsOptions {
  repo?: string
}

export function createExecutePrompts(options: CreateExecutePromptsOptions = {}): ExecutePrompts {
  return {
    selectOperations: ops => promptExecuteOperations(ops, options),
    confirmApply: confirmExecuteApply,
  }
}

async function promptExecuteOperations(ops: PendingOp[], options: CreateExecutePromptsOptions): Promise<number[] | undefined> {
  const selectedByDefault = ops.map((_, index) => index)
  const result = await multiselect<number>({
    message: 'Select operations to include',
    options: ops.map((op, index) => ({
      label: describeCliOperation(op, { tty: true, repo: options.repo }),
      value: index,
    })),
    initialValues: selectedByDefault,
    required: false,
  })

  if (isCancel(result)) {
    cancel('Operation selection cancelled')
    return undefined
  }

  return [...result]
}

async function confirmExecuteApply(count: number): Promise<boolean | undefined> {
  const result = await confirm({
    message: `Run ${count} ${count === 1 ? 'operation' : 'operations'} on GitHub?`,
    initialValue: false,
  })

  if (isCancel(result)) {
    cancel('Execution cancelled')
    return undefined
  }

  return result
}
