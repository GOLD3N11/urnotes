/* urNotes · Calendarul: rezumat, săptămână, lună.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- CALENDAR ---------- */
function renderCalendar() {
    const body = $("cal-body");
    if (!body) return;

    document.querySelectorAll("[data-action='cal-view']").forEach(btn => {
        btn.setAttribute("aria-pressed", String(btn.dataset.view === ui.cal.view));
    });

    if (typeof renderCompose === "function" && !document.activeElement?.closest?.("#cal-compose")) renderCompose();
    renderCalOverview();
    // „Tabel” și „Panou” arată testele și temele ca o bază de date (ca în Notion); săptămâna și luna, ca un calendar
    const dbView = ui.cal.view === "table" || ui.cal.view === "board";
    document.querySelector(".cal-shell")?.classList.toggle("is-db", dbView);
    if (ui.cal.view === "agenda") renderAgendaView();
    else if (ui.cal.view === "month") renderMonthView();
    else if (ui.cal.view === "table") renderTableView();
    else if (ui.cal.view === "board") renderBoardView();
    else renderWeekView();
}

/* ---------- baza de date: aceleași teste și teme, ca tabel sau ca panou cu coloane ---------- */
const OCC_STATUS = { todo: "De făcut", doing: "În lucru", done: "Gata" };
function occStatus(ev, date, links) {
    if (isOccurrenceDone(ev, date, links)) return "done";
    return ev.doingDates?.[date] ? "doing" : "todo";
}

/** Schimbă starea unei apariții; o notă legată ține testul la „Gata”. */
function setOccStatus(id, date, status) {
    const found = findEvent(id);
    if (!found || !OCC_STATUS[status] || !requireAccount()) return;
    const { ev } = found;
    if (linkedGrade(gradeLinks(), ev, date) && status !== "done") { showToast("⚠️ Testul are deja notă, deci rămâne la „Gata”."); return; }
    const before = occStatus(ev, date, gradeLinks());
    if (before === status) return;
    ev.doneDates ||= {}; ev.doingDates ||= {};
    delete ev.doneDates[date]; delete ev.doingDates[date];
    if (status === "done") ev.doneDates[date] = true;
    if (status === "doing") ev.doingDates[date] = true;
    if (!Object.keys(ev.doneDates).length) delete ev.doneDates;
    if (!Object.keys(ev.doingDates).length) delete ev.doingDates;
    if ((status === "done") !== (before === "done")) state.pal.events = Math.max(0, state.pal.events + (status === "done" ? 1 : -1));
    if (status === "done") addActivity(`Ai bifat „${ev.title}” ca făcut.`);
    refresh();
}

function dbRows() {
    const today = getLocalDateKey();
    const links = gradeLinks();
    const from = ui.cal.dbPast ? addDays(today, -60) : addDays(today, -14);
    return occurrencesBetween(from, addDays(today, 90))
        .filter(o => ui.cal.dbPast || o.date >= today || occStatus(o.ev, o.date, links) !== "done")
        .map(o => ({ ...o, status: occStatus(o.ev, o.date, links) }));
}

function dbTagHTML(ev) {
    return `<span class="np-tag t-${EVENT_TYPE_CLASS[ev.type] || "personal"}">${icon(EVENT_TYPE_ICON[ev.type] || "pin")} ${escapeHTML(ev.type)}</span>`;
}
function dbSubjectHTML(mat) {
    return mat ? `<span class="np-tag np-subj" style="${subjectStyle(mat)}">${escapeHTML(shortSubjectName(mat))}</span>` : `<span class="np-empty">–</span>`;
}
function dbStatusHTML(o) {
    const next = { todo: "doing", doing: "done", done: "todo" }[o.status];
    return `<button type="button" class="db-status s-${o.status}" data-action="occ-status" data-id="${escapeHTML(o.ev.id)}" data-date="${o.date}" data-status="${next}"
        title="Schimbă în „${OCC_STATUS[next]}”" aria-label="${escapeHTML(`Stare: ${OCC_STATUS[o.status]}. Schimbă în ${OCC_STATUS[next]}`)}"><i aria-hidden="true"></i>${OCC_STATUS[o.status]}</button>`;
}

function renderTableView() {
    const rows = dbRows();
    const today = getLocalDateKey();
    $("cal-title").textContent = "Teste și teme";
    setText("cal-caption", `${plural(rows.length, "rând", "rânduri")}`);
    $("cal-body").innerHTML = `
        <div class="db-tools">
            <label class="db-past"><input type="checkbox" data-action="db-past" ${ui.cal.dbPast ? "checked" : ""}> Arată și ce a trecut și e gata</label>
        </div>
        ${rows.length ? `
        <div class="db-table-wrap">
            <table class="db-table">
                <thead><tr><th scope="col">Titlu</th><th scope="col">Tip</th><th scope="col">Materie</th><th scope="col">Data</th><th scope="col">Stare</th></tr></thead>
                <tbody>
                    ${rows.map(o => `
                        <tr class="${o.date < today ? "is-past" : ""} ${o.status === "done" ? "is-done" : ""}">
                            <td><button type="button" class="db-open" data-action="event-open" data-id="${escapeHTML(o.ev.id)}" data-date="${o.date}">${escapeHTML(o.ev.title)}</button></td>
                            <td>${dbTagHTML(o.ev)}</td>
                            <td>${dbSubjectHTML(o.ev.subject)}</td>
                            <td class="db-date">${escapeHTML(shortDayLabel(o.date))}${o.ev.time ? ` <span class="np-rel">${escapeHTML(o.ev.time)}</span>` : ""}<small>${escapeHTML(relativeDayLabel(o.date))}</small></td>
                            <td>${dbStatusHTML(o)}</td>
                        </tr>`).join("")}
                </tbody>
            </table>
        </div>` : emptyNote("Nimic de dat în următoarele 3 luni. Adaugă un test sau o temă cu „+”.")}`;
}

function renderBoardView() {
    const rows = dbRows();
    const today = getLocalDateKey();
    $("cal-title").textContent = "Teste și teme";
    setText("cal-caption", "trage o carte în altă coloană ca să-i schimbi starea");
    $("cal-body").innerHTML = `
        <div class="db-board">
            ${Object.entries(OCC_STATUS).map(([s, label]) => {
                const list = rows.filter(o => o.status === s);
                return `
                    <section class="db-col s-${s}" data-status="${s}" aria-label="${label}">
                        <h4><i aria-hidden="true"></i>${label} <span class="cat-count">${list.length}</span></h4>
                        <div class="db-cards">
                            ${list.map(o => `
                                <article class="db-card ${o.date < today && s !== "done" ? "is-late" : ""}" draggable="true" data-id="${escapeHTML(o.ev.id)}" data-date="${o.date}">
                                    <button type="button" class="db-open" data-action="event-open" data-id="${escapeHTML(o.ev.id)}" data-date="${o.date}">${escapeHTML(o.ev.title)}</button>
                                    <div class="db-card-tags">${dbTagHTML(o.ev)} ${o.ev.subject ? dbSubjectHTML(o.ev.subject) : ""}</div>
                                    <div class="db-card-foot"><span>${escapeHTML(shortDayLabel(o.date))} · ${escapeHTML(relativeDayLabel(o.date))}</span>${dbStatusHTML(o)}</div>
                                </article>`).join("") || `<p class="db-empty">Nimic aici</p>`}
                        </div>
                    </section>`;
            }).join("")}
        </div>`;
}

/* tragerea cărților între coloane (mouse); pe telefon, butonul de stare de pe carte */
document.addEventListener("dragstart", event => {
    const card = event.target.closest?.(".db-card");
    if (!card) return;
    event.dataTransfer.setData("text/urn-occ", JSON.stringify({ id: card.dataset.id, date: card.dataset.date }));
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
});
document.addEventListener("dragend", event => event.target.closest?.(".db-card")?.classList.remove("is-dragging"));
document.addEventListener("dragover", event => {
    const col = event.target.closest?.(".db-col");
    if (!col || ![...(event.dataTransfer?.types || [])].includes("text/urn-occ")) return;
    event.preventDefault();
    document.querySelectorAll(".db-col.is-over").forEach(c => c !== col && c.classList.remove("is-over"));
    col.classList.add("is-over");
});
document.addEventListener("dragleave", event => { const col = event.target.closest?.(".db-col"); if (col && !col.contains(event.relatedTarget)) col.classList.remove("is-over"); });
document.addEventListener("drop", event => {
    const col = event.target.closest?.(".db-col");
    if (!col) return;
    const raw = event.dataTransfer?.getData("text/urn-occ");
    document.querySelectorAll(".db-col.is-over").forEach(c => c.classList.remove("is-over"));
    if (!raw) return;
    event.preventDefault();
    try { const { id, date } = JSON.parse(raw); setOccStatus(id, date, col.dataset.status); } catch (_) { /* ignorăm */ }
});

/* ---------- rezumat: ce urmează + ce necesită atenție ---------- */
function renderCalOverview() {
    const box = $("cal-overview");
    if (!box) return;

    const today = getLocalDateKey();
    const links = gradeLinks();
    const upcoming = occurrencesBetween(today, addDays(today, 30))
        .filter(o => NEEDS_GRADE.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links));
    const homework = occurrencesBetween(today, addDays(today, 6))
        .filter(o => o.ev.type === "Temă" && !isOccurrenceDone(o.ev, o.date, links));
    // Pentru o serie repetată arătăm doar cea mai recentă apariție ratată (+ câte mai vechi), nu câte un rând pe săptămână.
    const attention = missedOccurrences(links, today);
    const out = [];

    // 1. ce a rămas neterminat: un rând discret pentru fiecare, cu butoanele lui
    if (attention.length) {
        out.push(`
            <div class="cal-attn" role="group" aria-labelledby="cal-attn-title">
                <p class="cal-attn-title" id="cal-attn-title">${icon("alert")} ${attention.length === 1 ? "Un eveniment trecut așteaptă" : `${attention.length} evenimente trecute așteaptă`}</p>
                <ul class="cal-attn-list">${attention.slice(0, 3).map(({ ev, date, older }) => `
                    <li class="cal-att-row">
                        <button type="button" class="cal-att-info" data-action="cal-goto" data-date="${date}">
                            <i class="ev-dot ev-${EVENT_TYPE_CLASS[ev.type] || "personal"}" aria-hidden="true"></i>
                            <b>${escapeHTML(ev.title)}</b>
                            <small>${escapeHTML([relativeDayLabel(date), older && `+${older} mai ${older === 1 ? "veche" : "vechi"}`].filter(Boolean).join(" · "))}</small>
                        </button>
                        <span class="cal-att-actions">
                            ${canGradeOccurrence(ev, date, links) && NEEDS_GRADE.has(ev.type) ? `<button type="button" class="btn btn-primary btn-sm" data-action="event-grade" data-id="${escapeHTML(ev.id)}" data-date="${date}">${icon("plus")} Notă</button>` : ""}
                            <button type="button" class="btn btn-glass btn-sm" data-action="event-done" data-id="${escapeHTML(ev.id)}" data-date="${date}"
                                title="${NEEDS_GRADE.has(ev.type) ? "Marchează ca încheiat fără notă" : "Marchează ca făcut"}">${icon("check")} ${NEEDS_GRADE.has(ev.type) ? "Fără notă" : "Făcut"}</button>
                        </span>
                    </li>`).join("")}</ul>
                ${attention.length > 3 ? `<p class="cal-attn-more">și încă ${attention.length - 3} în săptămânile trecute</p>` : ""}
            </div>`);
    }

    // 2. ce urmează: câteva „etichete” pe un singur rând
    const chips = upcoming.slice(0, 4).map(o => {
        const n = daysBetween(today, o.date);
        return `<button type="button" class="cal-chip ev-${EVENT_TYPE_CLASS[o.ev.type] || "personal"} ${n <= 2 ? "is-near" : ""}" data-action="cal-goto" data-date="${o.date}"
            title="${escapeHTML(`${o.ev.title} · ${weekdayLabel(o.date)}${o.ev.time ? `, ${o.ev.time}` : ""}`)}">
            <i class="ev-dot" aria-hidden="true"></i><b>${escapeHTML(o.ev.subject ? shortSubjectName(o.ev.subject) : o.ev.title)}</b><small>${escapeHTML(n === 0 ? "azi" : n === 1 ? "mâine" : `în ${n} zile`)}</small>
        </button>`;
    });
    if (homework.length) chips.push(`<button type="button" class="cal-chip ev-tema" data-action="cal-goto" data-date="${homework[0].date}"><i class="ev-dot" aria-hidden="true"></i><b>${plural(homework.length, "temă", "teme")}</b><small>în 7 zile</small></button>`);
    out.push(`
        <div class="cal-upnext" aria-label="Urmează">
            <span class="cal-upnext-label">${icon("calendar-check")} Urmează</span>
            ${chips.length ? chips.join("") : `<span class="cal-upnext-empty">nimic în următoarele 30 de zile</span>`}
        </div>`);

    // 3. fără orar: o sugestie scurtă
    if (!Object.keys(state.timetable).length && Object.keys(state.subjects).length) {
        out.push(`<p class="cal-tip">${icon("calendar-days")} Cu orarul, fiecare zi îți arată orele și adaugi un test dintr-o atingere. <button type="button" class="btn btn-text btn-sm" data-action="timetable">Completează orarul</button></p>`);
    }
    box.innerHTML = out.join("");
}

/* ---------- săptămână ---------- */
function renderWeekView() {
    const start = weekStart(ui.cal.date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const today = getLocalDateKey();
    const links = gradeLinks();
    const occ = occurrencesBetween(days[0], days[6]);

    const sameMonth = parseDateKey(days[0]).getMonth() === parseDateKey(days[6]).getMonth();
    const endD = parseDateKey(days[6]);
    setText("cal-title", sameMonth
        ? `${parseDateKey(days[0]).getDate()} – ${endD.getDate()} ${MONTHS[endD.getMonth()].toLowerCase()} ${endD.getFullYear()}`
        : `${shortDayLabel(days[0])} – ${shortDayLabel(days[6])} ${endD.getFullYear()}`);
    const diff = Math.round(daysBetween(weekStart(today), start) / 7);
    setText("cal-caption", diff === 0 ? "Săptămâna aceasta" : diff === 1 ? "Săptămâna viitoare" : diff === -1 ? "Săptămâna trecută"
        : diff > 0 ? `Peste ${plural(diff, "săptămână", "săptămâni")}` : `Acum ${plural(-diff, "săptămână", "săptămâni")}`);

    const strip = `<div class="cal-daystrip" role="group" aria-label="Zilele săptămânii">${days.map(date => {
        const d = parseDateKey(date);
        const n = occ.filter(o => o.date === date).length;
        return `<button type="button" class="cal-dsd ${date === today ? "is-today" : ""}" data-action="cal-jump" data-date="${date}" aria-label="${escapeHTML(`${WEEKDAY_LONG[d.getDay()]}, ${getDateLabel(date)}${n ? `, ${plural(n, "eveniment", "evenimente")}` : ""}`)}">
            <small>${WEEKDAY_SHORT[d.getDay()].slice(0, 1)}</small><b>${d.getDate()}</b><i class="${n ? "has" : ""}" aria-hidden="true"></i></button>`;
    }).join("")}</div>`;
    $("cal-body").innerHTML = `${strip}<div class="cal-week">${days.map(date => dayColumnHTML(date, occ.filter(o => o.date === date), links, today)).join("")}</div>`;
}

function dayColumnHTML(date, items, links, today) {
    const d = parseDateKey(date);
    const wd = d.getDay();
    const lessons = isSchoolDay(date) ? (state.timetable[wd] || []) : [];
    const plan = calPlanHTML(date);
    const holiday = !isSchoolDay(date) && wd >= 1 && wd <= 5;
    const classes = [
        "cal-col",
        date === today && "is-today",
        date < today && "is-past",
        (wd === 0 || wd === 6) && "is-weekend",
        holiday && "is-holiday",
        !items.length && !lessons.length && !plan && "is-empty"
    ].filter(Boolean).join(" ");

    return `
        <section class="${classes}" data-date="${date}" aria-label="${escapeHTML(`${WEEKDAY_LONG[wd]}, ${getDateLabel(date)}`)}">
            <header class="cal-col-head">
                <span class="cal-col-wd">${WEEKDAY_SHORT[wd]}</span>
                <span class="cal-col-date">${d.getDate()}</span>
                <span class="cal-col-month">${MONTH_SHORT[d.getMonth()]}</span>
                ${date === today ? '<span class="cal-today-tag">Azi</span>' : ""}
                <button type="button" class="cal-add-mini" data-action="cc-day" data-date="${date}" aria-label="Adaugă pe ${escapeHTML(getDateLabel(date))}" title="Adaugă">${icon("plus")}</button>
            </header>
            <div class="cal-col-body">
                <div class="cal-items">${items.map(o => eventCardHTML(o, links)).join("")}</div>
                ${plan}
                ${lessons.length ? `
                    <div class="cal-lessons" aria-label="Orar">
                        ${lessons.map((m, i) => `
                            <button type="button" class="cal-lesson" data-action="cc-pick" data-date="${date}" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}"
                                title="${escapeHTML(`Ora ${i + 1}: ${m} — adaugă un test sau o temă`)}"><span class="cal-lesson-n">${i + 1}</span><span class="cal-lesson-name">${escapeHTML(shortSubjectName(m))}</span></button>`).join("")}
                    </div>` : ""}
                ${!items.length && !lessons.length && !plan ? `<p class="cal-free">${holiday ? "vacanță" : "liber"}</p>` : ""}
                <button type="button" class="cal-add" data-action="cc-day" data-date="${date}">${icon("plus")} Adaugă</button>
            </div>
        </section>`;
}

/** Sesiunile din plan, discrete, sub evenimentele zilei (dacă elevul vrea să le vadă în Calendar). */
function calPlanHTML(date) {
    if (!state.plan.prefs.setup || !state.plan.prefs.calendar) return "";
    const items = planItemsOn(date);
    if (!items.length) return "";
    return `<div class="cal-plan" aria-label="Din plan">${items.map(it => `
        <button type="button" class="cal-plan-item ${it.done ? "is-done" : ""}" data-action="nav" data-tab="tab-plan" title="${escapeHTML(`${PLAN_KINDS[it.kind].label} · ${it.min} min${it.reason ? ` · ${it.reason}` : ""}`)}">
            ${icon(it.done ? "check" : PLAN_KINDS[it.kind].icon)}<span>${escapeHTML(it.mat)} · ${it.min}′</span></button>`).join("")}</div>`;
}

function eventCardHTML({ ev, date }, links) {
    const link = linkedGrade(links, ev, date);
    const done = isOccurrenceDone(ev, date, links);
    const id = escapeHTML(ev.id);
    let gradeBtn = "";
    if (link) {
        gradeBtn = `<button type="button" class="cal-ev-grade cat-grade-val tone-${gradeTone(Number(link.grade.val))}" data-action="edit-grade"
            data-mat="${escapeHTML(link.mat)}" data-index="${link.idx}" title="Nota primită — apasă ca s-o modifici">Nota ${escapeHTML(link.grade.val)}</button>`;
    } else if (NEEDS_GRADE.has(ev.type) && canGradeOccurrence(ev, date, links)) {
        gradeBtn = `<button type="button" class="cal-ev-addgrade" data-action="event-grade" data-id="${id}" data-date="${date}">+ Notă</button>`;
    }

    return `
        <article class="cal-ev ev-${EVENT_TYPE_CLASS[ev.type] || "personal"} ${done ? "is-done" : ""}" draggable="true" data-id="${id}" data-date="${date}">
            <button type="button" class="cal-ev-check" data-action="event-done" data-id="${id}" data-date="${date}" aria-pressed="${done}"
                ${link ? "disabled" : ""} title="${link ? "Are notă — e încheiat" : done ? "Marchează ca nefăcut" : "Marchează ca făcut"}"
                aria-label="${escapeHTML(`${done ? "Nefăcut" : "Făcut"}: ${ev.title}`)}">${done ? "✓" : ""}</button>
            <button type="button" class="cal-ev-main" data-action="event-open" data-id="${id}" data-date="${date}" title="Editează">
                <span class="cal-ev-top">
                    ${ev.time ? `<span class="cal-ev-time">${escapeHTML(ev.time)}</span>` : ""}
                    <span class="cal-ev-type">${icon(EVENT_TYPE_ICON[ev.type] || "pin")} ${escapeHTML(ev.type)}</span>
                    ${ev.cls ? `<span class="cal-ev-cls" title="Pus de profesor pentru toată clasa">🏫 ${escapeHTML(ev.cls)}</span>` : ""}
                    ${ev.repeat ? `<span class="cal-ev-rep" title="${ev.repeat.every === 2 ? "Se repetă la 2 săptămâni" : "Se repetă săptămânal"}">↻</span>` : ""}
                </span>
                <b class="cal-ev-title">${escapeHTML(ev.title)}</b>
                ${ev.subject && ev.title !== autoEventTitle(ev.type, ev.subject) ? `<small class="cal-ev-sub">${escapeHTML(ev.subject)}</small>` : ""}
            </button>
            ${gradeBtn}
        </article>`;
}


/* ---------- agenda: zilele una sub alta, cu tot ce ai în fiecare și „+” pe fiecare zi ---------- */
const AGENDA_DAYS = 14;
function renderAgendaView() {
    const today = getLocalDateKey();
    const start = weekStart(ui.cal.date);
    const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(start, i));
    const links = gradeLinks();
    const occ = occurrencesBetween(days[0], days.at(-1));
    const a = parseDateKey(days[0]), b = parseDateKey(days.at(-1));
    setText("cal-title", a.getMonth() === b.getMonth()
        ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()].toLowerCase()}`
        : `${shortDayLabel(days[0])} – ${shortDayLabel(days.at(-1))}`);
    const diff = Math.round(daysBetween(weekStart(today), start) / 7);
    setText("cal-caption", diff === 0 ? "Săptămâna asta și următoarea" : diff === -2 ? "Acum două săptămâni" : diff === 2 ? "Peste două săptămâni"
        : diff > 0 ? `Peste ${plural(diff, "săptămână", "săptămâni")}` : `Acum ${plural(-diff, "săptămână", "săptămâni")}`);

    let html = "";
    days.forEach((date, i) => {
        const d = parseDateKey(date), wd = d.getDay();
        if (i === 7) html += `<p class="ag-week-sep">Săptămâna ${diff + 1 === 1 ? "viitoare" : `din ${shortDayLabel(date)}`}</p>`;
        const items = occ.filter(o => o.date === date);
        const lessons = isSchoolDay(date) ? [...new Set(state.timetable[wd] || [])].filter(m => state.subjects[m]) : [];
        const holiday = !isSchoolDay(date) && wd >= 1 && wd <= 5;
        const rel = date === today ? "Azi" : date === addDays(today, 1) ? "Mâine" : "";
        const cls = ["ag-day", date === today && "is-today", date < today && "is-past", (wd === 0 || wd === 6) && "is-weekend", !items.length && "is-empty"].filter(Boolean).join(" ");
        html += `
            <section class="${cls}" data-date="${date}" aria-label="${escapeHTML(`${WEEKDAY_LONG[wd]}, ${getDateLabel(date)}`)}">
                <button type="button" class="ag-date" data-action="cc-day" data-date="${date}" title="Adaugă ceva în ziua asta">
                    <b>${d.getDate()}</b><span>${escapeHTML(WEEKDAY_SHORT[wd])}${rel ? ` · ${rel}` : ""}</span>
                </button>
                <div class="ag-main">
                    ${items.length ? `<div class="ag-items">${items.map(o => eventCardHTML(o, links)).join("")}</div>` : `<p class="ag-free">${holiday ? "vacanță" : wd === 0 || wd === 6 ? "weekend liber" : "nimic încă"}</p>`}
                    ${calPlanHTML(date)}
                    ${lessons.length && date >= today ? `<div class="ag-lessons" aria-label="Orele zilei: atinge una ca să adaugi un test sau o temă">${lessons.map(m => `
                        <button type="button" class="ag-lesson" data-action="cc-pick" data-date="${date}" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}" title="${escapeHTML(`Adaugă un test sau o temă la ${m}`)}"><i aria-hidden="true"></i>${escapeHTML(shortSubjectName(m))}<span class="ag-lesson-plus" aria-hidden="true">+</span></button>`).join("")}</div>` : ""}
                </div>
                <button type="button" class="ag-add" data-action="cc-day" data-date="${date}" aria-label="${escapeHTML(`Adaugă pe ${getDateLabel(date)}`)}" title="Adaugă">${icon("plus")}</button>
            </section>`;
    });
    $("cal-body").innerHTML = `<div class="ag">${html}</div>`;
    if (typeof cc !== "undefined" && cc.open) document.querySelector(`.ag-day[data-date="${cc.date}"]`)?.classList.add("is-target");
}

/* ---------- lună ---------- */
function renderMonthView() {
    const anchor = parseDateKey(ui.cal.date);
    const first = getLocalDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    const last = getLocalDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    const gridStart = weekStart(first);
    const gridEnd = addDays(weekStart(last), 6);
    const today = getLocalDateKey();
    const links = gradeLinks();
    const occ = occurrencesBetween(gridStart, gridEnd);

    setText("cal-title", `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`);
    const monthDiff = (anchor.getFullYear() - new Date().getFullYear()) * 12 + anchor.getMonth() - new Date().getMonth();
    setText("cal-caption", monthDiff === 0 ? "Luna aceasta" : monthDiff === 1 ? "Luna viitoare" : monthDiff === -1 ? "Luna trecută" : "Apasă o zi pentru detalii");

    const cells = [];
    for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
        const items = occ.filter(o => o.date === date);
        const out = date < first || date > last;
        cells.push(`
            <button type="button" class="cal-mcell ${out ? "is-out" : ""} ${date === today ? "is-today" : ""} ${[0, 6].includes(parseDateKey(date).getDay()) ? "is-weekend" : ""} ${items.length ? "has-items" : ""}" data-action="cal-goto" data-date="${date}" data-date-cell="${date}"
                aria-label="${escapeHTML(`${getDateLabel(date)}${items.length ? `, ${plural(items.length, "eveniment", "evenimente")}` : ""}`)}">
                <b>${parseDateKey(date).getDate()}</b>
                ${items.slice(0, 3).map(({ ev, date: d }) => `<span class="cal-mpill ev-${EVENT_TYPE_CLASS[ev.type] || "personal"} ${isOccurrenceDone(ev, d, links) ? "is-done" : ""}">${escapeHTML(ev.title)}</span>`).join("")}
                ${items.length > 3 ? `<span class="cal-mmore">+${items.length - 3}</span>` : ""}
                ${items.length ? `<span class="cal-mdots" aria-hidden="true">${items.slice(0, 4).map(({ ev }) => `<i class="ev-${EVENT_TYPE_CLASS[ev.type] || "personal"}"></i>`).join("")}</span>` : ""}
            </button>`);
    }

    $("cal-body").innerHTML = `
        <div class="cal-month-head" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 0].map(wd => `<span class="cal-month-wd">${WEEKDAY_SHORT[wd]}</span>`).join("")}</div>
        <div class="cal-month">${cells.join("")}</div>`;
}

/* ---------- navigare ---------- */
function calNavigate(offset) {
    const d = parseDateKey(ui.cal.date);
    ui.cal.date = ui.cal.view === "month"
        ? getLocalDateKey(new Date(d.getFullYear(), d.getMonth() + offset, 1))
        : addDays(ui.cal.date, offset * (ui.cal.view === "agenda" ? 14 : 7));
    renderCalendar();
}

function calGoto(dateKey, { view = ui.cal.view === "week" ? "week" : "agenda" } = {}) {
    if (!DATE_KEY_RE.test(String(dateKey))) return;
    ui.cal.date = dateKey;
    ui.cal.view = view;
    if (ui.activeTab !== "tab-calendar") switchTab("tab-calendar");
    else renderCalendar();

    const col = document.querySelector(`.cal-col[data-date="${dateKey}"], .ag-day[data-date="${dateKey}"]`);
    if (col) {
        col.scrollIntoView({ block: "nearest", behavior: "smooth" });
        col.classList.add("flash");
        setTimeout(() => col.classList.remove("flash"), 1600);
    }
}


/** Telefonul: din banda cu zilele săptămânii, sari la ziua aleasă. */
function calJump(date) {
    const col = document.querySelector(`.cal-col[data-date="${date}"], .ag-day[data-date="${date}"]`);
    if (!col) return;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h")) || 60;
    window.scrollTo({ top: col.getBoundingClientRect().top + window.scrollY - bar - 70, behavior: reduceMotion() ? "auto" : "smooth" });
    col.classList.add("flash");
    setTimeout(() => col.classList.remove("flash"), 1400);
}

/** Folosită de Dashboard, Catalog și căutare. */
function showDateInCalendar(dateKey) {
    calGoto(dateKey);
}

registerTab("tab-calendar", { render: renderCalendar, title: "Calendar", icon: "calendar", group: "calendar" });
