export function formatValue(value: string | number | Date | undefined | null): string {
  if (value == null)
    return ''
  if (value instanceof Date)
    return `${value.toLocaleString()} (${formatRelativeTime(value)})`
  if (typeof value === 'number')
    return formatNumber(value)
  return String(value)
}

export function formatNumber(value: number): string {
  return value.toLocaleString()
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 1000)
    return 'just now'
  if (diff < 60000)
    return `${Math.round(diff / 1000)}s ago`
  if (diff < 3600000)
    return `${Math.round(diff / 60000)}m ago`
  return date.toLocaleString()
}

export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000)
    return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(2)}s`
}
