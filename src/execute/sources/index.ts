import type { ExecuteLoadResult } from './types'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { EXECUTE_MD_FILE_NAME } from '../../constants'
import { pathExists } from '../../utils/fs'
import { readAndValidateExecuteFileWithSource, validateExecuteRules, writeExecuteFile } from '../validate'
import { readExecuteMdFile, stringifyExecuteMd } from './execute-md'
import { loadPerItemSource } from './per-item'

export async function loadExecuteSources(executeFilePath: string): Promise<ExecuteLoadResult> {
  const storageDir = dirname(executeFilePath)
  const executeMdPath = join(storageDir, EXECUTE_MD_FILE_NAME)

  const yml = await readAndValidateExecuteFileWithSource(executeFilePath)
  const ymlOps = yml.ops
  const executeMd = await readExecuteMdFile(executeMdPath)
  const perItem = await loadPerItemSource(storageDir)

  const mergedOps = [...ymlOps, ...executeMd.ops, ...perItem.ops]
  const entries = mergedOps.map((op, mergedIndex) => {
    if (mergedIndex < ymlOps.length) {
      return {
        op,
        source: 'execute.yml' as const,
        sourceIndex: mergedIndex,
        mergedIndex,
      }
    }

    const mdOffset = mergedIndex - ymlOps.length
    if (mdOffset < executeMd.ops.length) {
      return {
        op,
        source: 'execute.md' as const,
        sourceIndex: mdOffset,
        mergedIndex,
      }
    }

    return {
      op,
      source: 'per-item' as const,
      sourceIndex: mdOffset - executeMd.ops.length,
      mergedIndex,
    }
  })
  const customErrors = validateExecuteRules(mergedOps)
  if (customErrors.length)
    throw new Error(`Invalid execute file: ${customErrors.join('; ')}`)

  return {
    ops: mergedOps,
    entries,
    warnings: [...executeMd.warnings, ...perItem.warnings],
    async writeRemaining(remainingIndexes) {
      const ymlRemaining = ymlOps
        .map((op, index) => ({ op, index }))
        .filter(item => remainingIndexes.has(item.index))
        .map(({ op, index }) => ({
          ...op,
          action: yml.sourceActions[index] ?? op.action,
        }))
      await writeExecuteFile(executeFilePath, ymlRemaining)

      if (!await pathExists(executeMdPath))
        return

      const mdOffset = ymlOps.length
      const mdRemaining = new Set<number>()
      for (const index of remainingIndexes) {
        if (index >= mdOffset && index < mdOffset + executeMd.ops.length)
          mdRemaining.add(index - mdOffset)
      }
      await writeFile(executeMdPath, stringifyExecuteMd(executeMd, mdRemaining), 'utf-8')
    },
  }
}
