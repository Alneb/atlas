#!/usr/bin/env bash
# The phone app's plain-Java logic tested on the desktop JVM (no device, no android.jar): the screen recognisers
# (Onscreen), a page's text selected (PdfText) and a share's pieces made one text (Shares); links, the samples codec, shares and properties are the core's (src/text.rs, tested there). Run by build-apk.sh before the APK is made; alone: bash android/test/run.sh
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
src=$here/../java/org/atlas/capture
out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
javac -nowarn --release 17 -d "$out" "$src/Onscreen.java" "$src/Core.java" "$src/PdfText.java" "$src/Shares.java" "$here"/org/atlas/capture/*Test.java
java -cp "$out" org.atlas.capture.OnscreenTest
java -cp "$out" org.atlas.capture.PdfTextTest
java -cp "$out" org.atlas.capture.SharesTest
