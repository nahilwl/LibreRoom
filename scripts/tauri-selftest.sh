#!/usr/bin/env bash
# Runs the in-app self-test inside the real Tauri WebView (Linux, headless via Xvfb).
#  1. online       : downloads + installs the model, removes a background, exports, saves/reopens a project
#  2. port-conflict: the port v0.1 used (41917) is held by another process; the app must still work
#                    and must not listen on any TCP/UDP port itself
#  3. offline      : rebuilt with a CSP that forbids every remote origin; the installed model must still work
# Pass --compare to also compare the native and browser engines on the same images.
set -uo pipefail
cd "$(dirname "$0")/.."
BIN=src-tauri/target/debug/libreroom
SELFTEST_BUILD='{"build":{"beforeBuildCommand":"npx vite build --mode selftest"}}'
OFFLINE_CSP='{"app":{"security":{"csp":{"default-src":"'"'self'"'","script-src":"'"'self' 'wasm-unsafe-eval'"'","worker-src":"'"'self'"' blob:","style-src":"'"'self' 'unsafe-inline'"'","img-src":"'"'self'"' data: blob:","connect-src":"'"'self'"' ipc: http://ipc.localhost data:"}}}}'
failed=0

run() { # $1 = mode, prints the JSON report, returns the app's exit status
  LIBREROOM_SELFTEST="$1" LIBREROOM_ENGINE="${2:-}" timeout 600 xvfb-run -a "$BIN" 2>/dev/null |
    grep '^LIBREROOM_SELFTEST' | sed 's/^LIBREROOM_SELFTEST //'
  return "${PIPESTATUS[0]}"
}
check() { if [ "$1" -eq 0 ]; then echo "PASS $2"; else echo "FAIL $2"; failed=1; fi; }

npx tauri build --debug --no-bundle --config "$SELFTEST_BUILD" >/dev/null 2>&1 || { echo "build failed"; exit 1; }

echo "== online"
run online; check $? online

echo "== port-conflict"
python3 -c '
import socket, time
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 41917)); s.listen(); time.sleep(120)' &
holder=$!
sleep 0.5
LIBREROOM_SELFTEST=online timeout 600 xvfb-run -a "$BIN" >/tmp/libreroom-port-test.log 2>&1 &
app=$!
sleep 6
# Every process of the app (Tauri shell + WebKit children), then their listening sockets.
pids=$(pgrep -f "$BIN" | tr '\n' '|')
pids=${pids%|}
for p in $(pgrep -f "$BIN"); do pids="$pids|$(pgrep -P "$p" | tr '\n' '|')"; done
listening=$(ss -Hltunp 2>/dev/null | grep -E "pid=(${pids//||/|})," || true)
wait "$app"; status=$?
kill "$holder" 2>/dev/null
grep '^LIBREROOM_SELFTEST' /tmp/libreroom-port-test.log | sed 's/^LIBREROOM_SELFTEST //'
check "$status" "app works while port 41917 is taken"
if [ -z "$listening" ]; then check 0 "app opens no listening socket"; else echo "$listening"; check 1 "app opens no listening socket"; fi

if [ "${1:-}" = "--compare" ]; then
  echo "== compare (installs the browser-engine copy of the model first)"
  run online browser >/dev/null
  run compare; check $? compare
fi

npx tauri build --debug --no-bundle --config "$SELFTEST_BUILD" --config "$OFFLINE_CSP" >/dev/null 2>&1 || { echo "build failed"; exit 1; }
echo "== offline"
run offline; check $? offline

exit $failed
