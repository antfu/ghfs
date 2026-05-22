export function isBotLogin(
  login: string | null | undefined,
  extraBots: readonly string[] = [],
): boolean {
  if (!login)
    return false
  if (login.endsWith('[bot]'))
    return true
  const lower = login.toLowerCase()
  return extraBots.some(b => b.toLowerCase() === lower)
}
