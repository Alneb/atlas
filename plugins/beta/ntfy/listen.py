#!/usr/bin/env python3
"""The ntfy plugin's helper (docs/guides/PLUGIN-API.md): sends to the phone, and keeps a subscription to the "inbox"
topic open, telling Atlas of every message (an event line), so what is sent from the phone becomes a capture.

Atlas → helper (the core adds the plugin's settings and secrets to every call):
  {"id": n, "method": "send", "params": {"text": ..., "title": ..., "settings": {...}, "secrets": {"token": "…"}}}
      → {"id": n, "result": {"sent": true}} — the page's "send to my phone" and the ntfy_send tool alike
  {"id": n, "method": "listen", "params": {"url": ".../topic/json", "secrets": {"token": "…"}}}
      → {"id": n, "result": "listening"}, then {"event": "message", "data": {"text": ..., "title": ...}}
"""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


def say(obj):
    print(json.dumps(obj), flush=True)


# the id of the last message captured, kept in the plugin's cache folder: on the next start the
# subscription asks for everything since (`?since=<id>`), so what the phone sent while Atlas was
# closed is captured too, and nothing twice
LAST = os.path.join(os.environ.get("ATLAS_PLUGIN_CACHE", "."), "last-id")


def last_id():
    try:
        with open(LAST, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def remember(mid):
    try:
        with open(LAST, "w", encoding="utf-8") as f:
            f.write(mid)
    except OSError as e:
        print(f"ntfy: cannot keep the last id: {e}", file=sys.stderr, flush=True)


def listen(url, token):
    delay = 2
    while True:  # a dropped connection is opened again, a little later each time up to a minute
        try:
            since = last_id()
            full = f"{url}{'&' if '?' in url else '?'}since={since}" if since else url
            req = urllib.request.Request(full, headers={"Authorization": f"Bearer {token}"} if token else {})
            with urllib.request.urlopen(req, timeout=90) as res:
                delay = 2
                for line in res:
                    m = json.loads(line or b"{}")
                    if m.get("event") == "message" and m.get("message"):
                        say({"event": "message", "data": {"text": m["message"], "title": m.get("title", "")}})
                        if m.get("id"):
                            remember(m["id"])
        except Exception as e:  # noqa: BLE001 — the reason goes to the plugin's log
            print(f"ntfy: {e}; again in {delay}s", file=sys.stderr, flush=True)
        time.sleep(delay)
        delay = min(delay * 2, 60)  # reset to 2 once a connection succeeds (above)


def send(p):
    """One POST of the text to <server>/<topic>. The title goes in the address (`?title=`), where ntfy reads UTF-8; an
    HTTP header carries only Latin-1, so a note named with an emoji or a Greek letter could not be sent."""
    s = p.get("settings") or {}
    topic = str(s.get("topic") or "").strip()
    text = str(p.get("text") or "")
    if not topic:
        raise RuntimeError("set the topic first: Settings → Plugins & automation → ntfy → Settings…")
    if not text.strip():
        raise RuntimeError("nothing to send")
    url = f"{str(s.get('server') or 'https://ntfy.sh').rstrip('/')}/{urllib.parse.quote(topic, safe='')}?{urllib.parse.urlencode({'title': p.get('title') or 'Atlas'})}"
    token = (p.get("secrets") or {}).get("token") or ""
    req = urllib.request.Request(url, data=text.encode("utf-8"), method="POST", headers={"Authorization": f"Bearer {token}"} if token else {})
    try:
        with urllib.request.urlopen(req, timeout=30):
            pass
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"the server answered {e.code}") from None
    return {"sent": True}


started = False


def start_listening(p):
    global started
    if not started:
        threading.Thread(target=listen, args=(p["url"], (p.get("secrets") or {}).get("token") or p.get("token", "")), daemon=True).start()
        started = True
    return "listening"


METHODS = {"send": send, "listen": start_listening}


def main():
    for raw in sys.stdin:
        msg = json.loads(raw)
        if "id" not in msg:
            continue
        fn = METHODS.get(msg.get("method"))
        try:
            if not fn:
                raise RuntimeError(f"no method {msg.get('method')!r}")
            say({"id": msg["id"], "result": fn(msg.get("params") or {})})
        except Exception as e:  # noqa: BLE001 — the reason is the answer
            say({"id": msg["id"], "error": str(e)})


if __name__ == "__main__":
    main()
