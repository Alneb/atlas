// The zoom of the tab in front, for the lower bar's left cell (StatusBar.svelte): the person sees at once that a tab is
// larger or smaller than the settings say, and clicks it back. pane-zoom.ts keeps it current.

/** The active tab's zoom, as a percentage of the settings' sizes (100: as set). */
export const zoomShown = $state({ percent: 100 });
