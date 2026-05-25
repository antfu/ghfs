import type { CommentTemplate } from '../../hub/config'
import { defineRpcFunction } from 'devframe'
import { loadHubConfig, setHubCommentTemplates } from '../../hub/config'
import { DEFAULT_HUB_COMMENT_TEMPLATES } from '../../hub/default-comment-templates'

// These RPCs intentionally do NOT depend on `getHubContext` so they work in
// both `ghfs ui` (single-project) and `ghfs hub` modes — global comment
// templates live in `~/.config/ghfs/hub.json` regardless of mode.

export const hubCommentTemplates = defineRpcFunction({
  name: 'ghfs:hub-comment-templates',
  type: 'query',
  setup: () => {
    return {
      handler: async (): Promise<CommentTemplate[]> => {
        const current = await loadHubConfig()
        // `undefined` means the user has never saved templates — seed defaults.
        // An empty array means they explicitly cleared the list — respect it.
        if (current.commentTemplates === undefined)
          return DEFAULT_HUB_COMMENT_TEMPLATES.map(t => ({ ...t }))
        return current.commentTemplates
      },
    }
  },
})

export const setHubCommentTemplatesRpc = defineRpcFunction({
  name: 'ghfs:set-hub-comment-templates',
  type: 'action',
  setup: () => {
    return {
      handler: async (templates: CommentTemplate[]): Promise<CommentTemplate[]> => {
        const next = await setHubCommentTemplates({ templates })
        return next.commentTemplates ?? []
      },
    }
  },
})
