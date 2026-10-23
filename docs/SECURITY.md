# Security

Atlas runs a local server for its window, can serve a vault to the network (`atlas serve --listen`), runs plugins with their own permissions, and keeps secrets outside the vault. A weakness in any of these matters.

## Reporting a vulnerability
Please **do not open a public issue**. Report it privately through GitHub's "Report a vulnerability" (Security → Advisories) on the repository, with:
- what an attacker can do, and from where (the same machine, the network, a plugin, a vault file);
- the steps or a proof of concept;
- the version (`atlas --version`) or the commit.

You will get an answer within a week. A fix is released before the details are made public, and the report is credited unless you ask otherwise.

## What is in scope
- The core's HTTP API and its guards: the local lock, the sign-in, served mode, trusted-proxy headers (`docs/guides/SERVER.md`).
- Plugin isolation: the `net` host list, secrets that never reach a plugin, helpers' access to the API (`docs/guides/PLUGIN-API.md`), and the service sign-ins kept for plugins (`docs/design/SERVICE-SIGNIN.md`).
- Path handling: no file outside the vault reached through the API.
- The Android app's sign-in and its token.

## Supported versions
Only the latest release and `main`.
