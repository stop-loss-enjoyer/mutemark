// Widgets in the header and the widget bar that turns them on and off.
// Clock, calendar, world clocks, a note and a timer. None of them uses the network:
// time comes from the computer, time zones from the browser (Intl), and the note
// and the timer are kept in localStorage. The weather lives in weather.js, its button
// here only switches settings.weather.
// Which widgets are on is in settings (settings.js). The header changes height when
// one is turned on or off, and newtab.js lays the cards out again on that settings event.
// Loaded before newtab.js, so the header is complete when the cards are first measured.

(() => {
  const NOTE_KEY = "mutemark-note";
  const TIMER_KEY = "mutemark-timer";
  const TIMER_DEFAULT_MIN = 25;
  // Longest timer, in minutes.
  const TIMER_MAX_MIN = 24 * 60;
  // A finished timer stays lit this long, then quietly goes back to its set time.
  const DONE_SHOWN_MIN = 10;
  // How many time zones the search list shows at once.
  const ZONE_MATCHES = 8;

  const $ = (id) => document.getElementById(id);
  const headerEl = $("top");
  const tiles = {
    weather: $("weather"),
    clock: $("w-clock"),
    calendar: $("w-calendar"),
    world: $("w-world"),
    note: $("w-note"),
    timer: $("w-timer"),
  };
  const barButtons = [...document.querySelectorAll(".bar-btn[data-widget]")];

  // Icons named in the markup (data-icon) are drawn once, here.
  for (const svg of document.querySelectorAll("svg[data-icon]")) iconSvg(svg, svg.dataset.icon);

  function isOn(name) {
    return name === "weather" ? settings.weather : settings.widgets.includes(name);
  }

  function toggleWidget(name) {
    if (name === "weather") {
      saveSettings({ weather: !settings.weather });
      return;
    }
    const on = new Set(settings.widgets);
    if (on.has(name)) on.delete(name);
    else on.add(name);
    saveSettings({ widgets: WIDGETS.filter((w) => on.has(w)) });
  }

  for (const button of barButtons) {
    button.addEventListener("click", () => toggleWidget(button.dataset.widget));
  }

  // Shows the widgets that are on and marks their buttons. The weather tile itself
  // is shown and hidden by weather.js.
  function applyWidgets() {
    for (const button of barButtons) {
      button.setAttribute("aria-pressed", String(isOn(button.dataset.widget)));
    }
    for (const name of WIDGETS) tiles[name].hidden = !isOn(name);
    document.body.classList.toggle("no-widgets", !Object.keys(tiles).some(isOn));
    renderClock();
    renderCalendar();
    renderZones();
    if (!isOn("world")) closeZonePick();
    syncTimerTick();
  }

  // Keys typed into the widget fields stay there: they neither start a bookmark search
  // nor undo a deleted bookmark (newtab.js listens on the document). Escape leaves the field.
  headerEl.addEventListener("keydown", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement) || !field.matches("textarea, input")) return;
    event.stopPropagation();
    if (event.key === "Escape" && !event.defaultPrevented) field.blur();
  });

  /* Time */

  // The options come from timeOptions() in weather.js, shared with the weather.
  const timeFormats = new Map();
  function timeFormat(timeZone) {
    const options = timeOptions();
    const key = `${options.hourCycle} ${timeZone ?? ""}`;
    if (!timeFormats.has(key)) {
      timeFormats.set(key, new Intl.DateTimeFormat(DATE_LOCALE, { ...options, ...(timeZone ? { timeZone } : {}) }));
    }
    return timeFormats.get(key);
  }

  // "2:05" and "PM" apart, so the day period can be set smaller.
  function timeParts(date, timeZone) {
    const parts = timeFormat(timeZone).formatToParts(date);
    const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
    const time = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim();
    return { time, period };
  }

  /* Clock */

  const clockTimeEl = $("clock-time");
  const clockAmpmEl = $("clock-ampm");
  const clockDateEl = $("clock-date");

  function renderClock() {
    if (!isOn("clock")) return;
    const now = new Date();
    const { time, period } = timeParts(now);
    clockTimeEl.textContent = time;
    clockAmpmEl.textContent = period;
    clockDateEl.textContent = longDayFmt.format(now);
  }

  // One tick at the start of each minute for the clock, the world clocks and,
  // at midnight, the calendar. Timers sleep in a hidden tab, so it is redone on return.
  let minuteTimer = 0;
  let shownDay = new Date().toDateString();
  function minuteTick() {
    clearTimeout(minuteTimer);
    renderClock();
    renderZones();
    const today = new Date().toDateString();
    if (today !== shownDay) {
      shownDay = today;
      calMonth = null;
      renderCalendar();
    }
    const now = Date.now();
    minuteTimer = setTimeout(minuteTick, 60000 - (now % 60000) + 50);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      minuteTick();
      renderTimer();
      syncNote();
    }
  });

  /* Calendar */

  const calMonthEl = $("cal-month");
  const calGridEl = $("cal-grid");
  // The month shown as { y, m }, null for the current one.
  let calMonth = null;

  // First day of the week from the browser's locale where it says, Monday otherwise.
  const WEEK_START = (() => {
    try {
      const locale = new Intl.Locale(navigator.language || "en-GB");
      const info = locale.getWeekInfo?.() ?? locale.weekInfo;
      if (info?.firstDay) return info.firstDay % 7;
    } catch {}
    return 1;
  })();

  const monthFmt = new Intl.DateTimeFormat(DATE_LOCALE, { month: "long", year: "numeric" });
  const narrowDayFmt = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "narrow" });
  const fullDayFmt = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Always six weeks, so the header keeps its height from month to month.
  function renderCalendar() {
    if (!isOn("calendar")) return;
    const today = new Date();
    const { y, m } = calMonth ?? { y: today.getFullYear(), m: today.getMonth() };
    const first = new Date(y, m, 1);
    calMonthEl.textContent = monthFmt.format(first);
    calMonthEl.disabled = !calMonth;
    calGridEl.setAttribute("aria-label", monthFmt.format(first));

    const head = document.createElement("tr");
    for (let i = 0; i < 7; i++) {
      const th = document.createElement("th");
      th.scope = "col";
      // 4 January 1970 was a Sunday.
      const day = new Date(1970, 0, 4 + ((WEEK_START + i) % 7));
      th.textContent = narrowDayFmt.format(day);
      th.title = shortDayFmt.format(day);
      head.append(th);
    }
    const thead = document.createElement("thead");
    thead.append(head);

    const tbody = document.createElement("tbody");
    const offset = (first.getDay() - WEEK_START + 7) % 7;
    for (let week = 0; week < 6; week++) {
      const row = document.createElement("tr");
      for (let i = 0; i < 7; i++) {
        const date = new Date(y, m, 1 - offset + week * 7 + i);
        const td = document.createElement("td");
        td.textContent = String(date.getDate());
        if (date.getMonth() !== m) td.className = "out";
        if (date.toDateString() === today.toDateString()) {
          td.classList.add("today");
          td.setAttribute("aria-current", "date");
        }
        td.title = fullDayFmt.format(date);
        row.append(td);
      }
      tbody.append(row);
    }
    calGridEl.replaceChildren(thead, tbody);
  }

  function shiftMonth(step) {
    const today = new Date();
    const { y, m } = calMonth ?? { y: today.getFullYear(), m: today.getMonth() };
    const next = new Date(y, m + step, 1);
    calMonth = next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth()
      ? null : { y: next.getFullYear(), m: next.getMonth() };
    renderCalendar();
  }

  $("cal-prev").addEventListener("click", () => shiftMonth(-1));
  $("cal-next").addEventListener("click", () => shiftMonth(1));
  calMonthEl.addEventListener("click", () => {
    calMonth = null;
    renderCalendar();
  });

  /* World clocks */

  const zonesEl = $("zones");
  const zoneAddEl = $("zone-add");
  const zonePickEl = $("zone-pick");
  const zoneFindEl = $("zone-find");
  const zoneListEl = $("zone-list");

  // The browser's own list of time zones. Chromium leaves UTC out of it.
  let allZones = null;
  function zoneList() {
    if (!allZones) {
      let list = [];
      try {
        list = Intl.supportedValuesOf("timeZone");
      } catch {}
      allZones = [...new Set(["UTC", ...list])].filter(isTimeZone);
    }
    return allZones;
  }

  // "America/Argentina/Buenos_Aires" is "Buenos Aires" in "America/Argentina".
  function zoneCity(zone) {
    const parts = zone.split("/");
    return parts.pop().replace(/_/g, " ");
  }

  function zoneRegion(zone) {
    return zone.split("/").slice(0, -1).join(" / ").replace(/_/g, " ");
  }

  // Offset from UTC in minutes at a moment, from "GMT+05:30".
  function zoneOffset(zone, date) {
    try {
      const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
        .formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";
      const m = name.match(/([+\-−])(\d{1,2})(?::(\d{2}))?/);
      if (!m) return 0;
      const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
      return m[1] === "+" ? minutes : -minutes;
    } catch {
      return 0;
    }
  }

  // "+3h", "−5:30h", "same time". A real minus sign, like the temperatures.
  function offsetText(minutes) {
    if (minutes === 0) return "same time";
    const sign = minutes > 0 ? "+" : "−";
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}h`;
  }

  function gmtText(minutes) {
    if (minutes === 0) return "UTC";
    return `UTC${offsetText(minutes).replace(/h$/, "")}`;
  }

  function renderZones() {
    if (!isOn("world")) return;
    const now = new Date();
    const local = -now.getTimezoneOffset();
    const rows = settings.zones.map((zone) => {
      const li = document.createElement("li");
      const city = document.createElement("span");
      city.className = "z-city";
      city.textContent = zoneCity(zone);
      city.title = zone.replace(/_/g, " ");
      const { time, period } = timeParts(now, zone);
      const clock = document.createElement("span");
      clock.className = "z-time";
      clock.textContent = time;
      if (period) {
        const small = document.createElement("small");
        small.textContent = period;
        clock.append(small);
      }
      const diff = document.createElement("span");
      diff.className = "z-diff";
      diff.textContent = offsetText(zoneOffset(zone, now) - local);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "z-del";
      remove.title = `Remove ${zoneCity(zone)}`;
      remove.setAttribute("aria-label", `Remove ${zoneCity(zone)}`);
      remove.append(makeIcon("x"));
      remove.addEventListener("click", () => {
        saveSettings({ zones: settings.zones.filter((z) => z !== zone) });
        zoneAddEl.focus();
      });
      li.append(city, clock, diff, remove);
      return li;
    });
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "z-empty";
      li.textContent = "Add a city with +";
      rows.push(li);
    }
    zonesEl.replaceChildren(...rows);
    const full = settings.zones.length >= MAX_ZONES;
    zoneAddEl.disabled = full;
    zoneAddEl.title = full ? "Up to three cities" : "Add a city";
  }

  let zoneMatches = [];
  let zoneCurrent = 0;

  function openZonePick() {
    zonePickEl.hidden = false;
    zoneAddEl.setAttribute("aria-expanded", "true");
    zoneFindEl.value = "";
    showZoneMatches();
    zoneFindEl.focus();
  }

  function closeZonePick() {
    if (zonePickEl.hidden) return;
    zonePickEl.hidden = true;
    zoneAddEl.setAttribute("aria-expanded", "false");
    zoneFindEl.setAttribute("aria-expanded", "false");
  }

  function showZoneMatches() {
    const query = zoneFindEl.value.trim().toLowerCase().replace(/[_/]/g, " ").replace(/\s+/g, " ");
    const taken = new Set(settings.zones);
    const words = query.split(" ").filter(Boolean);
    const scored = [];
    for (const zone of zoneList()) {
      if (taken.has(zone)) continue;
      const city = zoneCity(zone).toLowerCase();
      const name = zone.toLowerCase().replace(/[_/]/g, " ");
      if (!words.every((w) => name.includes(w))) continue;
      // Cities that start with the query first, then the rest in list order.
      scored.push([query && city.startsWith(query) ? 0 : 1, zone]);
      if (!query && scored.length >= ZONE_MATCHES) break;
    }
    scored.sort((a, b) => a[0] - b[0]);
    zoneMatches = scored.slice(0, ZONE_MATCHES).map(([, zone]) => zone);
    zoneCurrent = 0;
    const now = new Date();
    const items = zoneMatches.map((zone, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = `zone-opt-${i}`;
      li.className = i === 0 ? "current" : "";
      const city = document.createElement("b");
      city.textContent = zoneCity(zone);
      const region = document.createElement("span");
      region.textContent = [zoneRegion(zone), gmtText(zoneOffset(zone, now))].filter(Boolean).join(" · ");
      li.append(city, region);
      // mousedown, not click: otherwise the field loses focus first.
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        addZone(zone);
      });
      return li;
    });
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = "No such time zone";
      items.push(li);
    }
    zoneListEl.replaceChildren(...items);
    zoneFindEl.setAttribute("aria-expanded", String(zoneMatches.length > 0));
    markZone();
  }

  function markZone() {
    [...zoneListEl.children].forEach((li, i) => li.classList.toggle("current", i === zoneCurrent && zoneMatches.length > 0));
    if (zoneMatches.length) zoneFindEl.setAttribute("aria-activedescendant", `zone-opt-${zoneCurrent}`);
    else zoneFindEl.removeAttribute("aria-activedescendant");
  }

  function addZone(zone) {
    if (settings.zones.length < MAX_ZONES && !settings.zones.includes(zone)) {
      saveSettings({ zones: [...settings.zones, zone] });
    }
    closeZonePick();
    zoneAddEl.focus();
  }

  zoneAddEl.addEventListener("click", () => {
    if (zonePickEl.hidden) openZonePick();
    else closeZonePick();
  });

  zoneFindEl.addEventListener("input", showZoneMatches);
  zoneFindEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!zoneMatches.length) return;
      zoneCurrent = (zoneCurrent + (event.key === "ArrowDown" ? 1 : -1) + zoneMatches.length) % zoneMatches.length;
      markZone();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (zoneMatches[zoneCurrent]) addZone(zoneMatches[zoneCurrent]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeZonePick();
      zoneAddEl.focus();
    }
  });
  zoneFindEl.addEventListener("blur", () => setTimeout(() => {
    if (!zonePickEl.contains(document.activeElement)) closeZonePick();
  }, 120));

  /* Note */

  const noteEl = $("note-text");

  function readNote() {
    try {
      return localStorage.getItem(NOTE_KEY) ?? "";
    } catch {
      return "";
    }
  }

  // The text this tab last read or wrote. While the field still holds it, the user has not
  // typed here since, so a change made in another tab can safely replace it.
  let noteSynced = readNote();
  noteEl.value = noteSynced;

  function syncNote() {
    const remote = readNote();
    if (remote === noteSynced) return;
    if (document.activeElement !== noteEl || noteEl.value === noteSynced) {
      noteEl.value = remote;
      noteSynced = remote;
    }
  }

  noteEl.addEventListener("input", () => {
    noteSynced = noteEl.value;
    try {
      if (noteEl.value) localStorage.setItem(NOTE_KEY, noteEl.value);
      else localStorage.removeItem(NOTE_KEY);
    } catch {}
  });

  /* Timer */

  const timerEl = tiles.timer;
  const timerLeftEl = $("timer-left");
  const timerGoEl = $("timer-go");
  const timerOwnEl = $("timer-own");

  // { total, left, end, rung }: the set time and what is left, both in ms; end is the moment
  // it reaches zero while running (null when stopped); rung once the sound was played.
  // An end time rather than counting ticks: hidden tabs slow their timers down.
  function readTimer() {
    let state = null;
    try {
      state = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    } catch {}
    const valid = (n) => Number.isFinite(n) && n >= 0 && n <= TIMER_MAX_MIN * 60000;
    if (!state || !valid(state.total) || !valid(state.left) || !(state.end === null || Number.isFinite(state.end))) {
      const total = TIMER_DEFAULT_MIN * 60000;
      return { total, left: total, end: null, rung: false };
    }
    return { total: state.total, left: state.left, end: state.end, rung: Boolean(state.rung) };
  }

  let timer = readTimer();

  function writeTimer() {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    } catch {}
  }

  function remaining() {
    return timer.end === null ? timer.left : Math.max(0, timer.end - Date.now());
  }

  function clockText(ms) {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function setGoIcon(name, label) {
    iconSvg(timerGoEl.querySelector("svg"), name);
    timerGoEl.title = label;
    timerGoEl.setAttribute("aria-label", label);
  }

  function renderTimer() {
    if (timer.end !== null && Date.now() - timer.end > DONE_SHOWN_MIN * 60000) {
      timer = { ...timer, left: timer.total, end: null, rung: false };
      writeTimer();
    }
    const running = timer.end !== null;
    const left = remaining();
    const done = running && left <= 0;
    timerLeftEl.textContent = clockText(left);
    timerEl.classList.toggle("running", running && !done);
    timerEl.classList.toggle("done", done);
    timerEl.classList.toggle("paused", !running && timer.left < timer.total);
    if (running && !done) setGoIcon("pause", "Pause");
    else setGoIcon("play", done ? "Start again" : "Start");
    for (const preset of timerEl.querySelectorAll(".timer-preset")) {
      preset.classList.toggle("chosen", Number(preset.dataset.min) * 60000 === timer.total);
    }
    if (done && !timer.rung) ring();
  }

  let timerTick = 0;
  function syncTimerTick() {
    clearInterval(timerTick);
    timerTick = 0;
    renderTimer();
    // It runs while a countdown is going, also with the widget hidden: the end still rings.
    if (timer.end !== null && remaining() > 0) {
      timerTick = setInterval(() => {
        renderTimer();
        if (remaining() <= 0) syncTimerTick();
      }, 250);
    }
  }

  function startTimer() {
    if (timer.end !== null && remaining() <= 0) timer.left = timer.total;
    if (timer.left <= 0) timer.left = timer.total;
    timer.end = Date.now() + timer.left;
    timer.rung = false;
    wakeAudio();
    writeTimer();
    syncTimerTick();
  }

  function pauseTimer() {
    timer.left = remaining();
    timer.end = null;
    writeTimer();
    syncTimerTick();
  }

  function resetTimer() {
    timer.left = timer.total;
    timer.end = null;
    timer.rung = false;
    writeTimer();
    syncTimerTick();
  }

  function setTimer(ms) {
    timer.total = ms;
    timer.left = ms;
    timer.end = null;
    startTimer();
  }

  timerGoEl.addEventListener("click", () => {
    if (timer.end !== null && remaining() > 0) pauseTimer();
    else startTimer();
  });
  $("timer-reset").addEventListener("click", resetTimer);
  for (const preset of timerEl.querySelectorAll(".timer-preset")) {
    preset.addEventListener("click", () => setTimer(Number(preset.dataset.min) * 60000));
  }

  // "10" is ten minutes, "1:30" a minute and a half.
  function parseOwnTime(text) {
    const m = text.trim().match(/^(\d{1,4})(?::([0-5]?\d))?$/);
    if (!m) return null;
    const ms = (Number(m[1]) * 60 + Number(m[2] ?? 0)) * 1000;
    return ms > 0 && ms <= TIMER_MAX_MIN * 60000 ? ms : null;
  }

  timerOwnEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const ms = parseOwnTime(timerOwnEl.value);
    timerOwnEl.classList.toggle("error", ms === null);
    if (ms === null) return;
    timerOwnEl.value = "";
    timerOwnEl.blur();
    setTimer(ms);
  });
  timerOwnEl.addEventListener("input", () => timerOwnEl.classList.remove("error"));

  // Another tab started, paused or reset the timer.
  window.addEventListener("storage", (event) => {
    if (event.key === TIMER_KEY || event.key === null) {
      timer = readTimer();
      syncTimerTick();
    }
    if (event.key === NOTE_KEY || event.key === null) {
      syncNote();
    }
  });

  // A single loud bell strike, made in the page with WebAudio: no file, no notification,
  // no permission. The audio context is made inside the Start click, as browsers
  // only let a page play sound after the user did something on it.
  // The timer lives in this page only: no alarms, notifications or background scripts,
  // so a closed tab does not ring.
  let audio = null;

  function wakeAudio() {
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") audio.resume();
    } catch {
      audio = null;
    }
  }

  // The partials of a struck bell are not whole multiples of one pitch, which is what makes
  // it a bell and not an organ: [ratio to the pitch, loudness, seconds to die away].
  const BELL_PITCH = 660;
  const BELL_PARTIALS = [[0.5, 0.5, 4.2], [1, 1, 4.0], [1.19, 0.6, 3.2], [1.71, 0.45, 2.4], [2.0, 0.55, 2.0],
    [2.74, 0.5, 1.5], [3.76, 0.3, 1.0], [5.4, 0.2, 0.6]];
  // Master level. The partials are scaled so that even if all
  // peaked together the sum stays near 0.7 of full scale: no clipping.
  const BELL_GAIN = 0.6;

  function strikeBell(context, destination, start) {
    const total = BELL_PARTIALS.reduce((sum, [, level]) => sum + level, 0);
    const out = context.createGain();
    out.gain.value = BELL_GAIN;
    out.connect(destination);
    for (const [ratio, level, decay] of BELL_PARTIALS) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = BELL_PITCH * ratio;
      // Fast attack, then a long fall to silence; the higher the partial, the sooner.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level / (total * 0.85), start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + decay + 0.05);
    }
  }

  function ring() {
    // Several new tabs may be open: the first one that can play sound rings, the others only show it.
    // A tab nobody clicked in keeps its audio suspended, so it leaves the ring to a tab that can.
    timer.rung = true;
    wakeAudio();
    if (!audio) return;
    const play = () => {
      const stored = readTimer();
      if (stored.rung && stored.end === timer.end) return;
      writeTimer();
      strikeBell(audio, audio.destination, audio.currentTime + 0.05);
    };
    if (audio.state === "running") play();
    else audio.resume().then(() => { if (audio.state === "running") play(); }, () => {});
  }

  /* Settings */

  document.addEventListener("mutemark:settings", ({ detail }) => {
    const { changed } = detail;
    if (["widgets", "weather"].some((key) => changed.includes(key))) applyWidgets();
    if (changed.includes("clock")) {
      renderClock();
      renderZones();
    }
    if (changed.includes("zones")) renderZones();
  });

  applyWidgets();
  minuteTick();
  // The buttons are drawn as they are first, transitions come after (widgets.css).
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(".bar")?.classList.add("settled")));
})();
