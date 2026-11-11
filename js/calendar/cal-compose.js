/* urNotes · Bara de adăugat: singurul fel de a adăuga ceva (faza 3 din planul de design).
   Scrii pe un rând („test la mate vineri la 8”, „9 la mate azi”) sau alegi din etichete; Enter și gata.
   Ce înțelege din text completează etichetele pe care nu le-ai ales tu; ce alegi tu nu mai e schimbat de text.
   În Calendar stă deasupra calendarului; în rest se deschide peste pagină (butonul „Adaugă”, „+” de pe telefon, tasta N).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const CC_GRADE = "Notă";
const CC_TYPES = [CC_GRADE, "Test", "Temă", "Proiect", "Examen", "Prezentare", "Personal"];
const CC_TYPE_LABEL = { Personal: "Altceva" };
const CC_GTYPE_KEY = "urn_quick_grade_type_v1"; // același tip ținut minte ca la „+” de pe rândul materiei
const cc = { open: false, overlay: false, type: "Test", subject: "", date: "", time: "", val: 0, gtype: "Test", manual: new Set(), moreSubjects: false };

const ccToday = () => getLocalDateKey();
const ccIsGrade = () => cc.type === CC_GRADE;
function ccSavedGType() { try { const t = localStorage.getItem(CC_GTYPE_KEY); return GRADE_TYPES.includes(t) ? t : "Test"; } catch (_) { return "Test"; } }
function ccReset({ keepOpen = false, type = "Test" } = {}) {
    Object.assign(cc, { open: keepOpen, type, subject: "", date: ccToday(), time: "", val: 0, gtype: ccSavedGType(), manual: new Set(), moreSubjects: false });
}
ccReset();

/** Unde stă bara acum: peste pagină sau în Calendar. */
const ccHost = () => (cc.overlay ? $("cc-overlay-host") : $("cal-compose"));

/** Materiile, cu orele zilei alese întâi (de acolo vin de obicei testele, temele și notele). */
function ccSubjects() {
    const all = Object.keys(state.subjects).sort((a, b) => a.localeCompare(b, "ro"));
    const wd = parseDateKey(cc.date).getDay();
    const lessons = isSchoolDay(cc.date) ? [...new Set(state.timetable[wd] || [])].filter(m => state.subjects[m]) : [];
    return { lessons, rest: all.filter(m => !lessons.includes(m)) };
}

/** Zilele propuse: pentru un eveniment azi și următoarele 6; pentru o notă azi și cele 6 dinainte. */
function ccDays() {
    return Array.from({ length: 7 }, (_, i) => addDays(ccToday(), ccIsGrade() ? -i : i));
}
function ccDayLabel(d) {
    const n = daysBetween(ccToday(), d);
    if (n === 0) return "Azi";
    if (n === 1) return "Mâine";
    if (n === -1) return "Ieri";
    const dt = parseDateKey(d);
    return `${WEEKDAY_SHORT[dt.getDay()]} ${dt.getDate()}`;
}

/* ---------- textul unei note: „9 la mate”, „am luat 10 la fizică ieri”, „nota 7 la test la chimie” ---------- */
const CC_GRADE_TYPE_WORDS = { test: "Test", lucrare: "Test", ascultare: "Ascultare", oral: "Ascultare", teza: "Teză", proiect: "Proiect", tema: "Temă" };
function parseGradeText(text, today = ccToday()) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const f = words.map(w => foldText(w).replace(/[.,;!?]+$/, ""));
    let val = 0, gtype = null, date = null;
    f.forEach((w, i) => {
        const n = /^(10|[1-9])$/.test(w) ? Number(w) : 0;
        if (n && !val && (i === 0 || ["nota", "luat", "un", "o", "de"].includes(f[i - 1])) && !["la", "ora"].includes(f[i - 1])) val = n;
        if (!gtype && CC_GRADE_TYPE_WORDS[w]) gtype = CC_GRADE_TYPE_WORDS[w];
        if (!date) {
            if (w === "azi" || w === "astazi") date = today;
            else if (w === "ieri") date = addDays(today, -1);
            else if (w === "alaltaieri") date = addDays(today, -2);
            else if (w in NP_WEEKDAYS) { for (let k = 0; k <= 6; k++) { const d = addDays(today, -k); if (parseDateKey(d).getDay() === NP_WEEKDAYS[w]) { date = d; break; } } }
        }
    });
    const looksLikeGrade = Boolean(val) && (f[0] === String(val) || f.some(w => ["nota", "luat"].includes(w)));
    return { val, gtype, date, looksLikeGrade };
}

/* ---------- desenarea ---------- */
function renderCompose() {
    const box = ccHost();
    const inline = $("cal-compose");
    if (cc.overlay && inline) { inline.innerHTML = ""; inline.classList.remove("is-open"); } // un singur câmp cu aceleași id-uri
    if (!box) return;
    if (!DATE_KEY_RE.test(cc.date)) cc.date = ccToday();
    const had = $("cc-text");
    const text = had ? had.value : "";
    const focused = document.activeElement === had;
    const sel = had && focused ? [had.selectionStart, had.selectionEnd] : null;
    const grade = ccIsGrade();

    const { lessons, rest } = ccSubjects();
    const subjChip = m => `<button type="button" class="cc-chip cc-subj ${cc.subject === m ? "is-on" : ""}" data-action="cc-subject" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}" aria-pressed="${cc.subject === m}"><i aria-hidden="true"></i>${escapeHTML(shortSubjectName(m))}</button>`;
    const shownRest = cc.moreSubjects ? rest : rest.slice(0, Math.max(0, 6 - lessons.length));
    const hiddenCount = rest.length - shownRest.length;
    const days = ccDays();
    const otherDay = !days.includes(cc.date);
    const lessonsLabel = cc.date === ccToday() ? "orele de azi" : ccDayLabel(cc.date) === "Ieri" ? "orele de ieri" : ccDayLabel(cc.date) === "Mâine" ? "orele de mâine" : `orele de ${WEEKDAY_LONG[parseDateKey(cc.date).getDay()].toLowerCase()}`;
    const phone = matchMedia("(max-width: 640px)").matches;

    box.classList.toggle("is-open", cc.open);
    box.innerHTML = `
        <form class="cc" id="cc-form" autocomplete="off">
            <div class="cc-bar">
                <span class="cc-ico" aria-hidden="true"></span>
                <input type="text" id="cc-text" class="cc-text" maxlength="100" spellcheck="false" enterkeyhint="done"
                    placeholder="${phone ? "Adaugă o notă, un test…" : "Adaugă ceva… ex: 9 la mate azi · test la fizică vineri"}" aria-label="Ce adaugi" value="${escapeHTML(text)}">
                <button type="submit" class="btn btn-primary cc-add" aria-label="Adaugă">${icon("plus")} <span>Adaugă</span></button>
            </div>
            <div class="cc-body" ${cc.open ? "" : "hidden"}>
                <div class="cc-row" role="group" aria-label="Ce este">
                    <span class="cc-lab">Ce</span>
                    <div class="cc-chips">${CC_TYPES.map(t => `<button type="button" class="cc-chip cc-type ${t === CC_GRADE ? "is-grade" : `ev-${EVENT_TYPE_CLASS[t] || "personal"}`} ${cc.type === t ? "is-on" : ""}" data-action="cc-type" data-type="${escapeHTML(t)}" aria-pressed="${cc.type === t}">${icon(t === CC_GRADE ? "check-circle" : EVENT_TYPE_ICON[t] || "pin")} ${escapeHTML(CC_TYPE_LABEL[t] || t)}</button>`).join("")}</div>
                </div>
                ${grade ? `
                <div class="cc-row" role="group" aria-label="Nota">
                    <span class="cc-lab">Nota</span>
                    <div class="cc-chips cc-vals">${Array.from({ length: 10 }, (_, i) => 10 - i).map(n => `<button type="button" class="cc-chip cc-val tone-${gradeTone(n)} ${cc.val === n ? "is-on" : ""}" data-action="cc-val" data-val="${n}" aria-pressed="${cc.val === n}">${n}</button>`).join("")}</div>
                </div>` : ""}
                <div class="cc-row" role="group" aria-label="Materia">
                    <span class="cc-lab">Materia</span>
                    <div class="cc-chips">
                        ${lessons.length ? `<span class="cc-sub-lab">${escapeHTML(lessonsLabel)}</span>` : ""}
                        ${lessons.map(subjChip).join("")}
                        ${lessons.length && shownRest.length ? `<span class="cc-sep" aria-hidden="true"></span>` : ""}
                        ${shownRest.map(subjChip).join("")}
                        ${hiddenCount > 0 ? `<button type="button" class="cc-chip cc-ghost" data-action="cc-more-subjects">+ încă ${hiddenCount}</button>` : ""}
                        ${grade ? "" : `<button type="button" class="cc-chip cc-ghost ${cc.subject ? "" : "is-on"}" data-action="cc-subject" data-mat="" aria-pressed="${!cc.subject}">Fără materie</button>`}
                    </div>
                </div>
                ${grade ? `
                <div class="cc-row" role="group" aria-label="Tipul notei">
                    <span class="cc-lab">Tip</span>
                    <div class="cc-chips">${GRADE_TYPES.map(t => `<button type="button" class="cc-chip ${cc.gtype === t ? "is-on" : ""}" data-action="cc-gtype" data-type="${escapeHTML(t)}" aria-pressed="${cc.gtype === t}">${escapeHTML(t)}</button>`).join("")}</div>
                </div>` : ""}
                <div class="cc-row" role="group" aria-label="Când">
                    <span class="cc-lab">Când</span>
                    <div class="cc-chips">
                        ${days.map(d => `<button type="button" class="cc-chip cc-day ${cc.date === d ? "is-on" : ""}" data-action="cc-day" data-date="${d}" aria-pressed="${cc.date === d}">${escapeHTML(ccDayLabel(d))}</button>`).join("")}
                        <label class="cc-chip cc-pick ${otherDay ? "is-on" : ""}">${icon("calendar")}<span>${otherDay ? escapeHTML(shortDayLabel(cc.date)) : "Altă zi"}</span><input type="date" id="cc-date" value="${escapeHTML(cc.date)}" ${grade ? `max="${ccToday()}"` : ""} aria-label="Altă zi"></label>
                        ${grade ? "" : `<label class="cc-chip cc-pick ${cc.time ? "is-on" : ""}">${icon("clock")}<span>${cc.time ? escapeHTML(cc.time) : "Oră"}</span><input type="time" id="cc-time" value="${escapeHTML(cc.time)}" aria-label="Ora"></label>`}
                        ${!grade && cc.time ? `<button type="button" class="cc-chip cc-ghost" data-action="cc-time-clear" aria-label="Fără oră">×</button>` : ""}
                    </div>
                </div>
                <div class="cc-foot">
                    <p class="cc-preview" id="cc-preview" aria-live="polite"></p>
                    <span class="cc-foot-btns">
                        ${grade ? "" : `<button type="button" class="btn btn-text btn-sm" data-action="cc-more">Repetă, notițe…</button>`}
                        ${cc.overlay ? `<button type="button" class="btn btn-text btn-sm" data-action="cc-subject-new">Materie nouă</button>` : ""}
                        <button type="button" class="btn btn-text btn-sm" data-action="cc-close">Închide</button>
                    </span>
                </div>
            </div>
        </form>`;
    ccPreview();
    // ziua aleasă se vede și în agendă
    document.querySelectorAll(".ag-day.is-target").forEach(el => el.classList.remove("is-target"));
    if (cc.open && !grade) document.querySelector(`.ag-day[data-date="${cc.date}"]`)?.classList.add("is-target");
    const input = $("cc-text");
    if (focused && input) {
        input.focus();
        if (sel) input.setSelectionRange(sel[0], sel[1]);
    }
}

/** Ce se va adăuga, într-o propoziție (și pictograma barei după tip). */
function ccPreview() {
    const el = $("cc-preview");
    const ico = ccHost()?.querySelector(".cc-ico");
    if (ico) {
        const grade = ccIsGrade();
        ico.className = `cc-ico ${grade ? "is-grade" : `ev-${EVENT_TYPE_CLASS[cc.type] || "personal"}`}`;
        ico.innerHTML = icon(grade ? "check-circle" : EVENT_TYPE_ICON[cc.type] || "plus");
    }
    if (!el) return;
    const n = daysBetween(ccToday(), cc.date);
    const when = `${relativeDayLabel(cc.date)}${Math.abs(n) > 1 ? `, ${shortDayLabel(cc.date)}` : ""}${!ccIsGrade() && cc.time ? ` la ${cc.time}` : ""}`;
    if (ccIsGrade()) {
        const missing = !cc.val ? "alege nota" : !state.subjects[cc.subject] ? "alege materia" : "";
        el.innerHTML = missing
            ? `${icon("info")} <span>Nota ${cc.val || "…"} (${escapeHTML(cc.gtype)}) · ${escapeHTML(missing)}</span>`
            : `${icon("check")} <b>Nota ${cc.val} (${escapeHTML(cc.gtype)}) la ${escapeHTML(shortSubjectName(cc.subject))}</b> · ${escapeHTML(when)}`;
        el.classList.toggle("is-missing", Boolean(missing));
        return;
    }
    el.classList.remove("is-missing");
    const text = $("cc-text")?.value || "";
    el.innerHTML = `${icon("check")} <b>${escapeHTML(eventTitleFrom(text, cc.type, cc.subject))}</b> · ${escapeHTML(when)}`;
}

/** Textul scris completează ce n-ai ales tu. */
function ccFromText() {
    const text = $("cc-text")?.value || "";
    const p = parseEventText(text);
    const g = parseGradeText(text);
    const before = JSON.stringify([cc.type, cc.subject, cc.date, cc.time, cc.val, cc.gtype]);
    if (!cc.manual.has("type")) cc.type = g.looksLikeGrade ? CC_GRADE : p.type || "Test";
    if (!cc.manual.has("subject")) cc.subject = p.subject || "";
    if (ccIsGrade()) {
        if (!cc.manual.has("val")) cc.val = g.val || 0;
        if (!cc.manual.has("gtype")) cc.gtype = g.gtype || ccSavedGType();
        if (!cc.manual.has("date")) cc.date = g.date || ccToday();
    } else {
        if (!cc.manual.has("date")) cc.date = p.date || (cc.subject && nextLessonDate(cc.subject)) || ccToday();
        if (!cc.manual.has("time")) cc.time = p.time || "";
    }
    if (before !== JSON.stringify([cc.type, cc.subject, cc.date, cc.time, cc.val, cc.gtype])) renderCompose();
    else ccPreview();
}

/* ---------- deschis / închis ---------- */
function ccOpen({ focus = true } = {}) {
    if (!requireAccount()) return;
    if (!cc.open) {
        cc.open = true;
        renderCompose();
    }
    if (focus) {
        const input = $("cc-text");
        input?.focus();
        if (cc.overlay) return;
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h")) || 60;
        const box = $("cal-compose");
        if (box && box.getBoundingClientRect().top < bar) window.scrollTo({ top: box.getBoundingClientRect().top + window.scrollY - bar - 12, behavior: reduceMotion() ? "auto" : "smooth" });
    }
}

/** De oriunde: „Adaugă”, „+” pe telefon, tasta N/T/H. În Calendar folosește bara de acolo; în rest se deschide peste pagină. */
function ccOpenGlobal({ type = "", mat = "", date = "" } = {}) {
    if (!requireAccount()) return;
    closeQuickAdd?.({ restoreFocus: false });
    const inCalendar = ui.activeTab === "tab-calendar" && $("cal-compose");
    if (!inCalendar) {
        cc.returnFocus = document.activeElement;
        cc.overlay = true;
        $("cc-overlay").hidden = false;
        document.body.classList.add("cc-overlay-open");
    }
    ccReset({ keepOpen: true, type: CC_TYPES.includes(type) ? type : cc.type || "Test" });
    if (type) cc.manual.add("type");
    if (state.subjects[mat]) { cc.subject = mat; cc.manual.add("subject"); }
    if (DATE_KEY_RE.test(date)) { cc.date = date; cc.manual.add("date"); }
    if ($("cc-text")) $("cc-text").value = "";
    renderCompose();
    ccOpen();
}

function ccCloseOverlay() {
    if (!cc.overlay) return;
    cc.overlay = false;
    $("cc-overlay").hidden = true;
    $("cc-overlay-host").innerHTML = "";
    document.body.classList.remove("cc-overlay-open");
    ccReset();
    renderCompose(); // bara din Calendar revine la locul ei
    const back = cc.returnFocus;
    cc.returnFocus = null;
    if (back && document.contains(back)) back.focus();
}

/* ---------- adăugarea ---------- */
function ccSubmit() {
    if (!requireAccount()) return;
    const text = ($("cc-text")?.value || "").trim();
    if (ccIsGrade()) return ccSubmitGrade();
    if (!text && !cc.subject && cc.type === "Personal") {
        showToast("Scrie ce vrei să ții minte.");
        $("cc-text")?.focus();
        return;
    }
    const subject = state.subjects[cc.subject] ? cc.subject : "";
    const ev = { id: uid(), title: eventTitleFrom(text, cc.type, subject), time: TIME_RE.test(cc.time) ? cc.time : "", type: cc.type, subject, description: "" };
    const date = cc.date;
    ev.title = URN_RULES.cleanText(ev.title, URN_RULES.LIMITS.eventTitle) || eventTitleFrom("", cc.type, subject);
    if (!allowEvent(ev, date)) return;
    withUndo(`✅ Am pus „${ev.title}”, ${relativeDayLabel(date)}.`, () => {
        (state.calendar[date] ||= []).push(ev);
        addActivity(`Ai adăugat „${ev.title}” pentru ${getDateLabel(date)}.`);
    });
    ccAfterAdd(date, () => ccFlash(date, ev.id));
}

function ccSubmitGrade() {
    if (!cc.val) {
        showToast("⚠️ Alege nota, de la 1 la 10.");
        ccHost()?.querySelector(".cc-val")?.focus();
        return;
    }
    const mat = cc.subject;
    if (!state.subjects[mat]) {
        showToast("⚠️ Alege materia.");
        ccHost()?.querySelector(".cc-subj")?.focus();
        return;
    }
    const grade = { id: uid(), val: cc.val, type: cc.gtype, date: cc.date > ccToday() ? ccToday() : cc.date };
    // în weekend sau în vacanță nu se pun note: dacă n-ai ales tu ziua, nota merge pe ultima zi de școală
    const moved = !cc.manual.has("date") && !isSchoolDay(grade.date);
    if (moved) grade.date = lastSchoolDay(grade.date);
    if (!allowGrade(mat, grade)) return;
    try { localStorage.setItem(CC_GTYPE_KEY, cc.gtype); } catch (_) { /* fără stocare */ }
    withUndo(`✅ Am pus ${grade.val} (${grade.type}) la ${mat}${moved ? `, ${weekdayLabel(grade.date)} (ultima zi de școală)` : ""}.`, () => {
        state.subjects[mat].grades.push(grade);
        addActivity(`Ai adăugat nota ${grade.val} (${grade.type}) la ${mat}.`);
    });
    ccAfterAdd(grade.date, () => {});
    celebrateGrade(grade.val);
}

/** După adăugare: peste pagină se închide; în Calendar rămâne deschisă, goală, pentru următorul. */
function ccAfterAdd(date, flash) {
    if (cc.overlay) {
        ccCloseOverlay();
        flash();
        return;
    }
    const keepDate = cc.manual.has("date") ? date : null;
    const type = cc.type;
    ccReset({ keepOpen: true, type: type === CC_GRADE ? CC_GRADE : "Test" });
    if (type === CC_GRADE) cc.manual.add("type");
    if (keepDate) { cc.date = keepDate; cc.manual.add("date"); }
    if ($("cc-text")) $("cc-text").value = "";
    renderCompose();
    $("cc-text")?.focus();
    flash();
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
    if (ccIsGrade() && !type) { cc.type = "Test"; cc.manual.delete("type"); }
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
        if (cc.overlay) { ccCloseOverlay(); return; }
        if (document.activeElement?.closest?.("#cal-compose")) document.activeElement.blur(); // altfel bara s-ar redeschide singură
        ccReset();
        if ($("cc-text")) $("cc-text").value = "";
        renderCompose();
    },
    "cc-type": el => {
        const was = ccIsGrade();
        cc.type = el.dataset.type;
        cc.manual.add("type");
        // nota e de obicei de azi sau din urmă; un eveniment, de azi încolo
        if (was !== ccIsGrade() && !cc.manual.has("date")) cc.date = ccToday();
        if (ccIsGrade() && cc.date > ccToday()) cc.date = ccToday();
        renderCompose();
        $("cc-text")?.focus();
    },
    "cc-val": el => { cc.val = Number(el.dataset.val); cc.manual.add("val"); renderCompose(); $("cc-text")?.focus(); },
    "cc-gtype": el => { cc.gtype = el.dataset.type; cc.manual.add("gtype"); renderCompose(); $("cc-text")?.focus(); },
    "cc-subject": el => {
        cc.subject = el.dataset.mat || "";
        cc.manual.add("subject");
        // materia aleasă fără zi aleasă: ziua sare la următoarea ei oră (doar pentru evenimente)
        if (cc.subject && !ccIsGrade() && !cc.manual.has("date")) cc.date = nextLessonDate(cc.subject) || cc.date;
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
    "cc-subject-new": () => { ccCloseOverlay(); promptAddMaterie(); },
    // formularul întreg (repetare, notițe), cu ce ai ales deja
    "cc-more": () => {
        const text = $("cc-text")?.value || "";
        const pre = { date: cc.date, subject: cc.subject, type: cc.type, time: cc.time };
        if (cc.overlay) ccCloseOverlay(); else { ccReset(); renderCompose(); }
        openEventModal({ date: pre.date, subject: pre.subject, type: pre.type });
        const t = $("ev-title");
        if (t && text) t.value = text;
        if (pre.time && $("ev-time")) $("ev-time").value = pre.time;
        if (typeof syncEventForm === "function") syncEventForm();
    },
    "cc-overlay-close": () => ccCloseOverlay()
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
    if (event.target.id === "cc-date" && DATE_KEY_RE.test(event.target.value)) {
        cc.date = ccIsGrade() && event.target.value > ccToday() ? ccToday() : event.target.value;
        cc.manual.add("date"); renderCompose();
    }
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
    if (event.key === "Escape" && (event.target.id === "cc-text" || cc.overlay)) {
        event.stopPropagation();
        if (event.target.id === "cc-text" && event.target.value) { event.target.value = ""; ccFromText(); }
        else ACTIONS["cc-close"]();
        return;
    }
    if (cc.overlay && event.key === "Tab") trapFocusIn($("cc-overlay"), event);
}, true);
["cc-open", "cc-close", "cc-more-subjects", "cc-overlay-close"].forEach(a => GUEST_OK.add(a));
