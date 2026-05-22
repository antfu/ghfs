const paletteOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)

export function useCommandPalette() {
  function open() {
    query.value = ''
    selectedIndex.value = 0
    paletteOpen.value = true
  }
  function close() {
    paletteOpen.value = false
  }
  function setQuery(value: string) {
    if (query.value === value) return
    query.value = value
    selectedIndex.value = 0
  }
  function setSelectedIndex(value: number) {
    selectedIndex.value = value
  }
  return {
    paletteOpen,
    query,
    selectedIndex,
    open,
    close,
    setQuery,
    setSelectedIndex,
  }
}
