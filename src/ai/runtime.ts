import type { Api, ClassifierApi, ClassifierModel, Model, Models } from '@earendil-works/pi-ai'
import type { GhfsResolvedAiConfig } from '../types/config'
import process from 'node:process'
import { createModels } from '@earendil-works/pi-ai'
import { vercelAIGatewayProvider } from '@earendil-works/pi-ai/providers/vercel-ai-gateway'

export const GATEWAY_PROVIDER_ID = 'vercel-ai-gateway'
const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh'

export interface AiRuntime {
  models: Models
  classifier: ClassifierModel<ClassifierApi>
  agentModel: Model<Api>
  /** Explicit key from config; `undefined` lets pi-ai read `AI_GATEWAY_API_KEY`. */
  apiKey: string | undefined
}

export async function hasAiCredentials(config: GhfsResolvedAiConfig): Promise<boolean> {
  if (config.apiKey)
    return true
  await import('dotenv').then(mod => mod.config({ quiet: true }))
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim())
}

export function createAiRuntime(config: GhfsResolvedAiConfig, models: Models = gatewayModels()): AiRuntime {
  return {
    models,
    classifier: models.getModelOfType('classifier', GATEWAY_PROVIDER_ID, config.model) ?? customClassifier(config.model),
    agentModel: models.getModel(GATEWAY_PROVIDER_ID, config.agentModel) ?? customChatModel(config.agentModel),
    apiKey: config.apiKey || undefined,
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
