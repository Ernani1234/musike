#!/bin/sh
# musike issue #28 workaround: yt-dlp stream URLs become invalid ~3-4s
# after issuance; sleep AFTER yt-dlp finishes so Musike proxies a fresh
# URL (avoids 403s). Tunable via YTDLP_DELAY (seconds).
# Remove this wrapper once upstream fixes Ernani1234/musike#28.
/opt/musike/bin/yt-dlp "$@"
rc=$?
sleep "${YTDLP_DELAY:-4}"
exit $rc
