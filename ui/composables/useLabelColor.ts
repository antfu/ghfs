import type { RepoLabel } from '#ghfs/server-types'

export interface LabelStyle {
  backgroundColor: string
  color: string
  borderColor: string
}

const HEX_RE = /^[0-9a-f]{6}$/i
const FALLBACK_HEX = '8b949e'

export function labelStyle(rawHex: string): LabelStyle {
  const normalized = (rawHex ?? '').replace(/^#/, '')
  const hex = HEX_RE.test(normalized) ? normalized : FALLBACK_HEX
  const hashed = `#${hex}`
  return {
    backgroundColor: `color-mix(in srgb, ${hashed} 20%, transparent)`,
    borderColor: `color-mix(in srgb, ${hashed} 40%, transparent)`,
    color: hashed,
  }
}

export function useLabelColorMap(): ComputedRef<Map<string, RepoLabel>> {
  const state = useAppState()
  return computed(() => {
    const map = new Map<string, RepoLabel>()
    for (const label of state.payload.value?.repositoryLabels ?? [])
      map.set(label.name, label)
    return map
  })
}
