// The one bounded cache: a Map in insertion order, the least recently set dropped past its cap.

/** Sets `key` as the newest entry and drops the oldest past `max`; each dropped value goes to `gone` (to free what it
 *  holds: a blob URL, a bitmap). */
export function keepCapped<K, V>(map: Map<K, V>, key: K, value: V, max: number, gone?: (v: V) => void): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const [k, v] = map.entries().next().value!;
    map.delete(k);
    gone?.(v);
  }
}
