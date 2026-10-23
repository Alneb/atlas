# Sign-ins to services, for every plugin

The requirement (2026-10-16): everything supports Authelia or similar sign-in programs, both as HTTP guards (forward-auth) and as OIDC, autodetected.

A typical self-hosted server puts its services behind Authelia, a forward-auth gate. Without this, a plugin calling Linkwarden, Jellyfin or TubeArchivist there gets the portal's HTML (or a 302 or 401) instead of the service's answer. It then fails with a parse error, or falls back to an API bypass in the gate, which is to be avoided. This mechanism is written **once, in the core's fetch** (`atlas.fetch`, `POST /api/plugins/{id}/fetch`), so every plugin, its helper, and the catalog and its subplugins get it without writing anything.

## The door (forward-auth: Authelia, Authentik, oauth2-proxy, Keycloak Gatekeeper…) — built

### 1. Recognised by shape, never by product (`service_signin::detect`)
The core reads the service's answer:

| answer | read as |
|---|---|
| 3xx to **another host**. The fetch follows redirects only to hosts the plugin lists, so the portal's redirect stops and comes back. | a gate |
| 401 that is an HTML page, or sends you to another host, or has no `WWW-Authenticate` challenge and no JSON body | a gate. Authelia answers API requests this way. |
| 2xx HTML from **another host**, when the plugin lists the portal's host and the redirect was followed | a gate |
| 2xx HTML when the request asked for JSON (`Accept: …json`) | a gate |
| 401 with `WWW-Authenticate: Bearer` / `Basic`, 401 JSON, a redirect to the same host (`/login`) | **the service's own** sign-in. The plugin handles it with its token. |

When it is a gate, the fetch answers `{ status, ok: false, signin: { kind: "door", host, page }, text: "" }` instead of an error. Nothing is saved (`save_to`) and the portal's HTML is not passed on.

### 2. Offered once (the page)
For every fetch that meets a gate (a helper's fetch too, since helpers use the same route), the core puts `signinneeded { plugin, signin }` on the event bus. `ui/src/lib/service-signin.ts` shows a toast, *"Sign in to links.example.org"*, at most once per host per minute. Clicking it opens `<core>/signin/door?url=<page>`.

### 3. The sign-in window (desktop app, `crates/atlas-app` `door_window`)
The desktop app catches `/signin/door` on this computer (`door_target`) and opens the service's address in a window of its own. The gate sends that window to its portal, and the user signs in there. A security key works because it is a real WebKit page. When **a page of the service's own host** has finished loading, the window reads the cookies for that address with `cookies_for_url` (HttpOnly ones included), posts them to `POST /api/signin/door { host, cookies }` and closes. If the service's page has no cookie at all, no gate was involved (for example, the service's own login page). The window then stays open for the user.

In a browser (Atlas served on a server), `/signin/door` is a short page explaining that only the desktop app can hand a sign-in over, because a browser tab keeps its cookies to itself.

### 4. Kept and sent (`service_signin::keep` / `cookie_header`)
The cookies are kept in the vault's **secrets file** (outside the vault, mode 0600) under the section `@signin`. No plugin id starts with `@`, so no plugin can read them through `atlas.secrets`. On each later fetch, the cookies that cover the request (RFC 6265 domain and path matching, secure only over https, expired ones dropped) go in a `Cookie` header:
- **One sign-in opens every service behind the same gate.** Authelia's session cookie is set for the whole domain (`.example.org`), so signing in at Linkwarden also opens Jellyfin.
- **Only plugins that name the host get it**: exactly, or under a `*.domain` in `[permissions] net`. A plugin with `net = ["*"]` (a web clipper) can reach every host but never carries the user's sign-ins.
- A plugin that sends its own `Cookie` header keeps it. The kept one is not added.
- Helpers never see a cookie value. `/api/signin*` is closed to helpers (`helper_api::may`), so a helper can neither read nor plant one.
- When the gate's session ends, the gate answers as in step 1 again and the sign-in is offered again. The new sign-in replaces the old one.

Settings → Plugins & automation → **Sign-ins for plugins** lists the kept sign-ins (host and date only, no values), each with a **Forget** button (`GET /api/signin/doors`, `DELETE /api/signin/doors/{host}`). When a sign-in comes back, `signedin { host }` updates the list and toasts "Signed in to …".

### For plugin authors
`atlas.fetch(...)` answers `signin` when a gate is in front. Atlas has already offered the sign-in, so stop and retry after the `signedin` event (or the next time). A helper returns `{ "signin": res["signin"] }` as its tool's answer: the "come back" pattern, which the catalog collects and shows (`catalog-linkwarden/helper.py`). Send `Accept: application/json` to an API so that "HTML where JSON was asked" is recognised.

## OIDC (Authelia as an identity provider) — built, the plugin's part
The plan was (kept for the parts still to do): for a service that accepts the provider's tokens (a resource server, or Authelia's own authz endpoint with `Authorization: Bearer`): a 401 with `WWW-Authenticate: Bearer` and `resource_metadata` / `/.well-known/oauth-protected-resource` → the issuer → `/.well-known/openid-configuration` → authorization code + PKCE through `atlas.signIn` (the existing window that catches a localhost `redirect_uri`) → access and refresh tokens kept, refreshed by the core, sent as `Authorization: Bearer`. Note that this is OIDC for **plugins**. The Atlas server itself deliberately has none.

**What is built** (`crates/atlas-core/src/plugin_oauth.rs`, `atlas.oauth` in `ui/src/lib/plugins.svelte.ts`):
1. `atlas.oauth.signIn(name, { issuer, clientId, redirect, scopes? })` → `POST /api/plugins/{id}/oauth/start`: the core reads `<issuer>/.well-known/openid-configuration` (the issuer and both endpoints must be hosts the plugin's `net` allows), makes a PKCE verifier (48 random bytes, S256 challenge) and a `state`, keeps them in memory for 15 minutes, and answers the provider's authorization address (`response_type=code`, scopes `openid offline_access` by default).
2. The page opens it with `atlas.signIn(url, redirect)` — the desktop's sign-in window, which ends when the provider sends the browser to `redirect` — and hands that address to `POST …/oauth/finish`.
3. The core checks the `state` (same plugin, not too old), trades the code at the token endpoint (`grant_type=authorization_code`, `code_verifier`, no client secret: a **public client**) and keeps `{ access, refresh, expires, token_endpoint, client_id }` as the plugin's secret `oauth.<name>` — outside the vault, never sent to a page.
4. A header `{ oauth: name }` in `atlas.fetch` becomes `Bearer <access>`; within 60 s of its end the core first renews it (`grant_type=refresh_token`), keeping the old refresh token when the answer brings none. Ended without a refresh token → an error that says to sign in again.
5. `GET …/oauth/{name}` → `{ signed_in, expires, renews }`; `DELETE` signs out. In a plain browser (no sign-in window) the plugin lets the user paste the address the tab ended on into `atlas.oauth.finish(address)`.

6. **The provider found by itself**: `signIn(name, { resource })` instead of an issuer. The core asks `resource` with no token (no redirects followed) and reads the 401's `WWW-Authenticate` Bearer challenge (`bearer_params`: quoted values, commas inside quotes, other schemes after it). An `as_uri` / `issuer` there is the provider; otherwise the RFC 9728 metadata is tried in order — the challenge's `resource_metadata`, then `/.well-known/oauth-protected-resource<path>` and `/.well-known/oauth-protected-resource` on the service — and its first `authorization_servers` entry is the issuer. Every address is checked against the plugin's `net`. A redirect with no Bearer challenge is a **door** (forward-auth): the error says so and points at `atlas.signIn`.
7. **One client for every plugin**: Settings → Plugins & automation → `[plugins] oidc_issuer`, `oidc_client_id`, `oidc_redirect`. A plugin that names none of these uses the vault's; `start` answers the redirect it used, so the page's sign-in window knows where to stop. Register the client below once and every plugin can sign in with `atlas.oauth.signIn("authelia")`.

8. **Offered like the door**: `atlas.fetch` with a header `{ oauth: name }` answers `signin: { kind: "token", host, name, page }` (status 401, `ok: false`) when that sign-in is not kept or has ended with no refresh token — before sending anything — or when the service answers 401 with a `Bearer` challenge (the token refused). The core emits `signinneeded` as for a door; `ui/src/lib/service-signin.ts` toasts "Sign in to <host>", and the click runs `oauth/start` with `resource: page` (provider found from the service, the vault's client), the sign-in window, `oauth/finish`. A plugin needs no sign-in code: send `{ oauth: "svc" }`, retry once signed in.

**Still to do**: dynamic client registration.

**An Authelia client for this** (in `identity_providers.oidc.clients`, Authelia ≥ 4.38; in your Authelia configuration):
```yaml
- client_id: atlas-plugins
  client_name: Atlas plugins
  public: true                       # no secret: a vault cannot keep one
  authorization_policy: two_factor
  require_pkce: true
  pkce_challenge_method: S256
  redirect_uris: ['https://localhost/atlas']
  scopes: [openid, offline_access, profile, email]
  grant_types: [authorization_code, refresh_token]
  response_types: [code]
  token_endpoint_auth_method: none
```
and in the plugin: `await atlas.oauth.signIn("authelia", { issuer: "https://auth.example.org", clientId: "atlas-plugins", redirect: "https://localhost/atlas" })` — or, with those three set once in Settings, `await atlas.oauth.signIn("authelia")`, then `atlas.fetch(url, { headers: { authorization: { oauth: "authelia" } } })`.

## Tests
- `service_signin::tests`: the shapes (gate / not a gate) and cookie matching (a domain cookie covers its neighbours, never `example.org.evil.com`, no secure cookie over http, expired ones dropped, Forget).
- `plugin_net::tests::a_gate_in_front_is_reported_and_its_kept_sign_in_is_sent_only_to_plugins_that_name_the_host`: a stand-in gate's 302, nothing saved, the kept cookie sent on the retry, none for `net = ["*"]`.
- `helper_api::tests`: a helper cannot reach `/api/signin*`.
- `crates/atlas-app` `door_target`: only this computer's core asks, and only for http(s).
- Not yet tested against a real Authelia deployment. That needs the desktop app and a real sign-in (security key).
