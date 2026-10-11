#!/usr/bin/env bash
# Builds the extension for Chromium and Firefox.
#
#   ./build.sh
#
# For each browser it copies src/ into dist/<browser>/, writes manifest.json
# merged from src/manifest.base.json and manifests/<browser>.json, and packs
# dist/mutemark-<browser>-<version>.zip. No dependencies beyond bash, python3, zip and GNU coreutils
# (on macOS: brew install coreutils, then put its gnubin directory first in PATH).
# Set SOURCE_DATE_EPOCH to get byte-identical archives.
set -euo pipefail

# zip stores file times in local time without a zone, so the build runs in UTC.
export TZ=UTC

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$root/src"
dist="$root/dist"
browsers=(chromium firefox)

for tool in python3 zip; do
  command -v "$tool" >/dev/null || { echo "build.sh: $tool is required" >&2; exit 1; }
done
cp --version >/dev/null 2>&1 || { echo "build.sh: GNU coreutils are required (cp --parents, touch -d)" >&2; exit 1; }

for size in 16 32 48 128; do
  [[ -f "$src/icons/icon-$size.png" ]] || { echo "build.sh: missing src/icons/icon-$size.png" >&2; exit 1; }
done

version="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$src/manifest.base.json")"

# Objects merge key by key, lists are joined without duplicates, other values are replaced.
merge_manifest() {
  python3 -I - "$src/manifest.base.json" "$root/manifests/$1.json" "$2" <<'PY'
import json, sys

def merge(base, extra):
    if isinstance(base, dict) and isinstance(extra, dict):
        out = dict(base)
        for key, value in extra.items():
            out[key] = merge(base[key], value) if key in base else value
        return out
    if isinstance(base, list) and isinstance(extra, list):
        return base + [item for item in extra if item not in base]
    return extra

with open(sys.argv[1]) as f:
    base = json.load(f)
with open(sys.argv[2]) as f:
    extra = json.load(f)
with open(sys.argv[3], "w") as f:
    json.dump(merge(base, extra), f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
}

mkdir -p "$dist"
for browser in "${browsers[@]}"; do
  out="$dist/$browser"
  zipfile="$dist/mutemark-$browser-$version.zip"
  rm -rf "$out" "$zipfile"
  mkdir -p "$out"

  # Everything under src/ except the manifest parts, the icon source drawing, hidden files
  # (also those inside hidden folders) and a theme wallpaper (contrib/omarchy writes one
  # into builds, never into src/).
  (cd "$src" && find . -type f \
      ! -name 'manifest.*.json' ! -path './icons/*.svg' ! -path '*/.*' ! -name '*~' \
      ! -name 'background.jpg' \
      -print0 | xargs -0 -I{} cp --parents {} "$out/")
  merge_manifest "$browser" "$out/manifest.json"

  # The package carries its own license terms and the third-party notices (the ISC text
  # for the Lucide icons must travel with the icon code).
  cp "$root/LICENSE" "$root/THIRD_PARTY_NOTICES.md" "$out/"

  if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
    find "$out" -exec touch -h -d "@$SOURCE_DATE_EPOCH" {} +
  fi

  # Sorted file list, no directory entries, no extra attributes (owner, permissions).
  (cd "$out" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | zip -X -q -D "$zipfile" -@)
  echo "built $zipfile"
done
