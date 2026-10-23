#!/bin/sh
# A stand-in for ssh in the tests (ATLAS_SSH_BIN, read by the SSH example plugin's helper): no network.
# `-O check` says no shared connection is up, `-G` prints no config; a login says where to and keeps a shell.
# The sftp subsystem (`-s … sftp`, what `sftp -S` asks for) is the machine's own sftp-server, started in
# $ATLAS_FAKE_SFTP_ROOT: a real sftp conversation over a pipe, on a local folder.
sub=""
for a in "$@"; do
  case "$a" in -O) exit 255 ;; -G) exit 0 ;; -s) sub=1 ;; esac
  last="$a"
done
if [ -n "$sub" ] && [ "$last" = "sftp" ]; then
  # ATLAS_FAKE_SSH_DELAY: seconds before the server answers — a slow link, for the slow-connection measurement
  [ -n "$ATLAS_FAKE_SSH_DELAY" ] && sleep "$ATLAS_FAKE_SSH_DELAY"
  for s in /usr/libexec/openssh/sftp-server /usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/sftp-server; do
    [ -x "$s" ] && exec "$s" -d "${ATLAS_FAKE_SFTP_ROOT:-$PWD}"
  done
  echo "fake ssh: no sftp-server on this machine" >&2
  exit 1
fi
echo "fake ssh: logged in to $last"
exec sh
