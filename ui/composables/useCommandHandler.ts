import { diagnostics } from '../utils/logger'

interface MatchableBinding {
  command: { id: string, run: () => void | Promise<void> }
  tokens: string[]
  whenNode: ReturnType<typeof getCompiledKeybindings>[number]['whenNode']
  hasModifier: boolean
}

function isInputTarget(el: EventTarget | null): el is HTMLElement {
  const target = el as HTMLElement | null
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

export function useCommandHandler(): void {
  if (typeof document === 'undefined')
    return

  const ctxRef = useWhenContext()
  const palette = useCommandPalette()

  const buffer: string[] = []
  let bufferTimer: ReturnType<typeof setTimeout> | null = null

  useEventListener(document, 'keydown', (event: KeyboardEvent) => {
    const inputTarget = isInputTarget(event.target)
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey
    if (inputTarget && event.key === 'Escape') {
      (event.target as HTMLElement).blur()
      return
    }
    if (inputTarget && event.key === 'Tab') {
      (event.target as HTMLElement).blur()
      // fall through
    }
    else if (inputTarget && !hasModifier) {
      return
    }

    // Palette open: only allow the palette opener combos to retrigger
    // (toggle/close paths use the palette command's own when guards).
    // Other keys are handled inside the palette UI itself.
    if (palette.paletteOpen.value)
      return

    const eventToken = eventToToken(event)
    if (!eventToken)
      return

    const bindings = getCompiledKeybindings()
    const ctx = ctxRef.value as unknown as Record<string, unknown>

    // Build matchable bindings (parse on the fly; the keybinding count is
    // small so this is fine — and parseBinding is cheap).
    const matchables: MatchableBinding[] = []
    for (const kb of bindings) {
      const chords = parseBinding(kb.key)
      const tokens = chords.map(chordToken)
      const hasMod = chords.some(c => c.modifiers.length > 0)
      matchables.push({ command: kb.command, tokens, whenNode: kb.whenNode, hasModifier: hasMod })
    }

    // Modifier combos: single-shot match, no buffer involvement.
    if (hasModifier) {
      for (const m of matchables) {
        if (!m.hasModifier) continue
        if (m.tokens.length !== 1) continue
        if (m.tokens[0] !== eventToken) continue
        if (!evalWhen(m.whenNode, ctx)) continue
        event.preventDefault()
        buffer.length = 0
        invoke(m.command)
        return
      }
      return
    }

    // Plain-key path: tail-match buffer (carried over from the legacy handler).
    buffer.push(eventToken)
    if (buffer.length > 8)
      buffer.shift()
    if (bufferTimer)
      clearTimeout(bufferTimer)
    bufferTimer = setTimeout(() => { buffer.length = 0 }, 800)

    // Longest-sequence-first match.
    const sorted = matchables
      .filter(m => !m.hasModifier)
      .sort((a, b) => b.tokens.length - a.tokens.length)

    for (const m of sorted) {
      if (!tailMatches(buffer, m.tokens)) continue
      if (!evalWhen(m.whenNode, ctx)) continue
      event.preventDefault()
      buffer.length = 0
      invoke(m.command)
      return
    }
  })
}

function tailMatches(buffer: string[], tokens: string[]): boolean {
  if (tokens.length > buffer.length) return false
  const start = buffer.length - tokens.length
  for (let i = 0; i < tokens.length; i++) {
    if (buffer[start + i] !== tokens[i]) return false
  }
  return true
}

function invoke(cmd: { id: string, run: () => void | Promise<void> }): void {
  try {
    const result = cmd.run()
    if (result && typeof result === 'object' && 'catch' in result)
      void (result as Promise<unknown>).catch((err: unknown) => {
        diagnostics.GHFS0901({ shortcut: cmd.id, detail: String((err as Error)?.message ?? err), cause: err })
      })
  }
  catch (err) {
    diagnostics.GHFS0901({ shortcut: cmd.id, detail: String((err as Error)?.message ?? err), cause: err })
  }
}
