// The Settings panel, the gear in the widget bar and the first-run hint.
// Settings are stored and applied by settings.js, this file is only the interface.
// The panel is a modal <dialog>: the page behind it is inert, Tab stays inside,
// Escape closes it and the focus goes back to the gear.

const gearEl = document.getElementById("gear");
const settingsCloseEl = document.getElementById("settings-close");
const onboardEl = document.getElementById("onboard");
const onboardTextEl = document.getElementById("onboard-text");
const themeNoteEl = document.getElementById("theme-note");
const accentColorEl = document.getElementById("accent-color");
const bgGridEl = document.getElementById("bg-grid");
const bgOwnEl = document.getElementById("bg-own");
const bgCreditEl = document.getElementById("bg-credit");
const bgImageEl = document.getElementById("bg-image");
const bgChooseEl = document.getElementById("bg-choose");
const bgRemoveEl = document.getElementById("bg-remove");
const bgFileEl = document.getElementById("bg-file");
const bgNoteEl = document.getElementById("bg-note");
const paletteImportEl = document.getElementById("palette-import");
const paletteResetEl = document.getElementById("palette-reset");
const paletteFileEl = document.getElementById("palette-file");
const paletteNoteEl = document.getElementById("palette-note");
const startFolderEl = document.getElementById("start-folder");
const clearAskEl = document.getElementById("clear-ask");
const clearConfirmEl = document.getElementById("clear-confirm");

// A background image larger than this is refused, it would only slow the page down.
const MAX_IMAGE_MB = 20;
// A colors.toml is a few hundred bytes.
const MAX_THEME_KB = 64;

const PALETTE_NOTE = paletteNoteEl.textContent;
const BG_NOTE = bgNoteEl.textContent;

/* Opening and closing */

function openSettings() {
  dismissOnboarding();
  syncControls();
  fillFolders();
  checkOwnImage();
  settingsEl.showModal();
  gearEl.setAttribute("aria-expanded", "true");
  settingsCloseEl.focus();
}

function closeSettings() {
  if (settingsEl.open) settingsEl.close();
}

gearEl.addEventListener("click", openSettings);
settingsCloseEl.addEventListener("click", closeSettings);

// A line under the title once the content scrolls under it.
const settingsBodyEl = settingsEl.querySelector(".set-body");
settingsBodyEl.addEventListener("scroll", () => {
  settingsEl.classList.toggle("scrolled", settingsBodyEl.scrollTop > 0);
}, { passive: true });

settingsEl.addEventListener("close", () => {
  gearEl.setAttribute("aria-expanded", "false");
  hideClearConfirm();
  gearEl.focus();
});

// A press outside the panel (on its backdrop) closes it.
settingsEl.addEventListener("mousedown", (event) => {
  if (event.target !== settingsEl) return;
  const box = settingsEl.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX < box.right &&
    event.clientY >= box.top && event.clientY < box.bottom;
  if (!inside) closeSettings();
});

// Tab and Shift+Tab go round inside the panel instead of leaving it.
function focusables() {
  return [...settingsEl.querySelectorAll("button, input, select, a[href], summary")].filter((el) =>
    !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 &&
    (el.type !== "radio" || el.checked));
}

settingsEl.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const items = focusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const at = items.indexOf(document.activeElement);
  if (event.shiftKey && (at <= 0)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (at === -1 || at === items.length - 1)) {
    event.preventDefault();
    first.focus();
  }
});

/* Background gallery */

// A tile per picture of backgrounds.js, before Gradient, Solid and Your image.
// The small copies load only when the panel is first shown.
bgGridEl.prepend(...BACKGROUNDS.map((bg) => {
  const label = document.createElement("label");
  label.className = "bg-tile";
  label.title = bg.title;
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "background";
  input.value = bg.id;
  input.setAttribute("aria-label", bg.title);
  const img = document.createElement("img");
  img.src = `backgrounds/${bg.id}-thumb.jpg`;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  label.append(input, img);
  return label;
}));

// Whether a picture of the user's own is stored, and a small copy of it for its tile.
let ownImage = false;
let ownImageUrl = null;

async function checkOwnImage() {
  let blob = null;
  try {
    // Only look if the database exists: opening it would create it.
    const known = await indexedDB.databases?.();
    if (!known || known.some((db) => db.name === DB_NAME)) blob = await readWallpaper();
  } catch {}
  ownImage = blob instanceof Blob;
  if (ownImageUrl) URL.revokeObjectURL(ownImageUrl);
  ownImageUrl = ownImage ? URL.createObjectURL(blob) : null;
  let img = bgOwnEl.querySelector("img");
  if (ownImageUrl) {
    if (!img) {
      img = document.createElement("img");
      img.alt = "";
      bgOwnEl.append(img);
    }
    img.src = ownImageUrl;
  } else {
    img?.remove();
  }
  bgOwnEl.classList.toggle("filled", ownImage);
  syncBackground();
}

// The picked tile, the credit of a gallery picture and the buttons for the user's own.
function syncBackground() {
  const kind = effectiveBackground();
  checkRadio("background", kind === "theme" ? null : kind);
  const gallery = findBackground(kind);
  if (gallery) {
    const link = document.createElement("a");
    link.href = gallery.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = gallery.title;
    bgCreditEl.replaceChildren(link, ` by ${gallery.author}. ${gallery.license}.`);
  } else if (kind === "theme") {
    bgCreditEl.replaceChildren("The wallpaper of the imported Omarchy theme.");
  } else if (kind === "gradient" || kind === "solid") {
    // The small tiles have no names on them: the line under them says what is chosen.
    bgCreditEl.replaceChildren(kind === "gradient" ? "Gradient in the theme colors." : "Solid theme color.");
  } else {
    bgCreditEl.replaceChildren();
  }
  const image = kind === "image";
  bgImageEl.hidden = !image;
  bgNoteEl.hidden = !image && !bgNoteEl.classList.contains("error");
  bgChooseEl.textContent = ownImage ? "Choose another" : "Choose image";
  bgRemoveEl.hidden = !ownImage;
}

/* Showing the current settings */

function checkRadio(name, value) {
  for (const input of settingsEl.querySelectorAll(`input[type=radio][name="${name}"]`)) {
    input.checked = input.value === value;
  }
}

function syncControls() {
  const custom = settings.customTheme;
  checkRadio("theme", custom ? custom.mode : settings.theme);
  for (const input of settingsEl.querySelectorAll("input[name=theme]")) input.disabled = Boolean(custom);
  themeNoteEl.hidden = !custom;

  // A custom color has no radio: the color field itself is marked as chosen.
  checkRadio("accent", isHexColor(settings.accent) ? null : settings.accent);
  accentColorEl.classList.toggle("chosen", isHexColor(settings.accent));
  if (isHexColor(settings.accent)) accentColorEl.value = settings.accent;

  syncBackground();

  paletteResetEl.hidden = !custom;
  if (!paletteNoteEl.classList.contains("error")) {
    paletteNoteEl.textContent = custom ? `Using colors from ${custom.name}.` : PALETTE_NOTE;
  }

  checkRadio("tempUnit", settings.tempUnit);
  checkRadio("windUnit", settings.windUnit);
  // Until one is chosen the clock follows the browser's locale, and that one is shown.
  const clock = settings.clock !== "auto" ? settings.clock : /^h(11|12)$/.test(LOCAL_HOUR_CYCLE) ? "12" : "24";
  checkRadio("clock", clock);
}

/* Changes */

// Radio groups are named after their setting.
settingsEl.addEventListener("change", (event) => {
  const input = event.target;
  if (input.type !== "radio" || !(input.name in SETTINGS_SCHEMA)) return;
  // Your image without an image yet: choose one first, the setting follows once it is stored.
  if (input.name === "background" && input.value === "image" && !ownImage) {
    syncBackground();
    bgFileEl.click();
    return;
  }
  saveSettings({ [input.name]: input.value });
  syncControls();
});

// Your image is already the chosen kind but nothing is stored: no change event, so open the picker here.
bgOwnEl.addEventListener("click", (event) => {
  if (event.target instanceof HTMLInputElement && !ownImage && effectiveBackground() === "image") bgFileEl.click();
});

// While the color is being dragged only the look changes, it is stored once picked.
accentColorEl.addEventListener("input", () => {
  document.documentElement.style.setProperty("--accent", accentColorEl.value);
  checkRadio("accent", null);
  accentColorEl.classList.add("chosen");
});

accentColorEl.addEventListener("change", () => {
  saveSettings({ accent: accentColorEl.value.toLowerCase() });
  syncControls();
});

startFolderEl.addEventListener("change", () => {
  saveSettings({ startFolder: startFolderEl.value });
});

/* Start folder */

// Every bookmark folder. A nested folder is named with the folders above it,
// "Work / Projects": a closed list shows only the chosen line, and leading spaces
// for nesting would stand there as a stray indent.
async function fillFolders() {
  let root;
  try {
    root = (await api.bookmarks.getTree())[0];
  } catch {
    return;
  }
  const options = [new Option("Bookmarks bar (default)", "")];
  // The classic bookmarks bar is the default entry above, so it is not listed twice:
  // its subfolders are listed right under it, by their own names. Separators are skipped.
  const walk = (node, path) => {
    for (const child of node.children ?? []) {
      if (child.url || child.type === "separator" || options.length > 1000) continue;
      if (!path.length && TOOLBAR_IDS.includes(child.id)) {
        walk(child, path);
        continue;
      }
      const title = decodeEntities(child.title || "") || "Untitled folder";
      const names = [...path, title];
      options.push(new Option(names.join(" / "), child.id));
      walk(child, names);
    }
  };
  walk(root, []);
  startFolderEl.replaceChildren(...options);
  // A folder deleted since it was chosen: the bookmarks bar is on the page again.
  startFolderEl.value = settings.startFolder;
  if (startFolderEl.value !== settings.startFolder) startFolderEl.value = "";
}

/* Background image */

bgChooseEl.addEventListener("click", () => bgFileEl.click());

bgFileEl.addEventListener("change", async () => {
  const file = bgFileEl.files?.[0];
  bgFileEl.value = "";
  if (!file) return;
  bgNoteEl.classList.remove("error");
  bgNoteEl.textContent = BG_NOTE;
  const fail = (text) => {
    bgNoteEl.textContent = text;
    bgNoteEl.classList.add("error");
    bgNoteEl.hidden = false;
  };
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    fail("Choose a PNG, JPEG, WebP, AVIF or GIF image.");
    return;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    fail(`The image is larger than ${MAX_IMAGE_MB} MB.`);
    return;
  }
  // Checked before it is stored: the browser must be able to show it.
  // Its tone is measured on the way, for the veil over it.
  let tone;
  try {
    const bitmap = await createImageBitmap(file);
    tone = imageTone(bitmap);
    bitmap.close?.();
  } catch {
    fail("The browser cannot show this image.");
    return;
  }
  try {
    await storeWallpaper(new Blob([file], { type: file.type }));
  } catch {
    fail("The image could not be saved in this browser.");
    return;
  }
  saveSettings({ background: "image", imageTone: tone });
  // Shown now, and awaited so that the Remove button appears with it.
  await applyWallpaper();
  await checkOwnImage();
  syncControls();
});

// "light" or "dark": the average brightness of the picture drawn very small.
function imageTone(bitmap) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, 16, 16);
    const data = context.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return sum / (data.length / 4) / 255 > 0.55 ? "light" : "dark";
  } catch {
    return "dark";
  }
}

bgRemoveEl.addEventListener("click", async () => {
  try {
    await removeWallpaper();
  } catch {}
  // Back to the default picture.
  saveSettings({ background: "" });
  await applyWallpaper();
  await checkOwnImage();
  syncControls();
  // The image buttons are hidden now: the focus goes to the chosen background.
  settingsEl.querySelector("input[name=background]:checked")?.focus();
});

/* Theme colors */

// Reads the palette of a colors.toml (flat keys such as background, foreground, accent)
// or of an alacritty.toml ([colors.primary], [colors.normal] and so on).
// Only "key = value" lines with a #rrggbb (or 0xrrggbb) color are used.
function parseThemeColors(text) {
  const values = {};
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      section = head[1].trim();
      continue;
    }
    const pair = line.match(/^\s*([a-z_]+)\s*=\s*["']([^"']*)["']/i);
    if (!pair) continue;
    const key = section ? `${section}.${pair[1]}` : pair[1];
    let value = pair[2].trim();
    if (/^0x[0-9a-f]{6}$/i.test(value)) value = `#${value.slice(2)}`;
    values[key.toLowerCase()] = value.toLowerCase();
  }

  // The first key is from colors.toml, the others from alacritty.toml.
  const pick = (...keys) => keys.map((key) => values[key]).find(isHexColor);
  const vars = {
    "--bg": pick("background", "colors.primary.background"),
    "--fg": pick("foreground", "colors.primary.foreground"),
    "--bg-dark": pick("dark_background", "darker_background", "colors.normal.black"),
    "--fg-dim": pick("muted", "dark_foreground", "colors.bright.black"),
    "--selection": pick("selection", "selection_background", "colors.selection.background"),
    "--accent": pick("accent", "colors.normal.blue"),
    "--hot": pick("orange", "bright_red", "colors.bright.red", "red"),
    "--red": pick("red", "colors.normal.red"),
    "--yellow": pick("yellow", "colors.normal.yellow"),
    "--green": pick("green", "colors.normal.green"),
    "--cyan": pick("cyan", "colors.normal.cyan"),
    "--blue": pick("blue", "colors.normal.blue"),
    "--magenta": pick("magenta", "colors.normal.magenta"),
  };
  if (!vars["--bg"] || !vars["--fg"]) return null;
  vars["--bg-dark"] ??= vars["--bg"];
  for (const name of Object.keys(vars)) if (!vars[name]) delete vars[name];

  const mode = values.mode === "light" || values.mode === "dark" ? values.mode
    : luminance(vars["--bg"]) > 0.5 ? "light" : "dark";
  return { mode, vars };
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

paletteImportEl.addEventListener("click", () => paletteFileEl.click());

paletteFileEl.addEventListener("change", async () => {
  const file = paletteFileEl.files?.[0];
  paletteFileEl.value = "";
  if (!file) return;
  let theme = null;
  if (file.size <= MAX_THEME_KB * 1024) {
    try {
      theme = parseThemeColors(await file.text());
    } catch {}
  }
  if (!theme) {
    paletteNoteEl.textContent = "No theme colors found in this file. Choose a colors.toml or alacritty.toml.";
    paletteNoteEl.classList.add("error");
    return;
  }
  paletteNoteEl.classList.remove("error");
  // The file name only, never its folder: the browser does not give the path anyway.
  saveSettings({ customTheme: { name: file.name.slice(0, 60), ...theme } });
  syncControls();
});

paletteResetEl.addEventListener("click", () => {
  paletteNoteEl.classList.remove("error");
  saveSettings({ customTheme: null });
  syncControls();
  paletteImportEl.focus();
});

/* Clear data */

function hideClearConfirm() {
  clearConfirmEl.hidden = true;
  clearAskEl.hidden = false;
  clearAskEl.setAttribute("aria-expanded", "false");
}

clearAskEl.addEventListener("click", () => {
  clearConfirmEl.hidden = false;
  clearAskEl.hidden = true;
  clearAskEl.setAttribute("aria-expanded", "true");
  document.getElementById("clear-no").focus();
});

document.getElementById("clear-no").addEventListener("click", () => {
  hideClearConfirm();
  clearAskEl.focus();
});

// Everything the extension stored: localStorage and the IndexedDB with the image.
// Bookmarks belong to the browser and are not touched. The page then starts afresh.
document.getElementById("clear-yes").addEventListener("click", async () => {
  try {
    localStorage.clear();
  } catch {}
  await new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  location.reload();
});

/* First-run hint */

function showOnboarding() {
  if (settings.onboarded) return;
  onboardTextEl.textContent = shownBar
    ? "Mutemark shows your bookmarks bar. Widgets and settings are here."
    : "Mutemark shows your bookmarks. Widgets and settings are here.";
  onboardEl.hidden = false;
  document.body.classList.add("onboarding");
}

function dismissOnboarding() {
  onboardEl.hidden = true;
  document.body.classList.remove("onboarding");
  if (!settings.onboarded) saveSettings({ onboarded: true });
}

document.getElementById("onboard-close").addEventListener("click", () => {
  dismissOnboarding();
  gearEl.focus();
});

firstLoad.then(showOnboarding, showOnboarding);

// Settings changed in another tab: the open panel and the hint follow.
document.addEventListener("mutemark:settings", ({ detail }) => {
  if (!detail.remote) return;
  if (settings.onboarded && !onboardEl.hidden) dismissOnboarding();
  if (settingsEl.open) syncControls();
});
