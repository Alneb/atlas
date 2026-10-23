"""A stand-in copyparty: the few calls of its HTTP API the copyparty plugin makes, on a local folder.

`python3 fake_copyparty.py <root> [password]` prints {"port": n} and serves until killed:
GET <dir>/?ls → {dirs, files} as copyparty answers (href percent-encoded, dirs end in "/", sz, ts) · GET <file> ·
PUT <file>[?replace] (an existing file without ?replace gets a new name, as copyparty does) · POST <path>?move=<vpath> ·
POST <path>?delete (recursive, as copyparty's) · POST <dir>/ multipart act=mkdir name=<name>.
With a password, a request without the `pw` header is a 403.
"""
import json
import os
import shutil
import sys
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = os.path.realpath(sys.argv[1])
PW = sys.argv[2] if len(sys.argv) > 2 else ""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def target(self):
        u = urlsplit(self.path)
        rel = unquote(u.path).lstrip("/")
        full = os.path.realpath(os.path.join(ROOT, rel))
        if full != ROOT and not full.startswith(ROOT + os.sep):
            raise PermissionError(rel)
        return full, parse_qs(u.query, keep_blank_values=True)

    def answer(self, code, body=b"", ctype="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        if PW and self.headers.get("pw") != PW:
            self.answer(403, b"<h1>403 forbidden</h1>", "text/html")
            return False
        return True

    def body(self):
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def do_GET(self):
        if not self.allowed():
            return
        full, q = self.target()
        if "ls" in q:
            if not os.path.isdir(full):
                return self.answer(404, b"no such folder")
            dirs, files = [], []
            for name in sorted(os.listdir(full)):
                st = os.stat(os.path.join(full, name))
                isdir = os.path.isdir(os.path.join(full, name))
                (dirs if isdir else files).append({"href": quote(name) + ("/" if isdir else ""), "sz": 0 if isdir else st.st_size, "ts": int(st.st_mtime)})
            return self.answer(200, json.dumps({"dirs": dirs, "files": files, "perms": ["read", "write", "move", "delete"]}).encode(), "application/json")
        if not os.path.isfile(full):
            return self.answer(404, b"no such file")
        if "th" in q:  # copyparty's thumbnail: a JPEG for a picture (here: the picture itself), an icon for the rest
            if full.lower().endswith((".jpg", ".jpeg")):
                with open(full, "rb") as f:
                    return self.answer(200, f.read(), "image/jpeg")
            return self.answer(200, b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")
        with open(full, "rb") as f:
            self.answer(200, f.read(), "application/octet-stream")

    def do_PUT(self):
        if not self.allowed():
            return
        full, q = self.target()
        data = self.body()
        if os.path.exists(full) and "replace" not in q:
            stem, ext = os.path.splitext(full)
            full = f"{stem}-{int(os.path.getmtime(full))}{ext}"  # copyparty keeps both, under another name
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)
        self.answer(201, b"ok")

    def do_POST(self):
        if not self.allowed():
            return
        full, q = self.target()
        data = self.body()
        if "move" in q:
            to = os.path.realpath(os.path.join(ROOT, unquote(q["move"][0]).lstrip("/")))
            if not to.startswith(ROOT + os.sep) or os.path.exists(to):
                return self.answer(400, b"cannot move there")
            os.rename(full, to)
            return self.answer(200, b"ok")
        if "delete" in q:
            shutil.rmtree(full) if os.path.isdir(full) else os.remove(full)
            return self.answer(200, b"ok")
        msg = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + data)
        fields = {p.get_param("name", header="content-disposition"): p.get_content() for p in msg.iter_parts()}
        if fields.get("act") == "mkdir":
            os.makedirs(os.path.join(full, fields["name"]))
            return self.answer(201, b"ok")
        self.answer(400, b"unknown action")


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(json.dumps({"port": server.server_address[1]}), flush=True)
server.serve_forever()
