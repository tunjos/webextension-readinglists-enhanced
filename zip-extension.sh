#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest_path="${script_dir}/extension/manifest.json"
dist_dir="${script_dir}/dist"

if [[ ! -f "${manifest_path}" ]]; then
  echo "manifest.json not found at ${manifest_path}" >&2
  exit 1
fi

name="$(sed -n 's/^[[:space:]]*"name":[[:space:]]*"\([^"]*\)".*/\1/p' "${manifest_path}" | head -n 1)"
version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "${manifest_path}" | head -n 1)"

if [[ -z "${name}" || -z "${version}" ]]; then
  echo "Failed to read name or version from ${manifest_path}" >&2
  exit 1
fi

slug="${name// /-}"
mkdir -p "${dist_dir}"

make_zip() {
  local browser="$1"
  local tmpdir
  tmpdir="$(mktemp -d)"
  cp -R "${script_dir}/extension" "${tmpdir}/extension"

  local tmp_manifest="${tmpdir}/extension/manifest.json"
  if [[ "${browser}" == "chrome" || "${browser}" == "edge" ]]; then
    perl -0pi -e 's/("background"\s*:\s*\{\s*"service_worker"\s*:\s*"[^"]+")\s*,\s*"scripts"\s*:\s*\[[^\]]*\]\s*(\})/$1$2/s' "${tmp_manifest}"
    perl -0pi -e 's/\n  "page_action": \{.*?\n  \},(?=\n  "icons")//s' "${tmp_manifest}"
  elif [[ "${browser}" == "firefox" ]]; then
    perl -0pi -e 's/("background"\s*:\s*\{\s*)"service_worker"\s*:\s*"[^"]+"\s*,\s*/$1/s' "${tmp_manifest}"
  fi

  local zip_name="${slug}_${browser}_${version}.zip"
  rm -f "${dist_dir}/${zip_name}"
  (cd "${tmpdir}/extension" && zip -r "${dist_dir}/${zip_name}" . > /dev/null)
  rm -rf "${tmpdir}"
  echo "Created dist/${zip_name}"
}

make_zip "chrome"
make_zip "firefox"
make_zip "edge"
