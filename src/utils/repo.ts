import { CodedError, log } from '../logger'

export function splitRepo(repo: string): { owner: string, repo: string } {
  const [owner, name] = repo.split('/')
  if (!owner || !name)
    throw new CodedError(log.GHFS_E0016({ repo }))
  return { owner, repo: name }
}
