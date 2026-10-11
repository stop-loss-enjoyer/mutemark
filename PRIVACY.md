# Privacy policy

Last updated: 2026-10-11

Mutemark is a browser extension that shows your bookmarks on the new tab page. This policy describes everything it does with data.

## What we do not collect

Mutemark has no account, no analytics, no telemetry, no advertising and no servers of its own. The developer receives no data from the extension. Your bookmarks are not sent anywhere.

## What the extension reads

- Your browser bookmarks, through the browser's bookmarks API. This is used only to display them and to carry out changes you make: move, reorder, rename and delete bookmarks, create, rename, move and delete groups (bookmark folders), and undo a deletion. The "Read and change your bookmarks" permission exists for this reason.
- In Chromium browsers, site icons from the browser's local icon cache. These are not fetched from the network.

## What is stored on your device

The extension keeps the following in its own `localStorage`, inside your browser profile. Each item is listed with its key.

- `mutemark-settings`: theme, accent color, background (a gallery picture id, gradient, solid or your image, and whether your image is light or dark), start folder, whether the weather widget is on, which other widgets are on, the time zones of the world clocks (London and New York until you choose), units, clock format, whether the first-run hint was closed, and the colors and file name of a theme file if you imported one (not the file itself).
- `mutemark-note`: the text of the note widget. Removed when the note is empty.
- `mutemark-timer`: the timer's set time, the time left, the moment it ends while running, and whether its chime has played.
- `mutemark-plan`: layouts of the cards for recent window sizes and start folders (up to eight), as folder ids, columns and sizes.
- `mutemark-snapshot`: a cached copy of the last drawn page, so it opens instantly. This contains the names of your folders and the titles and addresses of your bookmarks.
- `mutemark-nofav`: up to 500 bookmark addresses that have no site icon in the browser's cache (Chromium only), so that a letter is shown for them at once.
- `mutemark-place`: if you use weather, the place you chose: its name, region and country, and its coordinates rounded to two decimals.
- `mutemark-weather`: the last forecast for that place and when it was received.

The weather widget is on by default but sends nothing until you choose a place.

If you choose your own background image, it is kept in the extension's own IndexedDB, also inside your browser profile: database `mutemark`, store `files`, one record `wallpaper` with the image data only, not its file name. The database is created only when you choose an image.

This data stays on your device. It is not synced and not uploaded.

## What is sent over the network

Nothing, unless the weather widget is on and you have chosen a place in it (or are searching for one). Only then does the extension contact Open-Meteo (https://open-meteo.com), and no other server:

- `geocoding-api.open-meteo.com`: a place search, sent when you type a city name in the place field and press Enter. It contains the text you typed. Coordinates typed in the field are never sent as a search, whatever digits they are written in (full-width, Arabic and others are read as plain ones): decimal ones (such as `51.51, -0.13`) and degrees, minutes and seconds are rounded and used directly. A Plus Code, a lone decimal number, a number with a sign in front and a few similar forms are not sent either: the field says to use decimal coordinates. Any other text is sent as typed, like a place name, so a position written in another code, such as a geohash, a Maidenhead locator or a what3words address, would reach the geocoder as it is.
- `api.open-meteo.com`: a forecast request for the place you chose, containing its coordinates rounded to two decimals (never finer than about 1 km). It is repeated at most every 20 minutes while a new tab is open.

No cookies and no referrer are sent with these requests. Open-Meteo, as the receiving server, can see your IP address, the browser's user agent, the headers the browser adds to every request (`Accept-Language` with your browser's languages and, in Chromium, the client hints `Sec-CH-UA`, `Sec-CH-UA-Mobile` and `Sec-CH-UA-Platform` with the browser brand and version, whether it is a mobile browser and the operating system) and an `Origin` header with the extension's id (in Firefox, an id made at random for each installation). Firefox asks for consent to share location data, and without it nothing is sent. Their handling of that data is described at https://open-meteo.com/en/terms#privacy. Mutemark does not detect your location automatically.

The extension's Content Security Policy permits connections only to those two hosts.

## Sharing

We do not sell, share or transfer your data. We have none.

## Deleting your data

Remove the extension, or press Delete everything in Settings (after a confirmation in the panel). Both delete everything the extension stored, in `localStorage` and in IndexedDB. Clearing the weather place field and pressing Enter forgets just the place and its forecast. Bookmarks themselves belong to your browser and are not affected by Delete everything, except for changes you made yourself.

## Contact

Open an issue at https://github.com/stop-loss-enjoyer/mutemark/issues.
