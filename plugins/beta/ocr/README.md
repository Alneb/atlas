# OCR

The text in captured screenshots, read on this machine and kept under them. A picture captured from any app — the
desktop capture box's screenshot or clipboard image, a picture shared from the phone — has its text read by Tesseract
and put under it as a folded `[!ocr]` callout, so search finds it. A link, DOI, ISBN or IMDb id in the picture is then
filed by the catalog as if it had been typed.

## What it adds

- **A capture hook** (`on = "capture"`): for each picture a capture embeds (png, jpg, jpeg, webp, gif, bmp), the text
  is read and written under it in the capture's note; the text is handed to the catalog's capture tool.
- **The tool `read`** `{ path }`: the text of any picture of the vault, for agents.
- Tesseract and Leptonica are compiled into the helper; each language's model (a few MB, the fast models) is fetched
  once into the plugin's cache. Nothing else leaves the machine.

## Settings

- **Languages**: Tesseract's codes joined by `+` (`eng`, `spa`, `fra`, `deu`, `ita`, `por`, `cat`…); empty: English
  and the system's language. Fewer languages read faster.
- **File what the screenshot shows** (on): needs the Catalog plugin.

## How it fits

No `requires`. It calls the catalog's `capture` tool directly (by the plugin id `catalog`); with the catalog off that
step is skipped.

## Needs

The helper is built by `bash engine/build.sh` into `bin/<arch>-<os>/ocr` (not committed; the first build is slow, as
Tesseract is compiled in; with podman it builds in a container so the binary also runs in the server's). The network
only for the language models (`raw.githubusercontent.com`).

## Platforms

Linux works; the others are untested; not in the phone app.

## Status

Beta. Tests: `cargo test -p atlas-ocr`. No end-to-end spec yet, and no progress shown for a long page.
