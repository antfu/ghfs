import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { Octokit } from 'octokit'

const BaseOctokit = Octokit.plugin(retry, throttling)

export function createGitHubClient(token: string): Octokit {
  return new BaseOctokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options) => {
        const retries = (options.request.retryCount ?? 0)
        if (retries < 2)
          return true
        return false
      },
      onSecondaryRateLimit: () => {
        return false
      },
    },
    retry: {
      doNotRetry: [401, 403],
      retries: 2,
    },
  })
}
