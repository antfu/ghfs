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
