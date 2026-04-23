import type { RepoDetectionCandidate, RepoResolutionResult } from '../types'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { CodedError, log } from '../logger'
import { pathExists } from '../utils/fs'

const execFileAsync = promisify(execFile)

export interface ResolveRepoOptions {
  cwd: string
  cliRepo?: string
  configRepo?: string
  interactive: boolean
  selectRepoChoice?: (gitCandidate: RepoDetectionCandidate, pkgCandidate: RepoDetectionCandidate) => Promise<string | undefined>
}

export async function resolveRepo(options: ResolveRepoOptions): Promise<RepoResolutionResult> {
  if (options.cliRepo) {
    const repo = normalizeRepo(options.cliRepo)
    if (!repo)
      throw new CodedError(log.GHFS_E0010({ value: options.cliRepo }))
    return {
      repo,
      source: 'cli',
      candidates: [],
    }
  }

  if (options.configRepo) {
    const repo = normalizeRepo(options.configRepo)
    if (!repo)
      throw new CodedError(log.GHFS_E0011({ value: options.configRepo }))
    return {
      repo,
      source: 'config',
      candidates: [],
    }
  }

  const candidates: RepoDetectionCandidate[] = []
  const gitCandidate = await detectRepoFromGit(options.cwd)
  const pkgCandidate = await detectRepoFromPackageJson(options.cwd)

  if (gitCandidate)
    candidates.push(gitCandidate)
  if (pkgCandidate)
    candidates.push(pkgCandidate)

  if (gitCandidate && pkgCandidate && gitCandidate.repo !== pkgCandidate.repo) {
    if (options.interactive && process.stdin.isTTY && options.selectRepoChoice) {
      const repo = await options.selectRepoChoice(gitCandidate, pkgCandidate)
      if (!repo)
        throw new CodedError(log.GHFS_E0012())

      const normalizedRepo = normalizeRepo(repo)
      if (!normalizedRepo || (normalizedRepo !== gitCandidate.repo && normalizedRepo !== pkgCandidate.repo))
        throw new CodedError(log.GHFS_E0013({ value: repo }))

      return {
        repo: normalizedRepo,
        source: normalizedRepo === gitCandidate.repo ? 'git' : 'package-json',
        candidates,
      }
    }
    throw new CodedError(log.GHFS_E0014({ gitRepo: gitCandidate.repo, pkgRepo: pkgCandidate.repo }))
  }

  if (gitCandidate) {
    return {
      repo: gitCandidate.repo,
      source: 'git',
      candidates,
    }
  }

  if (pkgCandidate) {
    return {
      repo: pkgCandidate.repo,
      source: 'package-json',
      candidates,
    }
  }

  throw new CodedError(log.GHFS_E0015())
}

export function normalizeRepo(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed)
    return undefined

  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (shortMatch)
    return `${shortMatch[1]}/${stripGitSuffix(shortMatch[2])}`

  const githubPrefixMatch = trimmed.match(/^github:([\w.-]+)\/([\w.-]+)$/)
  if (githubPrefixMatch)
    return `${githubPrefixMatch[1]}/${stripGitSuffix(githubPrefixMatch[2])}`

  const sshScpMatch = trimmed.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (sshScpMatch)
    return `${sshScpMatch[1]}/${stripGitSuffix(sshScpMatch[2])}`

  try {
    const url = new URL(trimmed)
    if (url.hostname !== 'github.com')
      return undefined
    const segments = url.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (segments.length < 2)
      return undefined
    return `${segments[0]}/${stripGitSuffix(segments[1])}`
  }
  catch {
    return undefined
  }
}

async function detectRepoFromGit(cwd: string): Promise<RepoDetectionCandidate | undefined> {
  let stdout: string
  try {
    const result = await execFileAsync('git', ['remote'], { cwd })
    stdout = result.stdout
  }
  catch {
    return undefined
  }

  const remotes = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (!remotes.length)
    return undefined

  const orderedRemotes = prioritizeRemotes(remotes)
  for (const remote of orderedRemotes) {
    try {
      const result = await execFileAsync('git', ['remote', 'get-url', remote], { cwd })
      const repo = normalizeRepo(result.stdout.trim())
      if (repo) {
        return {
          source: 'git',
          repo,
          detail: `remote:${remote}`,
        }
      }
    }
    catch {
      continue
    }
  }

  return undefined
}

async function detectRepoFromPackageJson(cwd: string): Promise<RepoDetectionCandidate | undefined> {
  const path = `${cwd}/package.json`
  if (!await pathExists(path))
    return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  }
  catch {
    return undefined
  }

  if (!parsed || typeof parsed !== 'object')
    return undefined

  const repository = (parsed as Record<string, unknown>).repository

  if (typeof repository === 'string') {
    const repo = normalizeRepo(repository)
    if (repo) {
      return {
        source: 'package-json',
        repo,
        detail: 'package.json#repository',
      }
    }
  }

  if (repository && typeof repository === 'object') {
    const url = (repository as Record<string, unknown>).url
    if (typeof url === 'string') {
      const repo = normalizeRepo(url)
      if (repo) {
        return {
          source: 'package-json',
          repo,
          detail: 'package.json#repository.url',
        }
      }
    }
  }

  return undefined
}

function prioritizeRemotes(remotes: string[]): string[] {
  const unique = [...new Set(remotes)]
  const priority = ['origin', 'upstream']
  const prioritized = priority.filter(name => unique.includes(name))
  const rest = unique.filter(name => !priority.includes(name))
  return [...prioritized, ...rest]
}

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/, '')
}
