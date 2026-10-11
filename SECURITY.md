# Security

Mutemark has no account, no analytics and no servers of its own. It reads your bookmarks to draw the new tab page and keeps its data in the browser. The only network requests it makes go to two Open-Meteo hosts, and only while the weather widget is on and you have chosen a place (or are searching for one). The forecast is refreshed at most every 20 minutes while a new tab is open. That shapes what a security problem here looks like.

## Supported versions

Only the latest release gets fixes. A fix ships as the next version, so updating is the whole remedy.

## What counts

- **Data leaving the browser.** Any way for bookmarks, the note, settings, your image or anything else the extension stores to be sent out, or for a place query or coordinates to reach any host other than `geocoding-api.open-meteo.com` and `api.open-meteo.com`.
- **A request to anywhere else.** Any network request from the extension pages to a host other than Open-Meteo.
- **A bypass of the Content Security Policy.** Any way to run script that does not ship in the package, to load a remote script, style, font or image, or to widen `connect-src` beyond the two hosts.
- **A web page reaching the extension.** Any way for a site to read or change bookmarks or stored data through the extension.
- **Bookmarks being lost.** An action that deletes or damages bookmarks other than the ones you chose, or that cannot be undone where the page says it can.

## What does not count

- **Someone with access to your browser profile.** They can read the bookmarks and the extension's local storage directly.
- **What Open-Meteo itself does with a request.** The data it receives is listed in [PRIVACY.md](PRIVACY.md). Turn the weather widget off to send nothing.
- **A modified or repackaged build.** Only the packages published on the Releases page and the source in this repository are covered.

## Reporting a problem

Please do not open a public issue for a vulnerability. Use **Report a vulnerability** on the Security tab of this repository instead; it opens a private advisory that only the maintainer can see.

Include the version of Mutemark, the browser and its version, what you did and what happened. Do not send your real bookmarks: describe them in general words or use a made-up set that shows the same problem.

You will get an answer as soon as possible. Once a fix is released, the advisory can be published with credit to you, unless you would rather not be named.
