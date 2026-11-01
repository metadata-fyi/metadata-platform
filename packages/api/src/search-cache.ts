/**
 * Small bounded cache for catalog reads whose result is independent of the
 * caller. The map is kept insertion-ordered so a hit is promoted to the
 * newest position and the oldest entry can be evicted deterministically.
 */
export function createSearchCache<T>(maxEntries = 128) {
  const limit = Math.max(1, Math.floor(maxEntries))
  const cache = new Map<string, T>()

  return {
    get(key: string): T | undefined {
      const value = cache.get(key)
      if (value === undefined) return undefined
      cache.delete(key)
      cache.set(key, value)
      return value
    },

    set(key: string, value: T): T {
      cache.delete(key)
      cache.set(key, value)
      while (cache.size > limit) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
      }
      return value
    },

    clear(): void {
      cache.clear()
    },

    get size(): number {
      return cache.size
    },
  }
}
