#!/usr/bin/env bash
# What must not be in a repository that could be published: secrets, and this machine's owner.
#   bash scripts/dev/scan-personal.sh          # the tracked CODE (docs/ and the session logs are left out:
#   bash scripts/dev/gate.sh scan              #   they are the user's own record and are handled apart — roadmap 11.3)
# It looks in files git tracks for: home-folder paths (/home/<name>), e-mail addresses, and things
# shaped like tokens (API keys, bearer tokens, private keys). Exit 1 when anything is found; each
# finding is printed as file:line. A line that must stay is marked with `scan:allow` and a reason.
set -u
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 2

# third-party licence texts (a font's OFL.txt) carry their authors' addresses and must stay word for word
files="$(git ls-files -- . ':!docs/' ':!*.lock' ':!ui/package-lock.json' ':!ui/src/vendor/' ':!*.png' ':!*.pdf' ':!*.woff2' ':!*OFL*.txt' ':!**/LICENSE*')"
found=0
look() { # look <what it is> <extended regex>
  local what="$1" re="$2" hits
  # not findings: lines marked `scan:allow`, and addresses that are nobody's (example.org, noreply@, a git@host: remote, a [@citekey])
  hits="$(printf '%s\n' "$files" | xargs -d '\n' grep -n -I -E -e "$re" -- 2>/dev/null | grep -v -E 'scan:allow|@example\.(org|com)|noreply@|git@[a-z.]+:|\[@[a-z]+[0-9]{4}' | cut -c1-200)"
  if [ -n "$hits" ]; then
    echo "[scan] $what:"
    printf '%s\n' "$hits" | sed 's/^/    /'
    found=$((found + $(printf '%s\n' "$hits" | wc -l)))
  fi
}
echo "[scan] $(printf '%s\n' "$files" | wc -l) tracked code files (docs/ left out)"
# an absolute /home/<name>: not a folder named home inside a path (the Home plugin's plugins/home/…)
look "a home folder by name"        '(^|[^A-Za-z0-9_.~-])/home/[a-z][a-z0-9_-]+'
look "an e-mail address"            '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.(com|org|net|es|io|dev|edu)\b' # scan:allow (the pattern itself)
look "something shaped like a key"  '(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' # scan:allow (the pattern itself)
echo "[scan] findings: $found"
[ "$found" -eq 0 ]
