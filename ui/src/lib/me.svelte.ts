// Who this page is talking to (GET /api/auth/me), asked once and shared: `server` is true only under `atlas serve`
// (server mode). Settings shows its Server page only then.
import { api, type Me } from "./api";

export const me = $state<{ info: Me | null }>({ info: null });

let asked: Promise<void> | null = null;
/** Starts the one request; later calls share it. A failure leaves `info` null (treated as not server mode). */
export function loadMe(): Promise<void> {
  asked ??= api.me().then((m) => { me.info = m; }, () => {});
  return asked;
}
