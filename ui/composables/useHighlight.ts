function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wrap matches of `query` in `<mark>` tags. Input is treated as plain text. */
export function highlight(source: string | null | undefined, query: string): string {
  const text = source ?? ''
  if (!text)
    return ''
  const q = query.trim()
  if (!q)
    return escapeHtml(text)
  try {
    const re = new RegExp(`(${escapeRegex(q)})`, 'ig')
    return escapeHtml(text).replace(re, '<mark class="bg-yellow-300/60 dark:bg-yellow-400/30 rounded-sm px-0.5">$1</mark>')
  }
  catch {
    return escapeHtml(text)
  }
}

/**
 * Return a short snippet around the first match of `query` in `source`,
 * with the match highlighted. Returns empty string when no match.
 */
export function snippet(source: string | null | undefined, query: string, context = 60): string {
  const text = source ?? ''
  const q = query.trim()
  if (!text || !q)
    return ''
  const lowerText = text.toLowerCase()
  const lowerQuery = q.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index < 0)
    return ''
  const start = Math.max(0, index - context)
  const end = Math.min(text.length, index + q.length + context)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const fragment = text.slice(start, end).replace(/\s+/g, ' ')
  return `${prefix}${highlight(fragment, q)}${suffix}`
}
