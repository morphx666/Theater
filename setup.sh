#!/usr/bin/env bash
# Theater setup for Linux (including Raspberry Pi) and macOS.
#   ./setup.sh [--no-update]
# Updates the app with git (unless --no-update), checks Node.js, installs and builds the app, finds your receiver,
# writes .env, and can make Theater start automatically. Run it again to update: it keeps your settings and
# restarts Theater.
set -euo pipefail
cd "$(dirname "$0")"
APP_DIR="$(pwd -P)"
NEED_MAJOR=22
NEED_MINOR=18
SERVICE=denon-remote
OS="$(uname -s)"

title() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask_yes() { # ask_yes "Question" [y|n]
  local def="${2:-y}" ans hint="[Y/n]"
  [ "$def" = n ] && hint="[y/N]"
  if [ ! -t 0 ]; then echo "  $1 $([ "$def" = y ] && echo yes || echo no)"; [ "$def" = y ]; return; fi
  read -r -p "  $1 $hint " ans
  [[ "${ans:-$def}" =~ ^[Yy] ]]
}
node_ok() { # node_ok /path/to/node -> true if it is 22.18 or newer
  [ -n "$1" ] && [ -x "$1" ] || return 1
  "$1" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>$NEED_MAJOR||(a===$NEED_MAJOR&&b>=$NEED_MINOR)?0:1)" 2>/dev/null
}
find_node() {
  local c brew_node=""
  command -v brew >/dev/null 2>&1 && brew_node="$(brew --prefix)/opt/node@22/bin/node"
  for c in "$(command -v node 2>/dev/null || true)" /opt/node22/bin/node "$brew_node"; do
    if node_ok "$c"; then NODE="$c"; return 0; fi
  done
  return 1
}
install_node_linux() { # Node 22 in /opt/node22, next to (not instead of) any existing Node
  local arch base file tmp
  case "$(uname -m)" in
    aarch64|arm64) arch=arm64 ;;
    armv7l) arch=armv7l ;;
    x86_64) arch=x64 ;;
    *) echo "  There is no official Node 22 build for this processor ($(uname -m))."; return 1 ;;
  esac
  for tool in curl tar xz sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { echo "  '$tool' is needed to install Node. Install it and run setup again."; return 1; }
  done
  base=https://nodejs.org/dist/latest-v22.x
  file="$(curl -fsSL "$base/" | grep -o "node-v22[0-9.]*-linux-$arch.tar.xz" | head -1)"
  [ -n "$file" ] || { echo "  Could not find a Node 22 download for $arch."; return 1; }
  tmp="$(mktemp -d)"
  echo "  Downloading $file..."
  curl -fL --progress-bar -o "$tmp/$file" "$base/$file"
  curl -fsSL "$base/SHASUMS256.txt" | grep " $file\$" | (cd "$tmp" && sha256sum -c --quiet -) \
    || { echo "  The download is damaged (checksum mismatch)."; rm -rf "$tmp"; return 1; }
  sudo mkdir -p /opt/node22
  sudo tar -xJf "$tmp/$file" -C /opt/node22 --strip-components=1
  rm -rf "$tmp"
}

if [ "$(id -u)" = 0 ]; then
  echo "Please run ./setup.sh as your normal user, without sudo. It asks for your password when it needs it."
  exit 1
fi

NO_UPDATE=""
for arg in "$@"; do
  case "$arg" in
    --no-update) NO_UPDATE=1 ;;
    *) echo "Unknown option: $arg (the only option is --no-update)"; exit 1 ;;
  esac
done

# ---------- update ----------
# Fast-forward only, so local edits and commits are never merged or overwritten. After an update, the new
# setup.sh runs in place of this one (THEATER_UPDATED stops it from updating again).
if [ -z "$NO_UPDATE" ] && [ -z "${THEATER_UPDATED:-}" ]; then
  title "Update"
  if [ ! -e .git ]; then
    echo "  This copy wasn't downloaded with git, so setup can't update it. Installing it as it is."
  elif ! command -v git >/dev/null 2>&1; then
    echo "  Git isn't installed, so setup can't check for updates. Installing this version."
  else
    BRANCH_REF="$(git symbolic-ref -q HEAD || true)"
    UPSTREAM=""
    [ -n "$BRANCH_REF" ] && UPSTREAM="$(git for-each-ref --format='%(upstream:short)' "$BRANCH_REF")"
    OLD="$(git rev-parse --short HEAD)"
    if [ -z "$UPSTREAM" ]; then
      echo "  This copy isn't on a branch that follows GitHub, so setup didn't update it."
    elif ! GIT_TERMINAL_PROMPT=0 git fetch --quiet; then
      echo "  Couldn't check for updates (no connection?). Installing the version you have."
    elif ! git merge --ff-only --quiet "$UPSTREAM"; then
      echo "  Couldn't update without touching your local changes. Installing the version you have."
    elif [ "$(git rev-parse --short HEAD)" = "$OLD" ]; then
      echo "  Already up to date ($OLD)."
    else
      echo "  Updated $OLD -> $(git rev-parse --short HEAD)."
      THEATER_UPDATED=1 exec bash "$APP_DIR/setup.sh" "$@"
    fi
  fi
fi

# ---------- Node.js ----------
title "Node.js"
ORIG_NODE="$(command -v node 2>/dev/null || true)"
if find_node; then
  echo "  Using Node $("$NODE" -v) ($NODE)"
else
  echo "  Theater needs Node.js $NEED_MAJOR.$NEED_MINOR or newer (found: $([ -n "$ORIG_NODE" ] && "$ORIG_NODE" -v || echo none))."
  NODE=""
  if [ "$OS" = Linux ]; then
    echo "  Setup can install Node 22 in /opt/node22. Any Node you already have stays as it is."
    if ask_yes "Install it?" y && install_node_linux; then NODE=/opt/node22/bin/node; fi
  elif [ "$OS" = Darwin ] && command -v brew >/dev/null 2>&1; then
    if ask_yes "Install Node 22 with Homebrew (brew install node@22)?" y && brew install node@22; then
      NODE="$(brew --prefix)/opt/node@22/bin/node"
    fi
  fi
  if ! node_ok "$NODE"; then
    echo "  Install Node.js $NEED_MAJOR.$NEED_MINOR or newer from https://nodejs.org, then run ./setup.sh again."
    exit 1
  fi
  echo "  Using Node $("$NODE" -v) ($NODE)"
fi
NODE_DIR="$(cd "$(dirname "$NODE")" && pwd -P)"
NODE="$NODE_DIR/$(basename "$NODE")"
export PATH="$NODE_DIR:$PATH" # npm below runs with this Node; your shell is not changed

# ---------- install and build ----------
title "Installing and building (this can take a few minutes on a Raspberry Pi)"
npm ci --no-audit --no-fund
npm run build

# ---------- settings ----------
title "Settings"
"$NODE" scripts/setup.ts configure

# ---------- start automatically ----------
AUTOSTART=""
if [ "$OS" = Linux ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  title "Start automatically"
  UNIT="/etc/systemd/system/$SERVICE.service"
  if [ -f "$UNIT" ] || ask_yes "Start Theater automatically when this computer boots?" y; then
    UNIT_TEXT=$(cat <<EOF
# Generated by setup.sh. Running setup.sh again rewrites this file; settings belong in $APP_DIR/.env
[Unit]
Description=Theater (web remote for Denon receivers)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$APP_DIR
ExecStart="$NODE" --env-file-if-exists=.env server/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
)
    # An update with the same settings leaves the unit as it is. The service runs as this user with
    # Restart=always, so stopping the process is enough to restart it on the new code, without sudo.
    OLD_PID=""
    if [ -f "$UNIT" ] && [ "$(cat "$UNIT")" = "$UNIT_TEXT" ] \
      && systemctl is-enabled --quiet "$SERVICE" 2>/dev/null && systemctl is-active --quiet "$SERVICE"; then
      OLD_PID=$(systemctl show -p MainPID --value "$SERVICE")
      [ "${OLD_PID:-0}" != 0 ] && kill "$OLD_PID" 2>/dev/null || OLD_PID=""
    fi
    if [ -n "$OLD_PID" ]; then
      # systemd waits RestartSec (5 s) before starting it again: count it down with dots so it doesn't look stuck.
      DOT=o; case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *UTF-8*|*utf8*) DOT=●;; esac
      DOTS="$DOT $DOT $DOT $DOT $DOT"
      if [ -t 1 ]; then TTY=1; else TTY=""; echo "  Restarting Theater..."; fi
      for i in $(seq 0 29); do
        if [ -n "$TTY" ]; then
          LEFT=$((5 - i / 2)); [ "$LEFT" -gt 0 ] || LEFT=0
          printf '\r\033[K  Restarting Theater  %s' "${DOTS:0:$((LEFT * 2))}"
        fi
        sleep 0.5
        NEW_PID=$(systemctl show -p MainPID --value "$SERVICE")
        [ "${NEW_PID:-0}" != 0 ] && [ "$NEW_PID" != "$OLD_PID" ] && systemctl is-active --quiet "$SERVICE" && break
      done
      if [ -n "$TTY" ]; then printf '\r\033[K'; fi
      if ! systemctl is-active --quiet "$SERVICE"; then OLD_PID=""; fi # didn't come back: restart it the usual way
    fi
    if [ -z "$OLD_PID" ]; then
      printf '%s\n' "$UNIT_TEXT" | sudo tee "$UNIT" >/dev/null
      sudo systemctl daemon-reload
      sudo systemctl enable "$SERVICE" >/dev/null 2>&1
      sudo systemctl restart "$SERVICE"
    fi
    AUTOSTART=systemd
    echo "  Theater is running as the '$SERVICE' service."
  fi
elif [ "$OS" = Darwin ]; then
  title "Start automatically"
  PLIST="$HOME/Library/LaunchAgents/com.theater.denon-remote.plist"
  if [ -f "$PLIST" ] || ask_yes "Start Theater automatically when you log in to this Mac?" y; then
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Generated by setup.sh. Running setup.sh again rewrites this file. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>com.theater.denon-remote</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file-if-exists=.env</string>
    <string>server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/Theater.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/Theater.log</string>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    AUTOSTART=launchd
    echo "  Theater is running, and starts whenever you log in."
  fi
fi

# ---------- done ----------
title "Theater is ready"
if [ -z "$AUTOSTART" ]; then
  if [ -n "$ORIG_NODE" ] && [ "$ORIG_NODE" -ef "$NODE" ]; then
    echo "  Start it with:  npm start"
  else
    echo "  Start it with:  PATH=\"$NODE_DIR:\$PATH\" npm start"
  fi
  echo "  Then open:"
else
  echo "  Open:"
fi
"$NODE" scripts/setup.ts summary
case "$AUTOSTART" in
  systemd) echo; echo "  Logs: journalctl -u $SERVICE -f    Stop: sudo systemctl stop $SERVICE" ;;
  launchd) echo; echo "  Logs: ~/Library/Logs/Theater.log" ;;
esac
if [ "$OS" = Linux ] && command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
  PORT="$(sed -n 's/^PORT=\([0-9]*\).*/\1/p' .env | head -1)"
  echo; echo "  The ufw firewall is on. To let other devices on your network in, run:"
  echo "    sudo ufw allow from 192.168.0.0/16 to any port ${PORT:-8787} proto tcp"
fi
echo
