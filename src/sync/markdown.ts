import type { IssueKind, IssueState } from '../types'
import type { ProviderReactions } from '../types/provider'
import { stringify } from 'yaml'
import { normalizeReactions } from '../utils/reactions'

export interface MarkdownComment {
  id: number
  author: string
  body: string
  createdAt: string
  updatedAt: string
  reactions?: ProviderReactions
}

export interface MarkdownDocumentInput {
  repo: string
  number: number
  kind: IssueKind
  url?: string
  state: IssueState
  title: string
  body: string
  author: string
  labels: string[]
  assignees: string[]
  milestone: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  lastSyncedAt: string
  reactions?: ProviderReactions
  comments: MarkdownComment[]
  pr?: {
    isDraft: boolean
    merged: boolean
    mergedAt: string | null
    baseRef: string
    headRef: string
    requestedReviewers: string[]
  }
}

const FIELDS_ALWAYS_KEEP = new Set(['labels', 'assignees'])
const FIELDS_ALWAYS_EXCLUDE = new Set(['repo', 'kind'])
const REACTION_FIELDS: Array<{ key: keyof ProviderReactions, emoji: string }> = [
  { key: 'plusOne', emoji: '👍' },
  { key: 'minusOne', emoji: '👎' },
  { key: 'laugh', emoji: '😄' },
  { key: 'hooray', emoji: '🎉' },
  { key: 'confused', emoji: '😕' },
  { key: 'heart', emoji: '❤️' },
  { key: 'rocket', emoji: '🚀' },
  { key: 'eyes', emoji: '👀' },
]

export function renderIssueMarkdown(input: MarkdownDocumentInput): string {
  const url = input.url || `https://github.com/${input.repo}/${input.kind === 'pull' ? 'pull' : 'issues'}/${input.number}`
  const frontmatter = {
    repo: input.repo,
    number: input.number,
    kind: input.kind,
    url,
    state: input.state,
    title: input.title,
    author: input.author,
    labels: input.labels,
    assignees: input.assignees,
    milestone: input.milestone,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    closed_at: input.closedAt,
    last_synced_at: input.lastSyncedAt,
    reactions: formatReactionsFrontmatter(input.reactions),
    is_draft: input.pr?.isDraft,
    merged: input.pr?.merged,
    merged_at: input.pr?.mergedAt,
    base_ref: input.pr?.baseRef,
    head_ref: input.pr?.headRef,
    reviewers_requested: input.pr?.requestedReviewers,
  }

  const compactFrontmatter = Object.fromEntries(
    Object.entries(frontmatter).filter(([key, value]) => {
      if (FIELDS_ALWAYS_EXCLUDE.has(key))
        return false
      if (FIELDS_ALWAYS_KEEP.has(key))
        return true
      if (value === undefined || value === null || value === false)
        return false
      if (Array.isArray(value))
        return value.length > 0
      return true
    }),
  )

  const sections: string[] = [
    `# ${input.title}`,
    '',
    '## Description',
    '',
    input.body?.trim() || '_No description._',
  ]
  const bodyReactionsLine = formatReactionsLine(input.reactions)
  if (bodyReactionsLine) {
    sections.push('')
    sections.push(bodyReactionsLine)
  }
  sections.push('')
  sections.push('---')
  sections.push('')
  sections.push('## Comments')
  sections.push('')

  if (input.comments.length === 0) {
    sections.push('_No comments._')
  }
  else {
    for (const [index, comment] of input.comments.entries()) {
      if (index > 0) {
        sections.push('---')
        sections.push('')
      }

      sections.push(`### @${comment.author} on ${comment.createdAt}`)
      sections.push(`<!-- comment-id:${comment.id} updated:${comment.updatedAt} -->`)
      sections.push('')
      sections.push(comment.body?.trim() || '_No content._')
      const reactionsLine = formatReactionsLine(comment.reactions)
      if (reactionsLine) {
        sections.push('')
        sections.push(reactionsLine)
      }
      sections.push('')
    }
  }

  return [
    '---',
    stringify(compactFrontmatter).trimEnd(),
    '---',
    '',
    ...sections,
    '',
  ].join('\n')
}

function formatReactionsLine(reactions: ProviderReactions | undefined): string | undefined {
  const entries = getReactionEntries(reactions)

  if (entries.length === 0)
    return undefined

  return `> ${entries.map(entry => `\`${entry.emoji} ${entry.count}\``).join(' | ')}`
}

function formatReactionsFrontmatter(reactions: ProviderReactions | undefined): Record<string, number> | undefined {
  const entries = getReactionEntries(reactions)
  if (entries.length === 0)
    return undefined

  return Object.fromEntries(entries.map(entry => [entry.emoji, entry.count]))
}

function getReactionEntries(reactions: ProviderReactions | undefined): Array<{ emoji: string, count: number }> {
  const normalized = normalizeReactions(reactions)
  return REACTION_FIELDS
    .map(({ key, emoji }) => {
      const count = normalized[key]
      if (!count)
        return undefined
      return { emoji, count }
    })
    .filter((entry): entry is { emoji: string, count: number } => Boolean(entry))
}
