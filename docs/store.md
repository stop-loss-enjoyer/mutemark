# Store listing texts

Texts for Chrome Web Store, Firefox Add-ons (AMO) and Edge Add-ons. Do not add personal details to them. Contact and support: GitHub issues. Privacy policy URL: the rendered PRIVACY.md in the repository.

## Name

Mutemark

## Short description (limit 132 characters)

Your browser bookmarks as a calm new tab. No account, no analytics, no servers of ours. Your bookmarks never leave the browser.

(Length: 127 characters.)

## Full description (Chrome Web Store, Edge)

Mutemark turns your bookmarks into your new tab page: a card for each folder of your bookmarks bar (or any start folder you pick), sized to fill your window and remembering where each card sits.

Start typing to find a bookmark by name, address, folder or initials. It also understands text typed on the wrong keyboard layout. Drag to reorder bookmarks or move them between folders, rename or delete them with undo. Right-click a bookmark to open it in a new tab, copy its link, rename or delete it. Make a new group with + New group, rename it, drag it by its title into place, or delete it and keep its bookmarks, with Undo. An empty group shows a card that says where to drop bookmarks. Every change goes straight to your browser's own bookmarks, so nothing is locked inside the extension.

Small widgets above the bookmarks, each one a click to turn on or off: weather, clock, calendar, world clocks, a note and a timer. All but the weather work without the network.

Light and dark themes, an accent color, and a background: one of 13 public domain and CC0 photos that ship with the extension, a gradient, a solid color or your own image, which stays in your browser.

Privacy is the point:
- No account, no analytics, no telemetry, no servers of ours.
- Your bookmarks never leave the browser.
- Site icons come from the browser's local cache.
- The weather widget is on, but sends nothing until you choose a place yourself. Then it contacts Open-Meteo: the name you searched for, and the coordinates of the place you chose, rounded to about 1 km. Turn it off with one click.
- The extension's Content Security Policy allows connections to Open-Meteo only, so the browser itself blocks anything else.

Free, with the source open under PolyForm Noncommercial. The code is plain HTML, CSS and JavaScript, not minified, so you can read exactly what runs.

Weather data by Open-Meteo.com (CC BY 4.0).

## Full description (AMO)

Same as above, with the line about site icons replaced:

Firefox gives extensions no local icon cache, so bookmarks show a letter instead of a site icon, and nothing is fetched from the sites.

## Category

Chrome Web Store: Productivity. AMO: Bookmarks, Tabs. Edge: Productivity.

## Single purpose (Chrome Web Store)

Replace the new tab page with a view of the user's browser bookmarks, with small optional widgets (weather, clock, calendar, world clocks, note, timer) above them.

## Permission justifications

**bookmarks.** Required to show the user's bookmarks on the new tab page and to apply the user's own actions: moving, reordering, renaming or deleting a bookmark, creating, renaming, moving or deleting a group (a bookmark folder), and undoing a deletion. Bookmarks are read and changed only locally, in response to what the user sees and does. They are never transmitted.

**favicon (Chromium only).** Required to display site icons from the browser's local icon cache. No icon is fetched from the network. The Firefox build does not request this permission.

**chrome_url_overrides: newtab.** This is the extension's single purpose: the new tab page.

**Host permissions.** None requested. Open-Meteo allows cross-origin requests, so the weather widget needs no host access. The extension pages CSP limits `connect-src` to `api.open-meteo.com` and `geocoding-api.open-meteo.com`.

**Remote code.** None. All code ships in the package and is not minified.

## Data disclosure form (Chrome Web Store, Edge)

Does the extension collect or use any of the following? Answers:

| Category | Answer | Explanation |
|---|---|---|
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | |
| Personal communications | No | |
| Location | Yes | Only if the weather widget is on (the default) and the user searches for or chooses a place: the typed place name goes to the Open-Meteo geocoder, and the coordinates of the chosen place, rounded to two decimals (about 1 km), go to Open-Meteo to get a forecast. Used only for that function, not sold, not stored by us. Never detected automatically. |
| Web history | No | History is not accessed. |
| User activity | No | |
| Website content | No | Bookmarks are read locally and never transmitted. |

Certifications, all true:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

If the form treats bookmarks as "website content" or "web history" because the permission is granted, answer that the data is handled locally only and is not transmitted.

## AMO data collection (manifest)

Declared in `manifests/firefox.json`: `data_collection_permissions.required` is `["none"]`, `optional` is `["locationInfo"]`. The weather widget is on by default but sends nothing until the user chooses a place. When the user searches for a place, the extension first calls `permissions.request({ data_collection: ["locationInfo"] })` from that key press (`src/platform.js`), and sends nothing if consent is refused. Revoking it in the add-on settings stops all weather requests. Whether consent is needed is read from the manifest, so if `permissions.getAll()` answers in another shape than expected, nothing is sent rather than everything (checked by loading this build in a browser without the API).

## Notes for reviewers

- Source is unminified; the submitted package is produced by `./build.sh`, which only copies files, merges manifest overlays and zips.
- No network request is made until the user searches for or chooses a place in the weather widget (on by default, empty until a place is chosen). Turning the widget off stops all requests.
- The clock, calendar, world clocks, note and timer use no network. The timer rings once, only while the tab stays open, with a bell strike synthesized with WebAudio in the page.
- The 13 background photos ship in the package. Credits and license proofs are in THIRD_PARTY_NOTICES.md.
- Firefox build has no site icons by design.
