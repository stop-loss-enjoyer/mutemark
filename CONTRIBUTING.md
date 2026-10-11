# Contributing

Mutemark is a privacy-first extension. The rules below protect that promise, and every change to the project follows them.

## Rules

1. **No network requests except Open-Meteo.** The only allowed hosts are `api.open-meteo.com` and `geocoding-api.open-meteo.com`, and only while the user has turned weather on and has chosen a place (or is searching for one). Coordinates are rounded to two decimals before they are stored or sent, and text in the coordinate forms that `looksLikeCoords` knows (decimal, degrees, minutes and seconds, a Plus Code, a lone decimal or signed number) is never sent to the geocoder. If you find a form that slips through, extend `looksLikeCoords` in `src/weather.js`. The `connect-src` of the extension pages CSP must stay limited to those two hosts. Do not widen it.
2. **No third-party icon services.** Do not fetch site icons from any web service (Google, DuckDuckGo, Yandex or any other). Doing so would send the domain of every bookmark to a third party. In Chromium, icons come from the browser's local `/_favicon/` cache. In Firefox there are no site icons, only letters. This is deliberate.
3. **No analytics, telemetry, crash reporting or remote code.** Not even opt-in.
4. **No build tools and no minification.** Plain HTML, CSS and JavaScript, no bundlers, no frameworks, no libraries. `build.sh` only copies files, merges manifests and zips them.
5. **Permissions stay minimal.** `bookmarks` and, in Chromium, `favicon`. No host permissions, no `tabs`, no `history`. Adding a permission needs a clear reason.
6. **English only** in code comments, interface text and documents. Keyboard layout tables in `src/newtab.js` are data, not text.
7. **No long dashes** (the em dash and the en dash) anywhere. Use a comma, a period or a colon.
8. **No external fonts, scripts or images.** Everything the page loads ships in the package. The one font is Inter, bundled in `src/fonts/` under the SIL Open Font License (see THIRD_PARTY_NOTICES.md, which ships in each package). Do not add another typeface.
9. **Keep it small.** Fewer features done well beat many features to maintain.

## Development

Edit files under `src/`, then run `./build.sh` and load `dist/chromium` as an unpacked extension (or `dist/firefox` as a temporary add-on). `src/` itself cannot be loaded: it has no `manifest.json`, only `manifest.base.json`, which the build merges with the overlay for each browser. After a change, run `./build.sh` again and reload the extension. Test in a Chromium browser and, if you touch anything platform-specific, in Firefox (`npx web-ext lint --source-dir dist/firefox`).

Never put a theme wallpaper or any other third-party image into `src/`. The Omarchy script in `contrib/omarchy` writes only into a build folder in `dist/`.

A new gallery background must be in the public domain or under CC0. Add `<name>.jpg` (2560 px on the long side, metadata stripped) and `<name>-thumb.jpg` to `src/backgrounds/`, an entry with title, author, license, source and tone to `src/backgrounds.js`, and its full provenance (source, license and proof, edits) to THIRD_PARTY_NOTICES.md.

New icons come from Lucide, the same version as the others (lucide-static 0.460.0, see `src/icons.js`). Copy the inner markup of the SVG, do not load it from anywhere.

A new key in `localStorage` or IndexedDB goes into the list in PRIVACY.md. Delete everything in Settings clears all of `localStorage` and the IndexedDB database, so new keys are covered by it.

Before publishing a build, check the package contents with `unzip -l dist/mutemark-chromium-*.zip`: only the files of `src/`, the merged `manifest.json`, `LICENSE` and `THIRD_PARTY_NOTICES.md`, no `manifest.base.json`, no `icons/*.svg`, no `background.jpg`.

## Code from outside

Issues with bugs and ideas are welcome. Code from outside is not merged: the project keeps a single author so that its license stays in one hand. If a change is worth making, describe it in an issue, with what changed and why, and any new network behavior, permission or stored key, so it can be checked against PRIVACY.md.
