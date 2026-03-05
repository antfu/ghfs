import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { cancel, isCancel, password } from '@clack/prompts'

const execFileAsync = promisify(execFile)

export interface ResolveTokenOptions {
  token?: string
  interactive: boolean
}

export async function resolveAuthToken(options: ResolveTokenOptions): Promise<string> {
  const configuredToken = options.token?.trim()
  if (configuredToken)
    return configuredToken

  const token = await readTokenFromGhCli()
  if (token)
    return token

  const envToken = await readTokenFromEnv()
  if (envToken)
    return envToken

  if (!options.interactive || !process.stdin.isTTY)
    throw new Error('Missing GitHub token. Set GH_TOKEN/GITHUB_TOKEN or run gh auth login.')

  return await promptForToken()
}

async function readTokenFromGhCli(): Promise<string | undefined> {
  try {
    const result = await execFileAsync('gh', ['auth', 'token'])
    const token = result.stdout.trim()
    return token || undefined
  }
  catch {
    return undefined
  }
}

async function readTokenFromEnv(): Promise<string | undefined> {
  // load .env file
  await import('dotenv').then(mod => mod.config())
  // get token from environment variables
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const value = process.env[name]?.trim()
    if (value)
      return value
  }
  return undefined
}

async function promptForToken(): Promise<string> {
  const result = await password({
    message: 'Enter a GitHub token (PAT) for ghfs:',
    validate: value => value?.trim().length ? undefined : 'Token is required',
  })

  if (isCancel(result)) {
    cancel('Token prompt cancelled')
    throw new Error('Token prompt cancelled')
  }

  return result.trim()
}
