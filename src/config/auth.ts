import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { CodedError, log } from '../logger'

const execFileAsync = promisify(execFile)

export interface ResolveTokenOptions {
  token?: string
  interactive: boolean
  promptForToken?: () => Promise<string | undefined>
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
    throw new CodedError(log.GHFS_E0001())

  if (!options.promptForToken)
    throw new CodedError(log.GHFS_E0001())

  const promptedToken = await options.promptForToken()
  if (promptedToken?.trim())
    return promptedToken.trim()

  throw new CodedError(log.GHFS_E0002())
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
