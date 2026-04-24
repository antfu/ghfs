import type { RepoLabel } from '#ghfs/server-types'
import Color from 'colorjs.io'

export interface LabelStyle {
  backgroundColor: string
  color: string
  borderColor: string
}

const HEX_RE = /^[0-9a-f]{6}$/i
const FALLBACK_HEX = '8b949e'

const cache = new Map<string, LabelStyle>()

function oklchToHex(l: number, c: number, h: number): string {
  const color = new Color('oklch', [l, c, h])
    .to('srgb')
    .toGamut({ space: 'srgb' })
  return color.toString({ format: 'hex' })
}

export function labelStyle(rawHex: string, isDark: boolean): LabelStyle {
  const normalized = (rawHex ?? '').replace(/^#/, '')
  const hex = HEX_RE.test(normalized) ? normalized : FALLBACK_HEX
  const key = `${hex}|${isDark ? 'd' : 'l'}`
  const cached = cache.get(key)
  if (cached)
    return cached

  const [, c, h] = new Color(`#${hex}`).to('oklch').coords
  const hue = h == null || !Number.isFinite(h) ? 0 : h
  const rawC = c == null || !Number.isFinite(c) ? 0 : c
  const chromaBase = Math.min(rawC, 0.18)

  const style: LabelStyle = isDark
    ? {
        color: oklchToHex(0.80, chromaBase, hue),
        backgroundColor: oklchToHex(0.22, chromaBase * 0.5, hue),
        borderColor: oklchToHex(0.38, chromaBase * 0.7, hue),
      }
    : {
        color: oklchToHex(0.42, chromaBase, hue),
        backgroundColor: oklchToHex(0.94, chromaBase * 0.35, hue),
        borderColor: oklchToHex(0.82, chromaBase * 0.5, hue),
      }
  cache.set(key, style)
  return style
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
