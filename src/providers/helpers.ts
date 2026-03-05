export async function collectPages<T>(pages: AsyncIterable<T[]>): Promise<T[]> {
  const items: T[] = []
  for await (const page of pages)
    items.push(...page)
  return items
}

export async function* iteratePages<T>(pages: AsyncIterable<T[]>): AsyncIterable<T> {
  for await (const page of pages) {
    for (const item of page)
      yield item
  }
}
