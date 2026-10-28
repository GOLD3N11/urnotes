/* urNotes · Orarul: o săptămână colorată, ca orarul de pe ușa clasei.
   Calculator: cele cinci zile una lângă alta; telefon: o zi pe ecran, cu zilele sus și materiile jos, la îndemână.
   Adaugi atingând materiile (în ordinea orelor) sau trăgându-le în zi; atingi o oră ca s-o schimbi, muți sau scoți.
   Se salvează la închidere, cu „Anulează” în mesaj.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const tt = { draft: null, day: 1, sel: null, returnFocus: null, drag: null };

const ttList = day => (tt.draft[day] ||= []);
const ttCount = () => TIMETABLE_DAYS.reduce((n, d) => n + (tt.draft[d] || []).length, 0);

/** Orarul curățat (fără zile goale sau materii șterse), cum se salvează. */
function ttClean(src) {
    const out = {};
    TIMETABLE_DAYS.forEach(day => {
        const list = (src[day] || []).filter(m => state.subjects[m]).slice(0, TIMETABLE_MAX);
        if (list.length) out[day] = list;
    });
    return out;
}

function openTimetable({ day = 0 } = {}) {
    if (!requireAccount()) return;
    if (!Object.keys(state.subjects).length) {
        showToast("⚠️ Adaugă mai întâi materiile, apoi orarul.");
        return;
    }
    closeActionModal();
    if (typeof closePalette === "function") closePalette({ restore: false });
    if (typeof ccCloseOverlay === "function") ccCloseOverlay();
    tt.draft = clone(ttClean(state.timetable));
    const todayWd = new Date().getDay();
    tt.day = TIMETABLE_DAYS.includes(Number(day)) ? Number(day)
        : TIMETABLE_DAYS.find(d => !(tt.draft[d] || []).length) || (TIMETABLE_DAYS.includes(todayWd) ? todayWd : 1);
    tt.sel = null;
    tt.returnFocus = document.activeElement;
    $("tt-overlay").hidden = false;
    document.body.classList.add("tt-open");
    renderTimetable();
    // Cu mouse/tastatură, focusul merge pe prima materie; pe ecran tactil, pe fereastră (fără inel pe un buton)
    const fine = window.matchMedia?.("(pointer: fine)")?.matches;
    const first = $("tt-overlay").querySelector(".tt-tap:not([disabled])");
    if (fine && first) first.focus({ preventScroll: true });
    else { $("tt-card").setAttribute("tabindex", "-1"); $("tt-card").focus({ preventScroll: true }); }
}
/** Numele vechi, folosit din alte locuri (configurare, Azi, Calendar). */
const openTimetableModal = () => openTimetable();

function closeTimetable({ save = true } = {}) {
    const box = $("tt-overlay");
    if (!box || box.hidden) return;
    const next = ttClean(tt.draft || {});
    const changed = JSON.stringify(next) !== JSON.stringify(ttClean(state.timetable));
    box.hidden = true;
    document.body.classList.remove("tt-open");
    tt.draft = null;
    tt.sel = null;
    if (save && changed) {
        withUndo("🗓️ Am salvat orarul.", () => {
            state.timetable = next;
            addActivity("Ai actualizat orarul.");
        });
    }
    const back = tt.returnFocus;
    tt.returnFocus = null;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
    if (ui.tourAfterModal) {
        ui.tourAfterModal = false;
        setTimeout(maybeStartTour, 300);
    }
}

/* ---------- desenul ---------- */
function renderTimetable(focus = "", { reveal = "" } = {}) {
    const box = $("tt-card");
    if (!box || !tt.draft) return;
    // Redesenăm tot, dar păstrăm unde ai derulat (altfel fiecare atingere te-ar arunca sus)
    const keep = {
        week: box.querySelector(".tt-week")?.scrollTop || 0,
        weekLeft: box.querySelector(".tt-week")?.scrollLeft || 0,
        taps: box.querySelector(".tt-taps")?.scrollTop || 0,
        day: box.dataset.day
    };
    const subjects = Object.keys(state.subjects).sort((a, b) => a.localeCompare(b, "ro"));
    const day = tt.day;
    const list = ttList(day);
    const sel = tt.sel !== null && tt.sel < list.length ? tt.sel : null;
    tt.sel = sel;
    const full = list.length >= TIMETABLE_MAX;
    const total = ttCount();
    const nextDay = TIMETABLE_DAYS.find(d => d > day);

    const hint = sel !== null
        ? `Alege altă materie pentru <b>ora ${sel + 1}</b>.`
        : full ? `${escapeHTML(WEEKDAY_LONG[day])} e plină (${TIMETABLE_MAX} ore).`
            : `Atinge o materie: intră la <b>${escapeHTML(WEEKDAY_LONG[day].toLowerCase())}, ora ${list.length + 1}</b>.`;

    const col = d => {
        const items = tt.draft[d] || [];
        const prev = TIMETABLE_DAYS[TIMETABLE_DAYS.indexOf(d) - 1];
        const prevList = prev ? tt.draft[prev] || [] : [];
        const canCopy = prevList.length && JSON.stringify(prevList) !== JSON.stringify(items);
        const on = d === day;
        return `
            <section class="tt-col ${on ? "is-active" : ""}" data-day="${d}" aria-label="${escapeHTML(WEEKDAY_LONG[d])}">
                <header class="tt-col-head">
                    <button type="button" class="tt-col-pick" data-action="tt-day" data-day="${d}" aria-pressed="${on}">
                        <b>${escapeHTML(WEEKDAY_LONG[d])}</b><small>${items.length ? plural(items.length, "oră", "ore") : "liberă"}</small>
                    </button>
                    <span class="tt-col-tools">
                        ${canCopy ? `<button type="button" class="tt-tool" data-action="tt-copy" data-day="${d}" title="Copiază orele de ${escapeHTML(WEEKDAY_LONG[prev].toLowerCase())}">${icon("copy")}<span>Ca ${escapeHTML(WEEKDAY_LONG[prev].toLowerCase())}</span></button>` : ""}
                        ${items.length ? `<button type="button" class="tt-tool" data-action="tt-clear" data-day="${d}" aria-label="Golește ${escapeHTML(WEEKDAY_LONG[d].toLowerCase())}" title="Golește ziua">${icon("trash")}<span class="tt-lbl">Golește</span></button>` : ""}
                    </span>
                </header>
                <ol class="tt-list">
                    ${items.map((m, i) => {
                        const isSel = on && sel === i;
                        return `
                        <li class="tt-row ${isSel ? "is-sel" : ""}">
                            <button type="button" class="tt-cell" data-action="tt-cell" data-day="${d}" data-i="${i}" draggable="true" style="${subjectStyle(m)}"
                                aria-pressed="${isSel}" aria-label="${escapeHTML(`Ora ${i + 1}, ${m}`)}">
                                <span class="tt-n" aria-hidden="true">${i + 1}</span>
                                <span class="tt-name">${escapeHTML(shortSubjectName(m))}</span>
                            </button>
                            ${isSel ? `<span class="tt-cell-tools">
                                <button type="button" data-action="tt-move" data-day="${d}" data-i="${i}" data-by="-1" aria-label="Mută mai sus" ${i === 0 ? "disabled" : ""}>${icon("arrow-up")}<span class="tt-lbl" aria-hidden="true">Sus</span></button>
                                <button type="button" data-action="tt-move" data-day="${d}" data-i="${i}" data-by="1" aria-label="Mută mai jos" ${i === items.length - 1 ? "disabled" : ""}>${icon("arrow-down")}<span class="tt-lbl" aria-hidden="true">Jos</span></button>
                                <button type="button" class="is-danger" data-action="tt-remove" data-day="${d}" data-i="${i}" aria-label="${escapeHTML(`Scoate ${m}, ora ${i + 1}`)}">${icon("trash")}<span class="tt-lbl" aria-hidden="true">Scoate</span></button>
                            </span>` : ""}
                        </li>`;
                    }).join("")}
                    ${items.length < TIMETABLE_MAX ? `<li class="tt-row"><button type="button" class="tt-slot ${on && sel === null ? "is-next" : ""}" data-action="tt-slot" data-day="${d}">${icon("plus")} <span class="tt-slot-d">Ora ${items.length + 1}</span><span class="tt-slot-m">Adaugă ora ${items.length + 1}</span></button></li>` : ""}
                </ol>
            </section>`;
    };

    box.innerHTML = `
        <header class="tt-head">
            <div class="tt-head-text">
                <h2 id="tt-title">${icon("calendar-days", "tt-title-ico")} Orarul tău</h2>
                <p>${total ? `${plural(total, "oră", "ore")} pe săptămână` : "Alege ziua, apoi atinge materiile în ordinea orelor."}</p>
            </div>
            <button type="button" class="btn btn-primary tt-done" data-action="tt-done">${icon("check")} Gata</button>
        </header>
        <nav class="tt-days" aria-label="Ziua">
            ${TIMETABLE_DAYS.map(d => `<button type="button" class="tt-daytab" data-action="tt-day" data-day="${d}" aria-pressed="${d === day}">
                <b>${WEEKDAY_SHORT[d]}</b><small>${(tt.draft[d] || []).length || "–"}</small></button>`).join("")}
        </nav>
        <div class="tt-week">${TIMETABLE_DAYS.map(col).join("")}</div>
        <div class="tt-pal">
            <div class="tt-pal-head">
                <p class="tt-pal-hint" aria-live="polite">${hint}</p>
                ${sel !== null ? `<button type="button" class="btn btn-text btn-sm" data-action="tt-cell" data-day="${day}" data-i="${sel}">Renunț</button>`
                    : nextDay && list.length ? `<button type="button" class="btn btn-glass btn-sm" data-action="tt-day" data-day="${nextDay}">${escapeHTML(WEEKDAY_LONG[nextDay])} ${icon("chevron")}</button>` : ""}
            </div>
            <div class="tt-taps">
                ${subjects.map(m => `<button type="button" class="tt-tap" data-action="tt-tap" data-mat="${escapeHTML(m)}" draggable="true" style="${subjectStyle(m)}" title="${escapeHTML(m)}" ${full && sel === null ? "disabled" : ""}>
                    <i aria-hidden="true">${escapeHTML(subjectInitials(m))}</i><span>${escapeHTML(shortSubjectName(m))}</span></button>`).join("")}
            </div>
        </div>`;
    box.dataset.day = String(day);
    const week = box.querySelector(".tt-week"), taps = box.querySelector(".tt-taps");
    // pe telefon se vede o singură zi: la altă zi pornim de sus; pe calculator toată săptămâna rămâne pe loc
    const oneDay = window.matchMedia?.("(max-width: 760px)")?.matches;
    if (week) { week.scrollTop = oneDay && keep.day !== String(day) ? 0 : keep.week; week.scrollLeft = keep.weekLeft; }
    if (taps) taps.scrollTop = keep.taps;
    if (reveal && week) ttReveal(week, box.querySelector(reveal));
    if (focus) box.querySelector(focus)?.focus({ preventScroll: true });
}

/** Derulează doar lista zilei (nu pagina) cât să se vadă elementul. */
function ttReveal(container, el) {
    if (!el) return;
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.bottom > c.bottom - 8) container.scrollTop += r.bottom - c.bottom + 8;
    else if (r.top < c.top + 8) container.scrollTop -= c.top + 8 - r.top;
}

/* ---------- ce face fiecare atingere ---------- */
function ttTap(mat) {
    if (!tt.draft || !state.subjects[mat]) return;
    const list = ttList(tt.day);
    if (tt.sel !== null && tt.sel < list.length) {
        list[tt.sel] = mat;          // înlocuiește ora aleasă
        tt.sel = null;
    } else if (list.length < TIMETABLE_MAX) {
        list.push(mat);              // următoarea oră din zi
    } else return;
    renderTimetable(`.tt-tap[data-mat="${CSS.escape(mat)}"]`, { reveal: `.tt-col[data-day="${tt.day}"] .tt-slot, .tt-col[data-day="${tt.day}"] .tt-row:last-child` });
}

function ttInsert(day, index, mat) {
    const list = ttList(day);
    if (list.length >= TIMETABLE_MAX) { showToast(`⚠️ ${WEEKDAY_LONG[day]} are deja ${TIMETABLE_MAX} ore.`); return false; }
    list.splice(Math.max(0, Math.min(index, list.length)), 0, mat);
    return true;
}

Object.assign(ACTIONS, {
    "timetable": el => openTimetable({ day: el?.dataset?.day }),
    "tt-done": () => closeTimetable(),
    "tt-close": () => closeTimetable(),
    "tt-day": el => {
        tt.day = Number(el.dataset.day);
        tt.sel = null;
        renderTimetable(el.classList.contains("tt-daytab") ? `.tt-daytab[data-day="${tt.day}"]` : `.tt-col-pick[data-day="${tt.day}"]`);
    },
    "tt-slot": el => {
        tt.day = Number(el.dataset.day);
        tt.sel = null;
        renderTimetable(".tt-tap:not([disabled])");
    },
    "tt-cell": el => {
        const day = Number(el.dataset.day), i = Number(el.dataset.i);
        const same = tt.day === day && tt.sel === i;
        tt.day = day;
        tt.sel = same ? null : i;
        renderTimetable(`.tt-cell[data-day="${day}"][data-i="${i}"]`, { reveal: ".tt-row.is-sel" });
    },
    "tt-tap": el => ttTap(el.dataset.mat),
    "tt-move": el => {
        const day = Number(el.dataset.day), i = Number(el.dataset.i), j = i + Number(el.dataset.by);
        const list = ttList(day);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        tt.sel = j;
        renderTimetable(`.tt-row.is-sel [data-action="tt-move"][data-by="${el.dataset.by}"]:not([disabled])`, { reveal: ".tt-row.is-sel" });
    },
    "tt-remove": el => {
        const day = Number(el.dataset.day);
        ttList(day).splice(Number(el.dataset.i), 1);
        tt.sel = null;
        renderTimetable(`.tt-slot[data-day="${day}"]`);
    },
    "tt-copy": el => {
        const day = Number(el.dataset.day);
        const prev = TIMETABLE_DAYS[TIMETABLE_DAYS.indexOf(day) - 1];
        if (!prev) return;
        tt.draft[day] = [...(tt.draft[prev] || [])];
        tt.day = day;
        tt.sel = null;
        renderTimetable(`.tt-col-pick[data-day="${day}"]`);
    },
    "tt-clear": el => {
        const day = Number(el.dataset.day);
        tt.draft[day] = [];
        tt.day = day;
        tt.sel = null;
        renderTimetable(`.tt-col-pick[data-day="${day}"]`);
    }
});

/* ---------- tastatura: Escape închide (și salvează), Delete scoate ora aleasă, Tab rămâne în orar ---------- */
document.addEventListener("keydown", event => {
    const box = $("tt-overlay");
    if (!box || box.hidden) return;
    if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (tt.sel !== null) { tt.sel = null; renderTimetable(`.tt-col-pick[data-day="${tt.day}"]`); }
        else closeTimetable();
        return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && tt.sel !== null && !isTyping(event.target)) {
        event.preventDefault();
        ACTIONS["tt-remove"]({ dataset: { day: tt.day, i: tt.sel } });
        return;
    }
    trapFocusIn(box, event);
}, true);

/* ---------- tras cu mouse-ul: o materie în zi, sau o oră în alt loc ---------- */
function ttDropTarget(el) {
    const cell = el.closest?.(".tt-cell");
    if (cell) return { day: Number(cell.dataset.day), index: Number(cell.dataset.i), el: cell.closest(".tt-row") };
    const col = el.closest?.(".tt-col");
    if (col) return { day: Number(col.dataset.day), index: (tt.draft[col.dataset.day] || []).length, el: col.querySelector(".tt-slot")?.closest(".tt-row") || col };
    return null;
}
document.addEventListener("dragstart", event => {
    const tap = event.target.closest?.("#tt-overlay .tt-tap");
    const cell = event.target.closest?.("#tt-overlay .tt-cell");
    if (!tap && !cell) return;
    tt.drag = tap ? { mat: tap.dataset.mat } : { day: Number(cell.dataset.day), i: Number(cell.dataset.i) };
    event.dataTransfer.effectAllowed = tap ? "copy" : "move";
    event.dataTransfer.setData("text/plain", tap ? tap.dataset.mat : "");
    $("tt-overlay").classList.add("is-dragging");
});
document.addEventListener("dragover", event => {
    if (!tt.drag) return;
    const target = ttDropTarget(event.target);
    document.querySelectorAll("#tt-overlay .is-drop").forEach(n => n.classList.remove("is-drop"));
    if (!target) return;
    event.preventDefault();
    target.el?.classList.add("is-drop");
});
document.addEventListener("drop", event => {
    if (!tt.drag) return;
    const target = ttDropTarget(event.target);
    const drag = tt.drag;
    tt.drag = null;
    if (!target || !tt.draft) return;
    event.preventDefault();
    if (drag.mat) {
        if (!ttInsert(target.day, target.index, drag.mat)) { renderTimetable(); return; }
    } else {
        const from = ttList(drag.day);
        const [mat] = from.splice(drag.i, 1);
        if (!mat) return;
        let index = target.index;
        if (drag.day === target.day && drag.i < index) index -= 1;
        if (!ttInsert(target.day, index, mat)) { from.splice(drag.i, 0, mat); renderTimetable(); return; }
    }
    tt.day = target.day;
    tt.sel = null;
    renderTimetable();
});
document.addEventListener("dragend", () => {
    tt.drag = null;
    $("tt-overlay")?.classList.remove("is-dragging");
    document.querySelectorAll("#tt-overlay .is-drop").forEach(n => n.classList.remove("is-drop"));
});

/* ---------- telefon: glisezi stânga/dreapta pe listă ca să schimbi ziua ---------- */
let ttTouch = null;
document.addEventListener("touchstart", event => {
    if (!event.target.closest?.("#tt-overlay .tt-week") || event.touches.length !== 1) { ttTouch = null; return; }
    ttTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
document.addEventListener("touchend", event => {
    if (!ttTouch || !tt.draft) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - ttTouch.x, dy = t.clientY - ttTouch.y;
    ttTouch = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
    const i = TIMETABLE_DAYS.indexOf(tt.day) + (dx < 0 ? 1 : -1);
    if (i < 0 || i >= TIMETABLE_DAYS.length) return;
    tt.day = TIMETABLE_DAYS[i];
    tt.sel = null;
    renderTimetable();
}, { passive: true });

["tt-done", "tt-close", "tt-day", "tt-slot", "tt-cell"].forEach(a => GUEST_OK.add(a));
