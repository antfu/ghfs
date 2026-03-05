import type { RepositoryProvider } from '../types'
import { createGitHubProvider } from './github/provider'

export interface CreateRepositoryProviderOptions {
  token: string
  repo: string
}

export function createRepositoryProvider(options: CreateRepositoryProviderOptions): RepositoryProvider {
  const { owner, repo } = splitRepo(options.repo)
  return createGitHubProvider({
    token: options.token,
    owner,
    repo,
  })
}

function splitRepo(repo: string): { owner: string, repo: string } {
  const [owner, name] = repo.split('/')
  if (!owner || !name)
    throw new Error(`Invalid repo slug: ${repo}`)
  return { owner, repo: name }
}
