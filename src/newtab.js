// Mutemark new tab page: the bookmarks laid out as cards. By default these are all bookmarks,
// one root after another (the bookmarks bar, Other bookmarks and so on); the start folder in Settings
// narrows the page to the bookmarks bar or to one folder.
// The loose bookmarks of a root or of the start folder make a card, each folder in it is a group with a card of its own.
// Links inside a group are collected recursively.
// Cards are packed into a grid that fills the window, without scrolling if at all possible.
// Bookmarks and whole groups can be dragged, the right button opens a menu.
// Typing on the page searches bookmarks, Enter opens the match.
// The weather in the header lives in weather.js, browser differences in platform.js,
// settings in settings.js (storage and look) and panel.js (the Settings panel).

// A card shows at most this many bookmarks. Its counter tells how many the folder has.
// Search still looks through all of them, see applyFind().
const MAX_LINKS_PER_SECTION = 60;
const LOOSE_SECTION_TITLE = "Bookmarks";
const NEW_GROUP_TITLE = "New group";

// Sizes at scale 1, in CSS pixels.
const ROW = 30;        // height of a bookmark row, the grid step
const GAP = 14;        // gap between cards
const COL_MIN = 200;   // narrowest column
const COL_MAX = 290;   // widest column that still reads as one line of text
const COL_FILL = 340;  // widest a column may stretch to fill the window
const FOOT = 30;       // the "New group" line under the board

// Cost of each narrow column beyond the number of wide ones, in rows of height.
const NARROW_PENALTY = 4;

// How a layout is judged, see quality(): what share of the window it fills, how large
// the text is, and what it costs. The costs are shares of the fill.
const WASTE_COST = 0.3;    // for the whole board as empty grid cells
const SPLIT_COST = 0.02;   // for each extra column inside a card
const NARROW_COST = 0.05;  // for each column narrower than COL_MAX

// A big folder is split into up to MAX_SPAN columns inside its card,
// but only if each column gets at least SPLIT_MIN_ROWS rows.
const MAX_SPAN = 5;
const SPLIT_MIN_ROWS = 6;
// A folder already split in a remembered layout shrinks in place: as soon as
// a column has fewer than SPLIT_KEEP_ROWS rows, it takes one column less.
// The threshold is below SPLIT_MIN_ROWS so one bookmark added and removed does not toggle the split.
const SPLIT_KEEP_ROWS = 4;

// How far a card may stretch down to meet its neighbors, in rows.
// No longer tails: an empty card body looks worse than an uneven bottom.
const MAX_TAIL = 1;

// Share of the height below the header that a fresh layout may use. The rest is room for new bookmarks.
const HEIGHT_BUDGET = 0.9;

// The board is sized by two numbers. k scales text, icons and columns,
// air makes rows taller without making text larger.
// Of all sizes and layouts that fit, the one that fills the window best with the largest text wins:
// few bookmarks get large rows, many get smaller ones.
// The largest k depends on the window only: K_REF_H and K_REF_W are the window
// height and width at which it is 1, it grows with the window up to K_MAX.
const K_MAX = 1.4;
const K_REF_H = 620;
const K_REF_W = 700;
const MIN_SCALE = 0.72;
const SCALE_STEP = 0.04;
const AIR_MAX = 1.5;
const AIR_STEP = 0.05;
// The header (weather and search) scales with the board, but no further than this.
const HEADER_K_MAX = 1.2;

// The layout is remembered: cards stay in their columns while they fit.
// A new or deleted bookmark only shifts the cards below it in the same column.
// The size (k and air) is remembered too. It gets smaller only if things no longer fit,
// and larger again only when there is HEIGHT_BUDGET room once more.
// So one bookmark added and removed does not jump the size.
// A fresh layout is made if things no longer fit, if the folder order changed,
// if a column became empty, if the window got wider or narrower by more than PLAN_WIDTH_PX,
// or if a fresh layout would be clearly larger (two steps of k or of air).
// A layout is remembered per start folder and window size, up to PLAN_LIMIT in all.
// Heights are told apart to PLAN_HEIGHT_PX. If the window gets shorter for a while,
// it gets its own layout, and the previous one waits for the window to come back.
// For a height with no layout yet, the layout of the same width and nearest height is used.
// A layout from a shorter window is used only if it is not worse than a fresh one:
// not smaller and not fewer columns.
const PLAN_KEY = "mutemark-plan";
const PLAN_WIDTH_PX = 32;
const PLAN_HEIGHT_PX = 32;
const PLAN_LIMIT = 8;

// While dragging, the gap between columns and the card padding up to this width
// belong to the nearest row, not to the end of the folder.
const NEAR_PX = 16;

// How many seconds a deleted bookmark or group can be restored.
const UNDO_SECONDS = 10;

// The snapshot keeps the last layout as data (no markup), to draw it at once next time.
const SNAPSHOT_KEY = "mutemark-snapshot";

// Addresses for which the browser returns its default globe instead of a real icon.
const NOFAV_KEY = "mutemark-nofav";
const NOFAV_LIMIT = 500;

const EPS = 1e-6;

const pageEl = document.getElementById("page");
const boardEl = document.getElementById("board");
const emptyEl = document.getElementById("empty");
const emptyMsgEl = document.getElementById("empty-msg");
const failMsgEl = document.getElementById("fail-msg");
const folderMsgEl = document.getElementById("folder-msg");
const topEl = document.querySelector(".top");
const findEl = document.getElementById("find");
const foundEl = document.getElementById("found");
const menuEl = document.getElementById("menu");
const toastEl = document.getElementById("toast");
const toastTextEl = document.getElementById("toast-text");
const toastTimerEl = document.getElementById("toast-timer");
const settingsEl = document.getElementById("settings");

// The line under the board with the "New group" button. Made here, the page markup has no place for it.
const footEl = document.createElement("div");
footEl.className = "board-foot";
footEl.hidden = true;
const newGroupEl = document.createElement("button");
newGroupEl.id = "new-group";
newGroupEl.className = "new-group";
newGroupEl.type = "button";
newGroupEl.title = "Add a folder for bookmarks";
newGroupEl.append(svgIcon("M12 5v14M5 12h14"), Object.assign(document.createElement("span"), { textContent: "New group" }));
footEl.append(newGroupEl);
boardEl.after(footEl);

// The context menu: one set of items for a bookmark, another for a group header.
// Built here so that every item has a known id and handler.
const MENU_ITEMS = [
  ["menu-open", "Open in new tab", "link"],
  ["menu-copy", "Copy link", "link"],
  ["menu-rename", "Rename", "link"],
  ["menu-delete", "Delete", "link", true],
  ["menu-rename-group", "Rename group", "group"],
  ["menu-delete-group", "Delete group", "group", true],
];
menuEl.replaceChildren(...MENU_ITEMS.map(([id, text, kind, danger]) => {
  const item = document.createElement("button");
  item.id = id;
  item.type = "button";
  item.tabIndex = -1;
  item.textContent = text;
  item.dataset.kind = kind;
  item.setAttribute("role", "menuitem");
  if (danger) item.className = "danger";
  return item;
}));

function svgIcon(path) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

let sections = [];
let menuTarget = null;
let menuKind = null;
let dragId = null;
let dragFolderId = null;
let dropTarget = null;
// A function that undoes the last delete, while the bar with Undo is showing.
let removed = null;
let toastTimer = null;
let reloadTimer = null;
let shownHtml = null;
let findItems = null;
// The name field open on a bookmark or a group header. The board is not redrawn meanwhile.
let editing = null;
// A group just created: its name field opens once the card is on the page.
let renameNext = null;
// Folder for bookmarks restored after their own folder is gone, and for new groups: the folder on the page.
let homeId = null;
// The start folder chosen in Settings was shown, not the bookmarks bar (for the empty message).
let chosenFolder = false;
// What the page shows, for the first-run hint: "all", "bar" (the bookmarks bar with its bookmarks),
// "folder" (name tells which) or "other" (the bar was empty and the rest of the tree took its place).
let shownView = { kind: settings.startFolder === "all" ? "all" : settings.startFolder ? "folder" : "bar", name: "" };

// Layouts and the snapshot are kept per start folder. "all" is a key of its own,
// so the layouts of all bookmarks never mix with the bookmarks bar ("") or a folder.
function folderKey() {
  return settings.startFolder || "";
}

/* Data */

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

// Some browsers return titles with HTML entities like &#231;, decode them.
// DOMParser makes an inert document: no scripts run, nothing loads.
function decodeEntities(text) {
  if (!text.includes("&")) return text;
  // A literal "<" is escaped first, or the parser takes "<notes>" for a tag and drops it.
  const doc = new DOMParser().parseFromString(text.replace(/</g, "&lt;"), "text/html");
  return doc.documentElement.textContent || text;
}

// Chromium only (see HAS_FAVICONS): the browser's local icon cache, no network.
function faviconUrl(pageUrl, size = 32) {
  const url = new URL(api.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// Only addresses that can be opened are shown, see LINK_SCHEMES in platform.js.
function isLink(node) {
  return Boolean(node.url) && isAllowedUrl(node.url);
}

function collectLinks(node, acc = []) {
  for (const child of node.children ?? []) {
    if (child.url) {
      if (isLink(child)) acc.push(child);
    } else {
      collectLinks(child, acc);
    }
  }
  return acc;
}

// The folder holds a bookmark of any kind, shown or not. Firefox reports a separator with
// the address "data:", so it is skipped by type: a folder with only separators is empty.
function hasBookmarks(node) {
  return (node.children ?? []).some(
    (child) => child.type !== "separator" && (child.url || hasBookmarks(child)),
  );
}

// total: how many bookmarks the folder has, links: the ones shown on the card,
// rest: the others, which only search looks at.
// loose: the card of the start folder or root itself, it cannot be renamed, deleted or moved.
function makeSection(title, folderId, all, loose = false) {
  return {
    title,
    folderId,
    loose,
    total: all.length,
    links: all.slice(0, MAX_LINKS_PER_SECTION),
    rest: all.slice(MAX_LINKS_PER_SECTION),
  };
}

// Every folder is a group and gets a card, an empty one too: it is where bookmarks are dragged.
function buildSections(folder) {
  const children = folder.children ?? [];
  const loose = children.filter(isLink);
  const result = [];

  if (loose.length) {
    result.push(makeSection(decodeEntities(folder.title || "") || LOOSE_SECTION_TITLE, folder.id, loose, true));
  }
  // Firefox separators are not folders. Real Firefox gives them a "data:" address, which the
  // address test already excludes, but the type check keeps a separator without one out too.
  for (const sub of children.filter((c) => !c.url && c.type !== "separator")) {
    const links = collectLinks(sub);
    // A folder that holds only bookmarks the page does not show (Firefox place: queries,
    // bookmarklets) would claim to be empty and invite drops, so it gets no card.
    if (!links.length && hasBookmarks(sub)) continue;
    result.push(makeSection(decodeEntities(sub.title || ""), sub.id, links));
  }
  return result;
}

function hasLinks(list) {
  return list.some((s) => s.links.length > 0);
}

function findFolder(node, id) {
  if (node.id === id) return node.url ? null : node;
  for (const child of node.children ?? []) {
    const found = findFolder(child, id);
    if (found) return found;
  }
  return null;
}

/* Layout */

// Card height in rows: header, links and one row for padding.
// An empty group keeps one row for the place to drop bookmarks.
function cardRows(n, span) {
  return Math.ceil(Math.max(n, 1) / span) + 2;
}

function linkRows(n, span) {
  return Math.ceil(Math.max(n, 1) / span);
}

// Places cards in order, each where it ends up highest.
// fixed[i]: the column from a remembered layout, the card then goes there.
// A card above an empty spot stretches down by at most MAX_TAIL rows,
// so the bottom of the board may stay uneven, like a masonry wall.
function pack(counts, spans, cols, fixed = []) {
  const heights = new Array(cols).fill(0);
  const cards = [];
  let area = 0;
  let holes = 0;

  // Stretches the lowest card of a column down to row `to` if nothing is below it and the tail is short.
  function stretch(col, to) {
    const last = cards.find((p) => col >= p.col && col < p.col + p.span && p.row + p.rows === heights[col]);
    if (!last || to - (last.row + last.rows) > MAX_TAIL) return false;
    for (let c = last.col; c < last.col + last.span; c++) {
      if (heights[c] !== last.row + last.rows) return false;
    }
    last.rows = to - last.row;
    for (let c = last.col; c < last.col + last.span; c++) heights[c] = to;
    return true;
  }

  // Remembered cards go first, in their columns. New folders follow,
  // each where it ends up highest: remembered cards do not move for them.
  const order = counts.map((_, i) => i);
  if (fixed.length) order.sort((a, b) => (fixed[a] === undefined) - (fixed[b] === undefined) || a - b);

  order.forEach((i) => {
    const n = counts[i];
    const span = Math.min(spans[i], cols);
    const rows = cardRows(n, span);
    let best = 0;
    let bestTop = Infinity;
    const fixedCol = fixed[i];
    for (let c = 0; c + span <= cols; c++) {
      if (fixedCol !== undefined && c !== fixedCol) continue;
      const top = Math.max(...heights.slice(c, c + span));
      if (top < bestTop) {
        bestTop = top;
        best = c;
      }
    }
    // A wide card sits on the tallest of its columns, no holes may stay below it.
    for (let c = best; c < best + span; c++) {
      if (heights[c] < bestTop && heights[c] > 0 && !stretch(c, bestTop)) holes++;
      if (heights[c] === 0 && bestTop > 0) holes++;
    }
    cards.push({ i, col: best, span, row: bestTop, rows, linkRows: linkRows(n, span) });
    for (let c = best; c < best + span; c++) heights[c] = bestTop + rows;
    area += span * rows;
  });

  // The bottom is evened out only if short tails are enough in every column.
  // Otherwise one stretched card next to an unstretched one looks accidental.
  const total = Math.max(...heights);
  if (heights.every((h) => total - h <= MAX_TAIL)) {
    for (let c = 0; c < cols; c++) {
      if (heights[c] < total) stretch(c, total);
    }
  }
  // Cards go on the page in folder order, and so do search and keyboard navigation.
  cards.sort((a, b) => a.i - b.i);
  return { cards, cols, total, waste: cols * total - area, holes, emptyCol: heights.some((h) => h === 0) };
}

// Lower and more even is better, a split costs a bit more than a whole card, narrow columns cost more than wide ones.
function scoreOf(layout, spans, wideCols) {
  const splits = spans.reduce((sum, s) => sum + s - 1, 0);
  return layout.total + layout.waste / layout.cols + splits * 0.5 +
    Math.max(0, layout.cols - wideCols) * NARROW_PENALTY;
}

// The last resort when nothing fits the window even at the smallest size: there will be
// scrolling anyway, so holes are allowed and the lowest, most even layout wins.
function chooseLayout(counts, maxCols, maxRows, wideCols, lastResort = false) {
  let best = null;
  const biggest = Math.max(...counts);
  // More columns than cards, counting splits, are never needed.
  const usefulCols = Math.min(maxCols, counts.reduce((sum, n) => sum + Math.min(MAX_SPAN, Math.max(1, Math.floor(n / SPLIT_MIN_ROWS))), 0));

  for (let cols = 1; cols <= usefulCols; cols++) {
    const variants = new Map();
    for (let target = SPLIT_MIN_ROWS; target <= Math.max(SPLIT_MIN_ROWS, biggest); target++) {
      const spans = counts.map((n) => {
        let span = n > target ? Math.min(MAX_SPAN, cols, Math.ceil(n / target)) : 1;
        while (span > 1 && Math.ceil(n / span) < SPLIT_MIN_ROWS) span--;
        return span;
      });
      variants.set(spans.join(","), spans);
    }
    variants.set(counts.map(() => 1).join(","), counts.map(() => 1));

    for (const spans of variants.values()) {
      const layout = pack(counts, spans, cols);
      // A hole in the grid is worse than a smaller size, and so is a column with nothing in it.
      // Without splits there are no holes, so a choice is always found.
      if (layout.total > maxRows || layout.emptyCol || (layout.holes && !lastResort)) continue;
      layout.score = scoreOf(layout, spans, wideCols);
      if (!best || layout.score < best.score) best = layout;
    }
  }
  return best;
}

// Every layout worth trying: column counts and splits of big folders.
// They do not depend on the size, so they are packed once and judged at each size.
// Layouts with a hole under a wide card or an empty column are left out.
function candidates(counts, maxCols) {
  const out = [];
  const seen = new Set();
  const biggest = Math.max(...counts);
  const usefulCols = Math.min(maxCols, counts.reduce((sum, n) => sum + Math.min(MAX_SPAN, Math.max(1, Math.floor(n / SPLIT_MIN_ROWS))), 0));
  for (let cols = 1; cols <= usefulCols; cols++) {
    const variants = [counts.map(() => 1)];
    for (let target = SPLIT_MIN_ROWS; target <= Math.max(SPLIT_MIN_ROWS, biggest); target++) {
      variants.push(counts.map((n) => {
        let span = n > target ? Math.min(MAX_SPAN, cols, Math.ceil(n / target)) : 1;
        while (span > 1 && Math.ceil(n / span) < SPLIT_MIN_ROWS) span--;
        return span;
      }));
    }
    for (const spans of variants) {
      const key = `${cols}:${spans.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const layout = pack(counts, spans, cols);
      if (layout.holes || layout.emptyCol) continue;
      layout.splits = spans.reduce((sum, s) => sum + Math.min(s, cols) - 1, 0);
      out.push(layout);
    }
  }
  return out;
}

// Higher is better. fill: the share of the room the board covers, up to the HEIGHT_BUDGET line.
// text: the scale against the largest one for this window.
function quality(layout, m, topK) {
  const colW = Math.min(COL_FILL * m.k, (m.availW - (layout.cols - 1) * m.gap) / layout.cols);
  const width = layout.cols * colW + (layout.cols - 1) * m.gap;
  const height = layout.total * m.unit;
  const fill = Math.min(1, width / m.availW) * Math.min(1, height / (m.fullH * HEIGHT_BUDGET));
  return fill + m.k / topK -
    WASTE_COST * layout.waste / (layout.cols * layout.total) -
    SPLIT_COST * layout.splits -
    NARROW_COST * Math.max(0, layout.cols - m.wideCols);
}

function round2(n) {
  return Number(n.toFixed(2));
}

// Sizes from the largest for this window down to the smallest: k first, then air.
function sizes() {
  const ceiling = Math.min(K_MAX, Math.max(1, window.innerHeight / K_REF_H), Math.max(1, window.innerWidth / K_REF_W));
  const top = 1 + Math.floor((ceiling - 1) / SCALE_STEP + EPS) * SCALE_STEP;
  const airs = [];
  for (let a = AIR_MAX; a >= 1 - EPS; a -= AIR_STEP) airs.push(round2(a));
  const list = [];
  for (let k = top; k >= MIN_SCALE - EPS; k -= SCALE_STEP) {
    for (const air of airs) list.push({ k: round2(k), air });
  }
  return list;
}

// One size is larger than another: larger text, or the same text and taller rows.
function larger(a, b, steps = 1) {
  if (a.k >= b.k + steps * SCALE_STEP - EPS) return true;
  return a.k >= b.k - EPS && a.air >= b.air + steps * AIR_STEP - EPS;
}

function notSmaller(a, b) {
  return a.k >= b.k - EPS && (a.k > b.k + EPS || a.air >= b.air - EPS);
}

// Layouts of the same width that suit these folders. First the layout
// for this window height, then by nearest height.
// same: a layout for this height, lower: remembered in a shorter window.
function findPlans(availW, height, secs) {
  const ids = secs.map((s) => s.folderId);
  const dist = (p) => Math.abs(p.h - height);
  return readPlans()
    .filter((p) => (p.f ?? "") === folderKey() && Math.abs(p.w - availW) <= PLAN_WIDTH_PX)
    .sort((a, b) => dist(a) - dist(b))
    .map((p) => planFor(p, ids, secs, dist(p) <= PLAN_HEIGHT_PX, p.h < height))
    .filter(Boolean);
}

function planFor(plan, ids, secs, same, lower) {
  // The order of known folders must match, new folders are allowed.
  const known = ids.filter((id) => id in plan.cards);
  const order = plan.order.filter((id) => ids.includes(id));
  if (!known.length || known.join("|") !== order.join("|")) return null;
  const fixed = [];
  const spans = [];
  for (const [i, id] of ids.entries()) {
    const card = plan.cards[id];
    const n = secs[i].links.length;
    if (!card) {
      spans.push(1);
      continue;
    }
    if (card.col + card.span > plan.cols) return null;
    // The folder got smaller: the split narrows in place, the card keeps its column.
    let span = card.span;
    while (span > 1 && Math.ceil(n / span) < SPLIT_KEEP_ROWS) span--;
    fixed[i] = card.col;
    spans.push(span);
  }
  return { cols: plan.cols, k: plan.k, air: plan.a ?? 1, fixed, spans, same, lower: !same && lower };
}

function readPlans() {
  try {
    const list = JSON.parse(localStorage.getItem(PLAN_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.h === "number" && typeof p.k === "number") : [];
  } catch {
    return [];
  }
}

function savePlan(availW, height, size, cols, cards, secs) {
  const plan = {
    f: folderKey(),
    w: Math.round(availW),
    h: height,
    k: size.k,
    a: size.air,
    cols,
    order: secs.map((s) => s.folderId),
    cards: Object.fromEntries(cards.map((c) => [secs[c.i].folderId, { col: c.col, span: c.span }])),
  };
  // Only the layout of the same folder and window size is replaced, other heights stay.
  const rest = readPlans().filter((p) => (p.f ?? "") !== plan.f || Math.abs(p.w - plan.w) > PLAN_WIDTH_PX ||
    Math.abs(p.h - plan.h) > PLAN_HEIGHT_PX);
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify([plan, ...rest].slice(0, PLAN_LIMIT)));
  } catch {}
}

// Puts back layouts saved before a group was deleted, with the group under its new id.
// They replace the layouts saved meanwhile for the same folder and window size.
function restorePlans(saved, oldId, newId) {
  const swap = (id) => (id === oldId ? newId : id);
  const back = saved.map((p) => ({
    ...p,
    order: (p.order ?? []).map(swap),
    cards: Object.fromEntries(Object.entries(p.cards ?? {}).map(([id, card]) => [swap(id), card])),
  }));
  const same = (a, b) => (a.f ?? "") === (b.f ?? "") && Math.abs(a.w - b.w) <= PLAN_WIDTH_PX &&
    Math.abs(a.h - b.h) <= PLAN_HEIGHT_PX;
  const rest = readPlans().filter((p) => !back.some((b) => same(p, b)));
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify([...back, ...rest].slice(0, PLAN_LIMIT)));
  } catch {}
}

// Header tiles that do not fit in one row are spread evenly over the rows, instead of
// filling the first rows and leaving one tile alone in the last.
// The rows stay as few as when they wrap on their own. A row ends with an empty element
// as wide as the row (.row-break). Without one, the rows wrap as they come.
function arrangeHeader() {
  const box = topEl.querySelector(".top-in");
  for (const br of box.querySelectorAll(".row-break")) br.remove();
  const tiles = [...box.querySelectorAll(".tile")].filter((tile) => tile.offsetWidth > 0);
  if (tiles.length < 3) return;
  const widths = tiles.map((tile) => tile.getBoundingClientRect().width + parseFloat(getComputedStyle(tile).marginRight));
  const room = box.clientWidth + 0.5;
  const rowOf = (from, to) => widths.slice(from, to).reduce((a, b) => a + b, 0);

  // The rows as they wrap on their own.
  let rows = 1;
  let used = 0;
  for (const w of widths) {
    if (used && used + w > room) {
      rows++;
      used = 0;
    }
    used += w;
  }
  if (rows < 2 || rows > tiles.length) return;

  // Every way to cut the tiles into that many rows: the widest row as narrow as possible.
  let best = null;
  let bestWidth = Infinity;
  const cuts = (start, left, acc) => {
    if (left === 1) {
      const all = [...acc, start];
      const ends = [...all.slice(1), tiles.length];
      const sizes = all.map((from, i) => rowOf(from, ends[i]));
      const widest = Math.max(...sizes);
      if (sizes.every((size) => size <= room) && widest < bestWidth - 0.5) {
        bestWidth = widest;
        best = all;
      }
      return;
    }
    for (let next = start + 1; next <= tiles.length - left + 1; next++) cuts(next, left - 1, [...acc, start]);
  };
  cuts(0, rows, []);
  if (!best) return;
  for (const from of best.slice(1)) {
    const br = document.createElement("span");
    br.className = "row-break";
    br.setAttribute("aria-hidden", "true");
    tiles[from].before(br);
  }
}

// Picks the size and layout so that the board fills the window and everything fits.
// secs: the sections that are laid out, the cards are indexed by their position in it.
function fit(secs) {
  if (!secs.length) return null;
  const counts = secs.map((s) => s.links.length);
  const style = getComputedStyle(pageEl);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availW = document.documentElement.clientWidth - padX;
  const list = sizes();

  // The header shrinks with the board, so the room under it depends on k.
  // Measuring it means a layout of the page, so it is measured at the two ends of its scale
  // and estimated in between. The size finally chosen is measured exactly, and if the
  // estimate was off, the choice is made again with the exact value.
  // The scale is set on the header only, cards are not recalculated while measuring.
  const exact = new Map();
  function headerAt(kh) {
    if (!exact.has(kh)) {
      topEl.style.setProperty("--k", String(kh));
      arrangeHeader();
      exact.set(kh, topEl.offsetHeight);
      topEl.style.removeProperty("--k");
    }
    return exact.get(kh);
  }
  const headerK = (k) => round2(Math.min(k, HEADER_K_MAX));
  function roomFor(k) {
    const kh = headerK(k);
    let header = exact.get(kh);
    if (header === undefined) {
      const low = headerAt(MIN_SCALE);
      const high = headerAt(HEADER_K_MAX);
      header = low + (high - low) * (kh - MIN_SCALE) / (HEADER_K_MAX - MIN_SCALE);
    }
    return window.innerHeight - padY - header - FOOT * k;
  }

  function measure({ k, air }) {
    const fullH = roomFor(k);
    const unit = ROW * k * air;
    const gap = GAP * k;
    return {
      k, air, unit, gap, availW, fullH,
      maxCols: Math.max(1, Math.floor((availW + gap) / (COL_MIN * k + gap))),
      wideCols: Math.max(1, Math.floor((availW + gap) / (COL_MAX * k + gap))),
      // A card ends one gap before its rows end, the last gap is not needed.
      maxRows: Math.floor((fullH * HEIGHT_BUDGET + gap) / unit),
      // A remembered layout may also use the spare room: that is what it is kept for.
      // No allowance for the last gap here, otherwise it slips below the bottom edge.
      fullRows: Math.floor(fullH / unit),
    };
  }

  // The result carries the header height it was chosen for, see layout().
  for (let tries = 0; ; tries++) {
    const result = decide();
    const kh = headerK(result.k);
    if (exact.has(kh) || tries >= 3) return { ...result, header: headerAt(kh) };
    const guess = roomFor(result.k);
    headerAt(kh);
    if (Math.abs(roomFor(result.k) - guess) < 1) return { ...result, header: headerAt(kh) };
  }

  function decide() {
    // Every layout at every size where it fits, the best one wins.
    // On a tie the larger size wins: sizes go from the largest.
    const last = measure(list[list.length - 1]);
    const all = candidates(counts, last.maxCols);
    let fresh = null;
    let best = -Infinity;
    for (const size of list) {
      // Quality is at most 1 for the fill plus the text share: smaller sizes cannot win any more.
      if (fresh && 1 + size.k / list[0].k <= best) break;
      const m = measure(size);
      for (const layout of all) {
        if (layout.cols > m.maxCols || layout.total > m.maxRows) continue;
        const q = quality(layout, m, list[0].k);
        if (q > best + EPS) {
          best = q;
          fresh = { ...m, layout };
        }
      }
    }
    if (!fresh) {
      // Nothing fits even at the smallest size: the lowest layout and scrolling.
      // Narrow columns are not penalized here: the less scrolling, the better.
      last.layout = chooseLayout(counts, last.maxCols, Infinity, last.maxCols, true);
      fresh = last;
    }

    // A remembered layout: same columns and the previous size, with the HEIGHT_BUDGET room available.
    // If it does not fit, step by step smaller. Larger than before only if it fits with room again.
    // A hole under a wide card is allowed here, it is better than moving every card.
    for (const plan of findPlans(availW, window.innerHeight, secs)) {
      const kept = keep(plan);
      // This height's own layout no longer fits: lay out afresh.
      if (!kept && plan.same) return fresh;
      if (!kept) continue;
      if (plan.lower) {
        // A layout from a shorter window: the window grew and has no layout of its own.
        // It is used only if it is not smaller than a fresh one and has no fewer columns.
        if (notSmaller(kept, fresh) && plan.cols <= fresh.layout.cols) return kept;
        continue;
      }
      // A fresh layout is used only if everything gets clearly larger with it.
      // Otherwise the cards stay where they are.
      return larger(fresh, kept, 2) ? fresh : kept;
    }
    return fresh;

    // The remembered layout at the largest size where it fits, or null.
    function keep(plan) {
      const layout = pack(counts, plan.spans, plan.cols, plan.fixed);
      // A folder was deleted and a column is empty: a full height hole, lay out afresh.
      if (layout.emptyCol) return null;
      for (const size of list) {
        const m = measure(size);
        const rows = larger(size, plan) ? m.maxRows : m.fullRows;
        if (plan.cols <= m.maxCols && layout.total <= rows) return { ...m, layout };
      }
      return null;
    }
  }
}

/* Rendering */

// Tile labels: the site address (default) or the bookmark's own name.
function showsAddress() {
  return settings.tileLabels !== "title";
}

function letterOf(name) {
  const ch = name.match(/[\p{L}\p{N}]/u);
  return (ch ? ch[0] : "?").toUpperCase();
}

function renderLink(bookmark) {
  const link = document.createElement("a");
  link.className = "link";
  link.href = bookmark.url;
  link.draggable = true;
  link.dataset.id = bookmark.id;

  const host = hostOf(bookmark.url);
  const title = decodeEntities(bookmark.title || "").trim();
  // In address mode the title is not drawn anywhere, and the letter follows the host.
  // The title is kept in a data attribute, only for search.
  const byAddress = showsAddress();
  const name = byAddress ? host : title || host;
  link.dataset.letter = letterOf(name);
  if (byAddress && title) link.dataset.title = title;
  link.dataset.host = host;

  // The site icon is a background, not an <img>: while it loads, or if there is none,
  // the spot stays empty instead of showing a broken image.
  // Without a local icon cache (Firefox), and for a site that had no icon last time,
  // the bookmark gets its letter right away. A site without an icon is still checked
  // again (data-src), so it gets its icon once the browser has one in the cache.
  const icon = document.createElement("span");
  if (!HAS_FAVICONS) {
    icon.className = "letter";
    icon.textContent = link.dataset.letter;
  } else if (noFav.has(bookmark.url)) {
    icon.className = "letter";
    icon.textContent = link.dataset.letter;
    icon.dataset.src = faviconUrl(bookmark.url);
  } else {
    const src = faviconUrl(bookmark.url);
    icon.dataset.src = src;
    icon.className = "icon";
    icon.style.backgroundImage = `url("${src}")`;
  }

  const label = document.createElement("span");
  label.className = "label";
  const nameEl = document.createElement("span");
  nameEl.className = "name";
  nameEl.textContent = name;
  label.append(nameEl);
  // With names shown, the address shows on hover and in search. If there is no room,
  // it wraps to a hidden second line. In address mode the label is the address already.
  if (!byAddress) {
    const hostEl = document.createElement("span");
    hostEl.className = "host";
    hostEl.textContent = host;
    label.append(hostEl);
  }

  link.append(icon, label);
  return link;
}

function renderCard(section, place) {
  const card = document.createElement("section");
  card.className = section.loose ? "card loose" : "card";
  card.dataset.folderId = section.folderId;
  card.style.cssText =
    `grid-column: ${place.col + 1} / span ${place.span}; ` +
    `grid-row: ${place.row + 1} / span ${place.rows}; --span: ${place.span}; --link-rows: ${place.linkRows}`;

  // A group is moved by its header. The loose bookmarks are the start folder itself and stay first.
  const head = document.createElement("h2");
  if (!section.loose) {
    head.draggable = true;
  }
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = section.title;
  const count = document.createElement("span");
  count.className = "count";
  const shown = section.links.length;
  const total = Math.max(section.total ?? shown, shown);
  count.textContent = total > shown ? `${shown} of ${total}` : String(shown);
  // Search puts the number of matches here and takes the count back from this copy.
  count.dataset.text = count.textContent;
  if (total > shown) {
    count.title = `This card shows the first ${shown} of ${total} bookmarks. ` +
      "Search looks through all of them. Move some of them into another folder next to this one to see them.";
  }
  head.append(title, count);

  const list = document.createElement("div");
  list.className = "links";
  for (const link of section.links) list.append(renderLink(link));
  if (!section.links.length) {
    const hint = document.createElement("span");
    hint.className = "placeholder";
    hint.textContent = "Drag bookmarks here";
    list.append(hint);
  }

  card.append(head, list);
  return card;
}

function setEmpty(empty, failed = false) {
  const kind = failed ? "fail" : chosenFolder ? "folder" : "bar";
  emptyMsgEl.hidden = kind !== "bar";
  folderMsgEl.hidden = kind !== "folder";
  failMsgEl.hidden = kind !== "fail";
  emptyEl.hidden = !empty;
  boardEl.hidden = empty;
  // New group stays under the message on an empty page: the first group can be made here.
  footEl.hidden = !homeId || failed;
  if (empty) emptyEl.append(footEl);
  else boardEl.after(footEl);
  document.body.classList.toggle("no-links", empty);
}

function applyVars(vars) {
  for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
}

// The page stays hidden until the layout is ready: the header does not resize once the scale is chosen.
function reveal() {
  pageEl.classList.add("ready");
}

// The header height the cards were last laid out for. The header can change later on its
// own: a forecast arrives, the place is changed, the font finishes loading. Then the cards
// are laid out again, so they never reach below the window.
let headerHeight = 0;
new ResizeObserver(() => {
  if (!pageEl.classList.contains("ready") || !sections.length) return;
  if (Math.abs(topEl.offsetHeight - headerHeight) > 1) layout();
}).observe(topEl);

// resizing: the window is being dragged. The layout is remembered only once the size settles,
// otherwise intermediate widths would push out the remembered ones.
let planTimer = null;

// Groups with no bookmarks do not take part in choosing the size and the layout: a new empty
// group would shrink the whole board for a card that holds nothing. They are put into the free
// space of the layout the other groups have, in the shortest column, or below it. The board is
// laid out afresh when a group gets its first bookmark.
// Only if every group is empty, they are laid out like any others.
function withEmpties(plan, base) {
  const cards = plan.cards.map((place) => ({ ...place, i: sections.indexOf(base[place.i]) }));
  if (base.length === sections.length) return cards;
  const heights = new Array(plan.cols).fill(0);
  for (const place of plan.cards) {
    for (let c = place.col; c < place.col + place.span; c++) heights[c] = Math.max(heights[c], place.row + place.rows);
  }
  sections.forEach((section, i) => {
    if (section.links.length) return;
    const col = heights.indexOf(Math.min(...heights));
    const rows = cardRows(0, 1);
    cards.push({ i, col, span: 1, row: heights[col], rows, linkRows: linkRows(0, 1) });
    heights[col] += rows;
  });
  return cards.sort((a, b) => a.i - b.i);
}

function layout(resizing = false) {
  // A name field is open: the board stays as it is, it is laid out again when the field closes.
  if (editing) return;
  const filled = sections.filter((s) => s.links.length);
  let base = filled.length ? filled : sections;
  let result = fit(base);
  // Empty groups do not shrink the board, but if they would push it below the window edge,
  // they take part in choosing the size after all: the board stays without scrolling.
  if (result && base.length !== sections.length) {
    const rows = Math.max(...withEmpties(result.layout, base).map((c) => c.row + c.rows));
    if (rows * result.unit - result.gap > result.fullH) {
      base = sections;
      result = fit(base);
    }
  }
  // Empty groups still get cards: there must be somewhere to drag bookmarks into them.
  setEmpty(sections.length === 0);
  if (!result) {
    shownHtml = "";
    findItems = null;
    boardEl.replaceChildren();
    saveSnapshot({}, []);
    reveal();
    return;
  }

  let vars = varsOf(result);
  applyVars(vars);
  arrangeHeader();
  // The header was measured as wide as the board was before. As wide as the new board
  // it may wrap otherwise and be taller: then the size is chosen again for that height.
  if (Math.abs(topEl.offsetHeight - result.header) > 1) {
    result = fit(base);
    vars = varsOf(result);
    applyVars(vars);
    arrangeHeader();
  }
  headerHeight = topEl.offsetHeight;

  const { k, air, availW, layout: plan } = result;
  const cols = plan.cols;
  const cards = withEmpties(plan, base);

  const next = document.createElement("main");
  cards.forEach((place) => next.append(renderCard(sections[place.i], place)));

  // If the layout did not change, the DOM is left alone: icons do not reload, nothing flickers.
  // The markup is only read here for the comparison, never parsed back.
  const html = next.innerHTML;
  if (html !== shownHtml) {
    shownHtml = html;
    findItems = null;
    boardEl.replaceChildren(...next.childNodes);
    watchIcons(boardEl);
  }
  // Also when the page is unchanged: the bookmarks past a card's cap may have changed, and
  // the rows search added to a card are drawn again from the current data.
  applyFind();
  saveSnapshot(vars, cards);
  clearTimeout(planTimer);
  const save = savePlan.bind(null, availW, window.innerHeight, { k, air }, cols, plan.cards, base);
  if (resizing) planTimer = setTimeout(save, 400);
  else save();
  reveal();

  // A group was just created: its name field opens in the card header.
  if (renameNext) {
    const created = renameNext;
    renameNext = null;
    const card = cardOf(created);
    if (card) renameGroup(card, created);
  }
}

// The variables that size the page for a layout.
function varsOf({ k, unit, gap, availW, layout: plan }) {
  const colW = Math.min(COL_FILL * k, (availW - (plan.cols - 1) * gap) / plan.cols);
  return {
    "--k": String(Math.min(k, HEADER_K_MAX)),
    "--bk": String(k),
    "--unit": `${unit.toFixed(2)}px`,
    "--gap": `${gap.toFixed(2)}px`,
    "--cols": String(plan.cols),
    "--col-w": `${Math.floor(colW)}px`,
  };
}

function cardOf(folderId) {
  return [...boardEl.querySelectorAll(".card")].find((card) => card.dataset.folderId === folderId) ?? null;
}

async function load() {
  let root;
  try {
    root = (await api.bookmarks.getTree())[0];
  } catch (error) {
    // The browser did not return bookmarks: say so instead of showing an empty page.
    console.error("could not read bookmarks", error);
    // A snapshot of the previous layout is already on screen and its links work: keep it.
    if (shownHtml) {
      reveal();
      return;
    }
    sections = [];
    shownHtml = null;
    findItems = null;
    boardEl.replaceChildren();
    setEmpty(true, true);
    reveal();
    return;
  }
  try {
    const bars = toolbarFolders(root);
    const everything = settings.startFolder === "all";
    // The folder chosen in Settings. If it was deleted, all bookmarks again (the default):
    // the setting is reset, so layouts are kept under that view, not the lost folder.
    // Saving it reloads the page through the settings event.
    const start = !everything && settings.startFolder ? findFolder(root, settings.startFolder) : null;
    if (!everything && settings.startFolder && !start) {
      saveSettings({ startFolder: "all" });
      return;
    }
    chosenFolder = Boolean(start);
    // New groups, and bookmarks whose own folder is gone, go to the bookmarks bar in the all view too.
    homeId = start?.id ?? bars[0]?.id ?? null;

    let found;
    if (everything) {
      // A root with no bookmarks and no folders gives no card. The bar fallback below is for the bar view only.
      found = rootFolders(root).flatMap(buildSections);
    } else if (start) {
      found = buildSections(start);
    } else {
      found = bars.flatMap(buildSections);
      if (!hasLinks(found)) {
        // The bookmarks toolbar has no bookmarks: show the rest of the tree instead.
        // Groups in the toolbar stay on the page, so a group just made there is not lost.
        const rest = (root.children ?? []).filter((node) => !bars.includes(node))
          .flatMap(buildSections).filter((s) => s.links.length);
        if (rest.length) found = [...found, ...rest];
      }
    }
    sections = found;
    if (everything) shownView = { kind: "all", name: "" };
    else if (start) shownView = { kind: "folder", name: decodeEntities(start.title || "") || "Untitled folder" };
    else shownView = { kind: bars.some((bar) => hasLinks(buildSections(bar))) ? "bar" : "other", name: "" };
    // The first-run hint follows what is on the page now (panel.js).
    document.dispatchEvent(new CustomEvent("mutemark:view"));
    forgetNoFav();
    // The header is measured for the layout: with the font it will be drawn in.
    await fontReady;
    layout();
  } finally {
    reveal();
  }
}

// The previous layout is shown at once on opening, while the browser reads the bookmarks.
// Stored as data and drawn with the same code as a fresh layout.
function saveSnapshot(vars, cards) {
  const slim = (link) => ({ id: link.id, title: link.title, url: link.url });
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      f: folderKey(),
      chosen: chosenFolder,
      home: homeId,
      w: window.innerWidth,
      h: window.innerHeight,
      vars,
      empty: !sections.length,
      cards: cards.map((place) => {
        const section = sections[place.i];
        return {
          place,
          section: { title: section.title, folderId: section.folderId, loose: section.loose, total: section.total, links: section.links.map(slim) },
        };
      }),
    }));
  } catch {}
}

function restoreSnapshot() {
  try {
    const snap = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
    if (!snap || snap.w !== window.innerWidth || snap.h !== window.innerHeight || !Array.isArray(snap.cards)) return;
    if ((snap.f ?? "") !== folderKey()) return;
    chosenFolder = Boolean(snap.chosen);
    homeId = typeof snap.home === "string" ? snap.home : null;
    applyVars(snap.vars);
    arrangeHeader();
    const cards = snap.cards
      .filter((card) => card.section?.links?.every((link) => isAllowedUrl(link.url)))
      .map(({ place, section }) => renderCard(section, place));
    boardEl.replaceChildren(...cards);
    shownHtml = boardEl.innerHTML;
    setEmpty(snap.empty);
    watchIcons(boardEl);
    reveal();
  } catch {}
}

// No icon in the cache: show the first letter of the name instead.
function showLetter(icon) {
  if (icon.className === "letter") return;
  const link = icon.closest(".link");
  if (!link) return;
  icon.className = "letter";
  icon.style.backgroundImage = "";
  icon.textContent = link.dataset.letter ?? "?";
}

let noFav = new Set();
try {
  noFav = new Set(JSON.parse(localStorage.getItem(NOFAV_KEY) || "[]"));
} catch {}

function saveNoFav() {
  try {
    localStorage.setItem(NOFAV_KEY, JSON.stringify([...noFav].slice(-NOFAV_LIMIT)));
  } catch {}
}

function rememberNoFav(url, missing) {
  if (noFav.has(url) === missing) return;
  if (missing) noFav.add(url);
  else noFav.delete(url);
  saveNoFav();
}

// Addresses of deleted bookmarks are dropped from the list.
function forgetNoFav() {
  if (!noFav.size) return;
  const shown = new Set(sections.flatMap((s) => s.links.map((link) => link.url)));
  const before = noFav.size;
  for (const url of noFav) if (!shown.has(url)) noFav.delete(url);
  if (noFav.size !== before) saveNoFav();
}

// Image pixels as one string, to compare icons with each other.
function pixelsOf(img) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  return `${img.naturalWidth}x${img.naturalHeight}:${hash(String.fromCharCode(...data))}`;
}

function decodeImage(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

// For an unknown site the browser returns its default globe, not an error.
// Fetch it for an address that surely has no icon and compare every icon with it.
// Chromium only, like the icons themselves.
let globe = null;
function globePixels() {
  globe ??= decodeImage(faviconUrl("http://favicon-none.invalid/")).then(pixelsOf, () => null);
  return globe;
}

// The same page with "www." added to the host, or taken off it. Chromium's cache is per host,
// so a bookmark of www.example.com finds nothing when only example.com was visited.
function otherWwwUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    return url.toString();
  } catch {
    return null;
  }
}

// True if the cache has a real icon for the address, not the default globe.
async function hasIcon(src) {
  try {
    return pixelsOf(await decodeImage(src)) !== await globePixels();
  } catch {
    return false;
  }
}

// A background image reports no errors, so a separate image checks the same icon.
// The browser takes it from the same local cache, there is no second request.
// With no icon for the address, the same site with "www." toggled is tried once.
function watchIcons(root) {
  if (!HAS_FAVICONS) return;
  for (const icon of root.querySelectorAll("[data-src]")) {
    // The address as stored in the bookmark, the same key renderLink looks up.
    const url = icon.closest(".link")?.getAttribute("href");
    (async () => {
      let found = await hasIcon(icon.dataset.src);
      if (!found && url) {
        const other = otherWwwUrl(url);
        const src = other && faviconUrl(other);
        if (src && await hasIcon(src)) {
          found = true;
          icon.className = "icon";
          icon.textContent = "";
          icon.style.backgroundImage = `url("${src}")`;
        }
      }
      if (!found) showLetter(icon);
      // The site has an icon now: it is taken off the list, and the next tab shows
      // the icon. The letter stays on this one, so nothing jumps under the pointer.
      if (url) rememberNoFav(url, !found);
    })();
  }
}

/* Opening links */

// A page cannot open browser pages such as chrome://settings itself, the browser does it.
// Firefox refuses some of them (about:config and the like): then a message says so.
async function openUrl(url, newTab) {
  // No supported browser opens ftp: any more, so the extension does not try.
  if (schemeOf(url) === "ftp:") {
    showToast("The browser does not let extensions open this address", false);
    return;
  }
  if (!isWebUrl(url) && api?.tabs) {
    try {
      if (newTab) await api.tabs.create({ url });
      else await api.tabs.update({ url });
    } catch {
      showToast("The browser does not let extensions open this address", false);
    }
    return;
  }
  if (newTab) window.open(url, "_blank", "noopener");
  else location.assign(url);
}

boardEl.addEventListener("click", (event) => {
  // A click in a name field must not open the bookmark around it.
  if (event.target.closest(".edit")) {
    event.preventDefault();
    return;
  }
  const link = event.target.closest(".link");
  if (!link || isWebUrl(link.href) || !api?.tabs) return;
  event.preventDefault();
  openUrl(link.href, event.ctrlKey || event.metaKey || event.shiftKey);
});

// The middle button fires auxclick, not click. Web links open in a new tab by themselves.
boardEl.addEventListener("auxclick", (event) => {
  if (event.button !== 1) return;
  const link = event.target.closest(".link");
  if (!link || isWebUrl(link.href) || !api?.tabs) return;
  event.preventDefault();
  openUrl(link.href, true);
});

/* Search */

// Other keyboard layouts on the same keys as QWERTY: a query typed while the wrong
// layout is active still finds the bookmark, in both directions.
// Each entry is [QWERTY keys, the same keys in that layout].
const KEY_LAYOUTS = [
  // Greek
  ["wertyuiopasdfghjklzxcvbnm", "ςερτυθιοπασδφγηξκλζχψωβνμ"],
  // Hebrew
  ["ertyuiopasdfghjkl;zxcvbnm,.", "קראטוןםפשדגכעיחלךףזסבהנמצתץ"],
  // Russian
  ["`qwertyuiop[]asdfghjkl;'zxcvbnm,.", "ёйцукенгшщзхъфывапролджэячсмитьбю"],
  // Ukrainian
  ["qwertyuiop[]asdfghjkl;'zxcvbnm,.", "йцукенгшщзхїфівапролджєячсмитьбю"],
].map(([latin, other]) => {
  const toOther = new Map();
  const toLatin = new Map();
  for (let i = 0; i < latin.length; i++) {
    toOther.set(latin[i], other[i]);
    toLatin.set(other[i], latin[i]);
  }
  return [toOther, toLatin];
});

function mapKeys(text, map) {
  return Array.from(text, (ch) => map.get(ch) ?? ch).join("");
}

// Lower case without accents, one character for one character,
// so that match positions stay valid for the original name.
const foldCache = new Map();
function foldChar(ch) {
  let folded = foldCache.get(ch);
  if (folded === undefined) {
    const bare = ch.normalize("NFD").replace(/\p{M}/gu, "");
    folded = bare.length === 1 ? bare : ch;
    foldCache.set(ch, folded);
  }
  return folded;
}

function normalize(text) {
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return lower;
  let out = "";
  for (let i = 0; i < lower.length; i++) out += foldChar(lower[i]);
  return out;
}

// The query as typed, then as if typed in each other layout.
function queryVariants(raw) {
  const lower = raw.toLowerCase();
  const direct = normalize(lower);
  const variants = new Set();
  for (const maps of KEY_LAYOUTS) {
    for (const map of maps) {
      const swapped = normalize(mapKeys(lower, map));
      if (swapped !== direct) variants.add(swapped);
    }
  }
  return { direct, swapped: [...variants] };
}

// Word starts: after spaces and punctuation, and CamelCase letters.
function wordStarts(text) {
  const starts = new Set([0]);
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1];
    const cur = text[i];
    if (!/[\p{L}\p{N}]/u.test(prev) && /[\p{L}\p{N}]/u.test(cur)) starts.add(i);
    else if (/\p{Ll}/u.test(prev) && /\p{Lu}/u.test(cur)) starts.add(i);
  }
  return starts;
}

// Match by first letters of words: "gh" is GitHub, "gd" is Google Drive.
// Each piece of the query starts at a word start and runs on from there.
function matchInitials(text, starts, q) {
  const positions = [];
  function step(qi, si) {
    if (qi === q.length) return true;
    if (si < text.length && text[si] === q[qi] && positions.length) {
      positions.push(si);
      if (step(qi + 1, si + 1)) return true;
      positions.pop();
    }
    for (let j = si; j < text.length; j++) {
      if (starts.has(j) && text[j] === q[qi]) {
        positions.push(j);
        if (step(qi + 1, j + 1)) return true;
        positions.pop();
      }
    }
    return false;
  }
  return step(0, 0) ? positions : null;
}

// Score of one row for the query. Higher is better, 0 means no match.
function scoreItem(item, q) {
  const at = item.norm.indexOf(q);
  if (at >= 0) {
    const range = Array.from({ length: q.length }, (_, i) => at + i);
    if (at === 0) return { score: 100 - item.norm.length / 100, marks: range };
    if (item.starts.has(at)) return { score: 80, marks: range };
    return { score: 55, marks: range };
  }
  if (q.length >= 2) {
    const marks = matchInitials(item.norm, item.starts, q);
    if (marks) return { score: 45, marks };
  }
  if (item.host.includes(q)) return { score: 35, marks: [] };
  if (item.title?.includes(q)) return { score: 30, marks: [] };
  if (item.folder.includes(q)) return { score: 20, marks: [] };
  return { score: 0, marks: [] };
}

// A match in another layout counts slightly less than a direct one.
function matchItem(item, queries) {
  let best = scoreItem(item, queries.direct);
  for (const swapped of queries.swapped) {
    const other = scoreItem(item, swapped);
    if (other.score * 0.95 > best.score) best = { ...other, score: other.score * 0.95 };
  }
  return best;
}

// The search list is collected from the page on the first keystroke and after each redraw.
function getFindItems() {
  if (findItems) return findItems;
  findItems = [...boardEl.querySelectorAll(".link")].map((link) => {
    const nameEl = link.querySelector(".name");
    const name = nameEl.textContent;
    return {
      link,
      nameEl,
      name,
      norm: normalize(name),
      starts: wordStarts(name),
      host: normalize(link.dataset.host ?? ""),
      title: link.dataset.title ? normalize(link.dataset.title) : "",
      folder: normalize(link.closest(".card")?.querySelector(".title")?.textContent ?? ""),
    };
  });
  return findItems;
}

// Search fields of a bookmark that is past the cap of its card, which has no row on the page.
// Kept per bookmark object: they are made on the first search and live until the next load.
const restFields = new WeakMap();

function restItem(bookmark, section) {
  let item = restFields.get(bookmark);
  if (!item) {
    const host = hostOf(bookmark.url);
    const title = decodeEntities(bookmark.title || "").trim();
    const name = showsAddress() ? host : title || host;
    item = {
      name,
      norm: normalize(name),
      starts: wordStarts(name),
      host: normalize(host),
      title: showsAddress() && title ? normalize(title) : "",
      folder: normalize(section.title),
    };
    restFields.set(bookmark, item);
  }
  return item;
}

// A card shows its first MAX_LINKS_PER_SECTION bookmarks, but a search must find the others
// too. While a query is active, such a card shows only its matches, the ones past the cap
// as extra rows after the ordinary ones. The card keeps its size: at most as many matches as
// it shows bookmarks normally, the rest are counted in the header ("84 matched") and in the
// total, but not drawn. Returns how many matches lie past the caps, drawn or not.
function findPastCap(queries, current) {
  let found = 0;
  for (const section of sections) {
    if (!section.rest.length) continue;
    const card = cardOf(section.folderId);
    if (!card) continue;
    const hits = [];
    for (const bookmark of section.rest) {
      const result = matchItem(restItem(bookmark, section), queries);
      if (result.score > 0) hits.push({ bookmark, result });
    }
    if (!hits.length) continue;
    found += hits.length;
    const list = card.querySelector(".links");
    const room = Math.max(0, section.links.length - list.querySelectorAll(".link.match").length);
    for (const { bookmark, result } of hits.slice(0, room)) {
      const link = renderLink(bookmark);
      link.classList.add("extra", "match");
      list.append(link);
      watchIcons(link);
      const item = { link, nameEl: link.querySelector(".name"), name: link.querySelector(".name").textContent };
      paintName(item, result.marks);
      if (!current.best || result.score > current.best.score) current.best = { link, score: result.score };
    }
    card.classList.toggle("has-extra", room > 0);
    if (hits.length > room) {
      const matched = list.querySelectorAll(".link.match").length - room + hits.length;
      card.querySelector(".count").textContent = `${matched} matched`;
    }
  }
  return found;
}

// The name with the matching letters highlighted.
function paintName(item, marks) {
  const el = item.nameEl;
  if (!marks.length) {
    if (el.childElementCount) el.textContent = item.name;
    return;
  }
  const set = new Set(marks);
  const frag = document.createDocumentFragment();
  let run = "";
  let runMarked = false;
  const flush = () => {
    if (!run) return;
    if (runMarked) {
      const mark = document.createElement("mark");
      mark.textContent = run;
      frag.append(mark);
    } else {
      frag.append(run);
    }
    run = "";
  };
  for (let i = 0; i < item.name.length; i++) {
    const marked = set.has(i);
    if (marked !== runMarked) {
      flush();
      runMarked = marked;
    }
    run += item.name[i];
  }
  flush();
  el.replaceChildren(frag);
}

function visibleMatches() {
  return [...boardEl.querySelectorAll(".link.match")];
}

// Matches stay bright, the rest fades, the layout does not move.
// The best match becomes current, not the first one in order.
// The query of the last applyFind, to tell a relayout from a new search.
let lastFindQuery = "";

function applyFind() {
  const raw = findEl.value.trim();
  const finding = raw.length > 0;
  const queries = finding ? queryVariants(raw) : null;
  document.body.classList.toggle("finding", finding);
  // A relayout runs this again with the same query. The keyboard selection then stays where
  // the user moved it, as long as that row still matches.
  const keepId = finding && raw === lastFindQuery ? boardEl.querySelector(".link.current")?.dataset.id : null;
  lastFindQuery = raw;
  // Rows and counts that the last query put on the cards go first.
  for (const link of boardEl.querySelectorAll(".link.extra")) link.remove();
  for (const card of boardEl.querySelectorAll(".card")) {
    card.classList.remove("has-extra");
    const count = card.querySelector(".count");
    if (count?.dataset.text !== undefined) count.textContent = count.dataset.text;
  }
  if (!finding && !findItems) {
    foundEl.textContent = "";
    return;
  }

  let best = null;
  let shown = 0;
  for (const item of getFindItems()) {
    const result = finding ? matchItem(item, queries) : { score: 0, marks: [] };
    const hit = result.score > 0;
    item.link.classList.toggle("match", hit);
    item.link.classList.remove("current");
    paintName(item, hit ? result.marks : []);
    if (hit) {
      shown++;
      if (!best || result.score > best.score) best = { link: item.link, score: result.score };
    }
  }
  if (finding) {
    const current = { best };
    shown += findPastCap(queries, current);
    best = current.best;
  }
  const kept = keepId ? [...boardEl.querySelectorAll(".link.match")].find((el) => el.dataset.id === keepId) : null;
  (kept ?? best?.link)?.classList.add("current");
  for (const card of boardEl.querySelectorAll(".card")) {
    card.classList.toggle("has-match", Boolean(card.querySelector(".match")));
  }
  foundEl.textContent = finding ? (shown ? String(shown) : "none") : "";
}

function moveCurrent(step) {
  const matches = visibleMatches();
  if (!matches.length) return;
  const at = matches.findIndex((el) => el.classList.contains("current"));
  const next = matches[(at + step + matches.length) % matches.length];
  for (const el of matches) el.classList.toggle("current", el === next);
}

function clearFind() {
  findEl.value = "";
  applyFind();
  findEl.blur();
}

findEl.addEventListener("input", applyFind);

findEl.addEventListener("keydown", (event) => {
  const tab = event.key === "Tab" && visibleMatches().length > 0;
  if (event.key === "ArrowDown" || (tab && !event.shiftKey)) {
    event.preventDefault();
    moveCurrent(1);
  } else if (event.key === "ArrowUp" || (tab && event.shiftKey)) {
    event.preventDefault();
    moveCurrent(-1);
  } else if (event.key === "Enter") {
    const current = boardEl.querySelector(".link.current");
    if (!current) return;
    event.preventDefault();
    // Ctrl or Shift opens in a new tab, otherwise in this one.
    openUrl(current.href, event.ctrlKey || event.metaKey || event.shiftKey);
  } else if (event.key === "Escape") {
    clearFind();
  }
});

// Right after a new tab opens, the keyboard is in the address bar, not on the page. Show a hint.
function updateFocusHint() {
  const away = !document.hasFocus();
  document.body.classList.toggle("page-unfocused", away);
  findEl.placeholder = away ? "Click to search" : "Find a bookmark";
}
window.addEventListener("focus", updateFocusHint);
window.addEventListener("blur", updateFocusHint);
updateFocusHint();

// Any printable key except space starts a search, and so does "/". Characters are read as typed, and "/" and Ctrl+Z also by key position, so any layout works.
document.addEventListener("keydown", (event) => {
  // The settings panel is a modal dialog with keys of its own (panel.js).
  if (settingsEl.open) return;
  if (event.key === "Escape") {
    closeMenu();
    return;
  }
  // The open menu takes the arrow keys itself, letters do not start a search there.
  if (event.target instanceof Element && event.target.closest("#menu")) return;
  // Ctrl+Z restores the bookmark just deleted. A Latin layout is read by the letter
  // (so QWERTZ and AZERTY follow the printed Z), any other layout by the key position.
  const latin = /^[a-z]$/i.test(event.key);
  const isZ = latin ? event.key.toLowerCase() === "z" : event.code === "KeyZ";
  if ((event.ctrlKey || event.metaKey) && isZ && removed &&
      (document.activeElement !== findEl || !findEl.value)) {
    event.preventDefault();
    undoRemove();
    return;
  }
  // In text fields (search, weather city) keys stay with the field.
  if (document.activeElement?.tagName === "INPUT" || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "Slash" && !event.shiftKey) {
    event.preventDefault();
    findEl.focus();
  } else if (event.key.length === 1 && event.key !== " ") {
    findEl.focus();
  }
});

/* Context menu */

// Focus goes back to the bookmark if it was in the menu.
function closeMenu() {
  const hadFocus = menuEl.contains(document.activeElement);
  menuEl.hidden = true;
  menuTarget?.classList.remove("menu-open");
  if (hadFocus) menuTarget?.focus();
  menuTarget = null;
  menuKind = null;
}

function menuItems() {
  return [...menuEl.querySelectorAll("[role=menuitem]:not([hidden])")];
}

// Arrow keys, Home and End move between the items. Tab closes the menu.
menuEl.addEventListener("keydown", (event) => {
  const items = menuItems();
  const at = items.indexOf(document.activeElement);
  let next = null;
  if (event.key === "ArrowDown") next = items[(at + 1) % items.length];
  else if (event.key === "ArrowUp") next = items[at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length];
  else if (event.key === "Home") next = items[0];
  else if (event.key === "End") next = items[items.length - 1];
  else if (event.key === "Tab") {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (next) {
    event.preventDefault();
    next.focus();
  }
});

// kind: "link" for a bookmark row, "group" for a group header.
// keyboard: opened from the keyboard. Then the first item takes the focus, with its ring.
// Opened with the mouse, the menu itself takes it: no item looks chosen, the arrow keys still work.
function openMenu(x, target, kind, keyboard = false) {
  closeMenu();
  menuTarget = target;
  menuKind = kind;
  target.classList.add("menu-open");
  for (const item of menuEl.querySelectorAll("[role=menuitem]")) item.hidden = item.dataset.kind !== kind;
  menuEl.setAttribute("aria-label", kind === "group" ? "Group" : "Bookmark");
  menuEl.hidden = false;

  // The menu opens below the row, or above it if there is no room below.
  // The row with its address stays fully visible.
  const box = menuEl.getBoundingClientRect();
  const row = target.getBoundingClientRect();
  let top = row.bottom + 4;
  if (top + box.height > window.innerHeight - 8) top = row.top - box.height - 4;
  const left = Math.min(x, window.innerWidth - box.width - 8);
  menuEl.style.left = `${Math.max(8, left)}px`;
  menuEl.style.top = `${Math.max(8, top)}px`;
  (keyboard ? menuItems()[0] : menuEl).focus({ preventScroll: true });
}

document.addEventListener("contextmenu", (event) => {
  const at = event.target instanceof Element ? event.target : null;
  // A name field keeps the browser's own menu, with cut and paste.
  if (at?.closest(".edit")) return;
  const link = at?.closest(".link");
  const head = link ? null : at?.closest(".card:not(.loose) h2");
  const target = link ?? head;
  if (!target) {
    closeMenu();
    return;
  }
  event.preventDefault();
  // Horizontally at the pointer, or at the left edge of the row from the keyboard.
  // A keyboard menu does not come from the right button: Chromium sets button to -1.
  const keyboard = event.button !== 2;
  openMenu(keyboard ? target.getBoundingClientRect().left : event.clientX, target, link ? "link" : "group", keyboard);
});

document.addEventListener("mousedown", (event) => {
  if (!event.target.closest("#menu")) closeMenu();
});

window.addEventListener("blur", closeMenu);

// The item's action gets the menu target, after the menu is closed.
function onMenu(id, action) {
  document.getElementById(id).addEventListener("click", () => {
    const target = menuTarget;
    closeMenu();
    if (target) action(target);
  });
}

onMenu("menu-open", (link) => openUrl(link.href, true));

onMenu("menu-copy", async (link) => {
  try {
    await navigator.clipboard.writeText(link.href);
    showToast("Link copied", false);
  } catch {
    showToast("Could not copy link", false);
  }
});

onMenu("menu-rename", (link) => renameLink(link));
onMenu("menu-delete", (link) => deleteLink(link.dataset.id));
onMenu("menu-rename-group", (head) => renameGroup(head.closest(".card")));
onMenu("menu-delete-group", (head) => deleteGroup(head.closest(".card").dataset.folderId));

/* Renaming in place */

// Puts a name field in place of `host`'s content. Enter or leaving the field saves,
// Escape cancels. The board is not redrawn while the field is open.
function startEdit(host, value, label, onDone) {
  // Another field still open is saved, as if the pointer had left it.
  finishEdit(true);
  const input = document.createElement("input");
  input.className = "edit";
  input.type = "text";
  input.value = value;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", label);
  const before = [...host.childNodes];
  const drag = host.closest("[draggable=true]");
  drag?.setAttribute("draggable", "false");
  host.closest(".link, .card")?.classList.add("editing");
  host.replaceChildren(input);
  editing = { input, host, before, drag, onDone };

  input.addEventListener("keydown", (event) => {
    // Keys stay with the field: no search, no menu, no undo of a deletion.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finishEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEdit(false);
    }
  });
  input.addEventListener("blur", () => finishEdit(true));
  input.focus({ preventScroll: true });
  input.select();
}

async function finishEdit(save) {
  const edit = editing;
  if (!edit) return;
  editing = null;
  const value = edit.input.value.trim();
  const hadFocus = document.activeElement === edit.input;
  edit.host.replaceChildren(...edit.before);
  edit.drag?.setAttribute("draggable", "true");
  edit.host.closest(".editing")?.classList.remove("editing");
  try {
    await edit.onDone(save, value);
  } catch {
    // The bookmark or the folder was deleted in another window meanwhile.
    showToast("Could not rename", false);
  }
  await load();
  if (hadFocus) edit.host.closest(".link")?.focus({ preventScroll: true });
}

function renameLink(link) {
  const id = link.dataset.id;
  const nameEl = link.querySelector(".name");
  // The editor holds the real bookmark title, not the address that may be drawn on the tile.
  // The title is read from the browser when the editor opens (it may be missing in the
  // data attribute, or changed in another window). Nothing is written unless it changed.
  openLinkEditor(link, id, nameEl);
}

async function openLinkEditor(link, id, nameEl) {
  let was;
  try {
    [{ title: was = "" }] = await api.bookmarks.get(id);
  } catch {
    showToast("Could not rename", false);
    return;
  }
  was = decodeEntities(was || "").trim();
  startEdit(nameEl, was, "Bookmark name", async (save, value) => {
    // An untouched field never writes: the stored title stays exactly as it is.
    if (save && value !== was) await api.bookmarks.update(id, { title: value });
  });
}

// created: the id of a group just made with "New group". Escape then takes it back.
function renameGroup(card, created = null) {
  if (!card || card.classList.contains("loose")) return;
  const id = card.dataset.folderId;
  const titleEl = card.querySelector(".title");
  const was = titleEl.textContent;
  startEdit(titleEl, was, "Group name", async (save, value) => {
    if (!save && created) {
      const children = await api.bookmarks.getChildren(created);
      if (!children.length) await api.bookmarks.remove(created);
      return;
    }
    if (save && value && value !== was) await api.bookmarks.update(id, { title: value });
  });
}

boardEl.addEventListener("dblclick", (event) => {
  const head = event.target.closest(".card:not(.loose) h2");
  if (!head || event.target.closest(".edit")) return;
  event.preventDefault();
  renameGroup(head.closest(".card"));
});

/* New group */

// A folder at the end of the start folder, its name field open at once.
async function createGroup() {
  if (!homeId) return;
  finishEdit(true);
  let node;
  try {
    node = await api.bookmarks.create({ parentId: homeId, title: NEW_GROUP_TITLE });
  } catch {
    showToast("Could not create group", false);
    return;
  }
  renameNext = node.id;
  await load();
}

newGroupEl.addEventListener("click", createGroup);

/* Delete and undo */

async function deleteLink(id) {
  if (!id) return;
  let node;
  try {
    [node] = await api.bookmarks.get(id);
    if (!node?.parentId) throw new Error("bookmark not found");
    await api.bookmarks.remove(id);
  } catch {
    // The bookmark was already deleted or moved in another window.
    await load();
    showToast("Bookmark no longer exists", false);
    return;
  }
  const entry = { parentId: node.parentId, index: node.index, title: node.title, url: node.url };
  await load();
  showToast(`Deleted: ${showsAddress() ? hostOf(node.url) : decodeEntities(node.title || "") || hostOf(node.url)}`, async () => {
    try {
      // Other bookmarks may have come or gone meanwhile, and Chromium rejects an index past the end.
      await api.bookmarks.get(entry.parentId);
      const siblings = await api.bookmarks.getChildren(entry.parentId);
      await api.bookmarks.create({ ...entry, index: Math.min(entry.index, siblings.length) });
    } catch {
      // The folder was deleted while the bar was showing: restore to the folder on the page.
      if (!homeId) throw new Error("no folder to restore to");
      await api.bookmarks.create({ parentId: homeId, title: entry.title, url: entry.url });
    }
  });
}

// The bookmarks of the group, and any folders in it, move up to where the group was,
// in the same order. Then the empty folder is deleted. Undo makes the folder again
// in its place and moves everything back.
async function deleteGroup(folderId) {
  let folder;
  let children;
  // The layouts as they are with the group. While it is gone they are laid out without it.
  const plans = readPlans();
  try {
    [folder] = await api.bookmarks.get(folderId);
    if (!folder?.parentId || folder.url) throw new Error("folder not found");
    children = await api.bookmarks.getChildren(folderId);
    for (const [i, child] of children.entries()) {
      await api.bookmarks.move(child.id, { parentId: folder.parentId, index: folder.index + i });
    }
    await api.bookmarks.remove(folderId);
  } catch {
    await load();
    showToast("Could not delete group", false);
    return;
  }
  await load();
  const name = decodeEntities(folder.title || "") || "group";
  showToast(`Deleted group: ${name}`, async () => {
    const siblings = await api.bookmarks.getChildren(folder.parentId);
    const group = await api.bookmarks.create({
      parentId: folder.parentId,
      index: Math.min(folder.index, siblings.length),
      title: folder.title,
    });
    // The folder made again has a new id: the layouts from before point to it, so every card
    // goes back to where it was.
    restorePlans(plans, folderId, group.id);
    for (const child of children) {
      // A bookmark deleted meanwhile stays deleted, the rest go back. With no index each one
      // is appended, so a missing one cannot make the later moves fail.
      try {
        await api.bookmarks.move(child.id, { parentId: group.id });
      } catch {}
    }
  });
}

function hideToast() {
  toastEl.hidden = true;
  clearTimeout(toastTimer);
  clearTimeout(flashTimer);
  removed = null;
}

let flashTimer = null;

// undo: a function that restores what was deleted, then the bar has an Undo button.
function showToast(text, undo) {
  clearTimeout(flashTimer);
  // While a deletion can still be undone, another message shows in the bar briefly,
  // and the Undo button and the countdown stay.
  if (!undo && removed) {
    const keep = toastTextEl.textContent;
    toastTextEl.textContent = text;
    flashTimer = setTimeout(() => {
      if (removed) toastTextEl.textContent = keep;
    }, 2000);
    return;
  }
  removed = undo || null;
  toastTextEl.textContent = text;
  toastEl.classList.toggle("undoable", Boolean(undo));
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  const seconds = undo ? UNDO_SECONDS : 2;
  toastTimer = setTimeout(hideToast, seconds * 1000);
  // The line at the bottom shows how much time is left to undo.
  toastTimerEl.style.animation = "none";
  void toastTimerEl.offsetWidth;
  toastTimerEl.style.animation = undo ? `countdown ${seconds}s linear forwards` : "none";
}

async function undoRemove() {
  if (!removed) return;
  const restore = removed;
  hideToast();
  try {
    await restore();
  } catch {
    showToast("Could not undo", false);
  }
  await load();
}

document.getElementById("toast-undo").addEventListener("click", undoRemove);

/* Drag and drop */

function clearDropMarks() {
  for (const el of boardEl.querySelectorAll(".drop-before, .drop-after, .drop-end, .drop-card-before, .drop-card-after")) {
    el.classList.remove("drop-before", "drop-after", "drop-end", "drop-card-before", "drop-card-after");
  }
}

boardEl.addEventListener("dragstart", (event) => {
  if (editing) {
    event.preventDefault();
    return;
  }
  const link = event.target.closest(".link");
  if (link) {
    dragId = link.dataset.id;
    dropTarget = null;
    closeMenu();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/uri-list", link.href);
    event.dataTransfer.setData("text/plain", link.href);
    link.classList.add("dragging");
    document.body.classList.add("dragging-now");
    return;
  }
  // A group is dragged by its header, the whole card goes with the pointer.
  const card = event.target.closest(".card:not(.loose)");
  if (!card || !event.target.closest("h2")) return;
  dragFolderId = card.dataset.folderId;
  dropTarget = null;
  closeMenu();
  event.dataTransfer.effectAllowed = "move";
  // Firefox starts a drag only with some data. The name is harmless wherever it lands.
  event.dataTransfer.setData("text/plain", card.querySelector(".title").textContent);
  const box = card.getBoundingClientRect();
  event.dataTransfer.setDragImage(card, event.clientX - box.left, event.clientY - box.top);
  card.classList.add("dragging");
  document.body.classList.add("dragging-card-now");
});

// Listens on the whole document, not just the board: the "end of folder" zone of the lowest cards
// reaches past the board edge, and with few bookmarks there is empty space below the page
// where the previous target must be cleared too.
document.addEventListener("dragover", (event) => {
  if (dragFolderId) {
    groupDragOver(event);
    return;
  }
  if (!dragId) return;

  const at = event.target instanceof Element ? event.target : document.body;
  const link = at.closest(".link");
  const card = (link || at.closest("h2") ? null : endZone(event.clientX, event.clientY)) ??
    at.closest(".card") ?? cardAround(event.clientX, event.clientY);
  if (!link && !card) {
    // The pointer left the cards: the previous target no longer applies.
    clearDropMarks();
    dropTarget = null;
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearDropMarks();

  // Gap between columns or side padding of a card: the place next to the nearest row.
  const near = link ?? (at.closest("h2") ? null : nearestLink(card, event.clientX, event.clientY));
  if (near && near.dataset.id !== dragId) {
    const box = near.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    near.classList.add(after ? "drop-after" : "drop-before");
    dropTarget = { linkId: near.dataset.id, after };
  } else if (!near) {
    // The header or empty space below the rows: the bookmark goes to the end of this folder.
    card.classList.add("drop-end");
    dropTarget = { folderId: card.dataset.folderId };
  } else {
    dropTarget = null;
  }
});

// A group goes before or after the card under the pointer, by which half of it the pointer is in.
// The loose bookmarks always stay first: dropped on them, a group becomes the first group.
function groupDragOver(event) {
  const at = event.target instanceof Element ? event.target : document.body;
  const card = at.closest(".card") ?? cardAround(event.clientX, event.clientY);
  clearDropMarks();
  if (!card || card.dataset.folderId === dragFolderId) {
    dropTarget = null;
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const box = card.getBoundingClientRect();
  const loose = card.classList.contains("loose");
  const after = loose || event.clientX > box.left + box.width / 2;
  card.classList.add(after ? "drop-card-after" : "drop-card-before");
  dropTarget = { cardId: card.dataset.folderId, after, loose };
}

// The "end of folder" zone: everything below the card's last row, its bottom padding
// and the gap under it, but at least one row. So it also takes the top padding
// of the card below, up to its header. Sideways, half of the gap between columns.
function endZone(x, y) {
  const style = getComputedStyle(document.documentElement);
  const gap = parseFloat(style.getPropertyValue("--gap")) || GAP;
  const unit = parseFloat(style.getPropertyValue("--unit")) || ROW;
  for (const card of boardEl.querySelectorAll(".card")) {
    const box = card.getBoundingClientRect();
    if (x < box.left - gap / 2 || x >= box.right + gap / 2) continue;
    const bottom = card.querySelector(".links").getBoundingClientRect().bottom;
    if (y >= bottom && y < Math.max(box.bottom + gap, bottom + unit)) return card;
  }
  return null;
}

// Pointer in a gap between cards: whose zone is it. The gap below a card
// and half the gap at its side belong to it, so the end of a folder is easier to hit.
function cardAround(x, y) {
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || GAP;
  for (const card of boardEl.querySelectorAll(".card")) {
    const box = card.getBoundingClientRect();
    if (x >= box.left - gap / 2 && x < box.right + gap / 2 && y >= box.top && y < box.bottom + gap) return card;
  }
  return null;
}

// The card row at the pointer's height, nearest horizontally, no further than NEAR_PX.
// Below the last row and in the empty cell of a split card there is no row: that is the end of the folder.
function nearestLink(card, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const el of card.querySelectorAll(".link")) {
    const box = el.getBoundingClientRect();
    if (y < box.top || y >= box.bottom) continue;
    const dist = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  return bestDist <= NEAR_PX ? best : null;
}

// index is a slot counted before the item is taken out. Firefox wants the final position,
// so a move down inside the same folder lands one slot earlier there.
async function moveTo(id, parentId, index) {
  const [node] = await api.bookmarks.get(id);
  if (IS_FIREFOX && node?.parentId === parentId && node.index < index) index--;
  await api.bookmarks.move(id, { parentId, index });
}

document.addEventListener("drop", async (event) => {
  if (!dragId && !dragFolderId) return;
  // The search field takes a dropped address itself, the bookmark does not move then.
  if (event.target instanceof Element && event.target.closest(".top, .find")) {
    endDrag();
    return;
  }
  event.preventDefault();
  const id = dragId ?? dragFolderId;
  const target = dropTarget;
  endDrag();
  if (!id || !target) return;

  try {
    if (target.cardId) {
      const [anchor] = await api.bookmarks.get(target.cardId);
      if (!anchor) throw new Error("folder not found");
      if (target.loose) {
        // The loose card is the start folder itself: the group becomes its first folder.
        await api.bookmarks.move(id, { parentId: anchor.id, index: 0 });
      } else {
        await moveTo(id, anchor.parentId, anchor.index + (target.after ? 1 : 0));
      }
    } else if (target.linkId) {
      const [anchor] = await api.bookmarks.get(target.linkId);
      if (!anchor?.parentId) throw new Error("bookmark not found");
      await moveTo(id, anchor.parentId, anchor.index + (target.after ? 1 : 0));
    } else if (target.folderId) {
      await api.bookmarks.move(id, { parentId: target.folderId });
    }
  } catch {
    // The bookmark or the drop place was deleted in another window meanwhile.
    showToast(target.cardId ? "Could not move group" : "Could not move bookmark", false);
  }
  await load();
});

function endDrag() {
  clearDropMarks();
  for (const el of boardEl.querySelectorAll(".dragging")) el.classList.remove("dragging");
  document.body.classList.remove("dragging-now", "dragging-card-now");
  dragId = null;
  dragFolderId = null;
  dropTarget = null;
}

document.addEventListener("dragend", endDrag);

/* Bookmarks changed in another window: redraw. */

// Not while something is dragged or a name field is open: the field would be lost.
// The field reloads the board itself when it closes.
function scheduleLoad() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (dragId || dragFolderId) scheduleLoad();
    else if (!editing) load();
  }, 150);
}

// Firefox has no onChildrenReordered and onImportEnded, hence the optional call.
for (const name of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
  api.bookmarks[name]?.addListener(scheduleLoad);
}

let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => layout(true));
});

/* Settings changed in the panel. */

document.addEventListener("mutemark:settings", ({ detail }) => {
  if (detail.changed.includes("startFolder") || detail.changed.includes("tileLabels")) {
    load();
    return;
  }
  // Widgets change the height of the header, so the layout may change.
  if (["weather", "widgets", "zones"].some((key) => detail.changed.includes(key))) layout();
});

// The shortcut to add a bookmark, as the system names it.
if (/Mac|iPhone|iPad/.test(navigator.platform)) document.getElementById("add-key").textContent = "\u2318D";

// The bundled font, or a short wait for it at most: it comes from the package, not the network.
const fontReady = Promise.race([
  document.fonts?.load?.('16px "Inter"') ?? Promise.resolve(),
  new Promise((resolve) => setTimeout(resolve, 500)),
]).catch(() => {});

restoreSnapshot();
const firstLoad = load();
