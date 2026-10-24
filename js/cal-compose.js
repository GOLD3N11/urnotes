/* urNotes · Adăugarea rapidă în calendar: o bară deasupra calendarului, fără ferestre.
   Scrii pe un rând („test la mate vineri la 8”) sau alegi din etichete: ce, la ce materie, ce zi. Enter și gata.
   Ce înțelege din text completează etichetele pe care nu le-ai ales tu; ce alegi tu nu mai e schimbat de text.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const CC_TYPES = ["Test", "Temă", "Proiect", "Examen", "Prezentare", "Personal"];
const CC_TYPE_LABEL = { Personal: "Altceva" };
const cc = { open: false, type: "Test", subject: "", date: "", time: "", manual: new Set(), moreSubjects: false };

const ccToday = () => getLocalDateKey();
function ccReset({ keepOpen = false } = {}) {
    Object.assign(cc, { open: keepOpen, type: "Test", subject: "", date: ccToday(), time: "", manual: new Set(), moreSubjects: false });
}
ccReset();

/** Materiile, cu orele zilei alese întâi (de acolo vin de obicei testele și temele). */
function ccSubjects() {
    const all = Object.keys(state.subjects).sort((a, b) => a.localeCompare(b, "ro"));
    const wd = parseDateKey(cc.date).getDay();
    const lessons = isSchoolDay(cc.date) ? [...new Set(state.timetable[wd] || [])].filter(m => state.subjects[m]) : [];
    return { lessons, rest: all.filter(m => !lessons.includes(m)) };
}

/** Zilele propuse: azi, mâine și următoarele 5. */
function ccDays() {
    return Array.from({ length: 7 }, (_, i) => addDays(ccToday(), i));
}
function ccDayLabel(d) {
    const n = daysBetween(ccToday(), d);
    if (n === 0) return "Azi";
    if (n === 1) return "Mâine";
    const dt = parseDateKey(d);
    return `${WEEKDAY_SHORT[dt.getDay()]} ${dt.getDate()}`;
}

function renderCompose() {
    const box = $("cal-compose");
    if (!box) return;
    if (!DATE_KEY_RE.test(cc.date)) cc.date = ccToday();
    const had = $("cc-text");
    const text = had ? had.value : "";
    const focused = document.activeElement === had;
    const sel = had && focused ? [had.selectionStart, had.selectionEnd] : null;

    const { lessons, rest } = ccSubjects();
    const subjChip = m => `<button type="button" class="cc-chip cc-subj ${cc.subject === m ? "is-on" : ""}" data-action="cc-subject" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}" aria-pressed="${cc.subject === m}"><i aria-hidden="true"></i>${escapeHTML(shortSubjectName(m))}</button>`;
    const shownRest = cc.moreSubjects ? rest : rest.slice(0, Math.max(0, 6 - lessons.length));
    const hiddenCount = rest.length - shownRest.length;
    const days = ccDays();
    const otherDay = !days.includes(cc.date);
    const cls = EVENT_TYPE_CLASS[cc.type] || "personal";

    box.classList.toggle("is-open", cc.open);
    box.innerHTML = `
        <form class="cc" id="cc-form" autocomplete="off">
            <div class="cc-bar">
                <span class="cc-ico ev-${cls}" aria-hidden="true">${icon(EVENT_TYPE_ICON[cc.type] || "plus")}</span>
                <input type="text" id="cc-text" class="cc-text" maxlength="100" spellcheck="false" enterkeyhint="done"
                    placeholder="${matchMedia("(max-width: 640px)").matches ? "Adaugă un test, o temă…" : "Adaugă ceva… ex: test la mate vineri la 8"}" aria-label="Ce adaugi în calendar" value="${escapeHTML(text)}">
                <button type="submit" class="btn btn-primary cc-add">${icon("plus")} <span>Adaugă</span></button>
            </div>
            <div class="cc-body" ${cc.open ? "" : "hidden"}>
                <div class="cc-row" role="group" aria-label="Ce este">
                    <span class="cc-lab">Ce</span>
                    <div class="cc-chips">${CC_TYPES.map(t => `<button type="button" class="cc-chip cc-type ev-${EVENT_TYPE_CLASS[t] || "personal"} ${cc.type === t ? "is-on" : ""}" data-action="cc-type" data-type="${escapeHTML(t)}" aria-pressed="${cc.type === t}">${icon(EVENT_TYPE_ICON[t] || "pin")} ${escapeHTML(CC_TYPE_LABEL[t] || t)}</button>`).join("")}</div>
                </div>
                <div class="cc-row" role="group" aria-label="Materia">
                    <span class="cc-lab">Materia</span>
                    <div class="cc-chips">
                        ${lessons.length ? `<span class="cc-sub-lab">${escapeHTML(cc.date === ccToday() ? "orele de azi" : `orele ${ccDayLabel(cc.date) === "Mâine" ? "de mâine" : `de ${WEEKDAY_LONG[parseDateKey(cc.date).getDay()].toLowerCase()}`}`)}</span>` : ""}
                        ${lessons.map(subjChip).join("")}
                        ${lessons.length && shownRest.length ? `<span class="cc-sep" aria-hidden="true"></span>` : ""}
                        ${shownRest.map(subjChip).join("")}
                        ${hiddenCount > 0 ? `<button type="button" class="cc-chip cc-ghost" data-action="cc-more-subjects">+ încă ${hiddenCount}</button>` : ""}
                        <button type="button" class="cc-chip cc-ghost ${cc.subject ? "" : "is-on"}" data-action="cc-subject" data-mat="" aria-pressed="${!cc.subject}">Fără materie</button>
                    </div>
                </div>
                <div class="cc-row" role="group" aria-label="Când">
                    <span class="cc-lab">Când</span>
                    <div class="cc-chips">
                        ${days.map(d => `<button type="button" class="cc-chip cc-day ${cc.date === d ? "is-on" : ""}" data-action="cc-day" data-date="${d}" aria-pressed="${cc.date === d}">${escapeHTML(ccDayLabel(d))}</button>`).join("")}
                        <label class="cc-chip cc-pick ${otherDay ? "is-on" : ""}">${icon("calendar")}<span>${otherDay ? escapeHTML(shortDayLabel(cc.date)) : "Altă zi"}</span><input type="date" id="cc-date" value="${escapeHTML(cc.date)}" aria-label="Altă zi"></label>
                        <label class="cc-chip cc-pick ${cc.time ? "is-on" : ""}">${icon("clock")}<span>${cc.time ? escapeHTML(cc.time) : "Oră"}</span><input type="time" id="cc-time" value="${escapeHTML(cc.time)}" aria-label="Ora"></label>
                        ${cc.time ? `<button type="button" class="cc-chip cc-ghost" data-action="cc-time-clear" aria-label="Fără oră">×</button>` : ""}
                    </div>
                </div>
                <div class="cc-foot">
                    <p class="cc-preview" id="cc-preview" aria-live="polite"></p>
                    <span class="cc-foot-btns">
                        <button type="button" class="btn btn-text btn-sm" data-action="cc-more">Repetă, notițe…</button>
                        <button type="button" class="btn btn-text btn-sm" data-action="cc-close">Închide</button>
                    </span>
                </div>
            </div>
        </form>`;
    ccPreview();
    // ziua aleasă se vede și în agendă
    document.querySelectorAll(".ag-day.is-target").forEach(el => el.classList.remove("is-target"));
    if (cc.open) document.querySelector(`.ag-day[data-date="${cc.date}"]`)?.classList.add("is-target");
    const input = $("cc-text");
    if (focused && input) {
        input.focus();
        if (sel) input.setSelectionRange(sel[0], sel[1]);
    }
}

/** Ce se va adăuga, într-o propoziție. */
function ccPreview() {
    const el = $("cc-preview");
    if (!el) return;
    const text = $("cc-text")?.value || "";
    const title = eventTitleFrom(text, cc.type, cc.subject);
    const when = `${relativeDayLabel(cc.date)}${daysBetween(ccToday(), cc.date) > 1 ? `, ${shortDayLabel(cc.date)}` : ""}${cc.time ? ` la ${cc.time}` : ""}`;
    el.innerHTML = `${icon("check")} <b>${escapeHTML(title)}</b> · ${escapeHTML(when)}`;
    const ico = document.querySelector("#cal-compose .cc-ico");
    if (ico) {
        ico.className = `cc-ico ev-${EVENT_TYPE_CLASS[cc.type] || "personal"}`;
        ico.innerHTML = icon(EVENT_TYPE_ICON[cc.type] || "plus");
    }
}

/** Textul scris completează ce n-ai ales tu. */
function ccFromText() {
    const p = parseEventText($("cc-text")?.value || "");
    const before = [cc.type, cc.subject, cc.date, cc.time].join("|");
    if (!cc.manual.has("type")) cc.type = p.type || "Test";
    if (!cc.manual.has("subject")) cc.subject = p.subject || "";
    if (!cc.manual.has("date")) cc.date = p.date || (cc.subject && nextLessonDate(cc.subject)) || ccToday();
    if (!cc.manual.has("time")) cc.time = p.time || "";
    if (before !== [cc.type, cc.subject, cc.date, cc.time].join("|")) renderCompose();
    else ccPreview();
}

function ccOpen({ focus = true } = {}) {
    if (!requireAccount()) return;
    if (!cc.open) {
        cc.open = true;
        renderCompose();
    }
    if (focus) {
        const input = $("cc-text");
        input?.focus();
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h")) || 60;
        const box = $("cal-compose");
        if (box && box.getBoundingClientRect().top < bar) window.scrollTo({ top: box.getBoundingClientRect().top + window.scrollY - bar - 12, behavior: reduceMotion() ? "auto" : "smooth" });
    }
}

function ccSubmit() {
    if (!requireAccount()) return;
    const text = ($("cc-text")?.value || "").trim();
    if (!text && !cc.subject && cc.type === "Personal") {
        showToast("Scrie ce vrei să ții minte.");
        $("cc-text")?.focus();
        return;
    }
    const subject = state.subjects[cc.subject] ? cc.subject : "";
    const ev = { id: uid(), title: eventTitleFrom(text, cc.type, subject), time: TIME_RE.test(cc.time) ? cc.time : "", type: cc.type, subject, description: "" };
    const date = cc.date;
    withUndo(`✅ Am pus „${ev.title}”, ${relativeDayLabel(date)}.`, () => {
        (state.calendar[date] ||= []).push(ev);
        addActivity(`Ai adăugat „${ev.title}” pentru ${getDateLabel(date)}.`);
    });
    // rămâne deschis, gol, ca să poți adăuga imediat încă unul; ziua se păstrează dacă ai ales-o tu
    const keepDate = cc.manual.has("date") ? date : null;
    ccReset({ keepOpen: true });
    if (keepDate) { cc.date = keepDate; cc.manual.add("date"); }
    if ($("cc-text")) $("cc-text").value = "";
    renderCompose();
    $("cc-text")?.focus();
    ccFlash(date, ev.id);
}

/** Arată unde a ajuns ce ai adăugat (dacă e pe ecran). */
function ccFlash(date, id) {
    const el = document.querySelector(`.cal-ev[data-id="${CSS.escape(id)}"]`) || document.querySelector(`[data-date-cell="${date}"]`);
    if (!el) return;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1500);
}

/** Din calendar: „+” pe o zi sau o oră din orar → bara se deschide cu ziua (și materia) deja alese. */
function ccPreset({ date = "", mat = "", type = "" } = {}) {
    if (!requireAccount()) return;
    if (DATE_KEY_RE.test(date)) { cc.date = date; cc.manual.add("date"); }
    if (mat !== undefined && mat !== "" && state.subjects[mat]) { cc.subject = mat; cc.manual.add("subject"); }
    if (CC_TYPES.includes(type)) { cc.type = type; cc.manual.add("type"); }
    cc.open = true;
    renderCompose();
    ccOpen();
}

Object.assign(ACTIONS, {
    "cc-open": () => ccOpen(),
    "cc-close": () => {
        if (document.activeElement?.closest?.("#cal-compose")) document.activeElement.blur(); // altfel bara s-ar redeschide singură
        ccReset();
        if ($("cc-text")) $("cc-text").value = "";
        renderCompose();
    },
    "cc-type": el => { cc.type = el.dataset.type; cc.manual.add("type"); renderCompose(); $("cc-text")?.focus(); },
    "cc-subject": el => {
        cc.subject = el.dataset.mat || "";
        cc.manual.add("subject");
        // materia aleasă fără zi aleasă: ziua sare la următoarea ei oră
        if (cc.subject && !cc.manual.has("date")) cc.date = nextLessonDate(cc.subject) || cc.date;
        renderCompose();
        $("cc-text")?.focus();
    },
    "cc-more-subjects": () => { cc.moreSubjects = true; renderCompose(); },
    "cc-day": el => {
        if (!$("cc-form")?.contains(el)) { ccPreset({ date: el.dataset.date }); return; } // „+” dintr-o zi a calendarului
        cc.date = el.dataset.date; cc.manual.add("date"); renderCompose(); $("cc-text")?.focus();
    },
    "cc-pick": el => ccPreset({ date: el.dataset.date, mat: el.dataset.mat, type: el.dataset.type }),
    "cc-time-clear": () => { cc.time = ""; cc.manual.add("time"); renderCompose(); },
    // formularul întreg (repetare, notițe), cu ce ai ales deja
    "cc-more": () => {
        const text = $("cc-text")?.value || "";
        openEventModal({ date: cc.date, subject: cc.subject, type: cc.type });
        const t = $("ev-title");
        if (t && text) { t.value = text; }
        if (cc.time && $("ev-time")) $("ev-time").value = cc.time;
        if (typeof syncEventForm === "function") syncEventForm();
        ccReset();
        renderCompose();
    }
});

document.addEventListener("submit", event => {
    if (event.target.id !== "cc-form") return;
    event.preventDefault();
    ccSubmit();
});
document.addEventListener("input", event => {
    if (event.target.id === "cc-text") ccFromText();
});
document.addEventListener("change", event => {
    if (event.target.id === "cc-date" && DATE_KEY_RE.test(event.target.value)) { cc.date = event.target.value; cc.manual.add("date"); renderCompose(); }
    if (event.target.id === "cc-time") { cc.time = TIME_RE.test(event.target.value) ? event.target.value : ""; cc.manual.add("time"); renderCompose(); }
});
document.addEventListener("focusin", event => {
    if (event.target.id === "cc-text" && !cc.open) {
        if (!canEdit()) { event.target.blur(); requireAccount(); return; }
        cc.open = true;
        renderCompose();
    }
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && event.target.id === "cc-text") {
        if (event.target.value) { event.target.value = ""; ccFromText(); }
        else ACTIONS["cc-close"]();
    }
});
["cc-open", "cc-close", "cc-more-subjects"].forEach(a => GUEST_OK.add(a));
