#!/bin/sh
# Only metadata extraction retries transient failures. Successful extraction has
# no implicit delay. Explicit legacy YTDLP_DELAY remains a compatibility opt-in.
# No arguments, URLs, cookies or provider credentials are written to retry logs.
set -u
binary=${YTDLP_REAL_PATH:-/opt/musike/bin/yt-dlp}
metadata=false
for arg in "$@"; do
  case "$arg" in -J|-j|--dump-json|--dump-single-json) metadata=true ;; esac
done
if [ "$metadata" = false ]; then exec "$binary" "$@"; fi
if [ "$binary" = "$0" ]; then echo 'musike-ytdlp: recursive wrapper configuration' >&2; exit 64; fi
attempts=${YTDLP_WRAP_MAX_ATTEMPTS:-2}
case "$attempts" in 1|2|3) ;; *) attempts=2 ;; esac
backoff=${YTDLP_WRAP_RETRY_DELAY:-1}
case "$backoff" in 0|1|2|3|4|5) ;; *) backoff=1 ;; esac
success_delay=${YTDLP_WRAP_SUCCESS_DELAY:-${YTDLP_DELAY:-0}}
case "$success_delay" in 0|1|2|3|4|5|6|7|8|9|10) ;; *) success_delay=0 ;; esac
umask 077
tmp=$(mktemp -d "${TMPDIR:-/tmp}/musike-ytdlp.XXXXXX") || exit 70
child=
cleanup() { rm -rf "$tmp"; }
stop() {
  trap '' INT TERM
  if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
  exit "$1"
}
trap cleanup 0
trap 'stop 130' INT
trap 'stop 143' TERM
attempt=1
while :; do
  "$binary" "$@" >"$tmp/out" 2>"$tmp/err" &
  child=$!
  wait "$child"
  rc=$?
  child=
  if [ "$rc" -eq 0 ]; then
    cat "$tmp/out"; cat "$tmp/err" >&2
    if [ "$success_delay" -gt 0 ]; then sleep "$success_delay" & child=$!; wait "$child"; child=; fi
    exit 0
  fi
  # Identity/permission/content/rate-limit failures need operator action, not a retry storm.
  if [ "$attempt" -ge "$attempts" ] || grep -Eiq 'confirm.*not a bot|sign in|private video|video unavailable|removed|age.restrict|unsupported URL|HTTP Error 429|not found|unrecognized (option|argument)|permission denied' "$tmp/err"; then
    cat "$tmp/out"; cat "$tmp/err" >&2; exit "$rc"
  fi
  if ! grep -Eiq 'HTTP Error (403|408|500|502|503|504)|timed out|temporary failure|connection (reset|aborted|refused)|network is unreachable' "$tmp/err"; then
    cat "$tmp/out"; cat "$tmp/err" >&2; exit "$rc"
  fi
  echo "musike-ytdlp stage=retry reason=transient attempt=$attempt" >&2
  if [ "$backoff" -gt 0 ]; then sleep "$backoff" & child=$!; wait "$child"; child=; fi
  attempt=$((attempt + 1))
done
