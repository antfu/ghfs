import type { HubCredentials } from '../../hub/config'
import process from 'node:process'
import { defineRpcFunction } from 'devframe'
import { DEFAULT_AI_AGENT_MODEL, DEFAULT_AI_MODEL } from '../../constants'
import { loadHubConfig, setHubCredentials } from '../../hub/config'

/** What the settings UI may see: secrets are reduced to a tail hint, never sent whole. */
export interface CredentialsView {
  githubTokenHint: string | null
  githubTokenFromEnv: boolean
  aiGatewayApiKeyHint: string | null
  aiGatewayApiKeyFromEnv: boolean
  aiModel: string | null
  aiAgentModel: string | null
  defaults: { aiModel: string, aiAgentModel: string }
}

export type CredentialsPatch = { [K in keyof HubCredentials]?: string | null }

function hint(secret: string | undefined): string | null {
  return secret ? `…${secret.slice(-4)}` : null
}

async function buildCredentialsView(): Promise<CredentialsView> {
  const saved = (await loadHubConfig()).credentials ?? {}
  await import('dotenv').then(mod => mod.config({ quiet: true }))
  return {
    githubTokenHint: hint(saved.githubToken),
    githubTokenFromEnv: Boolean(process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()),
    aiGatewayApiKeyHint: hint(saved.aiGatewayApiKey),
    aiGatewayApiKeyFromEnv: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
    aiModel: saved.aiModel ?? null,
    aiAgentModel: saved.aiAgentModel ?? null,
    defaults: { aiModel: DEFAULT_AI_MODEL, aiAgentModel: DEFAULT_AI_AGENT_MODEL },
  }
}

// Global like comment templates: lives in `~/.config/ghfs/hub.json`, so it works in both `ghfs ui` and `ghfs hub`.
export const credentials = defineRpcFunction({
  name: 'ghfs:credentials',
  type: 'query',
  setup: () => ({ handler: buildCredentialsView }),
})

export const setCredentials = defineRpcFunction({
  name: 'ghfs:set-credentials',
  type: 'action',
  setup: () => ({
    handler: async (patch: CredentialsPatch) => {
      await setHubCredentials({ patch })
      return buildCredentialsView()
    },
  }),
})
