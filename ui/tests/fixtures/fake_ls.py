"""A minimal language server for the Playwright LSP test: hover, one diagnostic, completion, a code action, the
project's symbols, and a
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
            "textDocumentSync": 1, "hoverProvider": True, "renameProvider": True, "codeActionProvider": True, "workspaceSymbolProvider": True, "inlayHintProvider": True,
            "completionProvider": {"triggerCharacters": ["."]}}}})
    elif meth == "textDocument/didOpen":
        uri = m["params"]["textDocument"]["uri"]
        send({"jsonrpc": "2.0", "method": "textDocument/publishDiagnostics", "params": {"uri": uri, "diagnostics": [
            {"range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 6}},
             "severity": 2, "message": "fake: unused import"}]}})
    elif meth == "textDocument/hover":
        # the environment it was started in (python_env.rs): the environment picker's test reads it here
        env = __import__("os").environ.get("VIRTUAL_ENV", "")
        send({"jsonrpc": "2.0", "id": mid, "result": {"contents": {"kind": "markdown", "value": "**fake hover** from the test server" + (" in env " + env.rsplit("/", 2)[-2] + "/" + env.rsplit("/", 1)[-1] if env else "")}}})
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
    elif meth == "textDocument/inlayHint":
        # a parameter's name before the `2` of line 6 (`    return -2 * t`), as pyright names a call's arguments
        send({"jsonrpc": "2.0", "id": mid, "result": [{"position": {"line": 5, "character": 12}, "label": "t:", "kind": 2, "paddingRight": True}]})
    elif meth == "workspace/symbol":
        # two symbols in the open file's folder: a function in run.py and a class in lsp_sym.py (line 3)
        base = "file://" + __import__("os").getcwd()
        send({"jsonrpc": "2.0", "id": mid, "result": [
            {"name": "energy", "kind": 12, "location": {"uri": base + "/scripts/run.py", "range": {"start": {"line": 3, "character": 0}, "end": {"line": 3, "character": 6}}}},
            {"name": "Lattice", "kind": 5, "containerName": "lsp_sym", "location": {"uri": base + "/projects/lsp_sym.py", "range": {"start": {"line": 2, "character": 0}, "end": {"line": 2, "character": 7}}}}]})
    elif meth == "shutdown":
        send({"jsonrpc": "2.0", "id": mid, "result": None})
    elif mid is not None:
        send({"jsonrpc": "2.0", "id": mid, "result": None})
