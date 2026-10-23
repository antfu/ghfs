import type { Api, ClassifierApi, ClassifierModel, Model, Models } from '@earendil-works/pi-ai'
import type { GhfsResolvedAiConfig } from '../types/config'
import process from 'node:process'
import { createModels } from '@earendil-works/pi-ai'
import { vercelAIGatewayProvider } from '@earendil-works/pi-ai/providers/vercel-ai-gateway'
import { DEFAULT_AI_AGENT_MODEL, DEFAULT_AI_MODEL } from '../constants'
import { loadHubConfig } from '../hub/config'

export const GATEWAY_PROVIDER_ID = 'vercel-ai-gateway'
const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh'

export interface AiRuntime {
  models: Models
  classifier: ClassifierModel<ClassifierApi>
  agentModel: Model<Api>
  apiKey: string | undefined
}

export interface AiSettings extends Omit<GhfsResolvedAiConfig, 'model' | 'agentModel'> {
  model: string
  agentModel: string
  /** Where the key came from, for the settings UI. `null` means no key anywhere. */
  apiKeySource: 'config' | 'settings' | 'env' | null
}

/** Project config wins, then credentials saved from the UI, then the environment, then defaults. */
export async function resolveAiSettings(config: GhfsResolvedAiConfig): Promise<AiSettings> {
  const saved = (await loadHubConfig()).credentials ?? {}
  await import('dotenv').then(mod => mod.config({ quiet: true }))
  const envKey = process.env.AI_GATEWAY_API_KEY?.trim() ?? ''
  const apiKey = config.apiKey || saved.aiGatewayApiKey || envKey
  return {
    ...config,
    apiKey,
    apiKeySource: config.apiKey ? 'config' : saved.aiGatewayApiKey ? 'settings' : envKey ? 'env' : null,
    model: config.model ?? saved.aiModel ?? DEFAULT_AI_MODEL,
    agentModel: config.agentModel ?? saved.aiAgentModel ?? DEFAULT_AI_AGENT_MODEL,
  }
}

export function createAiRuntime(settings: Pick<AiSettings, 'apiKey' | 'model' | 'agentModel'>, models: Models = gatewayModels()): AiRuntime {
  return {
    models,
    classifier: models.getModelOfType('classifier', GATEWAY_PROVIDER_ID, settings.model) ?? customClassifier(settings.model),
    agentModel: models.getModel(GATEWAY_PROVIDER_ID, settings.agentModel) ?? customChatModel(settings.agentModel),
    apiKey: settings.apiKey || undefined,
  }
}

function gatewayModels(): Models {
  const models = createModels()
  models.setProvider(vercelAIGatewayProvider())
  return models
}

/** Model ids missing from pi-ai's catalog still work through the Gateway; only cost accounting is lost. */
function customClassifier(id: string): ClassifierModel<ClassifierApi> {
  return {
    type: 'classifier',
    id,
    name: id,
    api: 'typesafe-system-one',
    provider: GATEWAY_PROVIDER_ID,
    baseUrl: `${GATEWAY_BASE_URL}/typesafe/v1`,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
  }
}

function customChatModel(id: string): Model<Api> {
  return {
    id,
    name: id,
    api: 'anthropic-messages',
    provider: GATEWAY_PROVIDER_ID,
    baseUrl: GATEWAY_BASE_URL,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_000,
  }
}
