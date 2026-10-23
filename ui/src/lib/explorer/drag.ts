// What a dragged row carries, between the sidebar's tree (panes/Files.svelte) and explorer tabs (panes/Explorer.svelte).
/** A vault path. */
export const VAULT_DRAG = "application/x-atlas-path";
/** A remote row (SSH, copyparty): where it is. */
export const REMOTE_DRAG = "application/x-atlas-remote";
export type RemoteRow = { source: string; place: string; path: string; dir: boolean };

/** A row of an explorer starts a drag: a vault path (also as text), or a remote row. */
export function dragRow(dt: DataTransfer, row: { vault: true; path: string } | ({ vault: false } & RemoteRow)): void {
  if (row.vault) { dt.setData(VAULT_DRAG, row.path); dt.setData("text/plain", row.path); }
  else dt.setData(REMOTE_DRAG, JSON.stringify({ source: row.source, place: row.place, path: row.path, dir: row.dir } satisfies RemoteRow));
  dt.effectAllowed = "copyMove";
}

/** Something an explorer takes: files from this computer, a vault path, a remote row. */
export const takesDrop = (dt: DataTransfer | null): boolean => {
  const t = dt?.types ?? [];
  return t.includes(VAULT_DRAG) || t.includes(REMOTE_DRAG) || t.includes("Files");
};

/** What was dropped. */
export type Dropped = { files: File[] } | { vault: string } | { remote: RemoteRow } | null;
export function dropped(dt: DataTransfer): Dropped {
  if (dt.files.length) return { files: [...dt.files] };
  const vault = dt.getData(VAULT_DRAG);
  if (vault) return { vault };
  const r = dt.getData(REMOTE_DRAG);
  return r ? { remote: JSON.parse(r) as RemoteRow } : null;
}
