import type { ClassifierBoolQuestion, JsonObject } from '@earendil-works/pi-ai'
import type { AiRuntime } from '../runtime'

/** One decision-model request: probability that each label applies to `state`. */
export async function decideLabelProbabilities(runtime: AiRuntime, state: JsonObject, questions: Record<string, ClassifierBoolQuestion>): Promise<Record<string, number>> {
  const result = await runtime.models.classify(runtime.classifier, { state, questions }, { apiKey: runtime.apiKey })
  if (result.stopReason !== 'stop')
    throw new Error(result.errorMessage ?? `Decision model ${runtime.classifier.id} failed (${result.stopReason})`)

  const probabilities: Record<string, number> = {}
  for (const [label, answer] of Object.entries(result.answers)) {
    if (answer.type === 'bool')
      probabilities[label] = answer.probability
  }
  return probabilities
}
