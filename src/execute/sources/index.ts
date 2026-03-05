import type { ExecuteLoadResult } from './types'
import { dirname, join } from 'pathe'
import { EXECUTE_MD_FILE_NAME } from '../../constants'
import { pathExists } from '../../utils/fs'
import { readAndValidateExecuteFile, validateExecuteRules, writeExecuteFile } from '../validate'
import { readExecuteMdFile, writeExecuteMdFile } from './execute-md'
import { loadPerItemSource } from './per-item'

export async function loadExecuteSources(executeFilePath: string): Promise<ExecuteLoadResult> {
  const storageDir = dirname(executeFilePath)
  const executeMdPath = join(storageDir, EXECUTE_MD_FILE_NAME)

  const ymlOps = await readAndValidateExecuteFile(executeFilePath)
  const executeMd = await readExecuteMdFile(executeMdPath)
  const perItem = await loadPerItemSource(storageDir)

  const mergedOps = [...ymlOps, ...executeMd.ops, ...perItem.ops]
  const customErrors = validateExecuteRules(mergedOps)
  if (customErrors.length)
    throw new Error(`Invalid execute file: ${customErrors.join('; ')}`)

  return {
    ops: mergedOps,
    warnings: [...executeMd.warnings, ...perItem.warnings],
    async writeRemaining(remainingIndexes) {
      const ymlRemaining = ymlOps.filter((_, index) => remainingIndexes.has(index))
      await writeExecuteFile(executeFilePath, ymlRemaining)

      if (!await pathExists(executeMdPath))
        return

      const mdOffset = ymlOps.length
      const mdRemaining = new Set<number>()
      for (const index of remainingIndexes) {
        if (index >= mdOffset)
          mdRemaining.add(index - mdOffset)
      }
      await writeExecuteMdFile(executeMdPath, executeMd, mdRemaining)
    },
  }
}
