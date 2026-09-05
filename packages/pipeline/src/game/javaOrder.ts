/**
 * Iteration order of a `java.util.HashMap<String, ?>` after inserting the given keys, for the
 * few places where the game iterates such a map and the order matters. Entries come out bucket
 * by bucket; a bucket keeps its insertion order, which resizing and treeifying both preserve.
 */

/** `String.hashCode()` of a JavaScript string (UTF-16 code units, 32-bit wrap). */
export function javaStringHashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  }
  return hash;
}

/** The table capacity a HashMap with default settings has after `size` insertions. */
export function javaHashMapCapacity(size: number): number {
  let capacity = 16;
  while (size > capacity * 0.75) capacity *= 2;
  return capacity;
}

/** The keys in HashMap iteration order; `size` is the total number of entries in the map. */
export function javaHashMapOrder(keys: readonly string[], size = keys.length): string[] {
  const capacity = javaHashMapCapacity(size);
  return keys
    .map((key, index) => {
      const h = javaStringHashCode(key);
      return { key, index, bucket: (h ^ (h >>> 16)) & (capacity - 1) };
    })
    .sort((a, b) => a.bucket - b.bucket || a.index - b.index)
    .map((entry) => entry.key);
}
