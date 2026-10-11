#!/usr/bin/env bash
# Copies the colors and wallpaper of the current Omarchy theme into an
# unpacked Mutemark build (dist/chromium or dist/firefox after ./build.sh).
# Run it after switching themes, then open a new tab.
# Usage: update-theme.sh <unpacked-build-folder> [palette-file]
# The palette is read from the theme's colors.toml, or alacritty.toml for
# older themes. Writes theme.css and background.jpg into the build folder.
# It refuses to write into src/: the wallpaper belongs to the theme's author
# and must never end up in the repository or in a package.
set -euo pipefail

if [[ $# -lt 1 || ! -d "$1" ]]; then
  echo "usage: $(basename "$0") <unpacked-build-folder> [palette-file]" >&2
  exit 2
fi

dir="$(realpath "$1")"

# A build folder has manifest.json. src/ has manifest.base.json instead.
if [[ -f "$dir/manifest.base.json" || ! -f "$dir/manifest.json" ]]; then
  echo "$dir is not an unpacked build. Run ./build.sh and pass dist/chromium or dist/firefox." >&2
  exit 2
fi

state="$HOME/.local/state/omarchy/current"
theme="$state/theme"
out="$dir/theme.css"

if [[ -n "${2:-}" ]]; then
  if [[ ! -f "$2" ]]; then
    echo "palette file not found: $2" >&2
    exit 1
  fi
  src="$2"
elif [[ -f "$theme/colors.toml" ]]; then
  src="$theme/colors.toml"
elif [[ -f "$theme/alacritty.toml" ]]; then
  src="$theme/alacritty.toml"
else
  echo "no theme palette found in $theme" >&2
  exit 1
fi

# The wallpaper first, so theme.css can point to it.
# The extension can only read its own folder, so the wallpaper is copied there.
wallpaper_css=""
wallpaper="$(readlink -f "$state/background" 2>/dev/null || true)"
rm -f "$dir/background.jpg"
if [[ -n "$wallpaper" && -f "$wallpaper" ]]; then
  if command -v magick >/dev/null; then
    magick "$wallpaper" -resize 2560x2560\> -quality 82 -strip "$dir/background.jpg"
  else
    cp -f "$wallpaper" "$dir/background.jpg"
  fi
  wallpaper_css='url("background.jpg")'
  echo "wallpaper copied: $(basename "$wallpaper") -> $dir/background.jpg"
else
  echo "no theme wallpaper found, the background stays plain" >&2
fi

awk -v wallpaper="$wallpaper_css" '
  /^[ \t]*\[/ { section = $0; sub(/^[ \t]+/, "", section); sub(/[ \t]*(#.*)?$/, "", section); next }
  /^[ \t]*[a-z_]+[ \t]*=/ {
    # Split on the first "=", so values with spaces or comments do not shift the fields.
    eq = index($0, "=")
    key = substr($0, 1, eq - 1)
    val = substr($0, eq + 1)
    gsub(/[ \t]/, "", key)
    sub(/^[ \t]+/, "", val)
    # Take the quoted text (either quote style), which drops a trailing comment after the
    # closing quote. An unquoted value ends at the first space or "#".
    if (match(val, /^"[^"]*"/) || match(val, /^\047[^\047]*\047/)) {
      val = substr(val, 2, RLENGTH - 2)
    } else {
      sub(/[ \t#].*$/, "", val)
    }
    # Only hex colors are accepted. Anything else leaves the fallback in place.
    if (val ~ /^#[0-9a-fA-F]+$/ && (length(val) == 4 || length(val) == 7 || length(val) == 9)) {
      store[section key] = val
    } else if (key == "mode" && (val == "light" || val == "dark")) {
      store[section key] = val
    }
  }
  function pick(a, b, fallback) {
    if (store[a] != "") return store[a]
    if (store[b] != "") return store[b]
    return fallback
  }
  END {
    # First key is from colors.toml, second from alacritty.toml.
    bg      = pick("background",        "[colors.primary]background", "#101315")
    bgdark  = pick("dark_background",   "[colors.normal]black",       bg)
    fg      = pick("foreground",        "[colors.primary]foreground", "#cacccc")
    fgdim   = pick("muted",             "[colors.bright]black",       "#5d6367")
    sel     = pick("selection",         "[colors.bright]green",       "#343d41")
    accent  = pick("accent",            "[colors.normal]blue",        "#798186")
    hot     = pick("bright_red",        "[colors.bright]red",         "#de6145")
    red     = pick("red",               "[colors.normal]red",         hot)
    yellow  = pick("yellow",            "[colors.normal]yellow",      fg)
    green   = pick("green",             "[colors.normal]green",       fg)
    cyan    = pick("cyan",              "[colors.normal]cyan",        accent)
    blue    = pick("blue",              "[colors.normal]blue",        accent)
    magenta = pick("magenta",           "[colors.normal]magenta",     accent)
    mode    = (store["mode"] == "light") ? "light" : "dark"

    print "/* Written by contrib/omarchy/update-theme.sh, do not edit by hand. */"
    print ":root {"
    printf "  color-scheme: %s;\n", mode
    printf "  --bg: %s;\n", bg
    printf "  --bg-dark: %s;\n", bgdark
    printf "  --fg: %s;\n", fg
    printf "  --fg-dim: %s;\n", fgdim
    printf "  --selection: %s;\n", sel
    printf "  --theme-accent: %s;\n", accent
    print "  --accent: var(--theme-accent);"
    printf "  --hot: %s;\n", hot
    printf "  --red: %s;\n", red
    printf "  --yellow: %s;\n", yellow
    printf "  --green: %s;\n", green
    printf "  --cyan: %s;\n", cyan
    printf "  --blue: %s;\n", blue
    printf "  --magenta: %s;\n", magenta
    if (wallpaper != "") printf "  --wallpaper: %s;\n", wallpaper
    print "}"
  }
' "$src" > "$out"

echo "colors written to $out (from $(basename "$src"))"

