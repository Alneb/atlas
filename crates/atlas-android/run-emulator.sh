#!/usr/bin/env bash
# The phone apps in an emulator, headless, from atlas/local/toolchains/ (get-toolchain.sh --emulator): a phone-sized virtual
# device made here by hand (no avdmanager), booted with no window; then the APKs installed. docs/guides/ANDROID.md, "Checking".
# ATLAS_EMU_GPU=guest: the emulator's GPU mode (swangle_indirect by default: swiftshader_indirect segfaulted in qemu's
#   RenderThread on 2026-10-17, twice, with memory to spare; swangle booted).
# ATLAS_EMU_RAM=2048: the device's memory in MB (3072 by default); with little free memory the host kills the emulator
#   silently during boot (2026-10-17: 2 GB free of 13).
#   bash crates/atlas-android/run-emulator.sh start      boot it (and wait), install target/dist/android/*-x86_64.apk (build-apk.sh --emulator)
#   bash crates/atlas-android/run-emulator.sh shot <out.png>   the screen as it is
#   bash crates/atlas-android/run-emulator.sh stop
#   bash crates/atlas-android/run-emulator.sh plugin <package> <plugin id> <file>   a test vault inside the app (root shell:
#     the google_apis image), <file> copied into its drawings/, the app pointed at it, the native plugin opened on it
#     (PluginActivity is not exported; root may start it) — e.g. plugin org.atlas.boox notepad my.excalidraw.
#     A pen for it: adb -s emulator-5580 shell input stylus swipe x0 y0 x1 y1 | input stylus motionevent DOWN|MOVE|UP x y
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tc=$repo/local/toolchains
export ANDROID_SDK_ROOT=$tc ANDROID_HOME=$tc ANDROID_AVD_HOME=$tc/avd
serial=emulator-5580
adb() { command adb -s $serial "$@"; }
case "${1:-start}" in
start)
  mkdir -p "$tc/avd/atlas.avd" "$tc/platform-tools" "$tc/platforms"
  # the emulator takes the folder as an SDK only with platform-tools in it: the system's adb, linked
  ln -sfn "$(type -P adb)" "$tc/platform-tools/adb" # type -P: the binary, not the adb() function above
  printf 'avd.ini.encoding=UTF-8\npath=%s\ntarget=android-35\n' "$tc/avd/atlas.avd" > "$tc/avd/atlas.ini"
  cat > "$tc/avd/atlas.avd/config.ini" <<CFG
AvdId=atlas
avd.ini.displayname=atlas
abi.type=x86_64
hw.cpu.arch=x86_64
hw.cpu.ncore=4
image.sysdir.1=system-images/android-35/google_apis/x86_64/
tag.id=google_apis
hw.lcd.width=1080
hw.lcd.height=2400
hw.lcd.density=420
hw.ramSize=${ATLAS_EMU_RAM:-3072}
disk.dataPartition.size=6G
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=${ATLAS_EMU_GPU:-swangle_indirect}
CFG
  echo "[emulator] booting (headless)"
  nohup setsid nice -n 19 "$tc/emulator/emulator" -avd atlas -port 5580 -no-window -no-audio -no-boot-anim -no-snapshot -gpu "${ATLAS_EMU_GPU:-swangle_indirect}" > "$tc/avd/emulator.log" 2>&1 &
  command adb start-server >/dev/null
  timeout 600 bash -c "until [ \"\$(command adb -s $serial shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')\" = 1 ]; do sleep 2; done" || { echo "[emulator] did not boot: $tc/avd/emulator.log" >&2; exit 1; }
  echo "[emulator] booted"
  for apk in "$repo"/target/dist/android/*-x86_64.apk; do echo "[emulator] install $(basename "$apk")"; adb install -r "$apk" >/dev/null; done ;;
plugin)
  pkg=$2 id=$3 file=$4 data=/data/data/$2; vault=$data/files/vault
  adb root >/dev/null; sleep 3; adb wait-for-device
  adb shell am force-stop "$pkg"
  adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 4 # its data folder made
  adb shell am force-stop "$pkg"
  uid=$(adb shell stat -c %u "$data" | tr -d '\r')
  prefs=$(mktemp)
  printf '%s\n' "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>" "<map>" \
    "<string name=\"vaults\">[&quot;$vault&quot;]</string>" "<string name=\"current\">$vault</string>" "</map>" > "$prefs"
  adb push "$file" /data/local/tmp/plugin-file >/dev/null && adb push "$prefs" /data/local/tmp/atlas.xml >/dev/null; rm -f "$prefs"
  name=$(basename "$file")
  adb shell "mkdir -p $vault/drawings $data/shared_prefs && cp /data/local/tmp/plugin-file '$vault/drawings/$name' && cp /data/local/tmp/atlas.xml $data/shared_prefs/atlas.xml && chown -R $uid:$uid $data/files $data/shared_prefs && restorecon -R $data"
  echo "[emulator] $pkg: vault $vault, drawings/$name, opening $id"
  adb shell am start -n "$pkg/org.atlas.capture.PluginActivity" --es org.atlas.plugin "$id" --es org.atlas.path "drawings/$name" ;;
shot) adb exec-out screencap -p > "$2"; echo "[emulator] $2" ;;
stop) adb emu kill || true ;;
esac
