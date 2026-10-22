import type { SuggestLabelsOptions } from '#ghfs/rpc-types'
import { ref } from 'vue'
import { useActiveProjectId, useAppState } from './useAppState'
import { useRpc } from './useRpc'

/** One in-flight run at a time per browser tab; the server call is long and not cancellable from the UI yet. */
const suggesting = ref(false)

export function useLabelSuggestions() {
  const activeId = useActiveProjectId()
  const rpc = useRpc()

  /** Scores items with the decision model and drafts accepted labels into the queue, then opens it. */
  async function suggest(options: SuggestLabelsOptions) {
    if (suggesting.value)
      return
    const projectId = activeId.value ?? '__default__'
    const state = useAppState(projectId)
    suggesting.value = true
    state.setError(null)
    try {
      const run = await rpc.$call('ghfs:suggest-labels', projectId, options)
      if (run.targets === 0)
        state.setError('No open unlabeled items to score.')
      else if (run.suggestions.length === 0)
        state.setError(`Scored ${run.targets} item${run.targets === 1 ? '' : 's'}; no label cleared the threshold.`)
      else
        state.openQueue()
    }
    catch (error) {
      state.setError(`Label suggestion failed: ${(error as Error).message}`)
    }
    finally {
      suggesting.value = false
    }
  }

  return { suggesting, suggest }
}
