"""A minimal language server for the Playwright LSP test: hover, one diagnostic, completion, a code action, and a
rename that answers with `documentChanges` touching the open file and a sibling `lsp_other.py`."""
import json, sys

inp, out = sys.stdin.buffer, sys.stdout.buffer

def read():
    n = None
    while True:
        line = inp.readline()
        if not line:
            sys.exit(0)
        line = line.strip()
        if not line:
            if n is not None:
                return json.loads(inp.read(n))
            continue
        k, _, v = line.decode().partition(":")
        if k.lower() == "content-length":
            n = int(v)

def send(msg):
    b = json.dumps(msg).encode()
    out.write(b"Content-Length: %d\r\n\r\n" % len(b) + b)
    out.flush()

while True:
    m = read()
    meth, mid = m.get("method"), m.get("id")
    if meth == "initialize":
        send({"jsonrpc": "2.0", "id": mid, "result": {"capabilities": {
            "textDocumentSync": 1, "hoverProvider": True, "renameProvider": True, "codeActionProvider": True,
            "completionProvider": {"triggerCharacters": ["."]}}}})
    elif meth == "textDocument/didOpen":
        uri = m["params"]["textDocument"]["uri"]
        send({"jsonrpc": "2.0", "method": "textDocument/publishDiagnostics", "params": {"uri": uri, "diagnostics": [
            {"range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 6}},
             "severity": 2, "message": "fake: unused import"}]}})
    elif meth == "textDocument/hover":
        send({"jsonrpc": "2.0", "id": mid, "result": {"contents": {"kind": "markdown", "value": "**fake hover** from the test server"}}})
    elif meth == "textDocument/completion":
        send({"jsonrpc": "2.0", "id": mid, "result": [{"label": "fake_completion", "kind": 3}]})
    elif meth == "textDocument/rename":
        p = m["params"]
        uri, new = p["textDocument"]["uri"], p["newName"]
        word = {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 8}}  # "old_name" on line 1
        other = uri.rsplit("/", 1)[0] + "/lsp_other.py"
        send({"jsonrpc": "2.0", "id": mid, "result": {"documentChanges": [
            {"textDocument": {"uri": u, "version": None}, "edits": [{"range": word, "newText": new}]} for u in (uri, other)]}})
    elif meth == "textDocument/codeAction":
        # a quick fix for the diagnostic sent along (the unused import on line 1), and one that edits a sibling file
        p = m["params"]
        uri = p["textDocument"]["uri"]
        seen = [d["message"] for d in p["context"]["diagnostics"]]
        first = {"start": {"line": 0, "character": 0}, "end": {"line": 1, "character": 0}}
        send({"jsonrpc": "2.0", "id": mid, "result": [
            {"title": "Remove unused import" + (" (asked about: %s)" % seen[0] if seen else ""), "kind": "quickfix",
             "edit": {"documentChanges": [{"textDocument": {"uri": uri, "version": None}, "edits": [{"range": first, "newText": ""}]}]}},
            {"title": "Disabled action", "disabled": {"reason": "no"}}]})
    elif meth == "shutdown":
        send({"jsonrpc": "2.0", "id": mid, "result": None})
    elif mid is not None:
        send({"jsonrpc": "2.0", "id": mid, "result": None})
