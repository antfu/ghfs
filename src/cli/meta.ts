import c from 'ansis'
import { GHFS_NAME, GHFS_VERSION } from '../meta'

export const CLI_NAME = GHFS_NAME
export const CLI_VERSION = GHFS_VERSION

export function ASCII_HEADER(repo: string) {
  return c.gray([
    '      _   ___     ',
    '  ___| |_|  _|___ ',
    ` | . |   |  _|_ -|  ${c.green.bold(CLI_NAME)} ${c.blue(`v${CLI_VERSION}`)}`,
    ` |_  |_|_|_| |___|  → ${repo}`,
    ' |___|            ',
    '',
  ].join('\n'))
}

export function toGitHubRepoUrl(repo: string): string {
  return `https://github.com/${repo}`
}
