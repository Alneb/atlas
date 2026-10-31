# UI style — the rules Atlas's interface is built and reviewed against

The UI matters, and its rules come from reading on style. What was read: Anthropic's design fundamentals for pages (the `artifact-design` skill), Vercel's *Web Interface Guidelines* (vercel.com/design/guidelines), Butterick's *Practical Typography* ("Typography in ten minutes"), and the desktop human interface guidelines of GNOME (developer.gnome.org/hig) and KDE (develop.kde.org/hig), the two desktops Atlas mostly runs on (§9). This file keeps the parts that apply to a desktop workspace app, phrased as checks. Every visible change is judged against them **from a screenshot**, in both themes.

## 1. Use the system that exists
- Colors, radii, shadows, fonts and sizes come from `ui/src/styles/tokens.css`. No literal colors in components; a new need becomes a token.
  `scripts/dev/check-styles.mjs` (the gate's `tidy` stage) fails on a literal colour in a component's `<style>` or a
  stylesheet; a line that must keep one (paper is white, a highlighter yellow, e-ink pure black) says why with a
  `/* literal: … */` comment. Dialogs, menus and popovers cast `--shadow-pop`, small raised things `--shadow-sm`.
- Sizes scale with `--ui-scale` (`calc(12px * var(--ui-scale, 1))`), as everywhere else.
- A task's checkbox outside a note (a block's task list) takes `class="atlas-check"`: the note's own box
  (`markdown.css`), never the browser's, so a task looks the same in a note, a block and a page.
- Fonts: Inter for the interface, the user's prose font for notes, JetBrains Mono for code and data.

## 2. Typography (Butterick)
- The body text decides the quality: get note text right before anything else.
- Prose 15–25 px, line height 1.2–1.45, **45–90 characters per line** (`[editor] prose_width`).
- Uppercase labels are small, letter-spaced, muted. Numbers that line up use `font-variant-numeric: tabular-nums`.
- Curly quotes and the real ellipsis character (…) in interface text.

## 3. Hierarchy and surfaces
- A border, a fill, a radius and a shadow each say "this is a separate object". Use them **by role**, not on every block; the same card around everything flattens the page.
- A block on a page (Home, a `.page`) is set apart by its fill alone (`--card-bg`); `--card-border` is transparent
  except on e-ink, where a fill does not show. A border around every block is the "same card everywhere" look (§8).
- One choice among a few lists or scopes is the shared segmented control, `.atlas-seg` (`base.css`): one sunken
  track, the chosen one raised — never loose pills that wrap. Navigation between places stays tabs.
- Nested radii are concentric: a child's radius is never larger than its parent's.
- Shadows are layered (ambient + direct); borders are semi-transparent tokens so they stay crisp on any surface.
- Summary before detail. State is shown in form as well as number (a chip, a dot, a stripe), never by color alone.
- Repeated things are identical: same padding, same edges, same place for the recurring control.
- **The left bar has one left edge** (`--side-inset`, `base.css`): every heading label, every row's icon and the first tool/footer button start there; headings are the one `.side-head` (28 px in the bar, small caps, faint), icon buttons 28 px. A hint that is only useful during an action ("drop here to pin") appears during that action, floating, never as a standing box.

### Palettes and shapes (Settings → Appearance)
- **A palette** (`ui.palette`: `atlas`, `ink`, `clay`; `styles/palettes.css`) is a colour family over `tokens.css`, in
  light and dark alike, set as `<html data-palette>`. It only redefines tokens; components never test the palette. E-ink
  keeps its own; an accent set in Settings and a VS Code theme (inline on `<html>`) win over it.
- **A shape** (`ui.shape`: `cards`, `paper`; `styles/shape-paper.css`) is how surfaces are drawn, set as
  `<html data-shape>`. `cards` is the default described above; `paper` is one flat sheet: panes flush with 1 px rules
  (the dock's gap, `lib/dock.ts`), square corners, a selected tab or row marked by an accent bar, section labels
  followed by a rule. Every rule of a shape starts with `:root[data-shape="…"]`, so it outranks the scoped styles it
  overrides and disappears with the setting. A new shape is one such file and one enum value.
- **Note fonts:** Literata and Source Serif 4 are carried by the interface (`main.ts`) and offered first for
  `editor.prose_font`; a serif body also sits better beside KaTeX's math.

## 4. Interaction (Vercel)
- **Everything works from the keyboard**; every command has a palette entry and can take a shortcut.
- Focus is always visible (`:focus-visible`), and it is managed: a pane opened by a shortcut receives the keys typed after it.
- Hit targets are at least **24 px**, even when the icon is smaller.
- Hover, active and focus states have *more* contrast than rest.
- No dead ends and no dead zones: every empty or error state says what to do next; what looks clickable is.
- Destructive actions confirm or offer Undo. Menu items that ask for more input end with "…".
- Dragging: no text selection during a drag; every drag has a click or keyboard alternative.
- Tooltips: delayed for the first, immediate for its neighbours; inline help beats a tooltip.
- Optimistic: update at once when success is likely, reconcile after, roll back with a message on failure. The UI is never the slow part.

## 5. Motion
- Animate only to show cause and effect. Only `opacity` and `transform`; never `transition: all`.
- Short (≈120 ms), interruptible, and off under `prefers-reduced-motion`.

## 6. Layout
- Flex/grid with `gap`, not per-element margins. `min-width: 0` on anything holding long text.
- Content sets heights; text that can outgrow its box wraps or scrolls inside it — clipped text is a bug.
- Only useful scrollbars. Blocks adapt to their container width (container queries), since any block can sit in a narrow column.
- On a phone the floating capture button covers the bottom right of the screen: every pane already ends above it
  (`--fab-room`, applied once to dockview's content container). Something fixed to a pane's bottom keeps clear of it the same way.

## 7. Words
- Name things as the user knows them (a *note*, a *page*, a *block*), not as the code does.
- Active voice; a button says exactly what happens. Errors say what went wrong and how to fix it.
- Few distinct nouns, used consistently.

## 8. What to avoid
The looks that read as generated: everything centered, the same rounded card everywhere, an accent stripe on every card, emoji as section markers, gradients as decoration.

## 9. From the GNOME and KDE guidelines
What they add to the above, as checks. Where the two disagree, Atlas keeps one rule.
- **Capitalisation: sentence case everywhere** (buttons, headings, menus, tooltips). GNOME wants title case on
  buttons and headings, KDE on most labels; Atlas has always written sentence case, and one rule beats two.
- **Labels**: a button starts with its verb ("Show info", not "Info"; "Apply", not "Yes"), no longer than
  "Configure keyboard shortcuts". No final period in a label or a one-sentence text. Avoid acronyms where a word
  does ("link", not "URL"); "Delete" only for removing from disk, and Atlas's deletions go to the trash.
- **Placeholders**: an example when a label names the field, else a short imperative; never ending with "…" when
  it is not a search box. A placeholder fits its field whole (clipped text is a bug, §6).
- **Dialogs**: one to three buttons; a confirmation has exactly two, Cancel first and the specific verb last
  ("Move to trash", never "OK"); Enter takes the verb unless it destroys, Esc cancels; focus starts on the control
  used first. A destructive action prefers Undo in a toast to a confirmation.
- **Toasts**: one event, not a state (a state is a banner or a status); a short sentence-case title; a button only
  when it is directly about the message (Undo); near the bottom, never over what they speak of.
- **Empty views**: an icon, one line on why it is empty, and the action that fills it (KDE's placeholder message).
- **Progress**: anything over a second shows progress — determinate when the amount is known.
- **Settings apply at once**, without a restart; no page or section named "Advanced" (a sub-page instead); a
  switch is not a substitute for a design decision.
- **Spacing** in steps: none between a title and its subtitle, small between related items, large between
  groups and at a pane's edge. Text over images or textures is avoided.
- **Text measure**: multi-sentence help ≤ 85 characters a line (≈ 450 px).
- **Typography**: the real characters — × for dimensions, – for ranges, − for minus, a thin space before units.
- **Light, dark, and the system**: both themes and "follow the system"; check high contrast too.
