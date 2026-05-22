import { rm } from 'node:fs/promises'
import { join } from 'pathe'
import {
  EXECUTE_MD_FILE_NAME,
  ISSUE_DIR_NAME,
  ISSUES_INDEX_FILE_NAME,
  PULL_DIR_NAME,
  PULLS_INDEX_FILE_NAME,
  REPO_SNAPSHOT_FILE_NAME,
  SYNC_STATE_FILE_NAME,
} from '../constants'

const ENTRIES_TO_REMOVE = [
  SYNC_STATE_FILE_NAME,
  REPO_SNAPSHOT_FILE_NAME,
  ISSUES_INDEX_FILE_NAME,
  PULLS_INDEX_FILE_NAME,
  EXECUTE_MD_FILE_NAME,
  ISSUE_DIR_NAME,
  PULL_DIR_NAME,
] as const

export async function forceSyncStorage(storageDirAbsolute: string): Promise<void> {
  await Promise.all(
    ENTRIES_TO_REMOVE.map(entry =>
      rm(join(storageDirAbsolute, entry), { recursive: true, force: true }),
    ),
  )
}
