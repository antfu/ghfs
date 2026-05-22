export interface ParsedKey {
  /** Normalized modifier set, alphabetically ordered: 'alt'|'ctrl'|'meta'|'shift'. */
  modifiers: string[]
  /** Final non-modifier key (e.g. 'k', 'Enter', 'ArrowDown', '/'). */
  key: string
}

const MAC_RE = /Mac|iPhone|iPad|iPod/i
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  // Prefer `navigator.platform` (stable, includes "MacIntel"); fall back to UA.
  // `userAgentData.platform` is intentionally skipped — headless browsers often
  // misreport it as "Windows" even on macOS.
  const platform = navigator.platform || navigator.userAgent
  return MAC_RE.test(platform)
}

const MODIFIER_TOKENS: Record<string, string> = {
  mod: 'modPlaceholder',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  win: 'meta',
  super: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  space: ' ',
  spacebar: ' ',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
}

const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta']

/**
 * Parse a single chord like `mod+shift+k`, `j`, `?`, `Tab`. Returns the
 * normalized modifier set + key. Does NOT split sequences — the caller
 * splits on whitespace first.
 */
export function parseChord(input: string): ParsedKey {
  const parts = input.split('+').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0)
    return { modifiers: [], key: '' }
  const modifiers = new Set<string>()
  let key = ''
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]!
    const lower = raw.toLowerCase()
    const modToken = MODIFIER_TOKENS[lower]
    if (modToken && i !== parts.length - 1) {
      modifiers.add(modToken === 'modPlaceholder' ? (isMac() ? 'meta' : 'ctrl') : modToken)
      continue
    }
    // Final segment is the key.
    // For ASCII letters, normalize case and treat uppercase as implicit `shift+lower`
    // so bindings like `G` and `shift+g` resolve to the same token.
    if (/^[a-z]$/i.test(raw)) {
      if (raw !== raw.toLowerCase()) modifiers.add('shift')
      key = raw.toLowerCase()
    }
    else {
      key = KEY_ALIASES[lower] ?? raw
    }
  }
  const sorted = MOD_ORDER.filter(m => modifiers.has(m))
  return { modifiers: sorted, key }
}

/**
 * Parse a binding string into a sequence of chords. Sequences are
 * whitespace-separated, e.g. `'g g'`. A single chord like `'mod+k'`
 * returns a sequence of length 1.
 */
export function parseBinding(binding: string): ParsedKey[] {
  return binding.trim().split(/\s+/).map(parseChord)
}

/**
 * Build the canonical token used to match a KeyboardEvent against a parsed
 * chord. Includes modifiers + normalized key. Example: `meta+shift+k`.
 *
 * Note: when shift is a modifier of a printable key, the OS already mutates
 * `event.key` (e.g. `Shift+/` → `?`). We compare against the *post-shift* key.
 */
export function chordToken(chord: ParsedKey): string {
  if (!chord.key) return ''
  return [...chord.modifiers, chord.key].join('+')
}

/**
 * Compose a token from a KeyboardEvent for matching.
 *
 * For Shift, we follow VS Code: shift counts as a modifier only for non-printable
 * keys (Tab, Enter, ArrowDown, ...). For printable keys, the OS already mutated
 * `event.key` (a/A, 1/!, /, ?) so shift is implicit in the key itself.
 */
export function eventToToken(event: KeyboardEvent): string {
  const key = event.key
  if (!key) return ''
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta')
    return ''
  const isLetter = /^[a-z]$/i.test(key)
  const normalKey = isLetter ? key.toLowerCase() : key
  const mods: string[] = []
  if (event.ctrlKey) mods.push('ctrl')
  if (event.altKey) mods.push('alt')
  // Shift counts as a modifier when (a) the key is a multi-char name (Tab,
  // ArrowDown) or (b) the key is an ASCII letter — `Shift+A` lowercases to
  // `shift+a`. For other printable chars (`?`, `!`, `:`) the OS already baked
  // shift into the key, so we don't double-count it.
  if (event.shiftKey && (key.length > 1 || isLetter)) mods.push('shift')
  if (event.metaKey) mods.push('meta')
  mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b))
  return [...mods, normalKey].join('+')
}

/**
 * Render a chord into display tokens like ['⌘', '⇧', 'K']. Mac uses Apple
 * glyphs; other platforms use textual modifiers.
 */
export function chordDisplay(chord: ParsedKey): string[] {
  const mac = isMac()
  const out: string[] = []
  for (const m of chord.modifiers) {
    if (m === 'meta') out.push(mac ? '⌘' : 'Win')
    else if (m === 'ctrl') out.push(mac ? '⌃' : 'Ctrl')
    else if (m === 'alt') out.push(mac ? '⌥' : 'Alt')
    else if (m === 'shift') out.push('⇧')
  }
  out.push(displayKey(chord.key))
  return out
}

function displayKey(key: string): string {
  if (key === 'Escape') return 'Esc'
  if (key === 'Enter') return '↵'
  if (key === 'ArrowUp') return '↑'
  if (key === 'ArrowDown') return '↓'
  if (key === 'ArrowLeft') return '←'
  if (key === 'ArrowRight') return '→'
  if (key === ' ') return 'Space'
  if (key === 'Tab') return 'Tab'
  return key
}

/** Render a full binding (sequence of chords) into a flat token list. */
export function bindingDisplay(binding: string): string[] {
  const chords = parseBinding(binding)
  if (chords.length === 1)
    return chordDisplay(chords[0]!)
  const out: string[] = []
  for (const chord of chords) {
    out.push(...chordDisplay(chord))
  }
  return out
}
