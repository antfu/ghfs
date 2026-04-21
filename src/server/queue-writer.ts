import type { PendingOp } from '../execute/types'
import type { BuildQueueStateOptions } from './queue-builder'
import type { QueueState } from './types'
import { writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { EXECUTE_MD_FILE_NAME } from '../constants'
import { ensureExecuteArtifacts } from '../execute/schema'
import { readExecuteMdFile, stringifyExecuteMd } from '../execute/sources/execute-md'
import { readAndValidateExecuteFileWithSource, writeExecuteFile } from '../execute/validate'
import { pathExists } from '../utils/fs'
import { buildQueueState } from './queue-builder'

export async function addQueueOp(options: BuildQueueStateOptions, op: PendingOp): Promise<QueueState> {
  await ensureExecuteArtifacts(options.executeFilePath)
  const current = await readAndValidateExecuteFileWithSource(options.executeFilePath)
  await writeExecuteFile(options.executeFilePath, [...current.ops, op])
  return buildQueueState(options)
}

export async function removeQueueOp(options: BuildQueueStateOptions, id: string): Promise<QueueState> {
  const queue = await buildQueueState(options)
  const entry = queue.entries.find(e => e.id === id)
  if (!entry)
    throw new Error(`Queue entry not found: ${id}`)

  if (entry.source === 'per-item') {
    throw new Error(
      `Cannot remove a per-item edit from the queue. Edit ${entry.filePath ?? 'the markdown file'} directly to adjust it.`,
    )
  }

  if (entry.source === 'execute.yml') {
    const current = await readAndValidateExecuteFileWithSource(options.executeFilePath)
    const next = current.ops.filter((_, index) => index !== entry.index)
    await writeExecuteFile(options.executeFilePath, next)
    return buildQueueState(options)
  }

  const mdPath = join(options.storageDirAbsolute, EXECUTE_MD_FILE_NAME)
  if (!await pathExists(mdPath))
    throw new Error('execute.md not found; cannot remove op')

  const parsed = await readExecuteMdFile(mdPath)
  const remaining = new Set<number>()
  for (let i = 0; i < parsed.ops.length; i += 1) {
    if (i !== entry.index)
      remaining.add(i)
  }
  await writeFile(mdPath, stringifyExecuteMd(parsed, remaining), 'utf-8')
  return buildQueueState(options)
}

export async function updateQueueOp(options: BuildQueueStateOptions, id: string, op: PendingOp): Promise<QueueState> {
  const queue = await buildQueueState(options)
  const entry = queue.entries.find(e => e.id === id)
  if (!entry)
    throw new Error(`Queue entry not found: ${id}`)

  if (entry.source !== 'execute.yml')
    throw new Error(`Cannot edit ${entry.source} ops from the queue panel`)

  const current = await readAndValidateExecuteFileWithSource(options.executeFilePath)
  const next = current.ops.map((existing, index) => (index === entry.index ? op : existing))
  await writeExecuteFile(options.executeFilePath, next)
  return buildQueueState(options)
}

export async function clearQueue(options: BuildQueueStateOptions): Promise<QueueState> {
  await ensureExecuteArtifacts(options.executeFilePath)
  await writeExecuteFile(options.executeFilePath, [])
  return buildQueueState(options)
}
