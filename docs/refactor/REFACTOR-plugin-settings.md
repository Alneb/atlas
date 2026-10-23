# REFACTOR — a plugin's settings as a schema: `records` (cards), `when`, `group`, `readonly`

The goal (2026-10-14): plugins get settings in the Settings UI instead of a file to edit; several mail accounts, shown as such in the mail settings, with Thunderbird import; and a better settings UI.

## What changed

A plugin's `[[setting]]` fields were a flat list of six kinds (text, number, toggle, list, choice, secret) drawn by the block-options dialog. Now:

- **`kind = "records"`**: a list of cards, each a set of fields of its own (any kind but `records`), stored as `[[settings.<key>]]` tables in the plugin's `plugin.toml`, the first card being the main one. Each card is named by a text field (`name`, added when the manifest does not declare it): unique, `[A-Za-z0-9_.@-]`, fixed once saved. A card's secret is kept in the store outside the vault as `<key>.<card name>.<field>`; removing a card forgets its secrets. `actions` are buttons on each card (`{ label, command, when? }`: the plugin's command runs with `{ setting, record }`), `list_actions` buttons under the list (`{ setting }`), `add` the label of the add button.
- **`when = { field = value | [values] | true/false }`**: a field is shown, and saved, only while its siblings hold those values (an empty sibling counts as its default). A hidden top-level field is taken out of the file on save; a hidden records field is left as it is (switching a choice must not throw cards away).
- **`group = "Servers"`**: the fields of a group are drawn together under a heading that starts closed and names what is inside.
- **`readonly = true`**: shown, not typed (a secret the plugin sets itself, like Outlook's refresh token): the form says "Set" / "Not set yet".
- **`atlas.plugin.saveSettings(values)`** and **`atlas.plugin.openSettings()`**: a plugin writes its own settings the way the form does, and opens its form (the email plugin's Thunderbird import adds a card this way). **`registerCommand`'s `run(arg)`** receives the card's or list's argument.

The manifest is checked when it is read: a key that does not fit its kind (`choices` on a text, `fields` on a number), a `when` naming a field that is not a sibling, records inside records, a naming field that is not plain text — each is the manifest's error, shown in Settings.

## Shape (before → after)

| | before | after |
|---|---|---|
| core | `SettingKind` / `SettingField` and the save loop inside `plugins.rs` | `crates/atlas-core/src/plugin_settings.rs`: the schema (`SettingField` read through a `RawField` with `try_from`, `SettingKind` a tagged enum whose `Choice` and `Records` carry their data, `When`), `with_defaults` (defaults inside every card too), `apply` (the new text + the secrets to set and to forget). `plugins.rs` keeps the manifest and calls these two. |
| secret names | `<field>` | also `<field>.<card>.<sub-field>`; `secrets.rs` accepts `@` and 200 characters (cards are often named by an address) |
| UI form | `BlockOptions.svelte` drew the controls itself; `PluginsPanel.svelte` held the open form | `FormFields.svelte` (controls, `when`, groups), `RecordCards.svelte` (the cards), `BlockOptions.svelte` (the dialog), `settings/PluginSettings.svelte` mounted once in `App.svelte` with its state in `lib/plugin-settings.svelte.ts` (so the plugin itself can open it) |
| form model | `lib/block-options.ts`: `OptionField`, `shown`, `store` | the same file: `When`, `Card`, `FormValue`, `applies`, `layout`, `newCard`, `secretHint`, records in `shown` / `store` |
| email example | one account as flat settings, more in `accounts.json` (helper-written), a palette menu to manage them | `accounts` as cards (0.2.0); `mail.py`'s `record` picks the account (named, else the first) for reading and signing in alike; an older vault's flat settings, `accounts.json` and secrets move into cards once on load (`migrate`, `retire`) |

## Two implementations, one kept

The `records` kind was built twice on 2026-10-14: completely in a worktree (`/tmp/claude-1000/atlas-records-wt`, branch `records-settings`, never committed) and half again in the main tree (it reached master inside bd9b087: `when` as a string `"auth=outlook"`, records as inline arrays, secrets as `<entry>.<field>`, no UI drawing the cards). The worktree's design was kept — typed `when`, cards as tables under `[settings]`, secrets namespaced by the field and forgotten with their card, checks at read time, the full UI — and master's start was removed (`records_value`, its test, `applies` / `shownEntry` / `storeEntries` in `block-options.ts`, `fieldOf` in `PluginsPanel.svelte`). Master's later fixes were kept: the email inbox's "No email account yet" with Add / Import buttons, Thunderbird's POP3 accounts read over IMAP, one function deciding which account a call reads (now `record`), the reading-note block options.

## What to watch

- **A save reloads the plugin twice** (the save itself, then the file watcher seeing `plugin.toml`). Between `disposeAll` and the new `register`, the plugin's commands are gone: a card button pressed then found no command (the `plugin-records.spec.ts:122` failure). `runPluginCommand` now waits for the plugin's start under way (`starting` in `plugins.svelte.ts`). Tests that open the form through the palette retry, because Enter on a missing command captures the typed text into today's log.
- `atlas.plugin.saveSettings` resolves after the reload, so a plugin must not await it inside `register` (it would wait for its own reload).
- `ui/src/lib/gen/` is generated: `cargo test -p atlas-core` rewrites `SettingField.ts`, `SettingKind.ts`, `Records.ts`, `RecordAction.ts`, `ListAction.ts`, `When*.ts`.
- Running the gate from a second checkout with the main repository's `target/` shared: the Playwright server is `cargo run -p atlas`, and another checkout's build can replace `target/debug/atlas` under it (the test then runs the other branch's core). Use a target directory of the checkout's own (`CARGO_TARGET_DIR`) and another `ATLAS_PW_PORT`.

Tests: `plugin_settings.rs` (5), `plugins.rs` `records_keep_their_secrets_by_card_forget_them_with_the_card_and_survive_an_update`, `ui/tests/plugin-records.spec.ts`, `ui/tests/example-email.spec.ts`, `ui/tests/plugin-settings.spec.ts`, `scripts/vault/tests/test_email_plugin.py`.
