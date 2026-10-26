#!/usr/bin/env python3
"""The Notifications plugin's helper (docs/design/DESIGN-notifications.md).

sync  — what arrived on the kept ntfy topics since the last time (`?poll=1&since=<id>`, one id kept per topic in the
        plugin's cache) is filed in a note per source — the message's first tag (Apprise's: backups, updates…), else
        the topic — newest first; what came to the inbox topic is captured. Runs every 5 minutes on the server
        (`schedule`) and when a page asks. Answers what is new and which sources are loud (not muted).
send  — a message to the phone: through the Apprise API when its address is set, else to the phone's ntfy topic.

Standard library only (it runs on the phone's Python too).
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

import atlas_plugin as atlas

CACHE = os.environ.get("ATLAS_PLUGIN_CACHE", ".")
MARK = {5: "🔴", 4: "🟠", 2: "", 1: ""}  # ntfy priorities: 5 urgent, 4 high, 3 default, 2 low, 1 min


def _since_file(topic):
    return os.path.join(CACHE, "since-" + re.sub(r"[^\w.-]", "_", topic))


def _since(topic):
    try:
        with open(_since_file(topic), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _keep_since(topic, mid):
    try:
        os.makedirs(CACHE, exist_ok=True)
        with open(_since_file(topic), "w", encoding="utf-8") as f:
            f.write(mid)
    except OSError as e:
        print(f"notifications: cannot keep the last id of {topic}: {e}", file=sys.stderr, flush=True)


def poll(server, topic, token):
    """The messages of `topic` since the last one kept (ntfy keeps them for hours), oldest first."""
    since = _since(topic) or "12h"
    url = f"{server.rstrip('/')}/{urllib.parse.quote(topic, safe='')}/json?poll=1&since={urllib.parse.quote(since)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"} if token else {})
    out = []
    with urllib.request.urlopen(req, timeout=30) as res:
        for line in res:
            m = json.loads(line or b"{}")
            if m.get("event") == "message":
                out.append(m)
    return out


def source_of(m, topic):
    """The message's first tag (the server's Apprise tag), else the topic: a name fit for a file."""
    tags = [t for t in (m.get("tags") or []) if isinstance(t, str) and t.strip()]
    name = tags[0] if tags else topic
    return re.sub(r"[\\/:*?\"<>|]+", " ", name).strip() or topic


def line_of(m):
    """One message as a line of its source's note; a long body folded into a quote under it."""
    when = dt.datetime.fromtimestamp(int(m.get("time") or 0)).strftime("%Y-%m-%d %H:%M")
    mark = MARK.get(int(m.get("priority") or 3), "")
    title = (m.get("title") or "").strip()
    body = (m.get("message") or "").strip()
    first, _, rest = body.partition("\n")
    link = m.get("click") or ""
    head = f"- {when} · {mark + ' ' if mark else ''}" + (f"**{title}** — {first}" if title else first)
    if link:
        head += f" · [open]({link})"
    head += f" <!-- n={m.get('id', '')} -->"
    more = "".join(f"\n  > {l}" for l in rest.strip().splitlines()) if rest.strip() else ""
    return head + more


def note_path(folder, source):
    return f"{folder.strip('/')}/{source}.md"


def muted(props):
    """`muted: true`, or a date not yet passed."""
    v = props.get("muted")
    if v is True or str(v).strip().lower() == "true":
        return True
    try:
        return dt.date.fromisoformat(str(v).strip()[:10]) >= dt.date.today()
    except ValueError:
        return False


def file_in(path, source, origin, lines):
    """`lines` (newest first) put at the top of the source's note, made when missing; its `unread` grows. → its
    properties (for `muted`)."""
    try:
        text = atlas.read(path)
    except atlas.AtlasError as e:
        if e.status != 404:
            raise
        text = f"---\ntype: notifications\nsource: {source}\nfrom: {origin}\nmuted: false\nunread: 0\n---\n# {source.capitalize()}\n\n"
    head, _, body = text.partition("\n---\n") if text.startswith("---\n") else ("", "", text)
    props = {}
    for l in head.splitlines()[1:]:
        k, _, v = l.partition(":")
        if k.strip():
            props[k.strip()] = v.strip()
    unread = int(props.get("unread") or 0) + len(lines)
    head = re.sub(r"(?m)^unread:.*$", f"unread: {unread}", head) if "unread:" in head else head + f"\nunread: {unread}"
    # under the title heading, newest first
    m = re.match(r"(\s*#[^\n]*\n\n?)", body)
    top, rest = (m.group(1), body[m.end():]) if m else ("", body)
    body = top + "\n".join(lines) + "\n" + rest
    atlas.write(path, f"{head}\n---\n{body}" if head else body)
    return props


@atlas.method
def sync(params):
    s = params.get("settings") or {}
    server = str(s.get("server") or "https://ntfy.sh")
    folder = str(s.get("folder") or "notifications")
    token = (params.get("secrets") or {}).get("token") or ""
    topics = [t.strip() for t in str(s.get("topics") or "").split(",") if t.strip()]
    inbox = str(s.get("inbox") or "").strip()
    new, loud, problems, captured = 0, [], [], 0
    for topic in topics:
        try:
            msgs = poll(server, topic, token)
        except Exception as e:  # noqa: BLE001 — said in the answer and the log; the other topics go on
            problems.append(f"{topic}: {e}")
            continue
        by = {}
        for m in msgs:
            by.setdefault(source_of(m, topic), []).append(m)
        for source, ms in by.items():
            path = note_path(folder, source)
            props = file_in(path, source, f"ntfy: {topic}", [line_of(m) for m in reversed(ms)])
            new += len(ms)
            if not muted(props):
                loud.extend({"source": source, "path": path, "title": m.get("title") or source, "text": (m.get("message") or "")[:200]} for m in ms)
        if msgs:
            _keep_since(topic, msgs[-1].get("id", ""))
    if inbox:
        try:
            msgs = poll(server, inbox, token)
            for m in msgs:
                if (m.get("message") or "").strip():
                    atlas.capture(m["message"])
                    captured += 1
            if msgs:
                _keep_since(inbox, msgs[-1].get("id", ""))
        except Exception as e:  # noqa: BLE001
            problems.append(f"{inbox}: {e}")
    summary = f"{new} new" + (f", {captured} captured" if captured else "") + (f"; {'; '.join(problems)}" if problems else "")
    return {"new": new, "loud": loud[-20:], "captured": captured, "problems": problems, "summary": summary}


@atlas.method
def send(params):
    s = params.get("settings") or {}
    text = str(params.get("text") or "")
    title = str(params.get("title") or "Atlas")
    if not text.strip():
        raise RuntimeError("nothing to send")
    apprise = str(s.get("apprise") or "").strip()
    if apprise:
        body = json.dumps({"title": title, "body": text}).encode("utf-8")
        req = urllib.request.Request(apprise, data=body, method="POST", headers={"Content-Type": "application/json"})
    else:
        topic = str(s.get("phone_topic") or "").strip()
        if not topic:
            raise RuntimeError("set the Apprise address or your phone's topic first: Settings → Notifications")
        token = (params.get("secrets") or {}).get("token") or ""
        url = f"{str(s.get('server') or 'https://ntfy.sh').rstrip('/')}/{urllib.parse.quote(topic, safe='')}?{urllib.parse.urlencode({'title': title})}"
        req = urllib.request.Request(url, data=text.encode("utf-8"), method="POST", headers={"Authorization": f"Bearer {token}"} if token else {})
    with urllib.request.urlopen(req, timeout=30) as res:
        res.read()
    return {"sent": True, "through": "apprise" if apprise else "ntfy"}


if __name__ == "__main__":
    atlas.serve()
