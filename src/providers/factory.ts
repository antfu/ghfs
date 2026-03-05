import type { RepositoryProvider } from '../types'
import { splitRepo } from '../utils/repo'
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
