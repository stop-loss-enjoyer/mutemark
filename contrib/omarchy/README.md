# Omarchy integration (optional)

Most people do not need this script. Settings in Mutemark has Import Omarchy theme under More, which reads the colors of a theme file in any build, packaged or not. On Omarchy the current theme's file is `~/.local/state/omarchy/current/theme/colors.toml` (older themes have `alacritty.toml` there instead). The script below also copies the wallpaper and repeats the import by itself after each theme change, but only works for an unpacked build.

`update-theme.sh` copies the colors and wallpaper of your current Omarchy theme into an unpacked Mutemark build, so the new tab matches your desktop.

This works only for an unpacked build loaded from a folder (Load unpacked), because the script writes files into that folder. Packaged zip installs and store installs cannot be changed this way. The script is not part of the extension and is not included in the packages.

## Use

Build Mutemark, load `dist/chromium` as an unpacked extension, then:

```
./build.sh
contrib/omarchy/update-theme.sh dist/chromium
```

It writes `theme.css` and, if the theme has one, `background.jpg` into that folder, and `theme.css` points the page background to it. Run it again after changing the Omarchy theme, then open a new tab. An optional second argument is a path to a specific `colors.toml` or `alacritty.toml`.

The script refuses any folder without a `manifest.json`, and `src/` in particular: the wallpaper must never land in the source tree. `./build.sh` deletes and rewrites `dist/<browser>`, so run the script again after each build.

The written colors have one value each, so with them the Theme switch in Settings (System, Light, Dark) no longer changes the colors. To return to the default palette, run `./build.sh` again.

The script only reads files under `~/.local/state/omarchy/current`. It does not touch the network.

The wallpaper belongs to the theme's author and is copied only onto your own machine. Do not commit or redistribute it. `background.jpg` is in `.gitignore`, and `build.sh` leaves it out of the packages.
