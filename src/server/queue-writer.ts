import type { PendingOp } from '../execute/types'
import type { BuildQueueStateOptions } from './queue-builder'
import type { QueueState } from './types'
import { writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { EXECUTE_MD_FILE_NAME } from '../constants'
import { compressOps } from '../execute/compress'
import { ensureExecuteArtifacts } from '../execute/schema'
import { readExecuteMdFile, stringifyExecuteMd } from '../execute/sources/execute-md'
import { readAndValidateExecuteFileWithSource, writeExecuteFile } from '../execute/validate'
import { CodedError, log } from '../logger'
import { pathExists } from '../utils/fs'
import { buildQueueState } from './queue-builder'

export async function addQueueOp(options: BuildQueueStateOptions, op: PendingOp): Promise<QueueState> {
  await ensureExecuteArtifacts(options.executeFilePath)
  const current = await readAndValidateExecuteFileWithSource(options.executeFilePath)
  const next = compressOps([...current.ops, op])
  await writeExecuteFile(options.executeFilePath, next)
  return buildQueueState(options)
}

export async function removeQueueOp(options: BuildQueueStateOptions, id: string): Promise<QueueState> {
  const queue = await buildQueueState(options)
  const entry = queue.entries.find(e => e.id === id)
  if (!entry)
    throw new CodedError(log.GHFS_E0202({ id }))

  if (entry.source === 'per-item') {
    throw new CodedError(log.GHFS_E0203({
      target: entry.filePath ?? 'the markdown file',
    }))
  }

  if (entry.source === 'execute.yml') {
    const current = await readAndValidateExecuteFileWithSource(options.executeFilePath)
    const next = current.ops.filter((_, index) => index !== entry.index)
    await writeExecuteFile(options.executeFilePath, next)
    return buildQueueState(options)
  }

  const mdPath = join(options.storageDirAbsolute, EXECUTE_MD_FILE_NAME)
  if (!await pathExists(mdPath))
    throw new CodedError(log.GHFS_E0204())

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
    throw new CodedError(log.GHFS_E0202({ id }))

  if (entry.source !== 'execute.yml')
    throw new CodedError(log.GHFS_E0205({ source: entry.source }))

  const current = await readAndValidateExecuteFileWithSource(options.executeFilePath)
  const replaced = current.ops.map((existing, index) => (index === entry.index ? op : existing))
  await writeExecuteFile(options.executeFilePath, compressOps(replaced))
  return buildQueueState(options)
}

export async function clearQueue(options: BuildQueueStateOptions): Promise<QueueState> {
  await ensureExecuteArtifacts(options.executeFilePath)
  await writeExecuteFile(options.executeFilePath, [])
  return buildQueueState(options)
}
