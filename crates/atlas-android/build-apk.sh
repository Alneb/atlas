#!/usr/bin/env bash
# The phone app's APK from the NDK and two small pieces of Google's repository, all in atlas/local/toolchains/
# (docs/guides/ANDROID.md): no SDK manager, no Gradle, no Android Studio.
#   bash crates/atlas-android/build-apk.sh [--debug] [--emulator] [capture|atlas|boox]   → target/dist/android/atlas-capture.apk, atlas.apk, atlas-boox.apk
# --emulator: the library for x86_64 too, so the same APKs run in the emulator (run-emulator.sh).
# Three apps from one library and one dex: "Atlas capture" (the capture box, its launcher opening Settings), "Atlas" (the
# full app, natively, with the same capture box) and "Atlas for Boox" (the full app as its own package, always in e-ink
# mode, with the pen and reading features: Edition.java) — android/AndroidManifest.{capture,atlas}.xml, the Boox one
# made from the full app's here so the two never drift. All three by default.
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tc=$repo/local/toolchains
ndk=$tc/android-ndk-r30
bt=$(dirname "$(ls "$tc"/unpack/*/aapt2 | head -1)")                      # build-tools: aapt2, zipalign, apksigner
jar=$(ls "$tc"/unpack/*/android.jar | head -1)                              # the platform's API stubs
api=26                                                                       # Android 8.0 and newer
profile=release; apps="capture atlas boox"; abis="aarch64:arm64-v8a"
for a in "$@"; do case "$a" in --debug) profile=debug;; --emulator) abis="$abis x86_64:x86_64";; capture|atlas|boox) apps=$a;; *) echo "[apk] unknown argument $a" >&2; exit 2;; esac; done
for p in "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin" "$bt/aapt2" "$jar"; do [ -e "$p" ] || { echo "[apk] missing $p (docs/guides/ANDROID.md, Toolchain)" >&2; exit 1; }; done
bin=$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin
out=$repo/target/dist/android; mkdir -p "$out" "$repo/target/tmp"
# the work folder on disk (target/tmp), not /tmp: three apps unpacked there filled a tmpfs quota
work=$(mktemp -d "${TMPDIR:-$repo/target/tmp}/apk.XXXXXX"); trap 'rm -rf "$work"' EXIT

# the native library, per app: the capture app's without the server (`full`), the full apps' (atlas, boox) with it
full_app() { [ "$1" = atlas ] || [ "$1" = boox ]; }
native() { # native <app> → $work/lib-<app>/<abi>/libatlas_android.so
  local feat=; full_app "$1" && feat="--features full"
  for pair in $abis; do
    abi=${pair#*:} triple=${pair%%:*}-linux-android
    T=$(echo "$triple" | tr 'a-z-' 'A-Z_')
    export "CC_${triple//-/_}=$bin/$triple$api-clang" "AR_${triple//-/_}=$bin/llvm-ar" "CARGO_TARGET_${T}_LINKER=$bin/$triple$api-clang"
    # release: the `android` profile (Cargo.toml: size-optimized)
    cargo build -p atlas-android --target "$triple" $feat $([ $profile = release ] && echo --profile android)
    mkdir -p "$work/lib-$1-$abi/lib/$abi"
    "$bin/llvm-strip" -o "$work/lib-$1-$abi/lib/$abi/libatlas_android.so" "$repo/target/$triple/$([ $profile = release ] && echo android || echo debug)/libatlas_android.so"
    # PDFium for the PDF reader (docs/design/DESIGN-pdfium-android.md; scripts/dev/fetch-pdfium.sh puts it in local/);
    # without it the reader keeps PdfRenderer
    pdfium=$(ls "$repo"/local/pdfium/*-"${abi/arm64-v8a/android-arm64}"/lib/libpdfium.so 2>/dev/null | tail -1)
    if [ -n "$pdfium" ]; then cp "$pdfium" "$work/lib-$1-$abi/lib/$abi/libpdfium.so"; echo "[apk]   PDFium ($abi): $(du -h "$pdfium" | cut -f1)"
    else echo "[apk]   no PDFium for $abi (bash scripts/dev/fetch-pdfium.sh): the PDF reader keeps PdfRenderer"; fi
  done
}
for app in $apps; do echo "[apk] 1/4 the native library for $app ($abis, API $api, $profile)"; native "$app"; done
# the plugins' engines (the catalog's), for the full apps: Android runs no program from the vault (/sdcard is noexec,
# the app's data W^X), so they ship inside the APK as libhelper_<name>.so (python_for below packs helpers/<abi>/*), linked
# into the app's bin/ on the PATH (Helpers.link) — a plugin's `run` finds them through $ATLAS_PLUGIN_BIN
engines() {
  for pair in $abis; do
    abi=${pair#*:} triple=${pair%%:*}-linux-android
    T=$(echo "$triple" | tr 'a-z-' 'A-Z_')
    export "CC_${triple//-/_}=$bin/$triple$api-clang" "AR_${triple//-/_}=$bin/llvm-ar" "CARGO_TARGET_${T}_LINKER=$bin/$triple$api-clang"
    cargo build -p atlas-catalog --target "$triple" $([ $profile = release ] && echo --profile android)
    mkdir -p "$repo/crates/atlas-android/helpers/$abi"
    "$bin/llvm-strip" -o "$repo/crates/atlas-android/helpers/$abi/catalog" "$repo/target/$triple/$([ $profile = release ] && echo android || echo debug)/catalog"
    echo "[apk]   engine catalog ($abi): $(du -h "$repo/crates/atlas-android/helpers/$abi/catalog" | cut -f1)"
  done
}
case " $apps " in *" atlas "*|*" boox "*) engines ;; esac

# The full app's Python (docs/guides/ANDROID.md, "Python and helpers"): python.org's
# Android build — libpython and its libraries beside ours, our launcher (python/launcher.c) as the `python3` program, the
# standard library as an asset the app unpacks — and the plugin helpers compiled for Android (helpers/<abi>/<name>).
PYV=3.14.0
python_for() { # python_for <app> <arch:abi>
  local app=$1; shift
  local arch=${1%%:*} abi=${1#*:} d=$tc/python-android
  local tgz=$d/python-$PYV-$arch-linux-android.tar.gz px=$d/$arch
  mkdir -p "$d"
  [ -f "$tgz" ] || curl -fL --retry 3 -o "$tgz" "https://www.python.org/ftp/python/$PYV/python-$PYV-$arch-linux-android.tar.gz"
  [ -d "$px/prefix" ] || { mkdir -p "$px"; tar -xzf "$tgz" -C "$px"; }
  local out=$work/lib-$app-$abi/lib/$abi
  "$bin/$arch-linux-android$api-clang" -O2 -fPIE -pie -I"$px/prefix/include/python${PYV%.*}" "$repo/crates/atlas-android/python/launcher.c" \
    -L"$px/prefix/lib" -lpython${PYV%.*} -Wl,-rpath,'$ORIGIN' -o "$out/libpython3exe.so"
  cp "$px"/prefix/lib/libpython${PYV%.*}.so "$px"/prefix/lib/lib*_python.so "$out/"
  "$bin/llvm-strip" "$out/libpython3exe.so"
  # the standard library (no tests, no GUI toolkits, no bytecode) — the app unpacks it on first start, per ABI
  mkdir -p "$work/assets-$app-$abi"
  (cd "$px/prefix/lib" && zip -q -r -X "$work/assets-$app-$abi/python-$abi.zip" "python${PYV%.*}" -x "*/test/*" "*/idlelib/*" "*/tkinter/*" "*/turtledemo/*" "*/__pycache__/*" "*/ensurepip/*")
  for h in "$repo/crates/atlas-android/helpers/$abi"/*; do
    [ -f "$h" ] && cp "$h" "$out/libhelper_$(basename "$h").so" && echo "[apk]   helper $(basename "$h") ($abi)"
  done
  echo "[apk]   python $PYV for $abi: $(du -sh "$work/assets-$app-$abi/python-$abi.zip" | cut -f1) of standard library"
}
for app in $apps; do full_app "$app" && for pair in $abis; do python_for "$app" "$pair"; done; done

echo "[apk] 2/4 the Java screen (javac → d8) and the resources (the icons generated from the desktop box's paths)"
# the plain-Java logic first (the screen recognisers, the capture's addresses): a wrong guess fails the build, not the phone
bash "$repo/crates/atlas-android/android/test/run.sh"
mkdir -p "$work/classes" "$work/res"
# the native plugins' Java (docs/refactor/REFACTOR-native-plugins.md) compiled with the app, and the list it reads generated
mapfile -t plugin_dirs < <(bash "$repo/crates/atlas-android/native-plugins.sh" "$work/NativePlugins.java")
plugin_java=(); for d in "${plugin_dirs[@]+"${plugin_dirs[@]}"}"; do while IFS= read -r f; do plugin_java+=("$f"); done < <(find "$d" -name '*.java'); done
javac -nowarn -source 17 -target 17 -cp "$jar" -d "$work/classes" "$repo"/crates/atlas-android/android/java/org/atlas/capture/*.java "$repo"/crates/atlas-android/android/java/org/atlas/notepad/*.java "$work/NativePlugins.java" "${plugin_java[@]+"${plugin_java[@]}"}"
"$bt/d8" --release --min-api $api --lib "$jar" --output "$work" $(find "$work/classes" -name '*.class')
cp -r "$repo/crates/atlas-android/android/res/." "$work/res/"
cargo run -q -p atlas-android --bin android-res -- "$work/res"
"$bt/aapt2" compile --dir "$work/res" -o "$work/res.zip"
key=$tc/atlas-debug.keystore
[ -f "$key" ] || keytool -genkeypair -keystore "$key" -storepass atlas-debug -keypass atlas-debug -alias atlas -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Atlas debug" >/dev/null 2>&1
# One APK per ABI: the phone's arm64 one is <name>.apk, the emulator's
# x86_64 one <name>-x86_64.apk — neither carries the other's libraries.
for app in $apps; do
  for pair in $abis; do
  abi=${pair#*:}
  case $app in atlas) name=atlas;; boox) name=atlas-boox;; *) name=atlas-capture;; esac
  name=$name$([ "$abi" = arm64-v8a ] || echo "-$abi")
  manifest=$repo/crates/atlas-android/android/AndroidManifest.$app.xml
  if [ "$app" = boox ]; then # the full app's manifest as its own package: beside "Atlas" on the same tablet
    manifest=$work/AndroidManifest.boox.xml
    sed -e 's/package="org.atlas.app"/package="org.atlas.boox"/' -e 's/android:label="Atlas"/android:label="Atlas for Boox"/' \
      -e 's/android:scheme="org.atlas.app"/android:scheme="org.atlas.boox"/' \
      -e 's/android:authorities="org.atlas.app.photos"/android:authorities="org.atlas.boox.photos"/' "$repo/crates/atlas-android/android/AndroidManifest.atlas.xml" > "$manifest"
    grep -q 'package="org.atlas.boox"' "$manifest" && grep -q 'android:scheme="org.atlas.boox"' "$manifest" && ! grep -q 'org.atlas.app.photos' "$manifest" || { echo "[apk] the Boox manifest was not made (the full app's changed shape)" >&2; exit 1; }
  fi
  echo "[apk] 3/4 $name: linked with $(basename "$manifest"), the library and the code in, aligned"
  # a new version number every build (minutes since 1970) and the commit in its name, so the phone sees an update
  assets=; [ -d "$work/assets-$app-$abi" ] && assets="-A $work/assets-$app-$abi"
  "$bt/aapt2" link -o "$work/$name.apk" -R "$work/res.zip" $assets -0 zip --auto-add-overlay --manifest "$manifest" -I "$jar" --min-sdk-version $api --target-sdk-version 35 \
    --replace-version --version-code $(( $(date +%s) / 60 )) --version-name "0.1.0-$(git -C "$repo" rev-parse --short HEAD)"
  cp "$work/classes.dex" "$work/lib-$app-$abi/" && (cd "$work/lib-$app-$abi" && zip -q -r "../$name.apk" lib classes.dex)
  "$bt/zipalign" -P 16 -f 4 "$work/$name.apk" "$work/$name-aligned.apk"
  echo "[apk] 4/4 $name: signed (a key of this machine, made once in local/toolchains/)"
  "$bt/apksigner" sign --ks "$key" --ks-pass pass:atlas-debug --key-pass pass:atlas-debug --out "$out/$name.apk" "$work/$name-aligned.apk"
  "$bt/apksigner" verify "$out/$name.apk" && echo "[apk] $out/$name.apk ($(du -h "$out/$name.apk" | cut -f1)) — install: adb install -r $out/$name.apk"
  done
done
