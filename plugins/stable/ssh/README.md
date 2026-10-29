# SSH

The hosts of your ssh config, one click away: a terminal on each, one shared connection per host, the host's files in
Atlas's explorer, a file copied over, a folder mounted, and tools that let an AI agent work on your hosts in the open.
OpenSSH does all the connecting (your config, keys, agent, 2FA); the plugin's helper is a Rust program around it.

## What it adds

- **One shared connection per host** (`ControlMaster`, kept up as the "Keep connections" setting says). Every ssh, scp
  and sftp the plugin starts rides on it. When a host asks for a passphrase or a second factor and *you* asked
  (Connect, Files), a **login tab** opens in Atlas for you to answer; whatever was waiting carries on once you have.
  When something in the background asked (an agent's session, another plugin polling a host), nothing opens by
  itself: one notice and a status-bar cell **"ssh: log in to <host>"** offer the login, once until the host connects.
- **The explorer**: each host is a file source of Atlas's explorer. Folders are listed over an SFTP channel kept open
  per host; a file opens from a local copy in `.atlas/remote/ssh/<host>/…`, and every save goes back to the host
  unless the file changed there meanwhile (then you are asked).
- **Commands**: "SSH: connect to…", "SSH: run a command on…", "SSH: browse files on… (SFTP)", "SSH: mount a host's
  files (sshfs)…", "SSH: open a shell on a connected host…", "SSH: watch a session…".
- **Menus**: "Copy to host…" on a file; "Open ssh on <host>" on a terminal tab; the terminal's "+" menu lists hosts.
- **The side tool "SSH"** and the block `ssh.hosts`: one card per host (connected ones first) with Shell / Connect,
  Files and more.
- **A status cell** with the connected hosts.
- **Tools for agents** (through `atlas mcp`, as `ssh_*`): `hosts`, `open`, `run`, `read`, `send`, `close`,
  `sessions`, `terminal`. Long-lived shells keep `cd` and the environment between calls; everything an agent runs is
  visible to you, and a login it cannot answer comes to you as that status-bar offer. The manifest's `for_agents` text tells
  agents to use these tools rather than ssh in their own shell.

## Settings

- **ssh config** (`~/.ssh/config`): the file the hosts are read from; its `Include` lines are followed, wildcard hosts
  left out.
- **More hosts**: `user@host` or `host:port`, for hosts not in the config.
- **ssh options**: added to every ssh / scp (`-o ServerAliveInterval=30`).
- **Keep connections** (`yes`): how long a shared connection stays up once idle (ssh's `ControlPersist`): `yes` until
  it drops, or a duration such as `8h`.
- **Copy files to** (`~`): the folder on the host that "Copy to host" puts a file in.
- **Mount folder** (`~/mnt`): where "Mount" puts each host with sshfs.

## How it fits

No requirements. It provides a file source (`atlas.files.source`) and agent tools.

## Needs

OpenSSH (`ssh`, `sftp`, `scp`) on the machine running Atlas's core; `sshfs` for Mount. The helper is built by
`bash engine/build.sh` into `bin/<arch>-<os>/atlas-ssh` (not committed).

## Platforms

Linux works; macOS, Windows and a server are untested.

## Status

Stable tier. Tests: `cargo test -p atlas-ssh`, `scripts/vault/tests/test_ssh_plugin.py` (a stand-in ssh and a real
sftp server on a temporary folder) and the specs `ui/tests/example-ssh.spec.ts`, `example-sftp.spec.ts`. The index of
opened copies is still written directly rather than through Atlas's API.
