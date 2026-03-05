export const CONFIG_FILE_CANDIDATES = [
  'ghfs.config.ts',
  'ghfs.config.mts',
  'ghfs.config.mjs',
  'ghfs.config.js',
  'ghfs.config.cjs',
] as const

export const DEFAULT_STORAGE_DIR = '.ghfs'

export const ISSUE_DIR_NAME = 'issues'
export const PULL_DIR_NAME = 'pulls'
export const CLOSED_DIR_NAME = 'closed'
export const SYNC_STATE_FILE_NAME = '.sync.json'
export const ISSUES_INDEX_FILE_NAME = 'issues.md'
export const PULLS_INDEX_FILE_NAME = 'pulls.md'
export const REPO_SNAPSHOT_FILE_NAME = 'repo.json'
export const EXECUTE_FILE_NAME = 'execute.yml'
export const EXECUTE_MD_FILE_NAME = 'execute.md'
export const DETAILS_MD_FILE_NAME = 'details.md'
export const EXECUTE_SCHEMA_RELATIVE_PATH = 'schema/execute.schema.json'
