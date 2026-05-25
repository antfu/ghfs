import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { File as DiffFile } from 'parse-diff'
import parseDiff from 'parse-diff'

export function useParsedDiff(textRef: Ref<string | null | undefined> | ComputedRef<string | null | undefined>) {
  return computed<DiffFile[]>(() => {
    const text = textRef.value
    if (!text)
      return []
    try {
      return parseDiff(text)
    }
    catch {
      return []
    }
  })
}
