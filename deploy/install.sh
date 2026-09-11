#!/usr/bin/env bash
#
# The Lord Erroll ordering platform — installer for Linux and macOS.
# For Windows, use deploy/install.ps1 instead.
#
#   ./deploy/install.sh                    set the platform up, leave it stopped
#   ./deploy/install.sh --service          also install and start the boot service
#   ./deploy/install.sh --help             every option
#
# Safe to re-run. Dependencies are reinstalled, the app is rebuilt, and the
# seed only adds what is missing, so an existing menu and existing staff
# accounts are never clobbered.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
OS="$(uname -s)"

WITH_SERVICE=0
DO_SEED=1
OPEN_FIREWALL=0
PORT=""
BASE_URL=""
BACKUP_DIR=""
SVC_USER="${SUDO_USER:-$(id -un)}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'USAGE'
Options
  --service            install the boot service (systemd or launchd) and start it
  --user NAME          account the service runs as (default: the invoking user)
  --port N             port to listen on (default: keep .env, else 4000)
  --base-url URL       address printed into every QR code, e.g. http://192.168.1.50:4000
  --backup-dir PATH    where nightly snapshots are written; use a drive that is
                       not the server's own disk
  --open-firewall      add a LAN rule for the port (ufw or firewalld)
  --no-seed            skip the database seed
  --help               this text
USAGE
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --service)       WITH_SERVICE=1 ;;
    --user)          SVC_USER="${2:?--user needs a name}"; shift ;;
    --port)          PORT="${2:?--port needs a number}"; shift ;;
    --base-url)      BASE_URL="${2:?--base-url needs a URL}"; shift ;;
    --backup-dir)    BACKUP_DIR="${2:?--backup-dir needs a path}"; shift ;;
    --open-firewall) OPEN_FIREWALL=1 ;;
    --no-seed)       DO_SEED=0 ;;
    --help|-h)       usage ;;
    *)               die "Unknown option: $1   (try --help)" ;;
  esac
  shift
done

case "$OS" in
  Linux|Darwin) ;;
  *) die "$OS is not supported by this script. On Windows run deploy\\install.ps1." ;;
esac

# ---------------------------------------------------------------- 1. preflight
say "1. Checking the machine"

command -v node >/dev/null 2>&1 || die "node is not installed. This needs Node.js 20 or newer."
command -v npm  >/dev/null 2>&1 || die "npm is not installed."

NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old. This needs 20 or newer."
info "node $(node -v) at $NODE_BIN"

# better-sqlite3 is a native module. It ships prebuilt binaries for the common
# platforms, but on anything unusual npm falls back to compiling it, and that
# needs a toolchain. Say so now rather than failing halfway through npm install.
if ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1; then
  warn "No C compiler found. If the SQLite driver has no prebuilt binary for"
  warn "this platform, npm install will fail. Install build-essential (Debian,"
  warn "Ubuntu, Raspberry Pi OS) or Xcode command line tools (macOS) first."
fi

# ------------------------------------------------------------ 2. dependencies
say "2. Installing dependencies"
cd "$ROOT"
if [ -f package-lock.json ]; then
  npm ci || { warn "npm ci failed, falling back to npm install"; npm install; }
else
  npm install
fi

# ------------------------------------------------------------ 3. configuration
say "3. Writing .env"

# Every value is read and written with node rather than sed, because the two
# sed dialects on Linux and macOS disagree about in-place editing.
set_env() {
  node -e '
    const fs = require("fs"), [p, k, v] = process.argv.slice(1);
    let t = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    const re = new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=.*$", "m");
    if (re.test(t)) t = t.replace(re, k + "=" + v);
    else t += (t === "" || t.endsWith("\n") ? "" : "\n") + k + "=" + v + "\n";
    fs.writeFileSync(p, t);
  ' "$ENV_FILE" "$1" "$2"
}
get_env() {
  # No early return here: node -e evaluates at the top level, where a bare
  # "return" is a syntax error rather than an exit.
  node -e '
    const fs = require("fs"), [p, k] = process.argv.slice(1);
    const t = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    const m = t.match(
      new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=(.*)$", "m"));
    console.log(m ? m[1].trim() : "");
  ' "$ENV_FILE" "$1"
}

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
  info "created .env from .env.example"
else
  info ".env already exists, keeping the values already in it"
fi

# A session secret left at the example value lets anyone forge a staff session.
CURRENT_SECRET="$(get_env SESSION_SECRET)"
EXAMPLE_SECRET="$(grep '^SESSION_SECRET=' "$ROOT/.env.example" | cut -d= -f2- || true)"
if [ -z "$CURRENT_SECRET" ] || [ "$CURRENT_SECRET" = "$EXAMPLE_SECRET" ] \
   || [ "$CURRENT_SECRET" = "change-me-before-go-live" ]; then
  set_env SESSION_SECRET "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  info "generated a new SESSION_SECRET"
else
  info "SESSION_SECRET already set, left alone"
fi

[ -n "$PORT" ] && { set_env PORT "$PORT"; info "PORT=$PORT"; }
PORT="$(get_env PORT)"; PORT="${PORT:-4000}"

# The QR base URL is printed into every table card. Getting it wrong and
# discovering it later means reprinting all of them, so this never guesses
# silently: it fills in a detected address and tells the operator to confirm it.
if [ -n "$BASE_URL" ]; then
  set_env PUBLIC_BASE_URL "$BASE_URL"
  info "PUBLIC_BASE_URL=$BASE_URL"
else
  CURRENT_URL="$(get_env PUBLIC_BASE_URL)"
  # .env.example ships a placeholder hostname that only resolves if someone has
  # already added that local DNS record. Treat it as unset rather than printing
  # it back as configured: 54 cards pointing at a name that does not resolve is
  # an expensive way to find out.
  EXAMPLE_URL="$(grep '^PUBLIC_BASE_URL=' "$ROOT/.env.example" | cut -d= -f2- || true)"
  if [ -z "$CURRENT_URL" ] || [ "$CURRENT_URL" = "$EXAMPLE_URL" ]; then
    LAN_IP="$(node -e 'const os=require("os");const a=Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==="IPv4"&&!i.internal).map(i=>i.address);process.stdout.write(a[0]||"")')"
    if [ -n "$LAN_IP" ]; then
      set_env PUBLIC_BASE_URL "http://$LAN_IP:$PORT"
      warn "PUBLIC_BASE_URL set to http://$LAN_IP:$PORT from this machine's"
      warn "current address. Confirm it is STATIC before printing table cards."
      warn "To use a hostname instead, re-run with --base-url and make sure the"
      warn "name resolves on the restaurant network first."
    else
      warn "No LAN address found. Set PUBLIC_BASE_URL in .env by hand."
    fi
  else
    info "PUBLIC_BASE_URL=$CURRENT_URL"
  fi
fi

[ -n "$BACKUP_DIR" ] && set_env BACKUP_DIR "$BACKUP_DIR"
BACKUP_DIR="$(get_env BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
case "$BACKUP_DIR" in
  /*) ABS_BACKUP="$BACKUP_DIR" ;;
  *)  ABS_BACKUP="$ROOT/${BACKUP_DIR#./}" ;;
esac
case "$ABS_BACKUP" in
  "$ROOT"/*)
    warn "BACKUP_DIR is $BACKUP_DIR, which is on the server's own disk."
    warn "A backup on the disk it protects is not a backup. Re-run with"
    warn "--backup-dir pointing at an external drive or a NAS mount."
    ;;
esac
info "BACKUP_DIR=$BACKUP_DIR"

set_env NODE_ENV production
mkdir -p "$ROOT/data"

# ------------------------------------------------------------------ 4. build
say "4. Building the guest and staff app"
npm run build

# ------------------------------------------------------------------- 5. seed
if [ "$DO_SEED" -eq 1 ]; then
  say "5. Seeding the database"
  info "Existing tables, menu items and staff are left untouched."
  info "PINs and passwords for any NEW account are printed once, below."
  npm run seed
else
  say "5. Seed skipped (--no-seed)"
fi

# ---------------------------------------------------------------- 6. service
if [ "$WITH_SERVICE" -eq 1 ]; then
  say "6. Installing the boot service"

  if [ "$OS" = "Linux" ]; then
    command -v systemctl >/dev/null 2>&1 || die "systemd not found. Start the server another way."
    SVC_GROUP="$(id -gn "$SVC_USER")"
    TMP="$(mktemp)"
    sed -e "s|__ROOT__|$ROOT|g" \
        -e "s|__USER__|$SVC_USER|g" \
        -e "s|__GROUP__|$SVC_GROUP|g" \
        -e "s|__NODE__|$NODE_BIN|g" \
        -e "s|__BACKUP_DIR__|$ABS_BACKUP|g" \
        "$ROOT/deploy/lord-erroll.service" > "$TMP"
    sudo install -m 0644 "$TMP" /etc/systemd/system/lord-erroll.service
    rm -f "$TMP"
    sudo systemctl daemon-reload
    sudo systemctl enable --now lord-erroll
    info "installed /etc/systemd/system/lord-erroll.service as user $SVC_USER"
    info "status:  sudo systemctl status lord-erroll"
    info "logs:    sudo journalctl -u lord-erroll -f"
  else
    PLIST=/Library/LaunchDaemons/com.lorderroll.platform.plist
    TMP="$(mktemp)"
    sed -e "s|__ROOT__|$ROOT|g" \
        -e "s|__USER__|$SVC_USER|g" \
        -e "s|__NODE__|$NODE_BIN|g" \
        "$ROOT/deploy/com.lorderroll.platform.plist" > "$TMP"
    sudo install -m 0644 -o root -g wheel "$TMP" "$PLIST"
    rm -f "$TMP"
    sudo launchctl bootout system/com.lorderroll.platform 2>/dev/null || true
    sudo launchctl bootstrap system "$PLIST"
    info "installed $PLIST as user $SVC_USER"
    info "status:  sudo launchctl print system/com.lorderroll.platform"
    info "logs:    tail -f /var/log/lord-erroll.log"
  fi

  if [ "$OPEN_FIREWALL" -eq 1 ] && [ "$OS" = "Linux" ]; then
    if command -v ufw >/dev/null 2>&1; then
      sudo ufw allow "$PORT/tcp" && info "ufw: opened $PORT/tcp"
    elif command -v firewall-cmd >/dev/null 2>&1; then
      sudo firewall-cmd --permanent --add-port="$PORT/tcp" && sudo firewall-cmd --reload
      info "firewalld: opened $PORT/tcp"
    else
      warn "No ufw or firewalld found. Open $PORT/tcp yourself if a firewall is running."
    fi
  fi
else
  say "6. Boot service not installed"
  info "Re-run with --service once the address and backup drive are settled."
fi

# ------------------------------------------------------------------ 7. done
say "Done"
if [ "$WITH_SERVICE" -eq 1 ]; then
  sleep 2
  if curl -fsS -m 5 "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    info "The server is answering on http://localhost:$PORT"
  else
    warn "The server is not answering yet. Check the service logs above."
  fi
else
  info "Start it with:  npm start"
fi
info "Then scan one printed table card from a phone on the restaurant network."
info "Go-live checklist: docs/go-live.md"
printf '\n'
