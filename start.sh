#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
RUNTIME_DIR="${SHARE_RUNTIME_DIR:-$PROJECT_ROOT/.runtime}"
PID_FILE="$RUNTIME_DIR/server.pid"
LOG_FILE="$RUNTIME_DIR/server.log"
LOCK_DIR="$RUNTIME_DIR/start.lock"
LOCK_OWNER="$LOCK_DIR/owner"

HOST="${SHARE_HOST:-127.0.0.1}"
PORT="${SHARE_PORT:-8787}"
MAX_BODY_BYTES="${SHARE_MAX_BODY_BYTES:-100000000}"
TOKEN="${SHARE_DEV_TOKEN:-dev-token}"
NODE_EXECUTABLE="${SHARE_NODE_BIN:-$(command -v node || true)}"
BASE_URL="${SHARE_BASE_URL:-http://$HOST:$PORT}"

die() {
  echo "[publish-note] ERROR: $*" >&2
  exit 1
}

on_error() {
  local exit_code="$1"
  local line_number="$2"
  echo "[publish-note] ERROR: command failed at line $line_number (exit $exit_code)" >&2
}

trap 'on_error "$?" "$LINENO"' ERR

usage() {
  cat <<'EOF'
Usage: ./start.sh [command]

Commands:
  start    Force-stop port occupants, then start a fresh local publish service
  stop     Stop only the Publish Note service owned by this project
  restart  Stop and start the Publish Note service
  status   Show process, port, URL, and log status
  logs     Follow the service log
  help     Show this help

Environment overrides:
  SHARE_HOST, SHARE_PORT, SHARE_BASE_URL, SHARE_MAX_BODY_BYTES
  SHARE_DEV_TOKEN, SHARE_NODE_BIN, SHARE_RUNTIME_DIR
EOF
}

validate_configuration() {
  [[ -n "$HOST" ]] || die "SHARE_HOST cannot be empty"
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "SHARE_PORT must be a number"
  (( PORT >= 1 && PORT <= 65535 )) || die "SHARE_PORT must be between 1 and 65535"
  [[ "$MAX_BODY_BYTES" =~ ^[0-9]+$ ]] || die "SHARE_MAX_BODY_BYTES must be a positive number"
  (( MAX_BODY_BYTES > 0 )) || die "SHARE_MAX_BODY_BYTES must be greater than zero"
  command -v lsof >/dev/null 2>&1 || die "lsof is required to manage the service port safely"
}

validate_node() {
  [[ -n "$NODE_EXECUTABLE" && -x "$NODE_EXECUTABLE" ]] || die "Node.js was not found; install Node.js or set SHARE_NODE_BIN"

  if ! "$NODE_EXECUTABLE" --experimental-strip-types -e "" >/dev/null 2>&1; then
    die "This Node.js binary does not support --experimental-strip-types"
  fi
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

pid_is_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

process_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | sed 's/^[[:space:]]*//' || true
}

process_cwd() {
  local pid="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true
  fi
}

is_our_process() {
  local pid="$1"
  local command
  local cwd
  command="$(process_command "$pid")"
  [[ "$command" == *"scripts/local-publish-server.ts"* ]] || return 1
  cwd="$(process_cwd "$pid")"
  [[ -z "$cwd" || "$cwd" == "$PROJECT_ROOT" ]]
}

list_port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | sort -u || true
  fi
}

read_pid_file() {
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(tr -d '[:space:]' < "$PID_FILE")"
    [[ "$pid" =~ ^[0-9]+$ ]] && echo "$pid"
  fi
}

remove_stale_pid_file() {
  local pid
  pid="$(read_pid_file || true)"
  if [[ -n "$pid" ]] && ! pid_is_alive "$pid"; then
    rm -f "$PID_FILE"
  fi
}

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_OWNER"
    return
  fi

  local owner=""
  if [[ -f "$LOCK_OWNER" ]]; then
    owner="$(tr -d '[:space:]' < "$LOCK_OWNER")"
  fi
  if [[ "$owner" == "$$" ]]; then
    return
  fi
  if [[ -n "$owner" ]] && pid_is_alive "$owner"; then
    die "another start/stop operation is in progress (PID $owner)"
  fi

  rm -f "$LOCK_OWNER"
  rmdir "$LOCK_DIR" 2>/dev/null || die "cannot remove stale startup lock: $LOCK_DIR"
  mkdir "$LOCK_DIR" || die "cannot acquire startup lock: $LOCK_DIR"
  printf '%s\n' "$$" > "$LOCK_OWNER"
}

release_lock() {
  local owner=""
  if [[ -f "$LOCK_OWNER" ]]; then
    owner="$(tr -d '[:space:]' < "$LOCK_OWNER")"
  fi
  if [[ "$owner" == "$$" ]]; then
    rm -f "$LOCK_OWNER"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}

port_contains_pid() {
  local expected_pid="$1"
  local pid
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    [[ "$pid" == "$expected_pid" ]] && return 0
  done < <(list_port_pids)
  return 1
}

describe_port_conflict() {
  local pid
  echo "[publish-note] Port $PORT is already in use:" >&2
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    echo "  PID $pid: $(process_command "$pid")" >&2
  done < <(list_port_pids)
}

force_kill_pid() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || die "invalid process ID: $pid"
  (( pid > 1 )) || die "refusing to kill protected process ID $pid"
  [[ "$pid" != "$$" ]] || die "refusing to kill the launcher process"
  echo "[publish-note] force-stopping PID $pid: $(process_command "$pid")" >&2
  kill -KILL "$pid" 2>/dev/null || {
    pid_is_alive "$pid" || return 0
    die "cannot force-stop PID $pid; check process permissions"
  }
}

force_clear_service() {
  local pid
  local owned_pid
  owned_pid="$(find_owned_server_pid || true)"
  if [[ -n "$owned_pid" ]] && pid_is_alive "$owned_pid"; then
    force_kill_pid "$owned_pid"
  fi

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    if pid_is_alive "$pid"; then
      force_kill_pid "$pid"
    fi
  done < <(list_port_pids)

  local attempt
  local remaining
  for attempt in $(seq 1 50); do
    remaining="$(list_port_pids)"
    if [[ -z "$remaining" ]]; then
      rm -f "$PID_FILE"
      return 0
    fi
    sleep 0.1
  done

  describe_port_conflict
  die "port $PORT is still occupied after force-stop"
}

find_owned_server_pid() {
  local pid
  local file_pid
  file_pid="$(read_pid_file || true)"
  if [[ -n "$file_pid" ]] && pid_is_alive "$file_pid" && is_our_process "$file_pid"; then
    echo "$file_pid"
    return 0
  fi

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    if pid_is_alive "$pid" && is_our_process "$pid"; then
      echo "$pid"
      return 0
    fi
  done < <(list_port_pids)
  return 1
}

rotate_log_if_needed() {
  local bytes
  [[ -f "$LOG_FILE" ]] || return 0
  bytes="$(wc -c < "$LOG_FILE" | tr -d '[:space:]')"
  if [[ "$bytes" =~ ^[0-9]+$ ]] && (( bytes > 10485760 )); then
    mv -f "$LOG_FILE" "$LOG_FILE.1"
  fi
}

start_service() {
  ensure_runtime_dir
  remove_stale_pid_file
  acquire_lock
  trap release_lock EXIT

  force_clear_service

  local pid_file_pid
  pid_file_pid="$(read_pid_file || true)"
  if [[ -n "$pid_file_pid" ]] && pid_is_alive "$pid_file_pid"; then
    die "PID file $PID_FILE still points to a live process (PID $pid_file_pid)"
  fi

  rotate_log_if_needed
  echo "[publish-note] starting local publish service..."
  nohup env \
    SHARE_HOST="$HOST" \
    SHARE_PORT="$PORT" \
    SHARE_BASE_URL="$BASE_URL" \
    SHARE_MAX_BODY_BYTES="$MAX_BODY_BYTES" \
    SHARE_DEV_TOKEN="$TOKEN" \
    "$NODE_EXECUTABLE" --experimental-strip-types "$PROJECT_ROOT/scripts/local-publish-server.ts" \
    >> "$LOG_FILE" 2>&1 < /dev/null &
  local child_pid=$!
  printf '%s\n' "$child_pid" > "$PID_FILE"

  local attempt
  for attempt in $(seq 1 50); do
    if ! pid_is_alive "$child_pid"; then
      rm -f "$PID_FILE"
      echo "[publish-note] service exited during startup; recent log:" >&2
      tail -n 30 "$LOG_FILE" >&2 || true
      die "service failed to start"
    fi
    if ! command -v lsof >/dev/null 2>&1 || port_contains_pid "$child_pid"; then
      echo "[publish-note] started (PID $child_pid)"
      echo "[publish-note] URL: $BASE_URL"
      echo "[publish-note] log: $LOG_FILE"
      return 0
    fi
    sleep 0.1
  done

  echo "[publish-note] service did not start listening on $HOST:$PORT; recent log:" >&2
  tail -n 30 "$LOG_FILE" >&2 || true
  kill "$child_pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  die "startup timeout"
}

stop_service() {
  ensure_runtime_dir
  acquire_lock
  trap release_lock EXIT

  local pid
  pid="$(find_owned_server_pid || true)"
  if [[ -z "$pid" ]]; then
    remove_stale_pid_file
    echo "[publish-note] service is not running"
    return 0
  fi

  echo "[publish-note] stopping service (PID $pid)..."
  kill -TERM "$pid" 2>/dev/null || die "cannot stop service PID $pid"
  local attempt
  for attempt in $(seq 1 50); do
    if ! pid_is_alive "$pid"; then
      rm -f "$PID_FILE"
      echo "[publish-note] stopped"
      return 0
    fi
    sleep 0.1
  done

  echo "[publish-note] service did not stop gracefully; sending SIGKILL" >&2
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "[publish-note] stopped"
}

status_service() {
  ensure_runtime_dir
  local pid
  pid="$(find_owned_server_pid || true)"
  if [[ -n "$pid" ]]; then
    echo "[publish-note] running (PID $pid)"
    echo "[publish-note] URL: $BASE_URL"
    echo "[publish-note] log: $LOG_FILE"
    return 0
  fi

  local port_pid
  while read -r port_pid; do
    [[ -z "$port_pid" ]] && continue
    describe_port_conflict
    echo "[publish-note] service is not running; another process owns port $PORT" >&2
    return 1
  done < <(list_port_pids)
  echo "[publish-note] stopped"
}

main() {
  cd "$PROJECT_ROOT"
  local command="${1:-start}"
  if [[ "$command" == "help" || "$command" == "-h" || "$command" == "--help" ]]; then
    usage
    return 0
  fi
  validate_configuration

  case "$command" in
    start) validate_node; start_service ;;
    stop) stop_service ;;
    restart) validate_node; stop_service; start_service ;;
    status) status_service ;;
    logs)
      ensure_runtime_dir
      touch "$LOG_FILE"
      tail -n 100 -f "$LOG_FILE"
      ;;
    *) usage >&2; die "unknown command: $command" ;;
  esac
}

main "$@"
