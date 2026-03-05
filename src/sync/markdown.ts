import type { IssueKind, IssueState } from '../types'
import { stringify } from 'yaml'

export interface MarkdownComment {
  id: number
  author: string
  body: string
  createdAt: string
  updatedAt: string
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

export function renderIssueMarkdown(input: MarkdownDocumentInput): string {
  const url = input.url || `https://github.com/${input.repo}/${input.kind === 'pull' ? 'pull' : 'issues'}/${input.number}`
  const frontmatter = {
    schema: 'ghfs/issue-doc@v1',
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
    '',
    '---',
    '',
    '## Comments',
    '',
  ]

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
