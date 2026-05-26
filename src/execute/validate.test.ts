import type { PendingFile } from './types'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'
import { readAndValidateExecuteFile, validateExecuteRules, writeExecuteFile } from './validate'

describe('validateExecuteRules', () => {
  it('passes a valid execute array', () => {
    const execute: PendingFile = [
      {
        number: 1,
        action: 'set-title',
        title: 'new title',
      },
    ]

    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('fails when required fields are missing for action payload', () => {
    const execute = [
      {
        number: 1,
        action: 'request-reviewers',
      },
    ] as PendingFile

    expect(validateExecuteRules(execute)).toContain('[0]: request-reviewers requires reviewers[]')
  })

  it('fails when close-with-comment body is missing', () => {
    const execute = [
      {
        number: 1,
        action: 'close-with-comment',
      },
    ] as PendingFile

    expect(validateExecuteRules(execute)).toContain('[0]: close-with-comment requires body')
  })

  it('fails for invalid datetime in ifUnchangedSince', () => {
    const execute: PendingFile = [
      {
        number: 1,
        action: 'close',
        ifUnchangedSince: 'not-a-date',
      },
    ]

    expect(validateExecuteRules(execute)).toContain('[0]: ifUnchangedSince must be a valid datetime')
  })

  it('fails for non-positive issue number', () => {
    const execute: PendingFile = [
      {
        number: 0,
        action: 'close',
      },
    ]

    expect(validateExecuteRules(execute)).toContain('[0]: number must be a positive integer')
  })

  it('accepts a valid add-reaction op on an item', () => {
    const execute: PendingFile = [
      { number: 5, action: 'add-reaction', reaction: 'heart' },
    ]
    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('accepts add-reaction with a comment target', () => {
    const execute: PendingFile = [
      { number: 5, action: 'add-reaction', reaction: '+1', target: { kind: 'comment', commentId: 123 } },
    ]
    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('accepts remove-reaction with a review target', () => {
    const execute: PendingFile = [
      { number: 5, action: 'remove-reaction', reaction: 'rocket', target: { kind: 'review', reviewId: 'PRR_abc' } },
    ]
    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('fails when add-reaction is missing reaction', () => {
    const execute = [{ number: 5, action: 'add-reaction' }] as unknown as PendingFile
    const errors = validateExecuteRules(execute)
    expect(errors.some(e => e.includes('add-reaction requires reaction'))).toBe(true)
  })

  it('fails for invalid comment target on add-reaction', () => {
    const execute = [
      { number: 5, action: 'add-reaction', reaction: 'heart', target: { kind: 'comment', commentId: -1 } },
    ] as unknown as PendingFile
    expect(validateExecuteRules(execute)).toContain('[0]: add-reaction target.commentId must be a positive integer')
  })

  it('fails for empty reviewId on review target', () => {
    const execute = [
      { number: 5, action: 'add-reaction', reaction: 'heart', target: { kind: 'review', reviewId: '' } },
    ] as unknown as PendingFile
    expect(validateExecuteRules(execute)).toContain('[0]: add-reaction target.reviewId must be a non-empty string')
  })

  it('accepts approve without a body', () => {
    const execute: PendingFile = [{ number: 1, action: 'approve' }]
    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('accepts approve with a body', () => {
    const execute: PendingFile = [{ number: 1, action: 'approve', body: 'LGTM' }]
    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('fails when request-changes is missing a body', () => {
    const execute = [{ number: 1, action: 'request-changes' }] as PendingFile
    expect(validateExecuteRules(execute)).toContain('[0]: request-changes requires body')
  })

  it('fails when review-comment is missing a body', () => {
    const execute = [{ number: 1, action: 'review-comment' }] as PendingFile
    expect(validateExecuteRules(execute)).toContain('[0]: review-comment requires body')
  })

  it('accepts merge with default method', () => {
    const execute: PendingFile = [{ number: 1, action: 'merge' }]
    expect(validateExecuteRules(execute)).toEqual([])
  })

  it('accepts merge with an allowed method', () => {
    for (const method of ['squash', 'merge', 'rebase'] as const) {
      const execute: PendingFile = [{ number: 1, action: 'merge', method }]
      expect(validateExecuteRules(execute)).toEqual([])
    }
  })

  it('fails when merge method is invalid', () => {
    const execute = [{ number: 1, action: 'merge', method: 'cherry-pick' }] as unknown as PendingFile
    const errors = validateExecuteRules(execute)
    expect(errors.some(e => e.includes('merge method must be one of'))).toBe(true)
  })
})

describe('readAndValidateExecuteFile', () => {
  it('parses a valid execute file', async () => {
    const file = await createTempExecuteFile(`- action: close\n  number: 1\n`)
    await expect(readAndValidateExecuteFile(file)).resolves.toEqual([
      {
        action: 'close',
        number: 1,
      },
    ])
    await cleanupTempFile(file)
  })

  it('accepts case-insensitive canonical and alias actions', async () => {
    const file = await createTempExecuteFile([
      '- action: ClOsE',
      '  number: 1',
      '- action: LaBeL',
      '  number: 2',
      '  labels: [bug]',
      '- action: COMMENT-AND-CLOSE',
      '  number: 3',
      '  body: done',
      '',
    ].join('\n'))

    await expect(readAndValidateExecuteFile(file)).resolves.toEqual([
      {
        action: 'close',
        number: 1,
      },
      {
        action: 'add-labels',
        number: 2,
        labels: ['bug'],
      },
      {
        action: 'close-with-comment',
        number: 3,
        body: 'done',
      },
    ])
    await cleanupTempFile(file)
  })

  it('throws for unknown mixed-case action', async () => {
    const file = await createTempExecuteFile(`- action: UnKnOwN\n  number: 1\n`)
    await expect(readAndValidateExecuteFile(file)).rejects.toThrow(/unknown action: UnKnOwN/)
    await cleanupTempFile(file)
  })

  it('throws for invalid yaml syntax', async () => {
    const file = await createTempExecuteFile(`- action: close\n  number: [\n`)
    await expect(readAndValidateExecuteFile(file)).rejects.toThrow(/Failed to parse execute YAML/)
    await cleanupTempFile(file)
  })

  it('throws for non-array root value', async () => {
    const file = await createTempExecuteFile(`action: close\nnumber: 1\n`)
    await expect(readAndValidateExecuteFile(file)).rejects.toThrow(/Invalid execute file/)
    await cleanupTempFile(file)
  })

  it('writes remaining operations back to execute file', async () => {
    const file = await createTempExecuteFile(`- action: close\n  number: 1\n`)
    const remaining: PendingFile = [
      {
        action: 'reopen',
        number: 2,
      },
      {
        action: 'set-title',
        number: 3,
        title: 'new title',
      },
    ]

    await writeExecuteFile(file, remaining)
    await expect(readAndValidateExecuteFile(file)).resolves.toEqual(remaining)
    await cleanupTempFile(file)
  })
})

async function createTempExecuteFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-exec-test-'))
  const file = join(dir, 'execute.yml')
  await writeFile(file, content, 'utf8')
  return file
}

async function cleanupTempFile(file: string): Promise<void> {
  const dir = file.slice(0, file.lastIndexOf('/'))
  await rm(dir, { recursive: true, force: true })
}
