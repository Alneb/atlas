#!/usr/bin/env bash
# The phone app's toolchain into atlas/local/toolchains/ (git-ignored), each archive checked against Google's SHA-1:
# the NDK (clang, the sysroot), build-tools (aapt2, zipalign, apksigner, d8) and one platform (android.jar).
# No SDK manager, no Gradle, no Android Studio (docs/guides/ANDROID.md).
#   --emulator  also the emulator and an Android 15 x86_64 image (~2 GB), to run the apps headless here (run-emulator.sh)
set -euo pipefail
tc=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/local/toolchains
mkdir -p "$tc/unpack"; cd "$tc"
get() { # get <archive> <sha1> <into> [<folder of the repository>]
  [ -e "$3" ] && { echo "[toolchain] $3: there"; return; }
  echo "[toolchain] $1"
  curl -fL --retry 3 -o "$1" "https://dl.google.com/android/repository/${4:-}$1"
  echo "$2  $1" | sha1sum -c -
  mkdir -p "$(dirname "$3")"
  unzip -q -o "$1" -d "$(dirname "$3")" && rm "$1"
}
get android-ndk-r30-linux.zip 5107f898313790e449e87eee2183d9a20602dee9 "$tc/android-ndk-r30"
get build-tools_r37_linux.zip 70954e99f4c3d9d46ee70fa32624672fe7cd6ebe "$tc/unpack/android-37.0"
get platform-37.2_r01.zip 4bec12a02162ff6852df50b5fcf8ee762b050966 "$tc/unpack/android-37.2"
rustup target add aarch64-linux-android
if [ "${1:-}" = "--emulator" ]; then
  get emulator-linux_x64-16555280.zip 3256d0dd7ac10a8ad8c64b1c5f3ce227036d6b5e "$tc/emulator"
  get x86_64-35_r09.zip 0103e6dab21290c4b9d16550a3ce99476f884eef "$tc/system-images/android-35/google_apis/x86_64" sys-img/google_apis/
  rustup target add x86_64-linux-android # the library for the emulator's x86_64 (build-apk.sh --emulator)
fi
echo "[toolchain] ready: $(du -sh "$tc" | cut -f1) in $tc"
