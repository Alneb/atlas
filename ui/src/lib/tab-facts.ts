// What the dock asks of the tab list without importing it (tabs.svelte.ts imports dock.ts): set by tabs.svelte.ts.
// A module of its own with no imports, so neither side's load order can leave it undefined (a cycle through dock.ts did).
export const tabFacts = { pinned: (_id: string): boolean => false };
