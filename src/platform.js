// Browser differences in one place. Loaded before the other scripts,
// which share these globals.

// Firefox exposes the extension API as `browser`, Chromium as `chrome`.
// Both return promises in Manifest V3, so no polyfill is needed.
const api = globalThis.browser ?? globalThis.chrome;

// Firefox and Chromium disagree about bookmarks.move(): the index is the final
// position in Firefox, and the position before the item is taken out in Chromium.
const IS_FIREFOX = (() => {
  try {
    return api.runtime.getURL("").startsWith("moz-extension:");
  } catch {
    return false;
  }
})();

// Site icons come from the browser's own local icon cache (`/_favicon/`).
// Only Chromium has it, and only with the "favicon" permission, which only
// the Chromium build declares. Elsewhere bookmarks show a letter instead.
// Icons are never fetched from the network.
const HAS_FAVICONS = (() => {
  try {
    return Boolean(api?.runtime?.getManifest?.().permissions?.includes("favicon"));
  } catch {
    return false;
  }
})();

// Bookmarks toolbar folder: "1" in Chromium, "toolbar_____" in Firefox.
// Newer Chromium also marks it with folderType, and with account bookmarks
// there can be a second toolbar folder with another id.
const TOOLBAR_IDS = ["1", "toolbar_____"];

function isToolbar(node) {
  return TOOLBAR_IDS.includes(node.id) || node.folderType === "bookmarks-bar";
}

// Toolbar folders of the tree, the classic one first.
// Falls back to the first top level folder if the browser marks none.
function toolbarFolders(root) {
  const top = root.children ?? [];
  const bars = top.filter(isToolbar)
    .sort((a, b) => TOOLBAR_IDS.includes(b.id) - TOOLBAR_IDS.includes(a.id));
  return bars.length ? bars : top.slice(0, 1);
}

// The top level folders of the bookmark tree in the order the "all bookmarks" view shows them:
// the bookmarks bar, Firefox's Bookmarks Menu, Other bookmarks, Mobile bookmarks.
// Newer Chromium names them with folderType, which also covers the second set of folders
// that a signed-in account adds. The ids are the fallback for Firefox and older Chromium.
const ROOT_TYPES = { "bookmarks-bar": 0, other: 2, mobile: 3 };
const ROOT_IDS = { "1": 0, toolbar_____: 0, menu________: 1, "2": 2, unfiled_____: 2, "3": 3, mobile______: 3 };
const OTHER_ROOT = 4;

// Where a top level folder goes in that order, or -1 for one that is not shown.
// Managed bookmarks (set by an administrator) are read only, so nothing could be dragged into them.
function rootRank(node) {
  // Chrome before 134 has no folderType, so the managed root is also recognised by its flag.
  if (node.folderType === "managed" || node.unmodifiable === "managed") return -1;
  return ROOT_TYPES[node.folderType] ?? ROOT_IDS[node.id] ?? OTHER_ROOT;
}

// Every shown top level folder, in order. Among folders of the same kind the classic one
// (by its well known id) comes first, then the tree's own order. The sort is stable.
function rootFolders(root) {
  return (root.children ?? [])
    .filter((node) => !node.url && rootRank(node) >= 0)
    .sort((a, b) => rootRank(a) - rootRank(b) || (isClassicRoot(b) - isClassicRoot(a)));
}

function isClassicRoot(node) {
  return Object.hasOwn(ROOT_IDS, node.id) ? 1 : 0;
}

// Address schemes a bookmark may use. Web addresses open as normal links.
const LINK_SCHEMES = ["http:", "https:"];
// Local files and browser pages such as chrome://settings. A page cannot open them
// itself, the browser does it through the tabs API. Firefox refuses some of them,
// and no supported browser opens ftp: any more, so it ends in the same message.
const BROWSER_SCHEMES = ["file:", "about:", "chrome:", "edge:", "brave:", "vivaldi:", "opera:", "ftp:"];
// Everything else is not shown: javascript: bookmarklets, Firefox place: queries,
// data: and blob: addresses.

function schemeOf(url) {
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(url ?? "");
  return match ? match[1].toLowerCase() : "";
}

function isWebUrl(url) {
  return LINK_SCHEMES.includes(schemeOf(url));
}

function isAllowedUrl(url) {
  const scheme = schemeOf(url);
  return LINK_SCHEMES.includes(scheme) || BROWSER_SCHEMES.includes(scheme);
}

// Firefox asks the user before an extension sends location data anywhere
// (built-in data consent, the optional "locationInfo" permission).
// Other browsers have no such permission, there the choice of a place is the consent.
// Consent is needed when the manifest declares "locationInfo" as optional data
// collection (the Firefox build). It is then granted only if the browser lists it:
// if the browser's answer has another shape, nothing is sent.
// The state is read once at startup so that the request can be made
// synchronously inside the user's key press or click.
// Until `settled` is true, `needed` is not known yet: a place search must wait.
function declaresLocationConsent() {
  try {
    const gecko = api?.runtime?.getManifest?.().browser_specific_settings?.gecko;
    return Boolean(gecko?.data_collection_permissions?.optional?.includes("locationInfo"));
  } catch {
    return false;
  }
}

const locationConsent = {
  needed: declaresLocationConsent(),
  granted: false,
  settled: false,
  ready: (async () => {
    try {
      const all = await api?.permissions?.getAll?.();
      if (Array.isArray(all?.data_collection)) {
        locationConsent.needed = true;
        locationConsent.granted = all.data_collection.includes("locationInfo");
      }
    } catch {
    } finally {
      locationConsent.settled = true;
    }
  })(),
};

function updateLocationConsent() {
  locationConsent.ready = locationConsent.ready.then(async () => {
    try {
      const all = await api.permissions.getAll();
      locationConsent.granted = Boolean(all.data_collection?.includes("locationInfo"));
    } catch {}
  });
  return locationConsent.ready;
}

api?.permissions?.onAdded?.addListener(updateLocationConsent);
api?.permissions?.onRemoved?.addListener(updateLocationConsent);

// Must be called directly from a user input handler, before any await.
// Resolves to true when location data may leave the browser.
// Before the startup check has settled it resolves to false: nothing is sent.
function requestLocationConsent() {
  if (!locationConsent.settled) return Promise.resolve(false);
  if (!locationConsent.needed || locationConsent.granted) return Promise.resolve(true);
  let asked;
  try {
    asked = api.permissions.request({ data_collection: ["locationInfo"] });
  } catch {
    return Promise.resolve(false);
  }
  return Promise.resolve(asked).then((granted) => {
    locationConsent.granted = Boolean(granted);
    return locationConsent.granted;
  }, () => false);
}
