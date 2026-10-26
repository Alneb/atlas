# OCR

The text in captured screenshots, read on this machine and kept under them. A picture captured from any app — the
desktop capture box's screenshot or clipboard image, a picture shared from the phone — has its text read by Tesseract
and put under it as a folded `[!ocr]` callout, so search finds it.

- Runs after every capture, for each picture it embeds (`png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`).
- The text is also handed to the Library (`catalog`) like typed text: a link, DOI, ISBN or IMDb id in a screenshot is
  filed as if it had been pasted.
- Tesseract is compiled into the plugin's program; each language's model (a few MB, Tesseract's fast models) is
  fetched once into the plugin's cache. Nothing else leaves the machine.
- The `read` tool reads any picture of the vault, for agents.

## Settings

- **Languages**: Tesseract's codes joined by `+` (`eng`, `spa`, `fra`, `deu`, `ita`, `por`, `cat`…); empty is English
  and the system's language. Fewer languages read faster.
- **File what the screenshot shows** (on): needs the Library plugin.

## Needs

The helper, a Rust binary that must be built (below); with a served vault the server runs it. The network only for
the language models (`raw.githubusercontent.com`).

## Platforms

Linux works; the others are untested; not in the phone app.

## Build

`bash engine/build.sh` builds the helper into `bin/<arch>-linux/ocr`, which git ignores. With podman it builds in a
Debian bookworm container, so the same file runs on the desktop and in the server's container; without podman (or
with `--local`) it builds for this machine only. Tesseract and Leptonica are compiled in, so the first build is slow.

## Tests

`cargo test -p atlas-ocr`.
