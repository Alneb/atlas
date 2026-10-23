# UI style — the rules Atlas's interface is built and reviewed against

The UI matters, and its rules come from reading on style (2026-10-13). What was read: Anthropic's design fundamentals for pages (the `artifact-design` skill), Vercel's *Web Interface Guidelines* (vercel.com/design/guidelines), and Butterick's *Practical Typography* ("Typography in ten minutes"). This file keeps the parts that apply to a desktop workspace app, phrased as checks. Every visible change is judged against them **from a screenshot**, in both themes.

## 1. Use the system that exists
- Colors, radii, shadows, fonts and sizes come from `ui/src/styles/tokens.css`. No literal colors in components; a new need becomes a token.
- Sizes scale with `--ui-scale` (`calc(12px * var(--ui-scale, 1))`), as everywhere else.
- Fonts: Inter for the interface, the user's prose font for notes, JetBrains Mono for code and data.

## 2. Typography (Butterick)
- The body text decides the quality: get note text right before anything else.
- Prose 15–25 px, line height 1.2–1.45, **45–90 characters per line** (`[editor] prose_width`).
- Uppercase labels are small, letter-spaced, muted. Numbers that line up use `font-variant-numeric: tabular-nums`.
- Curly quotes and the real ellipsis character (…) in interface text.

## 3. Hierarchy and surfaces
- A border, a fill, a radius and a shadow each say "this is a separate object". Use them **by role**, not on every block; the same card around everything flattens the page.
- Nested radii are concentric: a child's radius is never larger than its parent's.
- Shadows are layered (ambient + direct); borders are semi-transparent tokens so they stay crisp on any surface.
- Summary before detail. State is shown in form as well as number (a chip, a dot, a stripe), never by color alone.
- Repeated things are identical: same padding, same edges, same place for the recurring control.
- **The left bar has one left edge** (`--side-inset`, `base.css`): every heading label, every row's icon and the first tool/footer button start there; headings are the one `.side-head` (28 px in the bar, small caps, faint), icon buttons 28 px. A hint that is only useful during an action ("drop here to pin") appears during that action, floating, never as a standing box.

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

## 7. Words
- Name things as the user knows them (a *note*, a *page*, a *block*), not as the code does.
- Active voice; a button says exactly what happens. Errors say what went wrong and how to fix it.
- Few distinct nouns, used consistently.

## 8. What to avoid
The looks that read as generated: everything centered, the same rounded card everywhere, an accent stripe on every card, emoji as section markers, gradients as decoration.
