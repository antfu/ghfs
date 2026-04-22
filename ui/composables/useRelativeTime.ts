export function formatRelative(iso: string | null | undefined): string {
  if (!iso)
    return 'never'
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const seconds = Math.round(diff / 1000)
    const minutes = Math.round(seconds / 60)
    const hours = Math.round(minutes / 60)
    const days = Math.round(hours / 24)
    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 60) return `${days}d ago`
    const months = Math.round(days / 30)
    if (months < 24) return `${months}mo ago`
    return `${Math.round(days / 365)}y ago`
  }
  catch {
    return iso
  }
}

export function formatAbsolute(iso: string | null | undefined): string {
  if (!iso)
    return ''
  try {
    const date = new Date(iso)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  catch {
    return iso
  }
}
