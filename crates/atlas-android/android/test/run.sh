#!/usr/bin/env bash
# The phone app's plain-Java logic tested on the desktop JVM (no device, no android.jar): the screen recognisers
# (Onscreen) and the capture's addresses (Links). Run by build-apk.sh before the APK is made; alone: bash android/test/run.sh
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
src=$here/../java/org/atlas/capture
out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
javac -nowarn --release 17 -d "$out" "$src/Onscreen.java" "$src/Links.java" "$here"/org/atlas/capture/*Test.java
java -cp "$out" org.atlas.capture.OnscreenTest
