// What a dragged row carries, between the sidebar's tree (panes/Files.svelte) and explorer tabs (panes/Explorer.svelte).
import { app } from "../state.svelte";
import { api } from "../api";
import { basename } from "../paths";

/** A vault path. */
export const VAULT_DRAG = "application/x-atlas-path";
/** A remote row (SSH, copyparty): where it is. */
export const REMOTE_DRAG = "application/x-atlas-remote";
export type RemoteRow = { source: string; place: string; path: string; dir: boolean };

/** A row of the tree or an explorer starts a drag: a vault path (also as text, for a terminal or a note), or a remote
 *  row. A vault row also leaves the app as a file: `text/uri-list` (Linux file managers, WebKitGTK) when the vault is on
 *  this computer, and `DownloadURL` (Chromium: WebView2 on Windows, a browser) for a file. */
export function dragRow(dt: DataTransfer, row: { vault: true; path: string; dir?: boolean } | ({ vault: false } & RemoteRow)): void {
  if (row.vault) {
    dt.setData(VAULT_DRAG, row.path);
    dt.setData("text/plain", row.path);
    const root = app.workspace?.root;
    if (root && isLocalCore()) dt.setData("text/uri-list", fileUrl(root, row.path));
    if (!row.dir) dt.setData("DownloadURL", `application/octet-stream:${basename(row.path)}:${new URL(api.rawUrl(row.path), location.href).href}`);
  } else dt.setData(REMOTE_DRAG, JSON.stringify({ source: row.source, place: row.place, path: row.path, dir: row.dir } satisfies RemoteRow));
  dt.effectAllowed = "copyMove";
}

/** The page is served by a core on this computer, so the vault's root is a path here. */
const isLocalCore = (): boolean => ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);

/** `file://` for a vault path, on Linux (`/home/u/v`) and Windows (`C:\v`) roots alike. */
export function fileUrl(root: string, path: string): string {
  const abs = `${root.replace(/\\/g, "/").replace(/\/+$/, "")}/${path}`;
  return `file://${abs.startsWith("/") ? "" : "/"}${encodeURI(abs).replace(/[?#]/g, encodeURIComponent)}`;
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
