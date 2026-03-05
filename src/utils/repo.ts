export function splitRepo(repo: string): { owner: string, repo: string } {
  const [owner, name] = repo.split('/')
  if (!owner || !name)
    throw new Error(`Invalid repo slug: ${repo}`)
  return { owner, repo: name }
}
