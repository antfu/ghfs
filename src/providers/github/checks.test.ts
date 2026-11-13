import { Octokit } from 'octokit'
import { describe, expect, it, vi } from 'vitest'
import { fetchPullChecks } from './checks'

describe('fetchPullChecks', () => {
  it('pins both paginated APIs to the PR head and keeps the latest status per context', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/pulls/42'))
        return jsonResponse(String(input), { head: { sha: 'head-sha' } })
      const secondPage = url.searchParams.get('page') === '2'
      const headers: Record<string, string> = secondPage ? {} : { link: `<${url.href}&page=2>; rel="next"` }
      if (url.pathname.endsWith('/check-runs')) {
        return jsonResponse(String(input), {
          total_count: 2,
          check_runs: [{
            id: secondPage ? 2 : 1,
            name: secondPage ? 'lint' : 'test',
            status: secondPage ? 'in_progress' : 'completed',
            conclusion: secondPage ? null : 'neutral',
            details_url: 'https://ci.example/run',
            started_at: null,
            completed_at: null,
          }],
        }, { headers })
      }
      return jsonResponse(String(input), secondPage
        ? [
            { id: 1, context: 'build', state: 'failure', description: null, target_url: null, created_at: 'old', updated_at: 'old' },
            { id: 2, context: 'deploy', state: 'pending', description: null, target_url: null, created_at: 'now', updated_at: 'now' },
          ]
        : [{ id: 3, context: 'build', state: 'success', description: 'passed', target_url: 'https://ci.example/build', created_at: 'now', updated_at: 'now' }], { headers })
    })
    const octokit = new Octokit({ request: { fetch } })
    const bump = vi.fn()
    const checks = await fetchPullChecks(octokit, 'owner', 'repo', 42, bump)
    expect(checks.headSha).toBe('head-sha')
    expect(Number.isNaN(Date.parse(checks.fetchedAt))).toBe(false)
    expect(checks.checkRuns).toEqual([
      { id: 1, name: 'test', status: 'completed', conclusion: 'neutral', detailsUrl: 'https://ci.example/run', startedAt: null, completedAt: null },
      { id: 2, name: 'lint', status: 'in_progress', conclusion: null, detailsUrl: 'https://ci.example/run', startedAt: null, completedAt: null },
    ])
    expect(checks.statuses.map(status => [status.context, status.state])).toEqual([['build', 'success'], ['deploy', 'pending']])
    expect(checks.statuses[0].targetUrl).toBe('https://ci.example/build')
    expect(bump).toHaveBeenCalledTimes(5)
    for (const [input] of fetch.mock.calls.slice(1))
      expect(String(input)).toContain('/commits/head-sha/')
    expect(String(fetch.mock.calls[1][0])).toContain('filter=latest')
  })

  it('represents a commit without checks as empty arrays', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      return jsonResponse(String(input), path.endsWith('/pulls/42')
        ? { head: { sha: 'another-sha' } }
        : path.endsWith('/check-runs') ? { total_count: 0, check_runs: [] } : [])
    })
    const checks = await fetchPullChecks(new Octokit({ request: { fetch } }), 'owner', 'repo', 42, vi.fn())
    expect(checks).toMatchObject({ headSha: 'another-sha', checkRuns: [], statuses: [] })
  })

  it('propagates permission errors instead of reporting empty or successful checks', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/pulls/42'))
        return jsonResponse(String(input), { head: { sha: 'head-sha' } })
      return jsonResponse(String(input), { message: 'Resource not accessible by integration' }, { status: 403 })
    })
    await expect(fetchPullChecks(new Octokit({ request: { fetch } }), 'owner', 'repo', 42, vi.fn())).rejects.toMatchObject({ status: 403 })
  })
})

function jsonResponse(url: string, body: unknown, init?: ResponseInit): Response {
  const response = Response.json(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}
