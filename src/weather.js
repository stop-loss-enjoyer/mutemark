// Weather in the header: now and the next seven days.
// Data by Open-Meteo (open-meteo.com: open source, no API key, no user accounts).
// The weather widget is turned on and off with its button in the widget bar. Nothing
// is requested until the user searches for a place or picks one in the header.
// A search sends the typed name to the Open-Meteo geocoder. Coordinates typed in
// the field are never sent as a search: decimal ones and degrees, minutes and seconds
// are read and rounded here, and a few other forms of a position (a Plus Code, a lone
// number with a decimal point, a signed number) are refused, see looksLikeCoords.
// Any other text goes to the geocoder as typed.
// After that only the place's coordinates, rounded to about 1 km, go to Open-Meteo.
// Open-Meteo picks the best models for the place: ECMWF, DWD ICON, Meteo-France and others.
// The answer is kept in localStorage: the tab shows it at once and asks the network
// at most once per REFRESH_MINUTES. It is always in °C and m/s, other units are
// converted here, so changing units sends nothing.

const WEATHER_KEY = "mutemark-weather";
// The place is only ever set by the user, never guessed.
const PLACE_KEY = "mutemark-place";
const REFRESH_MINUTES = 20;
const FORECAST_DAYS = 7;

const wxIconEl = document.getElementById("wx-icon");
const wxTempEl = document.getElementById("wx-temp");
const wxPlaceEl = document.getElementById("wx-place");
const wxCityEl = document.getElementById("wx-city");
const wxDescEl = document.getElementById("wx-desc");
const wxDaysEl = document.getElementById("wx-days");
const wxCreditEl = document.getElementById("wx-credit");
const weatherEl = document.getElementById("weather");
const wxNowEl = document.getElementById("wx-now");

// WMO weather codes: description and icon. Clear and mostly clear have a night icon too.
const WMO = {
  0: ["Clear", "sun", "moon"],
  1: ["Mostly clear", "cloud-sun", "cloud-moon"],
  2: ["Partly cloudy", "cloud-sun", "cloud-moon"],
  3: ["Overcast", "cloud"],
  45: ["Fog", "cloud-fog"],
  48: ["Freezing fog", "cloud-fog"],
  51: ["Light drizzle", "cloud-drizzle"],
  53: ["Drizzle", "cloud-drizzle"],
  55: ["Heavy drizzle", "cloud-drizzle"],
  56: ["Freezing drizzle", "cloud-drizzle"],
  57: ["Freezing drizzle", "cloud-drizzle"],
  61: ["Light rain", "cloud-rain"],
  63: ["Rain", "cloud-rain"],
  65: ["Heavy rain", "cloud-rain-wind"],
  66: ["Freezing rain", "cloud-rain"],
  67: ["Heavy freezing rain", "cloud-rain-wind"],
  71: ["Light snow", "cloud-snow"],
  73: ["Snow", "cloud-snow"],
  75: ["Heavy snow", "cloud-snow"],
  77: ["Snow grains", "cloud-snow"],
  80: ["Light showers", "cloud-rain"],
  81: ["Showers", "cloud-rain"],
  82: ["Heavy showers", "cloud-rain-wind"],
  85: ["Snow showers", "cloud-snow"],
  86: ["Heavy snow showers", "cloud-snow"],
  95: ["Thunderstorm", "cloud-lightning"],
  96: ["Thunderstorm with hail", "cloud-hail"],
  99: ["Severe thunderstorm with hail", "cloud-hail"],
};

// Day names in English like the rest of the page, in the browser's own date order
// if the browser speaks English. The clock follows Settings or the browser's locale.
const DATE_LOCALE = /^en(-|$)/i.test(navigator.language ?? "") ? navigator.language : "en-GB";
const shortDayFmt = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "short" });
const longDayFmt = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long", day: "numeric", month: "long" });
const LOCAL_HOUR_CYCLE = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle ?? "h23";

// The clock setting as Intl options, for the clocks and the weather. On a 24-hour clock
// the hour always has two digits, "09:05", whatever the browser's language: locales
// disagree there, and in a column of world clocks "9:05" under "20:05" looks ragged.
function timeOptions() {
  const hourCycle = settings.clock === "12" ? "h12" : settings.clock === "24" ? "h23" : LOCAL_HOUR_CYCLE;
  const hour = hourCycle === "h23" || hourCycle === "h24" ? "2-digit" : "numeric";
  return { hour, minute: "2-digit", hourCycle };
}

function formatTime(ms) {
  return new Intl.DateTimeFormat(DATE_LOCALE, timeOptions()).format(ms);
}

const WIND_UNITS = { ms: [1, "m/s"], kmh: [3.6, "km/h"], mph: [2.236936, "mph"] };

function wind(ms) {
  const [factor, unit] = WIND_UNITS[settings.windUnit] ?? WIND_UNITS.ms;
  return `${Math.round(ms * factor)} ${unit}`;
}

let wxTimer = null;

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the forecast is simply requested again next time.
  }
}

function wmo(code) {
  return WMO[code] ?? ["", "cloud"];
}

// Icon markup is parsed once per icon and copied into the target <svg>.
// Weather icons are in weather-icons.js, interface icons in icons.js.
const ICONS = { ...WEATHER_ICONS, ...UI_ICONS };
const iconCache = new Map();
function iconNodes(name) {
  const key = name in ICONS ? name : "cloud";
  if (!iconCache.has(key)) {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${ICONS[key]}</svg>`, "image/svg+xml");
    iconCache.set(key, [...doc.documentElement.children]);
  }
  return iconCache.get(key).map((node) => document.importNode(node, true));
}

function iconSvg(svg, name) {
  svg.replaceChildren(...iconNodes(name));
}

function makeIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  iconSvg(svg, name);
  return svg;
}

// Temperature from °C in the chosen unit.
function deg(celsius) {
  const n = Math.round(settings.tempUnit === "f" ? celsius * 9 / 5 + 32 : celsius);
  // A real minus sign, not a hyphen: the digits line up.
  return `${n < 0 ? "−" : ""}${Math.abs(n)}°`;
}

// Forecast dates come as 2026-10-10 in the time zone of the place.
function dayDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/* Place */

// Only the user sets the place: a city by name or coordinates.
// The page never detects it: not by IP, not by time zone, not by geolocation.

// Coordinates are rounded to 2 decimals (about 1 km) before they are stored or sent.
function roundCoord(value) {
  return Math.round(Number(value) * 100) / 100;
}

// No referrer, no cookies: a request carries only its own parameters.
const FETCH_OPTIONS = { referrerPolicy: "no-referrer", credentials: "omit" };

// Coordinates in common written forms: "51.51, -0.13", "51.51 -0.13", "(51.51, -0.13)",
// "+51.51 -0.13", "51.51° -0.13°", "51.51N 0.13W", "N 51.51 W 0.13". A decimal comma
// works when the two numbers are separated by a space or a semicolon.
const COORD_NUM = String.raw`([+-]?\d+(?:[.,]\d+)?)`;
const COORD_SEP = String.raw`(?:\s*[;,]\s*|\s+)`;
// Letters before the numbers ("N 51.51 W 0.13") or after them ("51.51N 0.13W").
const COORD_PREFIX = new RegExp(`^([NSEW]?)\\s*${COORD_NUM}${COORD_SEP}([NSEW]?)\\s*${COORD_NUM}$`, "i");
const COORD_SUFFIX = new RegExp(`^${COORD_NUM}\\s*([NSEW]?)${COORD_SEP}${COORD_NUM}\\s*([NSEW]?)$`, "i");

// Degree, minute and second signs as people type them, including the ASCII stand-ins.
const DEG_SIGNS = /[°º˚]/g;
const MIN_SIGNS = /[′’‘´`]|'(?!')/g;
const SEC_SIGNS = /[″”“]|''|"/g;

// Two values, each with an optional compass letter, into a rounded place, or null.
function placeFromPairs(pairs) {
  let [a, b] = pairs.map(([letter, value]) => {
    const hemi = (letter ?? "").toUpperCase();
    return { hemi, value: hemi === "S" || hemi === "W" ? -Math.abs(value) : value };
  });
  // With letters, either order is allowed: "0.13W 51.51N".
  if ("EW".includes(a.hemi) && a.hemi && "NS".includes(b.hemi) && b.hemi) [a, b] = [b, a];
  if ((a.hemi && !"NS".includes(a.hemi)) || (b.hemi && !"EW".includes(b.hemi))) return null;
  if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) return null;
  const lat = roundCoord(a.value);
  const lon = roundCoord(b.value);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, country: "", lat, lon };
}

function parseDecimalCoords(text) {
  const clean = text.replace(DEG_SIGNS, "");
  let pairs = null;
  let m = clean.match(COORD_PREFIX);
  if (m) pairs = [[m[1], m[2]], [m[3], m[4]]];
  else if ((m = clean.match(COORD_SUFFIX))) pairs = [[m[2], m[1]], [m[4], m[3]]];
  if (!pairs) return null;
  return placeFromPairs(pairs.map(([letter, num]) => [letter, Number(num.replace(",", "."))]));
}

// One half in degrees, minutes and seconds: 51°30'26"N, N 51 30 26, -0°7'39", 51°30.43'.
const DMS_HALF = /^([NSEW])?\s*([+-])?\s*(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'?\s*(?:(\d+(?:\.\d+)?)\s*"?)?)?\s*([NSEW])?$/i;

function parseDmsHalf(text) {
  const m = text.trim().match(DMS_HALF);
  if (!m || (m[1] && m[6])) return null;
  const [d, min, sec] = [m[3], m[4] ?? "0", m[5] ?? "0"].map(Number);
  if (min >= 60 || sec >= 60) return null;
  const value = d + min / 60 + sec / 3600;
  return [m[1] ?? m[6] ?? "", m[2] === "-" ? -value : value];
}

// Degrees, minutes and seconds. The text is cut into two halves: at a comma or semicolon,
// after the first compass letter that ends a half, before the second leading letter,
// or before the second number with a degree sign.
function parseDmsCoords(text) {
  const clean = text.replace(DEG_SIGNS, "°").replace(SEC_SIGNS, '"').replace(MIN_SIGNS, "'")
    .replace(/\s+/g, " ").trim();
  if (!/[°'"]|\d\s*[NSEW]\b|\b[NSEW]\s*\d/i.test(clean)) return null;
  const cuts = [
    clean.split(/\s*[;,]\s*/),
    clean.split(/(?<=\d\s*[°'"]?\s*[NS])\s+(?=[+-]?\s*\d)/i),
    clean.split(/\s+(?=[EW]\s*\d)/i),
    clean.split(/\s+(?=[+-]?\d+(?:\.\d+)?\s*°)/),
  ];
  for (const halves of cuts) {
    if (halves.length !== 2) continue;
    const pairs = halves.map(parseDmsHalf);
    if (pairs.every(Boolean)) return placeFromPairs(pairs);
  }
  return null;
}

// Digits of every script as plain ones, so that coordinates typed with a Japanese, Chinese,
// Arabic, Persian or any other keyboard are read here and never sent as a search.
// NFKC makes full-width digits, signs and commas plain. Arabic separators get their plain
// counterparts. Any other decimal digit becomes its value: Unicode keeps the digits 0 to 9
// of each script in a row, so the value is the distance from the start of the row.
function plainDigits(text) {
  return text.normalize("NFKC")
    .replace(/\u066B/g, ".")
    .replace(/[\u066C\u060C]/g, ",")
    .replace(/\u061B/g, ";")
    .replace(/\u2212/g, "-")
    .replace(/\p{Nd}/gu, (digit) => {
      if (digit >= "0" && digit <= "9") return digit;
      const code = digit.codePointAt(0);
      let zero = code;
      while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--;
      return String((code - zero) % 10);
    });
}

function parseCoords(text) {
  const clean = text.trim().replace(/^[([{]\s*|\s*[)\]}]$/g, "");
  return parseDecimalCoords(clean) ?? parseDmsCoords(clean);
}

// Text in these forms may be a position and is never sent to the geocoder, so such
// a position cannot leave the browser unrounded. A city name has no such parts:
//   a number with a decimal point or comma: "51.5", "51,5 Berlin";
//   three or more numbers: "51 30 26 0 7 39";
//   a number with a degree, minute or second sign: 51°30'26";
//   a number with a sign in front: "-33";
//   a compass letter right after a number ("51N"), or two letters before numbers ("N51 W0");
//   a Plus Code (Open Location Code): "9C3XGV4C+XV", "GV4C+XV London".
// Postcodes such as "10115" or "SW1A 1AA" still go through.
const PLUS_CODE = /(^|[^0-9a-z])[23456789cfghjmpqrvwx]{2,8}\+[23456789cfghjmpqrvwx]{0,3}($|[^0-9a-z])/i;
// Digits are matched in every script, as a second guard behind plainDigits().
const COMPASS_BEFORE = /(?<![a-z])[nsew](?=\s*\p{Nd})/giu;
function looksLikeCoords(text) {
  return /\p{Nd}[.,]\p{Nd}/u.test(text) ||
    (text.match(/\p{Nd}+/gu) ?? []).length >= 3 ||
    /\p{Nd}\s*[°º˚′″'"’‘´`”“]/u.test(text) ||
    /(^|[\s(,;])[+\-−]\s*\p{Nd}/u.test(text) ||
    /\p{Nd}\s*[nsew](?![a-z])/iu.test(text) ||
    (text.match(COMPASS_BEFORE) ?? []).length >= 2 ||
    PLUS_CODE.test(text);
}

// What the field says when it refuses a position it cannot read.
const COORDS_HINT = "Use decimal coordinates, like 51.51, -0.13";

// Looks a city up by name, returns up to five matches, largest first.
async function geocode(name) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "en");
  const response = await fetch(url, FETCH_OPTIONS);
  if (!response.ok) throw new Error(`geocoder answered ${response.status}`);
  const results = (await response.json()).results ?? [];
  return results
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      country: [r.admin1, r.country].filter((x) => x && x !== r.name).join(", "),
      lat: roundCoord(r.latitude),
      lon: roundCoord(r.longitude),
    }));
}

// Rounded on read as well, in case a place was stored with more precision.
function currentPlace() {
  const saved = readJson(PLACE_KEY);
  if (saved?.lat == null || saved?.lon == null) return null;
  return { ...saved, lat: roundCoord(saved.lat), lon: roundCoord(saved.lon) };
}

/* Forecast */

async function fetchForecast(place) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(roundCoord(place.lat)));
  url.searchParams.set("longitude", String(roundCoord(place.lon)));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  const response = await fetch(url, FETCH_OPTIONS);
  if (!response.ok) throw new Error(`forecast answered ${response.status}`);
  return response.json();
}

function renderWeather(entry, stale = false) {
  const { place, data } = entry;
  const now = data.current;
  const [desc, dayIcon, nightIcon] = wmo(now.weather_code);

  iconSvg(wxIconEl, now.is_day === 0 && nightIcon ? nightIcon : dayIcon);
  wxTempEl.textContent = deg(now.temperature_2m);
  setPlaceLabel(place.name);
  wxPlaceEl.title = `${place.name}${place.country ? `, ${place.country}` : ""}\nClick to change location`;
  wxDescEl.textContent = desc;

  const updated = formatTime(entry.at);
  weatherEl.title =
    `Feels like ${deg(now.apparent_temperature)}\n` +
    `Wind ${wind(now.wind_speed_10m)}, humidity ${now.relative_humidity_2m}%\n` +
    `Updated at ${updated}${stale ? ", offline" : ""}. Data by Open-Meteo`;
  weatherState = { place, at: entry.at, stale };
  wxCreditEl.hidden = false;
  weatherEl.classList.remove("no-data", "pending");

  const d = data.daily;
  const items = d.time.map((iso, i) => {
    const date = dayDate(iso);
    const [dayDesc, icon] = wmo(d.weather_code[i]);
    const li = document.createElement("li");
    li.className = "wx-day" + (i === 0 ? " today" : "");

    const name = document.createElement("span");
    name.className = "wx-name";
    name.textContent = shortDayFmt.format(date).replace(".", "");

    const temps = document.createElement("span");
    temps.className = "wx-temps";
    const hi = document.createElement("b");
    hi.textContent = deg(d.temperature_2m_max[i]);
    const lo = document.createElement("i");
    lo.textContent = deg(d.temperature_2m_min[i]);
    temps.append(hi, lo);

    // Chance of precipitation shows only when it matters, its space is always kept.
    const rain = document.createElement("span");
    rain.className = "wx-rain";
    const chance = d.precipitation_probability_max[i];
    rain.textContent = chance >= 20 ? `${chance}%` : "";

    li.title =
      `${longDayFmt.format(date)}\n${dayDesc}, ${deg(d.temperature_2m_min[i])}…${deg(d.temperature_2m_max[i])}\n` +
      `Precipitation: ${chance ?? 0}%, ${d.precipitation_sum[i] ?? 0} mm\nWind up to ${wind(d.wind_speed_10m_max[i])}`;
    li.append(name, makeIcon(icon), temps, rain);
    return li;
  });
  wxDaysEl.replaceChildren(...items);
  weatherEl.classList.toggle("stale", stale);
  weatherEl.classList.add("ready");
  announceWeather();
}

// What the weather shows now, for the Settings panel.
let weatherState = null;

function announceWeather() {
  document.dispatchEvent(new Event("mutemark:weather"));
}

// Place name with a pin, which hints that the place can be changed.
// Without a forecast the large icon is already a pin, so the small one is left out.
function setPlaceLabel(text, pin = true) {
  const label = document.createElement("span");
  label.textContent = text;
  wxPlaceEl.replaceChildren(...(pin ? [makeIcon("map-pin")] : []), label);
}

// No forecast to show: the caption names the place (or just "Weather"),
// the large line says why, and a click on it opens the place field.
function renderNoWeather(caption, line) {
  iconSvg(wxIconEl, "map-pin");
  wxTempEl.textContent = line;
  weatherEl.classList.remove("pending");
  weatherEl.classList.add("no-data");
  setPlaceLabel(caption, false);
  wxPlaceEl.title = "Click to choose a location";
  wxDescEl.textContent = "";
  wxDaysEl.replaceChildren();
  wxCreditEl.hidden = true;
  weatherEl.title = "";
  weatherEl.classList.remove("stale");
  weatherEl.classList.add("ready");
  weatherState = { place: currentPlace(), at: null };
  announceWeather();
}

async function refreshWeather(force = false) {
  clearTimeout(wxTimer);
  if (!settings.weather) return;
  const cached = readJson(WEATHER_KEY);
  const fresh = cached && Date.now() - cached.at < REFRESH_MINUTES * 60000;
  try {
    const place = currentPlace();
    if (!place) {
      renderNoWeather("Weather", "Choose a place");
      return;
    }
    // Firefox: location sharing was turned off in the add-on settings. Nothing is sent.
    await locationConsent.ready;
    if (locationConsent.needed && !locationConsent.granted) {
      renderNoWeather(place.name, "Location sharing is off");
      return;
    }
    const samePlace = roundCoord(cached?.place?.lat) === place.lat && roundCoord(cached?.place?.lon) === place.lon;
    if (!force && fresh && samePlace) {
      renderWeather(cached);
    } else {
      const entry = { place, data: await fetchForecast(place), at: Date.now() };
      writeJson(WEATHER_KEY, entry);
      renderWeather(entry);
    }
  } catch (error) {
    console.warn("weather:", error);
    // The saved forecast is shown only for the place that is chosen now, never for an earlier one.
    const place = currentPlace();
    const same = cached && place &&
      roundCoord(cached.place?.lat) === place.lat && roundCoord(cached.place?.lon) === place.lon;
    if (same) renderWeather(cached, true);
    else renderNoWeather(place?.name ?? "Weather", "Unavailable");
  }
  // Weather may have been turned off while the request was on its way.
  if (!settings.weather) return;
  wxTimer = setTimeout(refreshWeather, REFRESH_MINUTES * 60000);
}

/* Changing the place */

const wxSuggestEl = document.getElementById("wx-suggest");

function openCityInput() {
  wxCityEl.value = currentPlace()?.name ?? "";
  wxCityEl.placeholder = "City or 51.51, -0.13";
  wxPlaceEl.hidden = true;
  wxCityEl.hidden = false;
  wxCityEl.focus();
  wxCityEl.select();
}

function closeCityInput() {
  wxCityEl.hidden = true;
  wxPlaceEl.hidden = false;
  headerPicker.hideList();
  if (wxDescEl.dataset.saved !== undefined) {
    wxDescEl.textContent = wxDescEl.dataset.saved;
    delete wxDescEl.dataset.saved;
  }
}

async function choosePlace(place) {
  writeJson(PLACE_KEY, { ...place, lat: roundCoord(place.lat), lon: roundCoord(place.lon) });
  closeCityInput();
  await refreshWeather(true);
}

// Forgets the place and its forecast. Nothing is requested until a place is chosen again.
function forgetPlace() {
  try {
    localStorage.removeItem(PLACE_KEY);
    localStorage.removeItem(WEATHER_KEY);
  } catch {}
  refreshWeather(true);
}

// The place field in the weather caption, with a list of matches. Options:
//   reopen() brings the field back if the browser's consent prompt closed it,
//   onChosen(place) runs after a place was chosen,
//   onEscape() runs on Escape when no list is open,
//   onNote(text) shows a short message next to the field while it keeps its text.
function placePicker(input, list, { reopen = () => {}, onChosen = () => {}, onEscape = () => {}, onNote = () => {} } = {}) {
  let suggested = [];

  function hideList() {
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
  }

  async function choose(place) {
    hideList();
    await choosePlace(place);
    onChosen(place);
  }

  function showList(places) {
    list.replaceChildren(...places.map((place, i) => {
      const item = document.createElement("li");
      item.setAttribute("role", "presentation");
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("role", "option");
      button.className = i === 0 ? "current" : "";
      const name = document.createElement("b");
      name.textContent = place.name;
      const where = document.createElement("span");
      where.textContent = place.country;
      button.append(name, where);
      // mousedown, not click: otherwise the field loses focus and the list closes first.
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(place);
      });
      item.append(button);
      return item;
    }));
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function move(step) {
    const buttons = [...list.querySelectorAll("button")];
    if (!buttons.length) return;
    const i = buttons.findIndex((b) => b.classList.contains("current"));
    buttons[i]?.classList.remove("current");
    buttons[(i + step + buttons.length) % buttons.length].classList.add("current");
  }

  function say(text) {
    input.value = "";
    input.placeholder = text;
  }

  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Matching places");

  input.addEventListener("input", () => {
    suggested = [];
    hideList();
    onNote("");
  });

  input.addEventListener("keydown", async (event) => {
    // Keys typed here do not start a bookmark search.
    event.stopPropagation();
    if (event.key === "Escape") {
      if (!list.hidden) {
        // Only the list closes, not the field or the Settings panel.
        event.preventDefault();
        hideList();
      } else {
        onEscape(event);
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // The list is already shown: Enter takes the highlighted match.
      if (suggested.length && !list.hidden) {
        const i = [...list.querySelectorAll("button")].findIndex((b) => b.classList.contains("current"));
        await choose(suggested[Math.max(0, i)]);
        return;
      }
      // Read and, if it is a name, sent with plain digits, see plainDigits().
      const text = plainDigits(input.value).trim();
      // An empty field forgets the place and its forecast.
      if (!text) {
        if (currentPlace()) forgetPlace();
        input.blur();
        return;
      }
      // Firefox: whether consent is needed is read at startup, asynchronously. Until it
      // is known nothing is sent. If it turns out no consent is needed, the search goes on.
      // If it is needed, the browser only asks inside a key press, so the user presses Enter again.
      if (!locationConsent.settled) {
        await locationConsent.ready;
        if (locationConsent.needed && !locationConsent.granted) {
          onNote("Press Enter again to search");
          return;
        }
      }
      // Firefox asks the user first, because the typed name and then the coordinates
      // leave the browser. The request must start here, inside the key press, before any await.
      if (!(await requestLocationConsent())) {
        reopen();
        say("Location sharing not allowed");
        return;
      }
      // The browser's prompt may have taken the focus and closed the field: bring it back.
      reopen(text);
      const coords = parseCoords(text);
      if (coords) {
        await choose(coords);
        return;
      }
      if (looksLikeCoords(text)) {
        say(COORDS_HINT);
        return;
      }
      try {
        suggested = await geocode(text);
      } catch {
        suggested = [];
        say("Offline");
        return;
      }
      // Even a single match is shown first: a postcode or a short name may exist in
      // several countries, and the geocoder may know only another one. Enter takes it.
      if (!suggested.length) say("Not found, try another name");
      else showList(suggested);
    }
  });

  return { hideList };
}

const headerPicker = placePicker(wxCityEl, wxSuggestEl, {
  reopen(text) {
    if (!wxCityEl.hidden) return;
    openCityInput();
    if (text) wxCityEl.value = text;
  },
  onEscape: () => wxCityEl.blur(),
  // The note takes the place of the condition in the caption until the field closes.
  onNote: (text) => {
    if (text && wxDescEl.dataset.saved === undefined) wxDescEl.dataset.saved = wxDescEl.textContent;
    wxDescEl.textContent = text || (wxDescEl.dataset.saved ?? wxDescEl.textContent);
    if (!text) delete wxDescEl.dataset.saved;
  },
});

wxPlaceEl.addEventListener("click", openCityInput);
wxNowEl.addEventListener("click", () => {
  if (weatherEl.classList.contains("no-data")) openCityInput();
});
wxCityEl.addEventListener("blur", closeCityInput);

// Back to a tab that sat in the background: refresh if the forecast is old.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !settings.weather) return;
  const cached = readJson(WEATHER_KEY);
  if (!cached || Date.now() - cached.at >= REFRESH_MINUTES * 60000) refreshWeather();
});

// Firefox: location sharing switched in the add-on settings. platform.js updates the state
// first (its listener was added earlier), then the weather is redrawn.
for (const name of ["onAdded", "onRemoved"]) {
  api?.permissions?.[name]?.addListener(() => locationConsent.ready.then(() => refreshWeather()));
}

// Turned on or off with its button, or other units or clock in Settings. Units are converted
// from the saved forecast, so nothing is requested for them.
function applyWeatherSetting() {
  weatherEl.hidden = !settings.weather;
  if (!settings.weather) {
    clearTimeout(wxTimer);
    closeCityInput();
  }
}

document.addEventListener("mutemark:settings", ({ detail }) => {
  const { changed } = detail;
  if (changed.includes("weather")) {
    applyWeatherSetting();
    if (settings.weather) refreshWeather();
  } else if (["tempUnit", "windUnit", "clock"].some((key) => changed.includes(key))) {
    const cached = readJson(WEATHER_KEY);
    if (cached && weatherEl.classList.contains("ready") && wxCreditEl.hidden === false) {
      renderWeather(cached, weatherEl.classList.contains("stale"));
    }
  }
});

// A place is chosen but no forecast is saved yet: the tile is laid out with a stand-in
// forecast, kept invisible, so it already has its final size when the cards are placed.
function renderPending(place) {
  const day = new Date();
  const days = Array.from({ length: FORECAST_DAYS }, (_, i) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate() + i, 12).toISOString().slice(0, 10));
  const zero = (n) => Array(FORECAST_DAYS).fill(n);
  renderWeather({
    place,
    at: Date.now(),
    data: {
      current: { temperature_2m: 10, apparent_temperature: 10, weather_code: 3, is_day: 1, wind_speed_10m: 0, relative_humidity_2m: 0 },
      daily: { time: days, weather_code: zero(3), temperature_2m_max: zero(10), temperature_2m_min: zero(10),
        precipitation_probability_max: zero(0), precipitation_sum: zero(0), wind_speed_10m_max: zero(0) },
    },
  });
  weatherEl.classList.add("pending");
  weatherEl.title = "";
  wxDescEl.textContent = "";
  weatherState = { place, at: null };
  announceWeather();
}

// The saved forecast is drawn at once, before the network answers and before bookmarks.
applyWeatherSetting();
if (settings.weather) {
  const cached = readJson(WEATHER_KEY);
  if (cached) renderWeather(cached);
  else if (currentPlace()) renderPending(currentPlace());
  refreshWeather();
}
