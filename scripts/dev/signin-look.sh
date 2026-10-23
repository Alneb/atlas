#!/usr/bin/env bash
# Checks the desktop app's sign-in window (crates/atlas-app `signin_window`, docs/guides/PLUGIN-API.md `atlas.signIn`)
# without touching the user's screen: a headless KWin of its own (`kwin_wayland --virtual`) on a private
# D-Bus, a throwaway vault, and a fake provider on 127.0.0.1 whose page signs in by itself and answers
# with a redirect to https://localhost/?code=… — as Microsoft's does. A probe plugin calls atlas.signIn;
# what it got back is written to the vault. Screenshots of the window go to <out-dir>.
#
#   bash scripts/dev/signin-look.sh <atlas-app binary> <out-dir>
# Needs kwin_wayland, dbus-run-session, python3 (dbus) and ImageMagick (`magick`); the UI from ui/dist.
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
W=${ATLAS_LOOK_DIR:-${TMPDIR:-/tmp}/atlas-signin-look}
K=$W/kwin

if [ -z "${ATLAS_LOOK_BUS:-}" ]; then
  rm -rf "$W" && mkdir -p "$K/rt" "$K/cfg" "$K/data" "$K/state" "$K/cache" && chmod 700 "$K/rt"
  cat > "$K/bus.conf" <<EOF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig><type>session</type><listen>unix:tmpdir=$K</listen>
<policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy></busconfig>
EOF
  V=$W/vault P=$V/.atlas/plugins/probe
  mkdir -p "$P" "$V/notes" && printf '# Home\n' > "$V/notes/Home.md"
  printf 'title = "Sign-in probe"\napi = 4\n' > "$P/plugin.toml"
  # the provider's port is known only inside; the plugin reads it from a file the script writes there
  cat > "$P/main.js" <<'EOF'
export function register(atlas) {
  // started outside `register` and without a click, as a sign-in started from a helper's answer would be
  setTimeout(async () => {
    try {
      const port = (await atlas.readText("port.txt")).trim();
      const page = `http://127.0.0.1:${port}/authorize?client_id=x&redirect_uri=${encodeURIComponent("https://localhost")}&state=s1`;
      await atlas.createFile("started.txt", page);
      const url = await atlas.signIn(page, "https://localhost");
      await atlas.createFile("got.txt", url);
    } catch (e) { await atlas.createFile("got.txt", `failed: ${e.message ?? e}`); }
  }, 1500);
}
EOF
  printf '[[vault]]\nname = "Probe"\npath = "%s"\nlast_opened = 1\n' "$V" > "$W/vaults.toml"
  ATLAS_LOOK_BUS=1 exec dbus-run-session --config-file="$K/bus.conf" -- "$0" "$@"
fi
export XDG_RUNTIME_DIR=$K/rt XDG_CONFIG_HOME=$K/cfg XDG_DATA_HOME=$K/data XDG_STATE_HOME=$K/state XDG_CACHE_HOME=$K/cache
export ATLAS_VAULTS=$W/vaults.toml ATLAS_SECRETS_DIR=$W/secrets KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 KDE_DEBUG=1
unset WAYLAND_DISPLAY DISPLAY

if [ -n "${ATLAS_LOOK_INSIDE:-}" ]; then
  # shellcheck disable=SC2064
  trap "[ \"\$(ps -p $PPID -o comm=)\" = kwin_wayland ] && kill $PPID" EXIT
  export WAYLAND_DISPLAY=atlas-look
  set -- $ATLAS_LOOK_ARGS
  bin=$1 out=$2; mkdir -p "$out"
  shot() { python3 "$here/capture/shot.py" "$1" >/dev/null && echo "[look] $1"; }
  # the fake provider: a page that "signs in" after 2.5 s (a form POST), answered by a 302 to the return address
  python3 - "$W/vault/port.txt" > "$out/provider.log" 2>&1 <<'EOF' &
import http.server, socketserver, sys, urllib.parse
PAGE = b"""<!doctype html><title>Provider sign-in</title><body style="font:16px sans-serif;padding:2em">
<h2>Sign in to the provider</h2><p>Signing in by itself in a moment...</p>
<form id=f method=post action=/login><input name=user value=me><button>Sign in</button></form>
<script>setTimeout(() => document.getElementById('f').submit(), 2500)</script>"""
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("content-type", "text/html"); self.end_headers(); self.wfile.write(PAGE)
        print("GET", self.path, flush=True)
    def do_POST(self):
        self.send_response(302); self.send_header("location", "https://localhost/?code=c-42&state=s1"); self.end_headers()
        print("POST", self.path, "→ 302 https://localhost/?code=c-42&state=s1", flush=True)
s = socketserver.TCPServer(("127.0.0.1", 0), H)
open(sys.argv[1], "w").write(str(s.server_address[1]))
s.serve_forever()
EOF
  prov=$!
  sleep 0.5
  # this repository's build, never the installed UI an Atlas terminal names in $ATLAS_UI_DIR
  ATLAS_UI_DIR=${ATLAS_LOOK_UI:-$here/../../ui/dist} "$bin" "$W/vault" > "$out/app.log" 2>&1 &
  app=$!
  sleep 6; shot "$out/1-window.png"
  for _ in $(seq 40); do [ -f "$W/vault/got.txt" ] && break; sleep 0.5; done
  sleep 1; shot "$out/2-after.png"
  echo "[look] provider: $(tr '\n' ' ' < "$out/provider.log")"
  echo "[look] the plugin started: $(cat "$W/vault/started.txt" 2>/dev/null || echo NO)"
  echo "[look] the plugin got: $(cat "$W/vault/got.txt" 2>/dev/null || echo NOTHING)"
  echo "[look] app: $(grep -i 'sign' "$out/app.log" | tr '\n' ' ')"
  kill $app $prov 2>/dev/null
  exit 0
fi

touch "$K/started"
ATLAS_LOOK_INSIDE=1 ATLAS_LOOK_ARGS="$*" timeout 120 kwin_wayland --virtual --socket atlas-look --width 1280 --height 800 \
  --no-lockscreen --inputmethod "" "$0" > "$K/kwin.log" 2>&1
grep -h '^\[look\]' "$K/kwin.log"
