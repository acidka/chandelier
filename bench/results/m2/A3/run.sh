#!/bin/sh
# run.sh <script.jsx> [argument]  — runs an ExtendScript in Illustrator, retries on RETRY/MRAP (4 tries, 10 s apart)
SCRIPT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; ARG="${2:-}"
run() { osascript -e "with timeout of 600 seconds
tell application id \"com.adobe.illustrator\" to do javascript (POSIX file \"$SCRIPT\") with arguments {\"$ARG\"}
end timeout" 2>&1; }
for i in 1 2 3 4; do OUT="$(run)"; case "$OUT" in RETRY|*MRAP*) [ $i -lt 4 ] && sleep 10 && continue;; esac; break; done
echo "$OUT"
