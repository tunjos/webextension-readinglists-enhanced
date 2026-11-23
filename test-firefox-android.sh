#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <adb-device-id>" >&2
  exit 1
fi

if ! command -v web-ext > /dev/null 2>&1; then
  echo "web-ext must be installed and available on PATH." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

# Firefox Android requires the background scripts variant rather than service_worker.
cp -R "${script_dir}/extension" "${tmpdir}/extension"
perl -0pi -e 's/("background"\s*:\s*\{\s*)"service_worker"\s*:\s*"[^"]+"\s*,\s*/$1/s' \
  "${tmpdir}/extension/manifest.json"

web-ext run \
  --source-dir "${tmpdir}/extension" \
  -t firefox-android \
  --adb-device "$1" \
  --firefox-apk org.mozilla.firefox
