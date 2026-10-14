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

    renderCalOverview();
    if (ui.cal.view === "month") renderMonthView();
    else renderWeekView();
}

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

    const cards = [];

    // 1. Ce urmează
    const [first, ...rest] = upcoming;
    cards.push(`
        <section class="glass-card cal-ov-card" aria-labelledby="cal-ov-next">
            <div class="cal-ov-head">
                <h3 id="cal-ov-next">${icon("calendar-check")} Urmează</h3>
                <span class="subtitle">teste și evaluări, următoarele 30 de zile</span>
            </div>
            ${first ? `
                <button type="button" class="cal-next-hero ev-${EVENT_TYPE_CLASS[first.ev.type]}" data-action="cal-goto" data-date="${first.date}">
                    <span class="cal-countdown">
                        <b>${daysBetween(today, first.date) === 0 ? "Azi" : daysBetween(today, first.date)}</b>
                        <small>${daysBetween(today, first.date) === 0 ? "" : daysBetween(today, first.date) === 1 ? "zi" : "zile"}</small>
                    </span>
                    <span class="cal-next-main">
                        <b>${escapeHTML(first.ev.title)}</b>
                        <small>${icon(EVENT_TYPE_ICON[first.ev.type])} ${escapeHTML([first.ev.type, first.ev.subject, `${weekdayLabel(first.date)}${first.ev.time ? `, ${first.ev.time}` : ""}`].filter(Boolean).join(" · "))}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                </button>
                ${rest.length ? `<ul class="cal-ov-list">${rest.slice(0, 4).map(o => `
                    <li><button type="button" class="cal-ov-row" data-action="cal-goto" data-date="${o.date}">
                        <span class="cal-ov-when">${escapeHTML(relativeDayLabel(o.date))}</span>
                        <span class="cal-ov-title"><i class="ev-dot ev-${EVENT_TYPE_CLASS[o.ev.type]}" aria-hidden="true"></i>${escapeHTML(o.ev.title)}</span>
                        <span class="cal-ov-meta">${escapeHTML(weekdayLabel(o.date))}</span>
                    </button></li>`).join("")}</ul>` : ""}`
            : `<p class="muted-small cal-ov-empty">${icon("sparkles")} Niciun test sau examen în următoarele 30 de zile.</p>`}
            <p class="cal-ov-foot">${icon("notebook")} ${homework.length ? `${plural(homework.length, "temă de predat", "teme de predat")} în următoarele 7 zile` : "Nicio temă de predat în următoarele 7 zile"}</p>
        </section>`);

    // 2. Ce necesită atenție (teste trecute fără notă, teme nebifate)
    if (attention.length) {
        cards.push(`
            <section class="glass-card cal-ov-card cal-ov-attention" aria-labelledby="cal-ov-att">
                <div class="cal-ov-head">
                    <h3 id="cal-ov-att">${icon("alert")} Necesită atenție <span class="cat-count">${attention.length}</span></h3>
                    <span class="subtitle">evenimente trecute nefinalizate</span>
                </div>
                <ul class="cal-ov-list">
                    ${attention.slice(0, 5).map(({ ev, date, older }) => `
                        <li class="cal-att-row">
                            <span class="cal-att-info">
                                <b><i class="ev-dot ev-${EVENT_TYPE_CLASS[ev.type]}" aria-hidden="true"></i>${escapeHTML(ev.title)}</b>
                                <small>${escapeHTML([ev.subject, `${relativeDayLabel(date)} (${shortDayLabel(date)})`, older && `+${older} mai ${older === 1 ? "veche" : "vechi"}`].filter(Boolean).join(" · "))}</small>
                            </span>
                            <span class="cal-att-actions">
                                ${canGradeOccurrence(ev, date, links) && NEEDS_GRADE.has(ev.type) ? `<button type="button" class="btn btn-primary btn-sm" data-action="event-grade" data-id="${escapeHTML(ev.id)}" data-date="${date}">${icon("plus")} Notă</button>` : ""}
                                <button type="button" class="btn btn-glass btn-sm" data-action="event-done" data-id="${escapeHTML(ev.id)}" data-date="${date}"
                                    title="${NEEDS_GRADE.has(ev.type) ? "Marchează ca încheiat fără notă" : "Marchează ca făcut"}">${icon("check")} ${NEEDS_GRADE.has(ev.type) ? "Fără notă" : "Făcut"}</button>
                            </span>
                        </li>`).join("")}
                </ul>
                ${attention.length > 5 ? `<p class="cal-ov-foot">și încă ${attention.length - 5}…</p>` : ""}
            </section>`);
    } else if (Object.keys(state.timetable).length === 0 && Object.keys(state.subjects).length) {
        // Fără orar: îl propunem, pentru că face adăugarea mult mai rapidă.
        cards.push(`
            <section class="glass-card cal-ov-card cal-ov-tip">
                <div class="cal-ov-head"><h3>${icon("calendar-days")} Adaugă-ți orarul</h3></div>
                <p class="muted-small">Cu orarul, fiecare zi îți arată orele, iar un test sau o temă se adaugă dintr-o atingere pe materie. Poți alege și „următoarea oră” ca dată.</p>
                <button type="button" class="btn btn-primary mt-3" data-action="timetable">Completează orarul</button>
            </section>`);
    }

    box.innerHTML = cards.join("");
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

    $("cal-body").innerHTML = `<div class="cal-week">${days.map(date => dayColumnHTML(date, occ.filter(o => o.date === date), links, today)).join("")}</div>`;
}

function dayColumnHTML(date, items, links, today) {
    const d = parseDateKey(date);
    const wd = d.getDay();
    const lessons = state.timetable[wd] || [];
    const classes = [
        "cal-col",
        date === today && "is-today",
        date < today && "is-past",
        (wd === 0 || wd === 6) && "is-weekend",
        !items.length && !lessons.length && !calPlanHTML(date) && "is-empty"
    ].filter(Boolean).join(" ");

    return `
        <section class="${classes}" data-date="${date}" aria-label="${escapeHTML(`${WEEKDAY_LONG[wd]}, ${getDateLabel(date)}`)}">
            <header class="cal-col-head">
                <span class="cal-col-wd">${WEEKDAY_SHORT[wd]}</span>
                <span class="cal-col-date">${d.getDate()}</span>
                <span class="cal-col-month">${MONTH_SHORT[d.getMonth()]}</span>
                ${date === today ? '<span class="cal-today-tag">Azi</span>' : ""}
                <button type="button" class="cal-add-mini" data-action="add-event" data-date="${date}" aria-label="Adaugă pe ${escapeHTML(getDateLabel(date))}">${icon("plus")}</button>
            </header>
            ${lessons.length ? `
                <div class="cal-lessons" aria-label="Orar">
                    ${lessons.map((m, i) => `
                        <button type="button" class="cal-lesson" data-action="add-event" data-date="${date}" data-mat="${escapeHTML(m)}"
                            title="${escapeHTML(`Ora ${i + 1}: ${m} — adaugă un test sau o temă`)}"><span class="cal-lesson-n">${i + 1}</span><span class="cal-lesson-name">${escapeHTML(m)}</span></button>`).join("")}
                </div>` : ""}
            <div class="cal-items">${items.map(o => eventCardHTML(o, links)).join("")}</div>
            ${calPlanHTML(date)}
            <button type="button" class="cal-add" data-action="add-event" data-date="${date}">${icon("plus")} Adaugă</button>
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
                    ${ev.repeat ? `<span class="cal-ev-rep" title="${ev.repeat.every === 2 ? "Se repetă la 2 săptămâni" : "Se repetă săptămânal"}">↻</span>` : ""}
                </span>
                <b class="cal-ev-title">${escapeHTML(ev.title)}</b>
                ${ev.subject && ev.title !== autoEventTitle(ev.type, ev.subject) ? `<small class="cal-ev-sub">${escapeHTML(ev.subject)}</small>` : ""}
            </button>
            ${gradeBtn}
        </article>`;
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
            <button type="button" class="cal-mcell ${out ? "is-out" : ""} ${date === today ? "is-today" : ""}" data-action="cal-goto" data-date="${date}"
                aria-label="${escapeHTML(`${getDateLabel(date)}${items.length ? `, ${plural(items.length, "eveniment", "evenimente")}` : ""}`)}">
                <b>${parseDateKey(date).getDate()}</b>
                ${items.slice(0, 3).map(({ ev, date: d }) => `<span class="cal-mpill ev-${EVENT_TYPE_CLASS[ev.type] || "personal"} ${isOccurrenceDone(ev, d, links) ? "is-done" : ""}">${escapeHTML(ev.title)}</span>`).join("")}
                ${items.length > 3 ? `<span class="cal-mmore">+${items.length - 3}</span>` : ""}
            </button>`);
    }

    $("cal-body").innerHTML = `
        <div class="cal-month">
            ${[1, 2, 3, 4, 5, 6, 0].map(wd => `<span class="cal-month-wd" aria-hidden="true">${WEEKDAY_SHORT[wd]}</span>`).join("")}
            ${cells.join("")}
        </div>`;
}

/* ---------- navigare ---------- */
function calNavigate(offset) {
    const d = parseDateKey(ui.cal.date);
    ui.cal.date = ui.cal.view === "month"
        ? getLocalDateKey(new Date(d.getFullYear(), d.getMonth() + offset, 1))
        : addDays(ui.cal.date, offset * 7);
    renderCalendar();
}

function calGoto(dateKey, { view = "week" } = {}) {
    if (!DATE_KEY_RE.test(String(dateKey))) return;
    ui.cal.date = dateKey;
    ui.cal.view = view;
    if (ui.activeTab !== "tab-calendar") switchTab("tab-calendar");
    else renderCalendar();

    const col = document.querySelector(`.cal-col[data-date="${dateKey}"]`);
    if (col) {
        col.scrollIntoView({ block: "nearest", behavior: "smooth" });
        col.classList.add("flash");
        setTimeout(() => col.classList.remove("flash"), 1600);
    }
}

/** Folosită de Dashboard, Catalog și căutare. */
function showDateInCalendar(dateKey) {
    calGoto(dateKey);
}

registerTab("tab-calendar", { render: renderCalendar, title: "Calendar", icon: "calendar", group: "day" });
