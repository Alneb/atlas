# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Atlas in server mode — container image (docs/guides/SERVER.md; compose.yaml at the repo root)
#
# Three stages, as obsidian-web's: (1) Node builds the UI into ui/dist; (2) Rust builds the `atlas` CLI, which
# embeds that dist (rust-embed, crates/atlas-core/src/server.rs); (3) a slim Debian runtime with the binary and what
# a vault's plugins and terminals call: git, python3 (plugin helpers), openssh-client (the ssh plugin), bash (the
# terminals' shell, with a prompt and the basic tools: packaging/docker/bashrc), the documents' tools and PDFium.
# The desktop app (crates/atlas-app) is not built: its manifest is only read, as a workspace member.
#
# Build:   docker build -f packaging/docker/Dockerfile -t atlas .
# First:   docker run --rm -it -v atlas-config:/config atlas server password
# Run:     docker run -p 7700:7700 -v /path/to/Notes:/vaults/notes -v /path/to/Work:/vaults/work \
#                     -v atlas-config:/config -v atlas-state:/state atlas
#          every folder in /vaults is a vault, at /v/<folder>/ — one sign-in for all, the app's vault picker switches
# ---------------------------------------------------------------------------

# ---- 1) the UI ------------------------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS ui
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npm run build   # → /src/ui/dist

# ---- 2) the `atlas` binary --------------------------------------------------------------------------------------------
FROM rust:1-bookworm AS core
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
# the workspace's plugin engines (catalog, ocr…): cargo reads every member's manifest. The bundle carries only those
# folders of plugins/ (the plugin engines named in Cargo.toml), so this copies just them.
COPY plugins ./plugins
# `atlas guide` prints these (include_str!)
COPY docs/guides/EXTENDING.md docs/guides/DEVELOPING.md ./docs/guides/
COPY --from=ui /src/ui/dist ./ui/dist
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p atlas && \
    cp target/release/atlas /usr/local/bin/atlas && \
    strip /usr/local/bin/atlas

# ---- 2b) PDFium: the core draws PDF covers with it (crates/atlas-core/src/pdfium.rs), pdfium-binaries' pinned build ----
FROM debian:bookworm-slim AS pdfium
ARG PDFIUM_RELEASE=8086
ARG PDFIUM_SHA256=588577cf52dabc1a444988bac841920df54cc2f141801424de97ab04f4fbb935
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    mkdir -p /out && \
    if [ "$(dpkg --print-architecture)" = amd64 ]; then \
      curl -fsSL -o /tmp/p.tgz "https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/$PDFIUM_RELEASE/pdfium-linux-x64.tgz" && \
      echo "$PDFIUM_SHA256  /tmp/p.tgz" | sha256sum -c - && \
      tar -xzf /tmp/p.tgz -C /tmp lib/libpdfium.so && mv /tmp/lib/libpdfium.so /out/; \
    else echo "no pinned PDFium for this architecture: covers through poppler"; fi

# ---- 3) the runtime -------------------------------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
# ca-certificates: plugins' HTTPS (mail, Zotero, copyparty…); tini: signals reach atlas, children are reaped;
# git, python3, openssh-client: what plugins and helpers run; bash and the basic tools: the terminals
# (bash as the default shell, with a friendly prompt). The documents' tools, so every plugin works here as on a
# desktop: poppler (pdftotext, pdftoppm where PDFium is missing), pandoc + TeX Live + latexmk + biber (Export,
# Print), djvulibre (Books' DjVu), libarchive's bsdtar and unar (Manga's .cbr/.cb7), cups-client (lp).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates tini git python3 openssh-client \
      poppler-utils pandoc latexmk biber texlive-luatex texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended texlive-science texlive-bibtex-extra djvulibre-bin libarchive-tools unar cups-client \
      bash bash-completion procps less nano vim-tiny curl wget jq ripgrep fd-find tree file htop \
      zip unzip xz-utils rsync iputils-ping iproute2 dnsutils man-db locales && \
    ln -s /usr/bin/fdfind /usr/local/bin/fd && \
    rm -rf /var/lib/apt/lists/*
# A terminal's shell is $SHELL (crates/atlas-core/src/pty.rs); HOME is not the user's own, so the niceties are
# system-wide: /etc/bash.bashrc is read by every interactive bash, whatever `user:` the host runs the container as.
COPY packaging/docker/bashrc /etc/atlas.bashrc
RUN echo '[ -r /etc/atlas.bashrc ] && . /etc/atlas.bashrc' >> /etc/bash.bashrc
COPY --from=core /usr/local/bin/atlas /usr/local/bin/atlas
# found by the core beside the binary: ../lib/atlas/ (an empty folder off amd64)
COPY --from=pdfium /out/ /usr/local/lib/atlas/

# Nothing of the sign-in lives in the vault: /config holds server.toml (the password's hash, the sign-in mode),
# /state the sessions and device tokens. HOME and the runtime folder are writable for any `user:` the host picks.
ENV SHELL=/bin/bash \
    LANG=C.UTF-8 \
    TERM=xterm-256color \
    EDITOR=nano \
    PAGER=less \
    XDG_CONFIG_HOME=/config \
    XDG_STATE_HOME=/state \
    XDG_CACHE_HOME=/state/cache \
    XDG_RUNTIME_DIR=/tmp/atlas-run \
    HOME=/tmp/atlas-home \
    ATLAS_SERVER_CONFIG=/config/atlas/server.toml \
    ATLAS_SERVER_STATE=/state/atlas/server.json
RUN mkdir -p /config/atlas /state/atlas /vaults && chmod 0777 /config /config/atlas /state /state/atlas

EXPOSE 7700
VOLUME ["/vaults", "/config", "/state"]

# Run as the vault's owner on the host (`user: "1000:1000"` in compose): edits keep the right ownership.
RUN useradd --system --uid 10001 --create-home --home-dir /home/atlas --shell /bin/bash atlas  # scan:allow (the container's own user)
USER atlas

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/atlas"]
CMD ["serve", "--listen", "0.0.0.0:7700", "--vaults-in", "/vaults"]
