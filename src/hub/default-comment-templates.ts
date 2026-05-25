import type { CommentTemplate } from './config'

/**
 * Seed templates shown to a user whose `~/.config/ghfs/hub.json` has never
 * had a `commentTemplates` field written. Once the user saves anything
 * (including an empty list), these stop being applied.
 */
export const DEFAULT_HUB_COMMENT_TEMPLATES: CommentTemplate[] = [
  {
    title: 'Needs a reproduction',
    body: 'Could you share a minimal reproduction? A small repo or code snippet that demonstrates the issue would help us a lot.',
  },
  {
    title: 'Working as intended',
    body: 'Thanks for raising this, {{author}}. This is the intended behavior — closing for now, but please reopen if you have additional context.',
  },
  {
    title: 'Closing as duplicate',
    body: 'Thanks! Closing as a duplicate — the discussion is happening over in #_____.',
  },
  {
    title: 'Closing as stale',
    body: 'Hey {{author}}, this hasn\'t seen activity in a while. Closing as stale — please reopen if it\'s still relevant.',
  },
]
