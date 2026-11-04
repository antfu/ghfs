const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'when', 'not', 'from', 'this', 'that', 'are', 'does', 'doesn', 'can', 'cannot', 'after', 'before', 'using', 'use', 'into', 'should', 'while', 'add', 'fix', 'support', 'feat', 'bug', 'error', 'issue'])

/** Lower-cased alphanumeric words of 3+ characters, minus filler words, for cheap title similarity. */
export function titleTokens(text: string): Set<string> {
  const tokens = new Set<string>()
  for (const token of text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    if (!STOPWORDS.has(token))
      tokens.add(token)
  }
  return tokens
}

export function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const token of a) {
    if (b.has(token))
      count++
  }
  return count
}
