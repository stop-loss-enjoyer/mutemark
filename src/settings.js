// Settings: one localStorage key with a version number.
// Loaded in <head>, before anything is drawn, so the chosen theme, accent and
// background apply without a flash. The other scripts read `settings` and
// listen for the "mutemark:settings" event, which lists the changed keys.
// A background image is kept in the extension's own IndexedDB, never uploaded.

const SETTINGS_KEY = "mutemark-settings";
const SETTINGS_VERSION = 1;

// Each setting with its default value and the values it may take.
// A stored value that is not allowed falls back to the default.
const SETTINGS_SCHEMA = {
  theme: ["system", "system", "light", "dark"],
  // "" is the theme's own accent, "--name" a palette color, "#rrggbb" a custom color.
  accent: ["", (v) => v === "" || ACCENT_PRESETS.includes(v) || isHexColor(v)],
  // "" is automatic: the wallpaper of an imported Omarchy theme if the build has one
  // (contrib/omarchy), otherwise the default photo for the theme (backgrounds.js). Otherwise a gallery image id
  // from backgrounds.js, the theme gradient, the solid theme color or the user's own image.
  background: ["", (v) => ["", "gradient", "solid", "image"].includes(v) || Boolean(findBackground(v))],
  // Whether the user's own image is mostly light or dark, measured when it is added.
  imageTone: ["dark", "dark", "light"],
  // "" is the bookmarks bar, otherwise a bookmark folder id.
  startFolder: ["", (v) => typeof v === "string" && v.length < 100],
  // The weather widget. On by default, but nothing is requested before a place is chosen.
  weather: [true, true, false],
  // The other widgets in the header that are turned on, see widgets.js.
  widgets: [["clock"], (v) => Array.isArray(v) && v.length <= WIDGETS.length &&
    v.every((name, i) => WIDGETS.includes(name) && v.indexOf(name) === i)],
  // Time zones of the world clocks, up to three.
  zones: [["Europe/London", "America/New_York"], (v) => Array.isArray(v) &&
    v.length <= MAX_ZONES && v.every((zone, i) => isTimeZone(zone) && v.indexOf(zone) === i)],
  tempUnit: ["c", "c", "f"],
  windUnit: ["ms", "ms", "kmh", "mph"],
  // "auto" follows the browser's locale until 12 or 24 hours is chosen.
  clock: ["auto", "auto", "12", "24"],
  // Colors imported from a colors.toml or alacritty.toml: { name, mode, vars }.
  customTheme: [null, (v) => v === null || isCustomTheme(v)],
  // The first-run hint was dismissed.
  onboarded: [false, true, false],
};

// Widgets besides the weather, in the order of the header and the widget bar.
const WIDGETS = ["clock", "calendar", "world", "note", "timer"];
const MAX_ZONES = 3;

function isTimeZone(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ACCENT_PRESETS = ["--blue", "--green", "--yellow", "--magenta", "--cyan", "--red"];

// Palette variables an imported theme may set, see theme.css.
const PALETTE_VARS = ["--bg", "--bg-dark", "--fg", "--fg-dim", "--selection", "--accent", "--hot",
  "--red", "--yellow", "--green", "--cyan", "--blue", "--magenta"];

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isCustomTheme(value) {
  return Boolean(value) && typeof value === "object" &&
    (value.mode === "light" || value.mode === "dark") &&
    typeof value.vars === "object" && value.vars !== null &&
    Object.entries(value.vars).every(([name, color]) => PALETTE_VARS.includes(name) && isHexColor(color));
}

function isAllowedSetting(key, value) {
  const [, ...allowed] = SETTINGS_SCHEMA[key];
  return typeof allowed[0] === "function" ? allowed[0](value) : allowed.includes(value);
}

function defaultSettings() {
  return Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([key, [value]]) => [key, value]));
}

function readSettings() {
  const result = defaultSettings();
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (stored && typeof stored === "object" && stored.v === SETTINGS_VERSION) {
      for (const key of Object.keys(SETTINGS_SCHEMA)) {
        if (key in stored && isAllowedSetting(key, stored[key])) result[key] = stored[key];
      }
    }
  } catch {}
  return result;
}

const settings = readSettings();

// Changes some settings, stores them, applies the look and tells the page.
function saveSettings(patch) {
  const changed = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTINGS_SCHEMA) || !isAllowedSetting(key, value)) continue;
    if (JSON.stringify(settings[key]) === JSON.stringify(value)) continue;
    settings[key] = value;
    changed.push(key);
  }
  if (!changed.length) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ v: SETTINGS_VERSION, ...settings }));
  } catch {}
  applyAppearance();
  if (WALLPAPER_KEYS.some((key) => changed.includes(key))) applyWallpaper();
  document.dispatchEvent(new CustomEvent("mutemark:settings", { detail: { changed } }));
}

// Settings that change the background: the default photo depends on the theme.
const WALLPAPER_KEYS = ["background", "imageTone", "theme", "customTheme"];

// Another open tab changed the settings, or deleted everything. This tab takes the new
// values at once: otherwise its next change would write its older copy back.
// After Delete everything it starts afresh, like the tab where it was pressed.
window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage) return;
  if (event.key === null) {
    location.reload();
    return;
  }
  if (event.key !== SETTINGS_KEY) return;
  const fresh = readSettings();
  const changed = Object.keys(SETTINGS_SCHEMA)
    .filter((key) => JSON.stringify(settings[key]) !== JSON.stringify(fresh[key]));
  if (!changed.length) return;
  for (const key of changed) settings[key] = fresh[key];
  applyAppearance();
  if (WALLPAPER_KEYS.some((key) => changed.includes(key))) applyWallpaper();
  document.dispatchEvent(new CustomEvent("mutemark:settings", { detail: { changed, remote: true } }));
});

/* Theme and accent */

// Sets data-theme on <html> and the palette variables, if a theme was imported.
// Uses the CSS object model only: the page's CSP forbids inline style markup.
function applyAppearance() {
  const root = document.documentElement;
  const custom = settings.customTheme;
  const theme = custom ? custom.mode : settings.theme;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  for (const name of PALETTE_VARS) root.style.removeProperty(name);
  root.style.removeProperty("--theme-accent");
  if (custom) {
    for (const [name, color] of Object.entries(custom.vars)) {
      root.style.setProperty(name === "--accent" ? "--theme-accent" : name, color);
    }
  }
  if (settings.accent.startsWith("--")) root.style.setProperty("--accent", `var(${settings.accent})`);
  else if (settings.accent) root.style.setProperty("--accent", settings.accent);
}

/* Background image */

const DB_NAME = "mutemark";
const DB_STORE = "files";
const WALLPAPER_ID = "wallpaper";

// One short-lived connection per operation, so that Clear data can delete the database at once.
function withStore(mode, action) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(DB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      let request;
      try {
        const tx = db.transaction(DB_STORE, mode);
        request = action(tx.objectStore(DB_STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request?.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

function readWallpaper() {
  return withStore("readonly", (store) => store.get(WALLPAPER_ID));
}

function storeWallpaper(blob) {
  return withStore("readwrite", (store) => store.put(blob, WALLPAPER_ID));
}

function removeWallpaper() {
  return withStore("readwrite", (store) => store.delete(WALLPAPER_ID));
}

// A wallpaper that theme.css itself sets (contrib/omarchy writes one into a build).
// Read before this script sets anything on <html>, so only the stylesheet counts.
const THEME_WALLPAPER = (() => {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--wallpaper").trim();
  return value !== "" && value !== "none";
})();

// What the background setting means right now: "gradient", "solid", "image",
// "theme" (the theme's own wallpaper) or a gallery image id.
function effectiveBackground() {
  const value = settings.background;
  if (value === "") return THEME_WALLPAPER ? "theme" : lightTheme() ? DEFAULT_BACKGROUND_LIGHT : DEFAULT_BACKGROUND;
  return value;
}

// The theme in use is light: chosen in Settings, set by imported colors, or the system's.
const LIGHT_SCHEME = matchMedia("(prefers-color-scheme: light)");
function lightTheme() {
  const theme = settings.customTheme?.mode ?? settings.theme;
  return theme === "system" ? LIGHT_SCHEME.matches : theme === "light";
}

// The system switched between light and dark: the default photo follows.
LIGHT_SCHEME.addEventListener("change", () => {
  if (settings.background === "" && !THEME_WALLPAPER) applyWallpaper();
});

let wallpaperUrl = null;

// Shows the chosen background. A gallery image is a file of the extension and is set
// at once, before the first paint. The user's own image is read from IndexedDB, which
// is opened only when that image is chosen, so by default no database is created.
// data-bg on <html> tells the stylesheet which kind it is, data-bg-tone how light it is.
async function applyWallpaper() {
  const root = document.documentElement;
  const kind = effectiveBackground();
  const gallery = findBackground(kind);
  const setUrl = (url) => {
    if (url) root.style.setProperty("--wallpaper", `url("${url}")`);
    else root.style.removeProperty("--wallpaper");
    root.classList.toggle("has-wallpaper", Boolean(url) || kind === "theme");
  };
  root.dataset.bg = gallery ? "gallery" : kind;
  root.dataset.bgTone = gallery ? gallery.tone : kind === "image" ? settings.imageTone : "dark";
  if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
  wallpaperUrl = null;
  if (gallery) {
    setUrl(new URL(`backgrounds/${gallery.id}.jpg`, location.href).href);
    return true;
  }
  if (kind !== "image") {
    setUrl(null);
    return kind === "theme";
  }
  let blob = null;
  try {
    blob = await readWallpaper();
  } catch {}
  // The setting may have changed while the database was read.
  if (effectiveBackground() !== "image") return false;
  // Another call may have made its own URL while the database was read, release it first.
  if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
  wallpaperUrl = blob instanceof Blob ? URL.createObjectURL(blob) : null;
  setUrl(wallpaperUrl);
  return Boolean(wallpaperUrl);
}

applyAppearance();
applyWallpaper();
