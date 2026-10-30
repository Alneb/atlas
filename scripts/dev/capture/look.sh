#!/usr/bin/env bash
# Looks at the native capture box (crates/atlas-capture) without touching the user's screen: each run
# starts a headless KWin of its own (`kwin_wayland --virtual`) on a private D-Bus, with its own
# runtime, config and data folders, and shows the box there. docs/guides/CAPTURE.md, "How it was checked".
#
#   bash scripts/dev/capture/look.sh shots <binary> <out-dir>      each state, dark and light, as PNGs
#   bash scripts/dev/capture/look.sh speed <binary>… [-n 20]       launch → first frame on screen, in ms
#   bash scripts/dev/capture/look.sh run   <command…>             a command inside the nested session, its output
#   bash scripts/dev/capture/look.sh keys  <binary> <out-dir>      real keys (X11 through Xwayland, XTEST):
#                                                                     a to-do with a date, a link, the vault
#                                                                     menu, Enter — then what was written
# ATLAS_LOOK_SCALE=1.5 runs the nested screen at that scale (fractional scaling: the box gets wp_fractional_scale).
# ATLAS_LOOK_STATES (one "name|text" per line) limits `shots` to those states; ATLAS_LOOK_PLUGINS (folders) are copied
# into both vaults' .atlas/plugins.
# Needs kwin_wayland, dbus-run-session, python3 (dbus, Xlib) and ImageMagick (`magick`).
# Vaults: two small throwaway ones made here (Work: dark, Personal: light); nothing else is read.
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
W=${ATLAS_LOOK_DIR:-${TMPDIR:-/tmp}/atlas-capture-look}
K=$W/kwin

# 1. a private bus with no service activation (no portal, no input method starts on it), then KWin
if [ -z "${ATLAS_LOOK_BUS:-}" ]; then
  mkdir -p "$K/rt" "$K/cfg" "$K/data" "$K/state" "$K/cache" && chmod 700 "$K/rt"
  cat > "$K/bus.conf" <<EOF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig><type>session</type><listen>unix:tmpdir=$K</listen>
<policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy></busconfig>
EOF
  # the nested KWin's own settings: a US keyboard, and XTEST allowed without asking (it would ask in a dialog)
  printf '[Layout]\nLayoutList=us\nUse=true\n' > "$K/cfg/kxkbrc"
  printf '[Xwayland]\nXwaylandEisNoPrompt=true\n' > "$K/cfg/kwinrc"
  # the vaults
  for v in Work:dark Personal:light; do
    name=${v%%:*}; mkdir -p "$W/vaults/$name/.atlas" "$W/vaults/$name/notes"
    printf '[ui]\ntheme = "%s"\n' "${v##*:}" > "$W/vaults/$name/.atlas/config.toml"
    for n in "Hamiltonian" "Holstein" "Hubbard model" "Kondo effect" "GW notes"; do printf '# %s\n\n#physics\n' "$n" > "$W/vaults/$name/notes/$n.md"; done
    # ATLAS_LOOK_PLUGINS: plugin folders copied in (the catalog and its sources: the box's "catalogued as …")
    for pl in ${ATLAS_LOOK_PLUGINS:-}; do mkdir -p "$W/vaults/$name/.atlas/plugins"; cp -r "$pl" "$W/vaults/$name/.atlas/plugins/"; done
  done
  printf '[[vault]]\nname = "Work"\npath = "%s"\nlast_opened = 2\n\n[[vault]]\nname = "Personal"\npath = "%s"\nlast_opened = 1\n' "$W/vaults/Work" "$W/vaults/Personal" > "$W/vaults.toml"
  ATLAS_LOOK_BUS=1 exec dbus-run-session --config-file="$K/bus.conf" -- "$0" "$@"
fi
export XDG_RUNTIME_DIR=$K/rt XDG_CONFIG_HOME=$K/cfg XDG_DATA_HOME=$K/data XDG_STATE_HOME=$K/state XDG_CACHE_HOME=$K/cache
export ATLAS_VAULTS=$W/vaults.toml KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 KDE_DEBUG=1 # KDE_DEBUG: no crash dialog
unset WAYLAND_DISPLAY DISPLAY

# 2. inside KWin (it starts this script as its application, the arguments in the environment)
if [ -n "${ATLAS_LOOK_INSIDE:-}" ]; then
  # KWin exits with this script (--exit-with-session): no trap, no kill (a trap killing $PPID left it running)
  export WAYLAND_DISPLAY=atlas-look
  # the nested Xwayland: the X socket that appeared after KWin started (never :0); the helpers check the size too
  nested_x() {
    local sock=
    for _ in $(seq 50); do sock=$(find /tmp/.X11-unix -maxdepth 1 -name 'X*' -newer "$K/started" -user "$(id -u)" | sort | tail -1); [ -n "$sock" ] && break; sleep 0.1; done
    [ -n "$sock" ] && [ "$sock" != /tmp/.X11-unix/X0 ] || { echo "[look] no nested X display"; return 1; }
    echo ":${sock##*/X}"
  }
  scale=${ATLAS_LOOK_SCALE:-1}
  export ATLAS_LOOK_SCREEN="1280x800 $(python3 -c "import sys; s=float(sys.argv[1]); print(f'{round(1280*s)}x{round(800*s)}')" "$scale")"
  # fractional scaling: KWin's --scale only makes the virtual output bigger; the scale itself is set here, the
  # way System Settings does it (kscreen-doctor, its backend in-process: no KScreen service on the private bus)
  if [ "$scale" != 1 ]; then
    KSCREEN_BACKEND_INPROCESS=1 timeout 10 kscreen-doctor "output.Virtual-0.scale.$scale" >/dev/null 2>&1 \
      || echo "[look] could not set the scale to $scale"
    echo "[look] output: $(KSCREEN_BACKEND_INPROCESS=1 timeout 10 kscreen-doctor -o 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Scale|Geometry' | tr -s '\t\n' '  ')"
  fi
  set -- $ATLAS_LOOK_ARGS
  cmd=$1; shift
  shot() { python3 "$here/shot.py" "$1" >/dev/null && magick "$1" -trim +repage "$1"; }
  # a plain desktop behind the box, so its transparent corners and shadow show (KWin's own is black)
  backdrop() { local x; x=$(nested_x) || return 1; DISPLAY=$x python3 "$here/backdrop.py" "${ATLAS_LOOK_BACKDROP:-#6b7280}" & sleep 0.5; }
  sleep 1
  case "$cmd" in
  run) # any command inside the nested session (a probe): look.sh run kscreen-doctor -o
    "$@" 2>&1 | sed 's/^/[look] /' ;;
  shots)
    bin=$1 out=$2; mkdir -p "$out"
    backdrop
    # one state per line, "name|text typed"
    states=${ATLAS_LOOK_STATES:-"empty|
plain|call Ana about the bath @tomorrow
task|[] pay the rent d
dates|[] pay the rent 📅 t
link|read [[h
tag|idea #ph
day|call Ana @t
vaults|
long|a long thought that goes on and on, past the end of the line, to see how the box grows when the text wraps over more than one line"}
    for theme in dark light; do
      vault=$W/vaults/Work; [ "$theme" = light ] && vault=$W/vaults/Personal
      while IFS= read -r state; do
        [ -n "$state" ] || continue
        name=${state%%|*} text=${state#*|}
        if [ "$name" = vaults ]; then ATLAS_CAPTURE_DRAFTS=off ATLAS_CAPTURE_MENU=1 "$bin" "$vault" >/dev/null 2>&1 & else ATLAS_CAPTURE_DRAFTS=off ATLAS_CAPTURE_TEXT="$text" "$bin" "$vault" >/dev/null 2>&1 & fi
        sleep 1.2; shot "$out/$theme-$name.png"; kill $! 2>/dev/null; wait $! 2>/dev/null
        echo "[look] $out/$theme-$name.png $(magick identify -format '%wx%h' "$out/$theme-$name.png")"
      done <<< "$states"
    done ;;
  speed)
    n=20; bins=()
    while [ $# -gt 0 ]; do case "$1" in -n) n=$2; shift 2;; *) bins+=("$1"); shift;; esac; done
    declare -A all
    for _ in $(seq "$n"); do
      for bin in "${bins[@]}"; do # in turn, so a busy moment of the machine falls on all of them alike
        log=$W/wl.log; t0=$(date +%s.%N)
        WAYLAND_DEBUG=client "$bin" > "$log" 2>&1 & pid=$!
        for _ in $(seq 400); do grep -q "attach(wl_buffer" "$log" && break; sleep 0.005; done
        kill $pid; wait $pid 2>/dev/null
        # WAYLAND_DEBUG stamps each message [HH:MM:SS.µs] (UTC): the first buffer attached is the first frame
        all[$bin]+=" $(python3 -c "
import datetime,sys
t0=float(sys.argv[1]); h,m,s=sys.argv[2].split(':')
d=datetime.datetime.fromtimestamp(t0,datetime.timezone.utc).replace(hour=int(h),minute=int(m),second=0,microsecond=0)
print(round((d.timestamp()+float(s)-t0)*1000))" "$t0" "$(grep -m1 'attach(wl_buffer' "$log" | sed 's/^\[\([0-9:.]*\)\].*/\1/')")"
        sleep 0.2
      done
    done
    for bin in "${bins[@]}"; do python3 -c "
import statistics,sys; v=sorted(int(x) for x in sys.argv[2].split())
print(f'[look] {sys.argv[1]}: launch → first frame: median {statistics.median(v):.0f} ms, min {v[0]}, max {v[-1]} (n={len(v)})')" "$bin" "${all[$bin]}"; done ;;
  keys)
    bin=$1 out=$2; mkdir -p "$out"; rm -rf "$W"/vaults/*/log
    DISPLAY=$(nested_x) || exit 1; export DISPLAY
    press() { python3 "$here/xtype.py" "$@"; sleep 0.3; }
    ( unset WAYLAND_DISPLAY; exec "$bin" "$W/vaults/Personal" ) > "$out/box.log" 2>&1 &
    sleep 1.5
    press "[] pay the rent d"; shot "$out/keys-1-task.png"
    press key:Tab key:Return; shot "$out/keys-2-dates.png"
    press key:Return "[[ham"; shot "$out/keys-3-link.png"
    press key:Return "ok" key:alt+v; shot "$out/keys-4-vaults.png"
    press key:Down key:Return; shot "$out/keys-5-chosen.png"
    press key:Return; sleep 1
    echo "[look] the box said: $(cat "$out/box.log")"
    echo "[look] written: $(cat "$W"/vaults/*/log/*.md 2>/dev/null | grep -- '- ' | tail -1)"
    # another window taking the focus closes the box
    ( unset WAYLAND_DISPLAY; exec "$bin" ) > "$out/first.log" 2>&1 &
    sleep 1.5; ( unset WAYLAND_DISPLAY; exec "$bin" ) >/dev/null 2>&1 & sleep 1.5
    echo "[look] a second box opened, the first said: $(cat "$out/first.log")"
    kill %2 2>/dev/null ;;
  esac
  exit 0
fi

# 3. start KWin with this script as its application
touch "$K/started"
# the output in device pixels: 1280×800 points at the scale asked for (set inside, above)
px=$(python3 -c "import sys; s=float(sys.argv[1]); print(round(1280*s), round(800*s))" "${ATLAS_LOOK_SCALE:-1}")
ATLAS_LOOK_INSIDE=1 ATLAS_LOOK_ARGS="$*" timeout 300 kwin_wayland --virtual --xwayland --socket atlas-look --width "${px% *}" --height "${px#* }" \
  --no-lockscreen --no-global-shortcuts --inputmethod "" \
  --exit-with-session "$0" > "$K/kwin.log" 2>&1
echo "[look] the nested KWin exited ($?; 124 = it had to be stopped by the timeout)" >> "$K/kwin.log"
grep -h '^\[look\]' "$K/kwin.log"
