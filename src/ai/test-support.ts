import type { ClassifierContext, ClassifierModel, ClassifierResult } from '@earendil-works/pi-ai'
import type { ProviderItem } from '../types/provider'
import type { SyncItemState, SyncState } from '../types/sync-state'
import { createFauxCore, createModels, createProvider } from '@earendil-works/pi-ai'
import { resolveAiConfig } from '../config/load'
import { createAiRuntime, GATEWAY_PROVIDER_ID } from './runtime'

export const CLASSIFIER_ID = 'typesafe-ai/jev'
export const AGENT_ID = 'faux/agent'

export function item(number: number, overrides: Partial<ProviderItem> = {}, extra: Partial<SyncItemState> = {}): SyncItemState {
  const data: ProviderItem = {
    number,
    kind: 'issue',
    url: `https://github.com/o/r/issues/${number}`,
    state: 'open',
    stateReason: null,
    updatedAt: `2026-01-${String(number).padStart(2, '0')}T00:00:00Z`,
    createdAt: '2026-01-01T00:00:00Z',
    closedAt: null,
    title: `Issue ${number}`,
    body: 'body',
    author: 'alice',
    labels: [],
    assignees: [],
    milestone: null,
    ...overrides,
  }
  return {
    number,
    kind: data.kind,
    state: data.state,
    lastUpdatedAt: data.updatedAt,
    lastSyncedAt: data.updatedAt,
    filePath: `issues/${number}.md`,
    data: { item: data, comments: [{ id: 1, body: 'Reproduced on main', createdAt: data.updatedAt, updatedAt: data.updatedAt, author: 'bob' }] },
    ...extra,
  }
}

export function syncState(items: SyncItemState[]): SyncState {
  return { version: 2, executions: [], items: Object.fromEntries(items.map(i => [String(i.number), i])) }
}

/** One Gateway-shaped provider: scripted classifier answers plus a faux chat model for the agent. */
export function createFakeGateway(answers: Array<Record<string, number>>) {
  const requests: ClassifierContext[] = []
  const classifier: ClassifierModel<'typesafe-system-one'> = {
    type: 'classifier',
    id: CLASSIFIER_ID,
    name: 'Jev',
    api: 'typesafe-system-one',
    provider: GATEWAY_PROVIDER_ID,
    baseUrl: 'https://example.invalid',
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
  }
  const chat = createFauxCore({ provider: GATEWAY_PROVIDER_ID, models: [{ id: AGENT_ID }] })
  const models = createModels()
  models.setProvider(createProvider({
    id: GATEWAY_PROVIDER_ID,
    auth: { apiKey: { name: 'test', resolve: async () => ({ auth: { apiKey: 'test-key' } }) } },
    models: [...chat.models, classifier],
    api: { stream: chat.stream, streamSimple: chat.streamSimple },
    classifiers: {
      'typesafe-system-one': {
        classify: async (model, context): Promise<ClassifierResult> => {
          requests.push(context)
          const probabilities = answers.shift()
          if (!probabilities)
            throw new Error('unexpected classify call')
          return {
            api: model.api,
            provider: model.provider,
            model: model.id,
            answers: Object.fromEntries(Object.entries(probabilities).map(([label, probability]) => [label, { type: 'bool', probability }])),
            stopReason: 'stop',
            timestamp: Date.now(),
          }
        },
      },
    },
  }))
  const config = resolveAiConfig({ model: CLASSIFIER_ID, agentModel: AGENT_ID })
  return { runtime: createAiRuntime(config, models), config, chat, requests }
}
