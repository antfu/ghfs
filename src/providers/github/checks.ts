import type { Octokit } from 'octokit'
import type { ProviderPullChecks } from '../../types/provider'

export async function fetchPullChecks(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: () => void,
): Promise<ProviderPullChecks> {
  bumpRequestCount()
  const { data: pull } = await octokit.rest.pulls.get({ owner, repo, pull_number: number })
  const headSha = pull.head.sha
  const fetchedAt = new Date().toISOString()
  const checkRuns: ProviderPullChecks['checkRuns'] = []
  const statuses: ProviderPullChecks['statuses'] = []

  for await (const page of octokit.paginate.iterator(octokit.rest.checks.listForRef, {
    owner,
    repo,
    ref: headSha,
    filter: 'latest',
    per_page: 100,
  })) {
    bumpRequestCount()
    for (const run of page.data) {
      checkRuns.push({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        detailsUrl: run.details_url,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      })
    }
  }

  const contexts = new Set<string>()
  for await (const page of octokit.paginate.iterator(octokit.rest.repos.listCommitStatusesForRef, {
    owner,
    repo,
    ref: headSha,
    per_page: 100,
  })) {
    bumpRequestCount()
    for (const status of page.data) {
      if (contexts.has(status.context))
        continue
      contexts.add(status.context)
      statuses.push({
        id: status.id,
        context: status.context,
        state: status.state,
        description: status.description,
        targetUrl: status.target_url,
        createdAt: status.created_at,
        updatedAt: status.updated_at,
      })
    }
  }

  return { headSha, fetchedAt, checkRuns, statuses }
}
