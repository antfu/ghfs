import { REACTION_EMOJI } from '../../src/utils/reactions'

export function summarizeQueueOp(op: Record<string, unknown>): string {
  const details: string[] = []
  if ('labels' in op && Array.isArray(op.labels))
    details.push((op.labels as string[]).join(', '))
  if ('assignees' in op && Array.isArray(op.assignees))
    details.push((op.assignees as string[]).map(a => `@${a}`).join(', '))
  if ('title' in op && typeof op.title === 'string')
    details.push(`"${op.title}"`)
  if ('body' in op && typeof op.body === 'string')
    details.push(`"${op.body.slice(0, 60)}${op.body.length > 60 ? '…' : ''}"`)
  if ('milestone' in op && op.milestone != null)
    details.push(String(op.milestone))
  if ('reaction' in op && typeof op.reaction === 'string') {
    const emoji = REACTION_EMOJI[op.reaction as keyof typeof REACTION_EMOJI]
    details.push(emoji ? `${emoji} ${op.reaction}` : op.reaction)
  }
  if ('target' in op && op.target && typeof op.target === 'object') {
    const t = op.target as { kind?: string, commentId?: number, reviewId?: string }
    if (t.kind === 'comment' && t.commentId != null)
      details.push(`on comment ${t.commentId}`)
    else if (t.kind === 'review' && t.reviewId)
      details.push('on review')
  }
  return details.join(' ')
}
