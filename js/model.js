/* urNotes · Modelul calendarului și logica purtării/modulelor.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== CALENDAR: MODEL ==================== */
/*
 * Un eveniment e salvat o singură dată, la data lui de început (state.calendar[data] = [...]).
 * Câmpuri opționale:
 *   repeat:    { every: 1|2 (săptămâni), until: "YYYY-MM-DD" | "" }
 *   doneDates: { "YYYY-MM-DD": true }    — apariții marcate ca făcute
 *   skipDates: ["YYYY-MM-DD", ...]       — apariții șterse/mutate dintr-o serie
 * O notă adăugată dintr-un test păstrează legătura: grade.eventId + grade.eventDate.
 * „Făcut” = bifat SAU are notă legată. Nota rămâne sursa de adevăr: dacă o ștergi, testul redevine nefinalizat.
 */
const DAY_MS = 86400000;
const WEEKDAY_SHORT = ["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"];
const WEEKDAY_LONG = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
const MONTH_SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
const TIMETABLE_DAYS = [1, 2, 3, 4, 5];
const TIMETABLE_MAX = 10;
const GRADE_TYPE_FOR_EVENT = { Test: "Test", Examen: "Teză", Temă: "Temă", Proiect: "Proiect", Prezentare: "Altele" };
const NEEDS_GRADE = new Set(["Test", "Examen", "Proiect", "Prezentare"]);
const EVENT_TYPE_CLASS = { Test: "test", Examen: "examen", Temă: "tema", Proiect: "proiect", Prezentare: "prezentare", Personal: "personal" };
const EVENT_TYPE_ICON = { Test: "note", Examen: "graduation", Temă: "book", Proiect: "shapes", Prezentare: "mic", Personal: "pin" };

function addDays(dateKey, n) {
    const d = parseDateKey(dateKey);
    d.setDate(d.getDate() + n);
    return getLocalDateKey(d);
}

function daysBetween(a, b) {
    return Math.round((parseDateKey(b) - parseDateKey(a)) / DAY_MS);
}

/** Lunea săptămânii care conține data. */
function weekStart(dateKey) {
    return addDays(dateKey, -((parseDateKey(dateKey).getDay() + 6) % 7));
}

function shortDayLabel(dateKey) {
    const d = parseDateKey(dateKey);
    return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

function weekdayLabel(dateKey) {
    const d = parseDateKey(dateKey);
    return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/** „azi”, „mâine”, „ieri”, „în 3 zile”, „acum 5 zile”. */
function relativeDayLabel(dateKey) {
    const n = daysBetween(getLocalDateKey(), dateKey);
    if (n === 0) return "azi";
    if (n === 1) return "mâine";
    if (n === -1) return "ieri";
    return n > 0 ? `în ${plural(n, "zi", "zile")}` : `acum ${plural(-n, "zi", "zile")}`;
}

/** Cheia unei apariții: id-ul simplu pentru evenimente unice (compatibil cu datele vechi). */
function occurrenceKey(ev, date) {
    return ev.repeat ? `${ev.id}@${date}` : ev.id;
}

/** Datele la care apare un eveniment în intervalul [from, to]. */
function seriesDates(ev, start, from, to) {
    if (!ev.repeat) return start >= from && start <= to ? [start] : [];

    const step = 7 * ev.repeat.every;
    const end = ev.repeat.until && ev.repeat.until < to ? ev.repeat.until : to;
    const skip = new Set(ev.skipDates || []);
    const out = [];
    const firstIndex = Math.max(0, Math.ceil(daysBetween(start, from) / step));
    // Temele și testele care se repetă nu apar în vacanțe (cele personale da); prima apariție rămâne mereu
    const schoolOnly = ev.type !== "Personal";
    for (let date = addDays(start, firstIndex * step); date <= end && out.length < 500; date = addDays(date, step)) {
        if (skip.has(date)) continue;
        if (schoolOnly && date !== start && isHolidayDate(date)) continue;
        out.push(date);
    }
    return out;
}

/** Toate aparițiile din interval, sortate după dată și oră. */
function occurrencesBetween(from, to) {
    const out = [];
    for (const [start, events] of Object.entries(state.calendar)) {
        if (start > to) continue;
        events.forEach(ev => seriesDates(ev, start, from, to).forEach(date => {
            out.push({ ev, date, start, key: occurrenceKey(ev, date) });
        }));
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.ev.time || "").localeCompare(b.ev.time || ""));
}

function findEvent(id) {
    for (const [start, events] of Object.entries(state.calendar)) {
        const ev = events.find(e => e.id === id);
        if (ev) return { ev, start };
    }
    return null;
}

/** Notele legate de evenimente, indexate după „idEveniment|dată”. */
function gradeLinks() {
    const map = new Map();
    for (const [mat, sub] of Object.entries(state.subjects)) {
        sub.grades.forEach((grade, idx) => {
            if (grade.eventId) map.set(`${grade.eventId}|${grade.eventDate || grade.date || ""}`, { mat, idx, grade });
        });
    }
    return map;
}

function linkedGrade(links, ev, date) {
    return links.get(`${ev.id}|${date}`) || null;
}

function isOccurrenceDone(ev, date, links) {
    return Boolean(ev.doneDates?.[date]) || Boolean(linkedGrade(links, ev, date));
}

/** Se poate adăuga nota direct din eveniment: are materie, e evaluabil, a avut loc, nu are deja notă. */
function canGradeOccurrence(ev, date, links) {
    return Boolean(state.subjects[ev.subject]) && Boolean(GRADE_TYPE_FOR_EVENT[ev.type])
        && date <= getLocalDateKey() && !linkedGrade(links, ev, date);
}

/** Prima zi (după `after`) în care materia apare în orar. */
function nextLessonDate(mat, after = getLocalDateKey()) {
    // Întâi după calendarul școlar (sare peste vacanțe și zile libere); în afara anului școlar, doar după orar
    for (let i = 1; i <= 60; i++) {
        const date = addDays(after, i);
        if (lessonsOn(date).includes(mat)) return date;
    }
    for (let i = 1; i <= 14; i++) {
        const date = addDays(after, i);
        if ((state.timetable[parseDateKey(date).getDay()] || []).includes(mat)) return date;
    }
    return null;
}

/** Vacanță sau zi liberă legală (weekendul nu contează aici). */
function isHolidayDate(dateKey) {
    return Boolean(SCHOOL_HOLIDAYS[dateKey]) || !moduleAt(dateKey);
}

/** Numele scurt al materiei, pentru butoane mici (ex. „Limba și literatura română” → „Română”). */
const SUBJECT_SHORT = {
    "Limba și literatura română": "Română", "Educație fizică și sport": "Sport", "Educație fizică": "Sport",
    "Tehnologia informației și a comunicațiilor": "TIC", "Informatică și TIC": "Info & TIC",
    "Educație tehnologică și aplicații practice": "Ed. tehnologică", "Educație plastică": "Plastică",
    "Educație muzicală": "Muzică", "Educație socială": "Ed. socială", "Consiliere și dezvoltare personală": "Consiliere",
    "Limba și literatura maternă": "Maternă"
};
function shortSubjectName(mat) {
    if (SUBJECT_SHORT[mat]) return SUBJECT_SHORT[mat];
    const m = /^Limba (\S+)$/.exec(mat);
    return m ? m[1][0].toUpperCase() + m[1].slice(1) : mat;
}

function autoEventTitle(type, subject) {
    return subject ? `${type} ${subject}` : type;
}

function pruneTimetable() {
    for (const day of Object.keys(state.timetable)) {
        state.timetable[day] = state.timetable[day].filter(m => state.subjects[m]);
        if (state.timetable[day].length === 0) delete state.timetable[day];
    }
}

/* ==================== PURTARE (logică) ==================== */
function matchingModulePreset(list) {
    const key = l => JSON.stringify(l.slice(0, 4).concat({ start: l[4]?.start })); // ultima zi depinde de clasă
    const year = DATE_KEY_RE.test(list?.[0]?.start || "") ? schoolYearOfDate(list[0].start) : currentSchoolYear();
    return Object.keys(modulePresetsFor(year)).find(id => key(presetModules(id)) === key(list)) || "custom";
}

/** Întoarce un mesaj de eroare sau null dacă lista de module e validă. */
function validateModules(list) {
    if (!Array.isArray(list) || list.length !== 5) return "Sunt necesare exact 5 module.";
    for (let i = 0; i < 5; i++) {
        const m = list[i];
        const ok = d => typeof d === "string" && DATE_KEY_RE.test(d) && !Number.isNaN(parseDateKey(d).getTime());
        if (!isPlainObject(m) || !ok(m.start) || !ok(m.end)) return `Modulul ${i + 1}: completează ambele date.`;
        if (m.end < m.start) return `Modulul ${i + 1}: se termină înainte să înceapă.`;
        if (i > 0 && m.start <= list[i - 1].end) return `Modulul ${i + 1} trebuie să înceapă după sfârșitul Modulului ${i}.`;
    }
    if (daysBetween(list[0].start, list[4].end) > 400) return "Modulele trebuie să fie în același an școlar.";
    return null;
}

function sanitizeModules(raw) {
    const list = Array.isArray(raw) ? raw.map(m => (isPlainObject(m) ? { start: String(m.start || ""), end: String(m.end || "") } : null)) : null;
    return validateModules(list) ? presetModules() : list;
}

function defaultPurtare() {
    return { grades: {}, excludeFromGPA: false, lastModule: "" };
}

function sanitizePurtare(raw) {
    const p = defaultPurtare();
    if (!isPlainObject(raw)) return p;
    if (isPlainObject(raw.grades)) {
        for (const [key, g] of Object.entries(raw.grades)) {
            if (!PURTARE_KEY_RE.test(key) || !isPlainObject(g)) continue;
            const val = parseStrictInteger(g.val, 1, 10);
            if (val === null) continue;
            const reason = typeof g.reason === "string" ? g.reason.trim().slice(0, 120) : "";
            if (val !== 10 || reason) p.grades[key] = reason ? { val, reason } : { val };
        }
    }
    p.excludeFromGPA = raw.excludeFromGPA === true;
    p.lastModule = typeof raw.lastModule === "string" && PURTARE_KEY_RE.test(raw.lastModule) ? raw.lastModule : "";
    return p;
}

/** Situația purtării la o dată: modulele, modulul curent și media lor. */
function purtareInfo(today = getLocalDateKey()) {
    // regula (notele pe module și media) e comună cu serverul: shared/rules.js
    const { modules, avg } = URN_RULES.purtareSummary(state.settings.modules, state.purtare.grades, today);
    const started = modules.filter(m => m.status !== "upcoming");
    const current = modules.find(m => m.status === "current") || null;
    const lastDone = [...modules].reverse().find(m => m.status === "done") || null;
    const next = modules.find(m => m.status === "upcoming") || null;
    const shown = current || lastDone;

    return {
        modules,
        current,
        lastDone,
        next,
        started: started.length,
        avg,
        value: shown ? shown.val : 10,
        shown,
        yearOver: !current && !next
    };
}

function purtareTone(val) {
    return val >= 10 ? "ok" : val >= 6 ? "warn" : "danger";
}

/** La purtare, orice notă sub 10 e o scădere: o colorăm ca atare (nu cu scala notelor obișnuite). */
function purtareGradeClass(val) {
    return { ok: "tone-hi", warn: "tone-low", danger: "tone-fail" }[purtareTone(val)];
}

function moduleRange(m) {
    return `${shortDayLabel(m.start)} – ${shortDayLabel(m.end)}`;
}

/** O materie veche numită „Purtare”, adăugată manual înainte de această versiune. */
function isLegacyPurtareName(name) {
    return foldText(String(name).trim()) === "purtare";
}

/** La începutul unui modul nou: jurnal + mesaj. Prima rulare doar memorează modulul. */
function checkModuleRollover() {
    const cur = metrics.purtare?.current;
    if (!cur || state.purtare.lastModule === cur.key) return;
    const firstRun = !state.purtare.lastModule;
    state.purtare.lastModule = cur.key;
    if (firstRun) return;
    addActivity(`A început Modulul ${cur.n}. Purtarea pornește din nou de la 10.`);
    showToast(`🎖️ A început Modulul ${cur.n} — purtarea pornește din nou de la 10.`);
}

/* ---------- catalog ---------- */
function purtareRowHTML() {
    const p = metrics.purtare;
    const selected = ui.catalog.selected === PURTARE_KEY;
    const where = p.current ? `Modulul ${p.current.n}` : p.yearOver ? "an încheiat" : p.next ? `de la ${shortDayLabel(p.next.start)}` : "";
    return `
        <button type="button" class="cat-row is-purtare ${selected ? "selected" : ""}" data-action="cat-select" data-mat="${PURTARE_KEY}"
            ${selected ? 'aria-current="true"' : ""}>
            <span class="cat-purtare-icon" aria-hidden="true">${icon("medal")}</span>
            <span class="cat-row-main">
                <span class="cat-row-name">Purtare</span>
                <span class="cat-row-meta" title="Pornește de la 10 la începutul fiecărui modul">${escapeHTML([where, "se reînnoiește"].filter(Boolean).join(" · "))}</span>
            </span>
            <span class="cat-row-avg">
                <b class="tone-text-${purtareTone(p.value)}">${p.value}</b>
                <small>${p.started > 1 ? `media ${p.avg.toFixed(2)}` : "din 10"}</small>
            </span>
        </button>`;
}

function purtareVisibleInList() {
    const q = foldText(ui.catalog.query.trim());
    return ui.catalog.filter === "all" && (!q || "purtare".includes(q));
}

function renderPurtareDetail() {
    const p = metrics.purtare;
    const today = getLocalDateKey();
    const inGPA = !state.purtare.excludeFromGPA;
    const editable = p.shown;
    const badge = p.value >= 10 ? ["badge-ok", "Maximă"] : p.value >= 6 ? ["badge-warn", "Scăzută"] : ["badge-danger", "Sub 6"];

    const stat = (title, value, caption, tone = "") => `
        <div class="cat-stat ${tone}">
            <span class="kpi-title">${title}</span>
            <b>${value}</b>
            <small>${caption}</small>
        </div>`;

    let nowTile;
    let daysTile;
    if (p.current) {
        const left = daysBetween(today, p.current.end);
        nowTile = stat(`Modulul ${p.current.n}`, `<span class="cat-grade-val ${purtareGradeClass(p.current.val)}">${p.current.val}</span>`, escapeHTML(moduleRange(p.current)));
        daysTile = stat("Până la final", left === 0 ? "azi" : plural(left, "zi", "zile"), `modulul se încheie pe ${escapeHTML(shortDayLabel(p.current.end))}`);
    } else if (p.next) {
        nowTile = stat(p.lastDone ? `Modulul ${p.lastDone.n}` : "Purtare", `<span class="cat-grade-val ${purtareGradeClass(p.value)}">${p.value}</span>`,
            p.lastDone ? "încheiat · acum e vacanță" : "pornește de la 10");
        daysTile = stat(`Modulul ${p.next.n}`, escapeHTML(shortDayLabel(p.next.start)), `începe ${escapeHTML(relativeDayLabel(p.next.start))}, de la 10`);
    } else {
        nowTile = stat("Ultimul modul", `<span class="cat-grade-val ${purtareGradeClass(p.value)}">${p.value}</span>`, "anul școlar s-a încheiat");
        daysTile = stat("An școlar", "încheiat", "actualizează modulele în Setări");
    }

    $("cat-detail").innerHTML = `
        <div class="glass-card cat-detail-card purtare-card">
            <button type="button" class="btn btn-text cat-back" data-action="cat-back">← Toate materiile</button>

            <header class="cat-detail-head">
                <div class="cat-detail-title-wrap">
                    <div class="cat-title-row">
                        <h3 class="cat-title" id="cat-detail-title" tabindex="-1">${icon("medal")} Purtare</h3>
                        <span class="badge ${badge[0]}">${badge[1]}</span>
                        ${inGPA ? "" : `<span class="badge cat-badge-muted">${icon("ban")} Exclusă din medie</span>`}
                    </div>
                    <p class="subtitle">Preinstalată · pornește de la 10 la începutul fiecărui modul</p>
                </div>
                ${editable ? `
                    <div class="cat-head-actions">
                        <button type="button" class="btn btn-primary" data-action="purtare-edit" data-key="${editable.key}">${icon("pen")} Modifică nota${p.current ? "" : ` (M${editable.n})`}</button>
                    </div>` : ""}
            </header>

            <div class="cat-stats">
                ${nowTile}
                ${stat("Media anuală", p.started ? p.avg.toFixed(2) : "10", p.started ? `din ${plural(p.started, "modul", "module")}` : "încă niciun modul", p.avg < 10 ? "is-warn" : "is-ok")}
                ${stat("Module", `${p.modules.filter(m => m.status === "done").length}<span class="sim-round">/5</span>`, "încheiate")}
                ${daysTile}
            </div>

            <section class="cat-block" aria-labelledby="purtare-mod-title">
                <div class="cat-block-head">
                    <h4 id="purtare-mod-title">${icon("calendar")} Pe module</h4>
                    <button type="button" class="btn btn-text cat-inline-btn" data-action="purtare-settings">Datele modulelor →</button>
                </div>
                <ol class="purtare-modules">
                    ${p.modules.map(m => purtareModuleHTML(m, today)).join("")}
                </ol>
            </section>

            <p class="muted-small purtare-note">
                ${inGPA
                    ? `Intră în media generală ca o materie${state.settings.calc.method === "weighted" ? ` (cu ${PURTARE_WEIGHT} oră în media ponderată)` : ""}, cu media modulelor de până acum.`
                    : "Nu intră în media generală."}
            </p>

            <footer class="cat-detail-foot">
                <button type="button" class="btn btn-text" data-action="purtare-toggle-gpa">
                    ${inGPA ? `${icon("ban")} Exclude din media generală` : `${icon("undo")} Include în media generală`}
                </button>
            </footer>
        </div>`;
}

function purtareModuleHTML(m, today) {
    const statusLabel = { done: "Încheiat", current: "În curs", upcoming: "Urmează" }[m.status];
    const progress = m.status === "current"
        ? Math.round((daysBetween(m.start, today) + 1) / (daysBetween(m.start, m.end) + 1) * 100)
        : 0;
    return `
        <li class="purtare-mod is-${m.status}">
            <div class="purtare-mod-head">
                <b>Modulul ${m.n}</b>
                <span class="purtare-mod-status">${statusLabel}</span>
            </div>
            <small class="purtare-mod-dates">${escapeHTML(moduleRange(m))}</small>
            <div class="purtare-mod-body">
                ${m.val === null
                    ? `<span class="purtare-mod-future">pornește de la 10</span>`
                    : `<span class="cat-grade-val ${purtareGradeClass(m.val)}">${m.val}</span>
                       <button type="button" class="btn btn-glass icon-btn" data-action="purtare-edit" data-key="${m.key}"
                           title="Modifică nota" aria-label="Modifică purtarea pe Modulul ${m.n}">${icon("pen")}</button>`}
            </div>
            ${m.reason ? `<small class="purtare-mod-reason">${escapeHTML(m.reason)}</small>` : ""}
            ${m.status === "current" ? `<span class="purtare-mod-bar" aria-hidden="true"><span style="width:${progress}%"></span></span>` : ""}
        </li>`;
}

function openPurtareModal(key) {
    const m = metrics.purtare.modules.find(x => x.key === key);
    if (!m || m.val === null) return;

    openModal({
        layout: "panel",
        title: `Purtare · Modulul ${m.n}`,
        confirmText: "Salvează",
        body: `
            <p class="modal-hint">${escapeHTML(moduleRange(m))}. Fiecare modul pornește de la 10; modifică nota doar dacă a fost scăzută.</p>
            <div class="form-group">
                <label for="purtare-val">Nota la purtare (1-10)</label>
                <select id="purtare-val" class="glass-select">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(v => `<option value="${v}" ${v === Number(m.val) ? "selected" : ""}>${v}</option>`).join("")}</select>
            </div>
            <div class="form-group">
                <label for="purtare-reason">Motiv <span class="label-hint">(opțional)</span></label>
                <input type="text" id="purtare-reason" class="glass-input" maxlength="120" autocomplete="off"
                    value="${escapeHTML(m.reason)}" placeholder="ex: absențe nemotivate">
            </div>
            ${m.changed ? `<button type="button" class="btn btn-text" data-action="purtare-reset" data-key="${m.key}">↺ Revino la 10</button>` : ""}`,
        onConfirm: () => {
            const val = parseStrictInteger(field("purtare-val"), 1, 10);
            if (val === null) {
                showToast("⚠️ Nota trebuie să fie un număr întreg între 1 și 10.");
                $("purtare-val")?.focus();
                return;
            }
            setPurtare(m, val, field("purtare-reason").trim().slice(0, 120));
        }
    });
    $("purtare-val")?.focus();
}

function setPurtare(m, val, reason) {
    const before = m.val;
    if (val === 10 && !reason) delete state.purtare.grades[m.key];
    else state.purtare.grades[m.key] = reason ? { val, reason } : { val };

    if (before !== val) addActivity(`Purtare, Modulul ${m.n}: ${before} → ${val}${reason ? ` (${reason})` : ""}.`);
    closeActionModal();
    refresh();
    showToast(before === val ? "Purtare actualizată." : `Purtarea pe Modulul ${m.n}: ${val}.`);
}

/* ---------- setări: modulele ---------- */
function renderModulesSettings(list = state.settings.modules) {
    const box = $("set-modules");
    if (!box) return;
    // Datele vin din structura oficială a anului școlar: se alege doar varianta (vacanța mobilă a județului).
    box.innerHTML = list.map((m, i) => `
        <div class="module-row">
            <b>Modulul ${i + 1}</b>
            <span class="module-dates">${escapeHTML(getShortDateLabel(m.start))} – ${escapeHTML(getShortDateLabel(m.end))}</span>
            <input type="hidden" id="set-mod-${i}-start" value="${escapeHTML(m.start)}">
            <input type="hidden" id="set-mod-${i}-end" value="${escapeHTML(m.end)}">
        </div>`).join("");
    syncModulePresetSelect();
    renderYearCalendar(list);
}

/* ---------- calendarul anului școlar (ca cel publicat de minister) ---------- */
/** Anul școlar al unei liste de module (după prima zi). */
const yearOfModules = (list = state.settings.modules) => schoolYear(DATE_KEY_RE.test(list?.[0]?.start || "") ? schoolYearOfDate(list[0].start) : currentSchoolYear());

function schoolDayKind(date, list) {
    const y = yearOfModules(list);
    const wd = parseDateKey(date).getDay();
    const first = list[0].start, last = list[4].end;
    if (date < first || date > `${y.start + 1}-06-30`) return "out";
    if (SCHOOL_HOLIDAYS[date]) return "holiday";
    if (wd === 0 || wd === 6) return "weekend";
    if (list.some(m => date >= m.start && date <= m.end)) return date === last && last !== y.end ? "lastday" : "course";
    if (date > last) return "after";
    const weeks = Object.values(y.mobile).sort();
    return date >= weeks[0] && date <= addDays(weeks.at(-1), 6) ? "mobile" : "vacation";
}

function renderYearCalendar(list = state.settings.modules) {
    const box = $("year-calendar");
    if (!box) return;
    if (validateModules(list)) { box.innerHTML = ""; return; }
    const y = yearOfModules(list);
    setText("year-label", y.label);
    setText("year-source", y.estimated
        ? `Structura anului ${y.label} nu e încă publicată: datele sunt estimate după anul trecut. Verifică-le când apare ordinul ministrului.`
        : `Datele implicite sunt cele din structura anului școlar ${y.label} (${y.order}).`);
    const today = getLocalDateKey();
    const months = Array.from({ length: 10 }, (_, i) => new Date(y.start, 8 + i, 1));
    const wd = ["L", "Ma", "Mi", "J", "V", "S", "D"];
    box.innerHTML = `
        <div class="ycal-grid">
            ${months.map(m => {
                const yy = m.getFullYear(), mo = m.getMonth();
                const days = new Date(yy, mo + 1, 0).getDate();
                const lead = (m.getDay() + 6) % 7;
                const cells = [];
                for (let i = 0; i < lead; i++) cells.push(`<span class="ycal-d is-blank"></span>`);
                for (let d = 1; d <= days; d++) {
                    const key = `${yy}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const kind = schoolDayKind(key, list);
                    const note = SCHOOL_HOLIDAYS[key] || SCHOOL_NOTES[key] || (kind === "lastday" ? "ultima zi de cursuri" : "");
                    cells.push(`<span class="ycal-d k-${kind} ${key === today ? "is-today" : ""} ${SCHOOL_NOTES[key] ? "has-note" : ""}" ${note ? `title="${escapeHTML(note)}"` : ""}>${d}</span>`);
                }
                return `<div class="ycal-month"><b>${MONTHS[mo]} ${yy}</b><div class="ycal-days">${wd.map(w => `<span class="ycal-wd">${w}</span>`).join("")}${cells.join("")}</div></div>`;
            }).join("")}
        </div>
        <ul class="ycal-legend">
            <li><i class="k-course"></i> cursuri</li>
            <li><i class="k-vacation"></i> vacanță</li>
            <li><i class="k-mobile"></i> vacanța din județul tău</li>
            <li><i class="k-holiday"></i> sărbători legale / zile libere</li>
            ${list[4].end !== y.end ? `<li><i class="k-lastday"></i> ultima zi de cursuri pentru clasa ta</li>` : ""}
        </ul>`;
}

function readModulesFromSettings() {
    return Array.from({ length: 5 }, (_, i) => ({ start: field(`set-mod-${i}-start`), end: field(`set-mod-${i}-end`) }));
}

function syncModulePresetSelect() {
    const select = $("set-module-preset");
    if (!select) return;
    const list = readModulesFromSettings();
    // variantele anului modulelor tale (anul se schimbă la închiderea anului școlar)
    const presets = modulePresetsFor(yearOfModules(validateModules(list) ? state.settings.modules : list).start);
    const sig = Object.keys(presets).join();
    if (select.dataset.sig !== sig) {
        select.innerHTML = Object.entries(presets).map(([id, p]) => `<option value="${id}">${escapeHTML(p.label)}</option>`).join("")
            + `<option value="custom">Datele tale de până acum</option>`;
        select.dataset.sig = sig;
    }
    const id = matchingModulePreset(list);
    select.value = id;
    select.querySelector('option[value="custom"]').hidden = id !== "custom";
}

function bindPurtareEvents() {
    $("set-module-preset")?.addEventListener("change", event => {
        if (MODULE_PRESETS[event.target.value]) renderModulesSettings(presetModules(event.target.value, state.settings.school.cls));
    });
    $("set-county")?.addEventListener("change", event => {
        const week = countyPreset(event.target.value, yearOfModules().start);
        if (week && $("set-module-preset")) {
            $("set-module-preset").value = week;
            renderModulesSettings(presetModules(week, state.settings.school.cls));
        }
    });
    $("set-modules")?.addEventListener("change", syncModulePresetSelect);
}
