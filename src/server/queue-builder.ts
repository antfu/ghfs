import type { PendingOp } from '../execute/types'
import type { QueueEntry, QueueSource, QueueState } from './types'
import { hash } from 'ohash'
import { join } from 'pathe'
import { EXECUTE_MD_FILE_NAME } from '../constants'
import { readExecuteMdFile } from '../execute/sources/execute-md'
import { loadPerItemSource } from '../execute/sources/per-item'
import { readAndValidateExecuteFileWithSource } from '../execute/validate'
import { loadSyncState } from '../sync/state'
import { pathExists } from '../utils/fs'

export interface BuildQueueStateOptions {
  storageDirAbsolute: string
  executeFilePath: string
}

export async function buildQueueState(options: BuildQueueStateOptions): Promise<QueueState> {
  const { storageDirAbsolute, executeFilePath } = options
  const executeMdPath = join(storageDirAbsolute, EXECUTE_MD_FILE_NAME)
  const [yml, md, perItem, syncState] = await Promise.all([
    readYmlOps(executeFilePath),
    readMdOps(executeMdPath),
    loadPerItemSource(storageDirAbsolute),
    loadSyncState(storageDirAbsolute),
  ])

  const entries: QueueEntry[] = []
  for (const [index, op] of yml.ops.entries())
    entries.push(buildEntry(op, 'execute.yml', index))
  for (const [index, op] of md.ops.entries())
    entries.push(buildEntry(op, 'execute.md', index))
  for (const [index, op] of perItem.ops.entries()) {
    const filePath = syncState.items[String(op.number)]?.filePath
    entries.push(buildEntry(op, 'per-item', index, filePath))
  }

  return {
    entries,
    warnings: [...yml.warnings, ...md.warnings, ...perItem.warnings],
    upCount: entries.length,
  }
}

async function readYmlOps(path: string): Promise<{ ops: PendingOp[], warnings: string[] }> {
  if (!await pathExists(path))
    return { ops: [], warnings: [] }
  try {
    const result = await readAndValidateExecuteFileWithSource(path)
    return { ops: result.ops, warnings: [] }
  }
  catch (error) {
    return { ops: [], warnings: [`execute.yml: ${(error as Error).message}`] }
  }
}

async function readMdOps(path: string): Promise<{ ops: PendingOp[], warnings: string[] }> {
  const parsed = await readExecuteMdFile(path)
  return { ops: parsed.ops, warnings: parsed.warnings }
}

function buildEntry(op: PendingOp, source: QueueSource, index: number, filePath?: string): QueueEntry {
  return {
    id: hash({ source, index, action: op.action, number: op.number }),
    source,
    index,
    op,
    filePath,
  }
}
