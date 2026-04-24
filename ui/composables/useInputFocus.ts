const isInputFocused = ref(false)
let wired = false

function isEditable(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement))
    return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function useInputFocus() {
  if (typeof document !== 'undefined' && !wired) {
    wired = true
    useEventListener(document, 'focusin', (event: FocusEvent) => {
      isInputFocused.value = isEditable(event.target)
    })
    useEventListener(document, 'focusout', (event: FocusEvent) => {
      isInputFocused.value = isEditable(event.relatedTarget)
    })
  }
  return isInputFocused
}
