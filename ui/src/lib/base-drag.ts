// Reordering by drag in the Bases editors (columns, sort keys, the properties list): one rule for all of them.

/** `list` with the item at `from` moved to `to` (the place it is dropped on). */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}
