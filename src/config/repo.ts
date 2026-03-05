import type { RepoDetectionCandidate, RepoResolutionResult } from '../types'
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { cancel, isCancel, select } from '@clack/prompts'

const execFileAsync = promisify(execFile)

export interface ResolveRepoOptions {
  cwd: string
  cliRepo?: string
  configRepo?: string
  interactive: boolean
}

export async function resolveRepo(options: ResolveRepoOptions): Promise<RepoResolutionResult> {
  if (options.cliRepo) {
    const repo = normalizeRepo(options.cliRepo)
    if (!repo)
      throw new Error(`Invalid --repo value: ${options.cliRepo}`)
    return {
      repo,
      source: 'cli',
      candidates: [],
    }
  }

  if (options.configRepo) {
    const repo = normalizeRepo(options.configRepo)
    if (!repo)
      throw new Error(`Invalid repo in ghfs.config.ts: ${options.configRepo}`)
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
    if (options.interactive && process.stdin.isTTY) {
      const repo = await promptRepoChoice(gitCandidate, pkgCandidate)
      return {
        repo,
        source: repo === gitCandidate.repo ? 'git' : 'package-json',
        candidates,
      }
    }
    throw new Error(`Repo mismatch detected. git=${gitCandidate.repo} package.json=${pkgCandidate.repo}. Use --repo to disambiguate.`)
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

  throw new Error('Could not resolve repository. Provide --repo or set repo in ghfs.config.ts.')
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
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

async function promptRepoChoice(gitCandidate: RepoDetectionCandidate, pkgCandidate: RepoDetectionCandidate): Promise<string> {
  const result = await select<string>({
    message: 'Detected conflicting GitHub repositories. Which one should ghfs use?',
    options: [
      {
        label: `${gitCandidate.repo} (${gitCandidate.detail})`,
        value: gitCandidate.repo,
      },
      {
        label: `${pkgCandidate.repo} (${pkgCandidate.detail})`,
        value: pkgCandidate.repo,
      },
    ],
    initialValue: gitCandidate.repo,
  })

  if (isCancel(result)) {
    cancel('Repository selection cancelled')
    throw new Error('Repository selection cancelled')
  }

  return result
}
