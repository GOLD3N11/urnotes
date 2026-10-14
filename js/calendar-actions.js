/* urNotes · Calendarul: formular, mutare, ștergere, orar.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== CALENDAR ==================== */
/* ---------- formularul de eveniment (adăugare și editare) ---------- */
/** Materiile în ordinea în care urmează în orar (cea de mâine prima), restul alfabetic. */
function subjectsBySoonest(after = getLocalDateKey()) {
    const next = Object.fromEntries(Object.keys(state.subjects).map(m => [m, nextLessonDate(m, after) || "9999"]));
    return Object.keys(state.subjects).sort((a, b) => next[a].localeCompare(next[b]) || a.localeCompare(b, "ro"));
}

function evSubjectChipsHTML(selected) {
    const chip = (m, label) => `<button type="button" class="ev-subj-chip ${m === selected ? "is-on" : ""}" data-action="ev-pick-subject" data-mat="${escapeHTML(m)}" role="radio" aria-checked="${m === selected}">${escapeHTML(label)}</button>`;
    return subjectsBySoonest().map(m => chip(m, shortSubjectName(m))).join("") + chip("", "Fără materie");
}

function eventFormHTML(v, { editing = false, occurrenceDate = "", autoDate = false } = {}) {
    const subjects = Object.keys(state.subjects);
    const isSeries = Boolean(v.repeat);
    const moreOpen = Boolean(v.repeat || v.description || (v.title && v.title !== autoEventTitle(v.type, v.subject)));
    return `
        <div class="ev-type-picker" role="radiogroup" aria-label="Tip eveniment">
            ${EVENT_TYPES.map(t => `
                <label class="ev-type-opt ev-${EVENT_TYPE_CLASS[t]}">
                    <input type="radio" name="ev-type" value="${escapeHTML(t)}" ${t === v.type ? "checked" : ""}>
                    <span>${icon(EVENT_TYPE_ICON[t])} ${escapeHTML(t)}</span>
                </label>`).join("")}
        </div>
        <div class="form-group">
            <label for="ev-subject">Materie</label>
            ${subjects.length ? `<div class="ev-subj-strip" role="radiogroup" aria-label="Alege materia">${evSubjectChipsHTML(v.subject)}</div>` : ""}
            <select id="ev-subject" class="glass-select ${subjects.length ? "ev-subject-select" : ""}">
                <option value="" ${v.subject ? "" : "selected"}>Fără materie</option>
                ${subjects.map(m => `<option value="${escapeHTML(m)}" ${m === v.subject ? "selected" : ""}>${escapeHTML(m)}</option>`).join("")}
            </select>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="ev-date">${isSeries && editing ? "Începe pe" : "Data"}</label>
                <input type="date" id="ev-date" class="glass-input" value="${escapeHTML(v.date)}" ${autoDate ? "data-auto" : ""}>
            </div>
            <div class="form-group">
                <label for="ev-time">Ora <span class="label-hint">(opțional)</span></label>
                <input type="time" id="ev-time" class="glass-input" value="${escapeHTML(v.time || "")}">
            </div>
        </div>
        <div id="ev-next-lesson" class="ev-hint ev-date-chips" role="group" aria-label="Alege repede ziua"></div>
        <details class="ev-more" ${moreOpen ? "open" : ""}>
        <summary>Titlu, repetare, notițe</summary>
        <div class="form-group">
            <label for="ev-title">Titlu <span class="label-hint">(opțional)</span></label>
            <input type="text" id="ev-title" class="glass-input" maxlength="100" autocomplete="off"
                value="${escapeHTML(v.title && v.title !== autoEventTitle(v.type, v.subject) ? v.title : "")}" placeholder="${escapeHTML(autoEventTitle(v.type, v.subject))}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="ev-repeat">Se repetă</label>
                <select id="ev-repeat" class="glass-select">
                    <option value="0" ${!v.repeat ? "selected" : ""}>Nu</option>
                    <option value="1" ${v.repeat?.every === 1 ? "selected" : ""}>Săptămânal</option>
                    <option value="2" ${v.repeat?.every === 2 ? "selected" : ""}>La 2 săptămâni</option>
                </select>
            </div>
            <div class="form-group">
                <label for="ev-until">Până la <span class="label-hint">(opțional)</span></label>
                <input type="date" id="ev-until" class="glass-input" value="${escapeHTML(v.repeat?.until || "")}" ${v.repeat ? "" : "disabled"}>
            </div>
        </div>
        <div class="form-group">
            <label for="ev-description">Notițe <span class="label-hint">(opțional)</span></label>
            <textarea id="ev-description" class="glass-input" rows="2" maxlength="500" placeholder="ex: capitolele 3–4, de adus calculatorul">${escapeHTML(v.description || "")}</textarea>
        </div>
        </details>
        ${editing ? `
            <div class="ev-edit-foot">
                ${isSeries ? `<p class="modal-hint">↻ Eveniment repetat: modificările se aplică întregii serii.</p>` : ""}
                <button type="button" class="btn btn-text text-danger" data-action="event-delete" data-id="${escapeHTML(v.id)}" data-date="${escapeHTML(occurrenceDate)}">${icon("trash")} Șterge evenimentul</button>
            </div>` : ""}`;
}

/** Actualizează în dialog: titlul propus, „următoarea oră” și câmpul „Până la”. */
function syncEventForm() {
    if (!$("ev-subject")) return;
    const type = document.querySelector("input[name='ev-type']:checked")?.value || "Test";
    const subject = $("ev-subject").value;
    $("ev-title").placeholder = autoEventTitle(type, subject);
    $("ev-until").disabled = $("ev-repeat").value === "0";

    const dateEl = $("ev-date");
    const next = subject ? nextLessonDate(subject) : null;
    // Eveniment nou fără zi aleasă: la alegerea materiei, data sare singură la următoarea ei oră
    if (next && dateEl.hasAttribute("data-auto")) dateEl.value = next;
    document.querySelectorAll(".ev-subj-chip").forEach(b => {
        const on = b.dataset.mat === subject;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
    });

    const today = getLocalDateKey();
    const options = [];
    if (next) options.push({ date: next, html: `${icon("calendar")} Ora de ${escapeHTML(shortSubjectName(subject))}: <b>${escapeHTML(weekdayLabel(next))}</b>`, label: `Următoarea oră de ${subject}` });
    [[0, "Azi"], [1, "Mâine"], [2, "Poimâine"], [7, "Peste o săptămână"]].forEach(([n, label]) => {
        const date = addDays(today, n);
        if (date !== next) options.push({ date, html: escapeHTML(label), label });
    });
    $("ev-next-lesson").innerHTML = options.map(o => `
        <button type="button" class="ev-hint-btn ${dateEl.value === o.date ? "is-active" : ""}" data-action="ev-use-date" data-date="${o.date}" aria-pressed="${dateEl.value === o.date}" aria-label="${escapeHTML(`${o.label}, ${longDateLabel(o.date)}`)}">${o.html}</button>`).join("");
}

function readEventForm() {
    const type = EVENT_TYPES.includes(document.querySelector("input[name='ev-type']:checked")?.value)
        ? document.querySelector("input[name='ev-type']:checked").value : "Personal";
    const subject = state.subjects[field("ev-subject")] ? field("ev-subject") : "";
    const date = field("ev-date");
    if (!DATE_KEY_RE.test(date) || Number.isNaN(parseDateKey(date).getTime())) {
        showToast("⚠️ Alege o dată.");
        $("ev-date")?.focus();
        return null;
    }
    const time = TIME_RE.test(field("ev-time")) ? field("ev-time") : "";
    const every = Number(field("ev-repeat"));
    const until = field("ev-until");
    if (every && until && (!DATE_KEY_RE.test(until) || until < date)) {
        showToast("⚠️ „Până la” trebuie să fie după data de început.");
        $("ev-until")?.focus();
        return null;
    }

    return {
        type,
        subject,
        date,
        time,
        title: field("ev-title").trim().replace(/\s+/g, " ").slice(0, 100) || autoEventTitle(type, subject),
        description: field("ev-description").trim().slice(0, 500),
        repeat: every === 1 || every === 2 ? { every, until: until || "" } : null
    };
}

function openEventModal({ id = null, date = "", subject = "", type = "" } = {}) {
    // Editare
    if (id) {
        const found = findEvent(id);
        if (!found) {
            showToast("⚠️ Evenimentul nu mai există.");
            return;
        }
        const { ev, start } = found;
        openModal({
            layout: "panel",
            title: `${ev.title}`,
            confirmText: "Salvează",
            body: eventFormHTML({ ...ev, date: start }, { editing: true, occurrenceDate: date || start }),
            onConfirm: () => {
                const values = readEventForm();
                if (!values) return;
                saveEventEdits(id, values);
            }
        });
        syncEventForm();
        return;
    }

    // Adăugare: data implicită = ziua aleasă, altfel următoarea oră a materiei, altfel azi.
    const preset = state.subjects[subject] ? subject : "";
    const when = DATE_KEY_RE.test(date) ? date : (preset && nextLessonDate(preset)) || getLocalDateKey();
    openModal({
        layout: "panel",
        title: `Eveniment nou · ${weekdayLabel(when)}`,
        confirmText: "Adaugă",
        body: eventFormHTML({ type: EVENT_TYPES.includes(type) ? type : "Test", subject: preset, date: when, title: "" }, { autoDate: !DATE_KEY_RE.test(date) }),
        onConfirm: () => {
            const values = readEventForm();
            if (!values) return;

            const ev = { id: uid(), title: values.title, time: values.time, type: values.type, subject: values.subject, description: values.description };
            if (values.repeat) ev.repeat = values.repeat;
            (state.calendar[values.date] ||= []).push(ev);

            addActivity(`Ai adăugat „${ev.title}” pentru ${getDateLabel(values.date)}${ev.repeat ? " (se repetă)" : ""}.`);
            ui.cal.date = values.date;
            closeActionModal();
            refresh();
            showToast(`Ai adăugat „${ev.title}”, ${relativeDayLabel(values.date)}.`);
        }
    });
    syncEventForm();
    // Cu materia deja aleasă, utilizatorul de obicei vrea doar să confirme.
    (preset ? $("action-modal-confirm") : $("ev-subject"))?.focus();
}

function saveEventEdits(id, values) {
    const found = findEvent(id);
    if (!found) {
        closeActionModal();
        showToast("⚠️ Evenimentul nu mai există.");
        return;
    }
    const { ev, start } = found;

    Object.assign(ev, { title: values.title, time: values.time, type: values.type, subject: values.subject, description: values.description });

    if (values.repeat) {
        ev.repeat = values.repeat;
    } else if (ev.repeat) {
        // Seria devine un eveniment unic, la data de început.
        delete ev.repeat;
        delete ev.skipDates;
        if (ev.doneDates) ev.doneDates = ev.doneDates[start] ? { [start]: true } : undefined;
        if (!ev.doneDates) delete ev.doneDates;
    }

    if (values.date !== start) moveEventStart(ev, start, values.date);

    clearEventAlertMeta(ev);
    addActivity(`Ai modificat „${ev.title}”.`);
    ui.cal.date = values.date;
    closeActionModal();
    refresh();
    showToast("Eveniment actualizat.");
}

/** Mută începutul unui eveniment; pentru unul unic, mută și starea „făcut” și legătura cu nota. */
function moveEventStart(ev, from, to) {
    const list = state.calendar[from] || [];
    const i = list.indexOf(ev);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) delete state.calendar[from];
    (state.calendar[to] ||= []).push(ev);

    if (!ev.repeat) {
        if (ev.doneDates?.[from]) ev.doneDates = { [to]: true };
        Object.values(state.subjects).forEach(sub => sub.grades.forEach(g => {
            if (g.eventId === ev.id && g.eventDate === from) g.eventDate = to;
        }));
    }
}

/** Mutare prin drag & drop: o apariție dintr-o serie devine un eveniment separat. */
function moveOccurrence(id, from, to) {
    if (!DATE_KEY_RE.test(String(to)) || from === to) return;
    const found = findEvent(id);
    if (!found) return;
    const { ev, start } = found;

    if (linkedGrade(gradeLinks(), ev, from)) {
        showToast("⚠️ Evenimentul are deja o notă, așa că rămâne la data lui.");
        return;
    }

    if (ev.repeat) {
        ev.skipDates = [...new Set([...(ev.skipDates || []), from])];
        if (ev.doneDates) delete ev.doneDates[from];
        const copy = { id: uid(), title: ev.title, time: ev.time, type: ev.type, subject: ev.subject, description: ev.description };
        (state.calendar[to] ||= []).push(copy);
    } else {
        moveEventStart(ev, start, to);
    }

    clearEventAlertMeta(ev);
    addActivity(`Ai mutat „${ev.title}” pe ${getDateLabel(to)}.`);
    refresh();
    showToast(`Ai mutat „${ev.title}” pe ${weekdayLabel(to)}.`);
}

function promptDeleteEvent(id, date) {
    const found = findEvent(id);
    if (!found) return;
    const { ev, start } = found;

    const removeSeries = () => {
        const list = state.calendar[start] || [];
        const i = list.indexOf(ev);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) delete state.calendar[start];
        clearEventAlertMeta(ev);
        addActivity(`Ai șters „${ev.title}”${ev.repeat ? " (toată seria)" : ""}.`);
    };

    if (!ev.repeat) {
        closeActionModal();
        withUndo(`Ai șters „${ev.title}”.`, removeSeries);
        return;
    }

    const occ = DATE_KEY_RE.test(String(date)) ? date : start;
    openModal({
        title: "Șterge evenimentul repetat",
        confirmText: "",
        cancelText: "Anulează",
        body: `
            <p class="modal-hint">„${escapeHTML(ev.title)}” se repetă ${ev.repeat.every === 2 ? "la 2 săptămâni" : "săptămânal"}.</p>
            <button type="button" class="reset-option-card" data-action="event-delete-one" data-id="${escapeHTML(id)}" data-date="${occ}">
                <span><span class="reset-option-title">Doar pe ${escapeHTML(weekdayLabel(occ))}</span>
                <span class="reset-option-hint">Celelalte apariții rămân.</span></span>
                <span class="reset-option-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" class="reset-option-card danger" data-action="event-delete-all" data-id="${escapeHTML(id)}">
                <span><span class="reset-option-title">Toată seria</span>
                <span class="reset-option-hint">Toate aparițiile, trecute și viitoare.</span></span>
                <span class="reset-option-arrow" aria-hidden="true">→</span>
            </button>`
    });
}

function deleteSeries(id) {
    const found = findEvent(id);
    if (!found) return;
    const { ev, start } = found;
    closeActionModal();
    withUndo(`Ai șters toată seria „${ev.title}”.`, () => {
        const list = state.calendar[start] || [];
        const i = list.indexOf(ev);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) delete state.calendar[start];
        clearEventAlertMeta(ev);
        addActivity(`Ai șters „${ev.title}” (toată seria).`);
    });
}

function deleteOccurrence(id, date) {
    const found = findEvent(id);
    if (!found || !found.ev.repeat) return;
    const { ev } = found;
    closeActionModal();
    withUndo(`Ai șters „${ev.title}” doar pe ${weekdayLabel(date)}.`, () => {
        ev.skipDates = [...new Set([...(ev.skipDates || []), date])];
        if (ev.doneDates) delete ev.doneDates[date];
        addActivity(`Ai șters „${ev.title}” din ${getDateLabel(date)}.`);
    });
}

/* ---------- făcut / notă ---------- */
function toggleEventDone(id, date) {
    const found = findEvent(id);
    if (!found || !DATE_KEY_RE.test(String(date))) return;
    const { ev } = found;
    if (linkedGrade(gradeLinks(), ev, date)) return;

    ev.doneDates ||= {};
    if (ev.doneDates[date]) delete ev.doneDates[date];
    else ev.doneDates[date] = true;
    const nowDone = Boolean(ev.doneDates[date]);
    if (Object.keys(ev.doneDates).length === 0) delete ev.doneDates;

    if (nowDone) addActivity(`Ai bifat „${ev.title}” ca făcut.`);
    refresh();
}

/** Nota de la un test trecut, dintr-o singură atingere (pe Azi); se poate anula din mesaj. */
function quickGradeForEvent(id, date, val) {
    const found = findEvent(id);
    const v = parseStrictInteger(val, 1, 10);
    if (!found || v === null || !canGradeOccurrence(found.ev, date, gradeLinks())) return;
    const { ev } = found;
    withUndo(`Ai adăugat nota ${v} la ${ev.subject} („${ev.title}”).`, () => {
        state.subjects[ev.subject].grades.push({ val: v, type: GRADE_TYPE_FOR_EVENT[ev.type] || "Test", date, eventId: ev.id, eventDate: date });
        addActivity(`Ai adăugat nota ${v} (${GRADE_TYPE_FOR_EVENT[ev.type] || "Test"}) la ${ev.subject}.`);
    });
}

function openGradeForEvent(id, date) {
    const found = findEvent(id);
    if (!found) return;
    const { ev } = found;
    if (!canGradeOccurrence(ev, date, gradeLinks())) {
        showToast(state.subjects[ev.subject] ? "Nota se poate adăuga după data evenimentului." : "Alege mai întâi materia evenimentului.");
        return;
    }
    openAddGradeModal(ev.subject, { eventId: ev.id, eventDate: date, type: GRADE_TYPE_FOR_EVENT[ev.type], title: ev.title });
}

/* ---------- orar ---------- */
function openTimetableModal() {
    if (Object.keys(state.subjects).length === 0) {
        showToast("⚠️ Adaugă mai întâi materiile, apoi orarul.");
        return;
    }
    ui.ttDraft = clone(state.timetable);
    ui.ttDay = TIMETABLE_DAYS.find(d => !(state.timetable[d] || []).length) || 1; // prima zi necompletată
    openModal({
        layout: "panel",
        title: "Orarul săptămânal",
        confirmText: "Salvează orarul",
        body: `
            <p class="modal-hint">Alege ziua, apoi atinge materiile în ordinea orelor. „Ca luni” copiază ziua de dinainte. În calendar, atinge o oră ca să programezi rapid un test sau o temă.</p>
            <div id="tt-editor" class="tt-editor">${ttEditorHTML()}</div>`,
        onConfirm: () => {
            state.timetable = {};
            TIMETABLE_DAYS.forEach(day => {
                const list = (ui.ttDraft[day] || []).filter(m => state.subjects[m]);
                if (list.length) state.timetable[day] = list;
            });
            ui.ttDraft = null;
            addActivity("Ai actualizat orarul.");
            closeActionModal();
            refresh();
            showToast("🗓️ Orar salvat.");
        }
    });
}

function ttEditorHTML() {
    const subjects = Object.keys(state.subjects);
    const active = TIMETABLE_DAYS.includes(Number(ui.ttDay)) ? Number(ui.ttDay) : 1;
    const activeFull = (ui.ttDraft[active] || []).length >= TIMETABLE_MAX;
    const nextDay = TIMETABLE_DAYS.find(d => d > active);
    // Paleta: o atingere = o oră adăugată la ziua aleasă, în ordine (mai repede decât câte o listă pentru fiecare oră)
    const palette = `
        <div class="tt-palette">
            <p class="tt-palette-hint">Atinge materiile în ordinea orelor. Se adaugă la <b>${WEEKDAY_LONG[active]}</b>.</p>
            <div class="tt-palette-chips">
                ${subjects.map(m => `<button type="button" class="tt-tap" data-action="tt-tap" data-mat="${escapeHTML(m)}" title="${escapeHTML(m)}" ${activeFull ? "disabled" : ""}>${escapeHTML(shortSubjectName(m))}</button>`).join("")}
            </div>
            ${nextDay ? `<button type="button" class="btn btn-glass btn-sm tt-next" data-action="tt-day" data-day="${nextDay}">Gata, treci la ${WEEKDAY_LONG[nextDay]} →</button>` : ""}
        </div>`;
    return palette + TIMETABLE_DAYS.map(day => {
        const list = ui.ttDraft[day] || [];
        const full = list.length >= TIMETABLE_MAX;
        const prev = TIMETABLE_DAYS[TIMETABLE_DAYS.indexOf(day) - 1];
        const prevList = prev ? ui.ttDraft[prev] || [] : [];
        return `
            <div class="tt-day ${day === active ? "is-active" : ""}">
                <div class="tt-day-head">
                    <button type="button" class="tt-day-pick" data-action="tt-day" data-day="${day}" aria-pressed="${day === active}">
                        <b>${WEEKDAY_LONG[day]}</b>
                        <small>${list.length ? plural(list.length, "oră", "ore") : "liber"}</small>
                    </button>
                    <span class="tt-day-tools">
                        ${prevList.length && JSON.stringify(prevList) !== JSON.stringify(list) ? `<button type="button" class="btn btn-text btn-sm" data-action="tt-copy" data-day="${day}" title="Copiază orele de ${WEEKDAY_LONG[prev]}">Ca ${WEEKDAY_LONG[prev].toLowerCase()}</button>` : ""}
                        ${list.length ? `<button type="button" class="btn btn-text btn-sm" data-action="tt-clear" data-day="${day}" aria-label="Golește ${WEEKDAY_LONG[day]}">Golește</button>` : ""}
                    </span>
                </div>
                <div class="tt-chips">
                    ${list.map((m, i) => `
                        <span class="tt-chip"><span class="tt-num">${i + 1}</span>${escapeHTML(m)}
                            <button type="button" data-action="tt-remove" data-day="${day}" data-index="${i}" aria-label="${escapeHTML(`Scoate ${m}, ora ${i + 1}, ${WEEKDAY_LONG[day]}`)}">×</button>
                        </span>`).join("")}
                    <select class="glass-select tt-add" data-tt-add="${day}" aria-label="Adaugă o oră ${WEEKDAY_LONG[day]}" ${full ? "disabled" : ""}>
                        <option value="">Adaugă oră</option>
                        ${subjects.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join("")}
                    </select>
                </div>
            </div>`;
    }).join("");
}

function rerenderTimetableEditor(focusDay, focusSelector = null) {
    const box = $("tt-editor");
    if (!box) return;
    box.innerHTML = ttEditorHTML();
    (focusSelector && box.querySelector(focusSelector) || box.querySelector(`[data-tt-add="${focusDay}"]`))?.focus({ preventScroll: Boolean(focusSelector) });
}

/** Schimbările din câmpurile dialogului (formular eveniment, editor orar). */
function handleModalChange(event) {
    const el = event.target;
    if (el.matches("[data-tt-add]") && ui.ttDraft) {
        const day = el.dataset.ttAdd;
        if (state.subjects[el.value] && (ui.ttDraft[day] || []).length < TIMETABLE_MAX) {
            (ui.ttDraft[day] ||= []).push(el.value);
        }
        rerenderTimetableEditor(day);
        return;
    }
    if (el.id === "modal-grade-mat") syncGradeSubjectChips();
    if (el.id === "ev-date") el.removeAttribute("data-auto"); // a ales singur ziua: n-o mai mutăm
    if (el.id === "ev-subject" || el.id === "ev-repeat" || el.id === "ev-date" || el.name === "ev-type") syncEventForm();
}

/* ---------- drag & drop în săptămână ---------- */
function bindCalendarEvents() {
    const body = $("cal-body");
    if (!body) return;
    let dragging = null;

    body.addEventListener("dragstart", event => {
        const card = event.target.closest?.(".cal-ev");
        if (!card) return;
        dragging = { id: card.dataset.id, date: card.dataset.date };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.dataset.id);
        card.classList.add("dragging");
    });
    body.addEventListener("dragend", event => {
        event.target.closest?.(".cal-ev")?.classList.remove("dragging");
        body.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
        dragging = null;
    });
    body.addEventListener("dragover", event => {
        const col = event.target.closest?.(".cal-col");
        if (!dragging || !col) return;
        event.preventDefault();
        body.querySelectorAll(".drop-target").forEach(el => el !== col && el.classList.remove("drop-target"));
        col.classList.add("drop-target");
    });
    body.addEventListener("drop", event => {
        const col = event.target.closest?.(".cal-col");
        if (!dragging || !col) return;
        event.preventDefault();
        const { id, date } = dragging;
        dragging = null;
        moveOccurrence(id, date, col.dataset.date);
    });

    $("action-modal-body").addEventListener("change", handleModalChange);
}
