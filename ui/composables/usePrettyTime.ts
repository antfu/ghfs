const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function usePrettyTime() {
  function formatAbsolute(value?: string | null): string {
    if (!value)
      return '-'

    const date = new Date(value)
    if (Number.isNaN(date.getTime()))
      return value

    return absoluteFormatter.format(date)
  }

  function formatRelative(value?: string | null): string {
    if (!value)
      return '-'

    const date = new Date(value)
    if (Number.isNaN(date.getTime()))
      return value

    const diff = date.getTime() - Date.now()
    const absSeconds = Math.abs(diff / 1000)
    if (absSeconds < 45)
      return 'just now'

    const absMinutes = absSeconds / 60
    if (absMinutes < 60)
      return `${Math.round(absMinutes)}m ${diff < 0 ? 'ago' : 'from now'}`

    const absHours = absMinutes / 60
    if (absHours < 24)
      return `${Math.round(absHours)}h ${diff < 0 ? 'ago' : 'from now'}`

    const absDays = absHours / 24
    return `${Math.round(absDays)}d ${diff < 0 ? 'ago' : 'from now'}`
  }

  return {
    formatAbsolute,
    formatRelative,
  }
}
