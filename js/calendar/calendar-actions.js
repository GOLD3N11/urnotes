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

/* ---------- scriere liberă: „test mate vineri la 8” → tip, materie, dată, oră ---------- */
const NP_TYPE_WORDS = {
    test: "Test", teste: "Test", testul: "Test", lucrare: "Test", lucrarea: "Test", evaluare: "Test", evaluarea: "Test", extemporal: "Test",
    teza: "Examen", teze: "Examen", examen: "Examen", examenul: "Examen", simulare: "Examen", simularea: "Examen", bac: "Examen",
    tema: "Temă", teme: "Temă", temele: "Temă",
    proiect: "Proiect", proiectul: "Proiect", referat: "Proiect", referatul: "Proiect", portofoliu: "Proiect",
    prezentare: "Prezentare", prezentarea: "Prezentare"
};
/* porecle obișnuite → bucăți din numele materiei (se folosesc doar dacă elevul are materia) */
const NP_SUBJECT_ALIASES = {
    mate: "matematic", matem: "matematic", ro: "romana", rom: "romana", romana: "romana", engl: "engleza", eng: "engleza", engleza: "engleza",
    fr: "franceza", franceza: "franceza", germ: "germana", germana: "germana", info: "informatic", bio: "biolog", chim: "chimi", fiz: "fizica",
    geo: "geograf", ist: "istori", sport: "educatie fizica", tic: "tic", rel: "religi", psiho: "psiholog", eco: "economi", filo: "filosof",
    desen: "plastic", muzica: "muzic", dirig: "dirigentie", opt: "optional", logica: "logic"
};
/* cum arată în titlu cuvântul de tip scris fără diacritice */
const NP_TYPE_DISPLAY = { tema: "Temă", teme: "Teme", temele: "Temele", teza: "Teză", teze: "Teze" };
const NP_WEEKDAYS = { luni: 1, marti: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6, duminica: 0 };
const NP_MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
const NP_LINK_WORDS = new Set(["pe", "la", "ora", "in", "de", "din", "pentru", "pt", "si"]);

/** Materia la care se referă un cuvânt (sau null). */
function npSubjectFor(word) {
    const w = foldText(word).replace(/[^a-z0-9]/g, "");
    if (w.length < 2) return null;
    const subjects = Object.keys(state.subjects);
    const folded = subjects.map(m => [m, foldText(m), foldText(shortSubjectName(m))]);
    const alias = NP_SUBJECT_ALIASES[w];
    if (alias) {
        const hit = folded.find(([, full, short]) => full.includes(alias) || short.includes(alias));
        if (hit) return hit[0];
    }
    if (w.length < 4) return folded.find(([, , short]) => short === w)?.[0] || null;
    return folded.find(([, full, short]) => short === w || full === w)?.[0]
        || folded.find(([, full, short]) => short.startsWith(w) || full.split(/\s+/).some(part => part.length >= 4 && part.startsWith(w)))?.[0]
        || null;
}

/**
 * Ce se înțelege dintr-un rând scris liber. Întoarce câmpurile găsite și textul rămas (fără dată și oră),
 * ca titlul să nu repete „vineri la 8”.
 */
function parseEventText(text, today = getLocalDateKey()) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const f = words.map(w => foldText(w).replace(/[.,;!?]+$/, ""));
    const out = { type: null, subject: null, date: null, time: null };
    const used = new Set(), typeIdx = new Set(), subjIdx = new Set(), subjExtra = new Set();
    const take = (...idx) => idx.forEach(i => used.add(i));
    const linkBefore = i => { if (i > 0 && NP_LINK_WORDS.has(f[i - 1]) && !used.has(i - 1)) used.add(i - 1); };
    const nextWeekday = wd => { for (let k = 1; k <= 7; k++) { const d = addDays(today, k); if (parseDateKey(d).getDay() === wd) return d; } return null; };
    const ymdOf = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const validDay = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 && dt.getDate() === d; };
    const upcoming = (m, d) => {
        const y = Number(today.slice(0, 4));
        if (!validDay(y, m, d)) return null;
        const k = ymdOf(y, m, d);
        return k >= today ? k : (validDay(y + 1, m, d) ? ymdOf(y + 1, m, d) : null);
    };
    for (let i = 0; i < f.length; i++) {
        const w = f[i];
        // dată
        if (!out.date) {
            let d = null, n = 1;
            if (w === "azi" || w === "astazi") d = today;
            else if (w === "maine") d = addDays(today, 1);
            else if (w === "poimaine") d = addDays(today, 2);
            else if (w in NP_WEEKDAYS) d = nextWeekday(NP_WEEKDAYS[w]);
            else if (w === "saptamana" && f[i + 1] === "viitoare") { d = addDays(today, 7); n = 2; }
            else if (w === "peste" && /^\d{1,2}$/.test(f[i + 1] || "") && /^zi/.test(f[i + 2] || "")) { d = addDays(today, Number(f[i + 1])); n = 3; }
            else if (/^\d{1,2}[./]\d{1,2}([./]\d{2,4})?$/.test(w)) {
                const [dd, mm] = w.split(/[./]/).map(Number);
                if (mm >= 1 && mm <= 12) d = upcoming(mm, dd);
            } else if (/^\d{1,2}$/.test(w) && NP_MONTHS.some(m => (f[i + 1] || "").startsWith(m))) {
                d = upcoming(NP_MONTHS.findIndex(m => f[i + 1].startsWith(m)) + 1, Number(w)); n = 2;
            } else if (/^\d{1,2}$/.test(w) && f[i - 1] === "pe" && Number(w) >= 1 && Number(w) <= 31) {
                const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
                const k = validDay(y, m, Number(w)) ? ymdOf(y, m, Number(w)) : null;
                d = k && k >= today ? k : upcoming(m === 12 ? 1 : m + 1, Number(w));
            }
            if (d) { out.date = d; take(...Array.from({ length: n }, (_, k) => i + k)); linkBefore(i); i += n - 1; continue; }
        }
        // oră
        if (!out.time) {
            let t = null;
            const hm = /^(\d{1,2})[:.h](\d{2})$/.exec(w);
            if (hm && Number(hm[1]) <= 23 && Number(hm[2]) <= 59 && (w.includes(":") || w.includes("h") || Number(hm[2]) > 12 || ["la", "ora"].includes(f[i - 1]))) t = [hm[1], hm[2]];
            else if (/^\d{1,2}$/.test(w) && ["la", "ora"].includes(f[i - 1]) && Number(w) >= 6 && Number(w) <= 22 && !NP_MONTHS.some(m => (f[i + 1] || "").startsWith(m))) t = [w, "00"];
            if (t) { out.time = `${String(t[0]).padStart(2, "0")}:${t[1]}`; take(i); linkBefore(i); continue; }
        }
        // tip
        if (!out.type && NP_TYPE_WORDS[w]) { out.type = NP_TYPE_WORDS[w]; typeIdx.add(i); continue; }
        // materie (sare peste cuvintele de legătură)
        if (!out.subject && !NP_LINK_WORDS.has(w)) {
            const two = i + 1 < f.length ? npSubjectFor(`${words[i]} ${words[i + 1]}`) : null;
            const m = npSubjectFor(words[i]);
            if (m) { out.subject = m; subjIdx.add(i); continue; }
            if (two && f[i] === "ed") { out.subject = two; subjIdx.add(i); subjExtra.add(i + 1); i++; continue; }
        }
    }
    // titlul: fără dată și oră; tipul cu diacritice, materia cu numele ei scurt („mate” → „Matematică”)
    const title = words.map((w, i) => {
        if (used.has(i) || subjExtra.has(i)) return null;
        if (typeIdx.has(i)) return NP_TYPE_DISPLAY[f[i]] || w;
        if (subjIdx.has(i)) return shortSubjectName(out.subject);
        return w;
    }).filter(Boolean).join(" ");
    return { ...out, rest: title };
}

/** Titlul salvat: fără dată și oră; dacă n-a rămas decât tipul și materia, titlul automat („Test Matematică”). */
function eventTitleFrom(raw, type, subject) {
    const text = String(raw || "").trim().replace(/\s+/g, " ");
    if (!text) return autoEventTitle(type, subject);
    const t = parseEventText(text).rest;
    if (!t) return autoEventTitle(type, subject);
    return (t[0].toLocaleUpperCase("ro") + t.slice(1)).slice(0, 100);
}

/* ---------- formularul, ca o pagină din Notion: un titlu mare și proprietăți dedesubt ---------- */
const npForm = { manual: new Set(), prop: "" };
const NP_PROPS = [
    { key: "type", label: "Tip", icon: "layers" },
    { key: "subject", label: "Materie", icon: "notebook" },
    { key: "date", label: "Data", icon: "calendar" },
    { key: "time", label: "Ora", icon: "clock" },
    { key: "repeat", label: "Se repetă", icon: "repeat" }
];

function eventFormHTML(v, { editing = false, occurrenceDate = "", autoDate = false } = {}) {
    const subjects = Object.keys(state.subjects);
    const isSeries = Boolean(v.repeat);
    const typed = v.title && v.title !== autoEventTitle(v.type, v.subject) ? v.title : "";
    return `
        <div class="np" data-auto-date="${autoDate ? "1" : ""}">
            <div class="np-icon" id="np-icon" aria-hidden="true"></div>
            <input type="text" id="ev-title" class="np-title" maxlength="100" autocomplete="off" spellcheck="false" enterkeyhint="done"
                aria-label="Titlu" value="${escapeHTML(typed)}" placeholder="${escapeHTML(v.subject ? autoEventTitle(v.type, v.subject) : "ex: test la mate vineri la 8")}">
            ${editing ? "" : `<p class="np-hint">Scrie pe un rând: tipul, materia și ziua le completez eu. Le poți schimba mai jos.</p>`}
            <div class="np-props" role="list">
                ${NP_PROPS.map(p => `
                    <div class="np-row" role="listitem">
                        <span class="np-label">${icon(p.icon)} ${p.label}${p.key === "date" && isSeries && editing ? " (începe)" : ""}</span>
                        <button type="button" class="np-val" id="np-val-${p.key}" data-action="np-open" data-prop="${p.key}" aria-haspopup="listbox" aria-expanded="false"></button>
                    </div>`).join("")}
            </div>
            <div class="np-pop" id="np-pop" role="dialog" aria-label="Alege" hidden></div>
            <div class="np-divider"></div>
            <textarea id="ev-description" class="np-notes" rows="2" maxlength="500" placeholder="Adaugă o notiță… (ex: capitolele 3–4, de adus calculatorul)">${escapeHTML(v.description || "")}</textarea>

            <!-- câmpurile reale (citite la salvare); proprietățile de mai sus doar le completează -->
            <div class="np-fields" hidden>
                ${EVENT_TYPES.map(t => `<input type="radio" name="ev-type" value="${escapeHTML(t)}" ${t === v.type ? "checked" : ""} aria-label="${escapeHTML(t)}">`).join("")}
                <select id="ev-subject" aria-label="Materie">
                    <option value="" ${v.subject ? "" : "selected"}>Fără materie</option>
                    ${subjects.map(m => `<option value="${escapeHTML(m)}" ${m === v.subject ? "selected" : ""}>${escapeHTML(m)}</option>`).join("")}
                </select>
                <input type="date" id="ev-date" value="${escapeHTML(v.date)}" ${autoDate ? "data-auto" : ""} aria-label="Data">
                <input type="time" id="ev-time" value="${escapeHTML(v.time || "")}" aria-label="Ora">
                <select id="ev-repeat" aria-label="Se repetă">
                    <option value="0" ${!v.repeat ? "selected" : ""}>Nu</option>
                    <option value="1" ${v.repeat?.every === 1 ? "selected" : ""}>Săptămânal</option>
                    <option value="2" ${v.repeat?.every === 2 ? "selected" : ""}>La 2 săptămâni</option>
                </select>
                <input type="date" id="ev-until" value="${escapeHTML(v.repeat?.until || "")}" ${v.repeat ? "" : "disabled"} aria-label="Până la">
            </div>
            ${editing ? `
                <div class="ev-edit-foot">
                    ${isSeries ? `<p class="modal-hint">↻ Eveniment repetat: modificările se aplică întregii serii.</p>` : ""}
                    <button type="button" class="btn btn-text text-danger" data-action="event-delete" data-id="${escapeHTML(v.id)}" data-date="${escapeHTML(occurrenceDate)}">${icon("trash")} Șterge evenimentul</button>
                </div>` : ""}
        </div>`;
}

const npType = () => document.querySelector("input[name='ev-type']:checked")?.value || "Test";
function npSetType(t) { const r = document.querySelector(`input[name='ev-type'][value="${CSS.escape(t)}"]`); if (r) r.checked = true; }

/** Redesenează valorile proprietăților (și pictograma paginii) din câmpurile reale. */
function syncEventForm() {
    if (!$("ev-subject")) return;
    const type = npType();
    const subject = $("ev-subject").value;
    const dateEl = $("ev-date");
    $("ev-until").disabled = $("ev-repeat").value === "0";
    $("ev-title").placeholder = subject ? autoEventTitle(type, subject) : "ex: test la mate vineri la 8";
    // eveniment nou fără zi aleasă: la alegerea materiei, data sare la următoarea ei oră
    const next = subject ? nextLessonDate(subject) : null;
    if (next && dateEl.hasAttribute("data-auto") && !npForm.manual.has("date")) dateEl.value = next;

    const cls = EVENT_TYPE_CLASS[type] || "personal";
    $("np-icon").className = `np-icon t-${cls}`;
    $("np-icon").innerHTML = icon(EVENT_TYPE_ICON[type] || "pin");
    const empty = text => `<span class="np-empty">${text}</span>`;
    const set = (key, html) => { const el = $(`np-val-${key}`); if (el) el.innerHTML = html; };
    set("type", `<span class="np-tag t-${cls}">${icon(EVENT_TYPE_ICON[type])} ${escapeHTML(type)}</span>`);
    set("subject", subject ? `<span class="np-tag np-subj" style="${subjectStyle(subject)}">${escapeHTML(subject)}</span>` : empty("Fără materie"));
    const d = dateEl.value;
    set("date", DATE_KEY_RE.test(d) ? `${escapeHTML(longDateLabel(d))} <span class="np-rel">${escapeHTML(relativeDayLabel(d))}</span>${next === d ? ` <span class="np-rel">· ora de ${escapeHTML(shortSubjectName(subject))}</span>` : ""}` : empty("Alege ziua"));
    set("time", TIME_RE.test($("ev-time").value) ? escapeHTML($("ev-time").value) : empty("Fără oră"));
    const every = Number($("ev-repeat").value);
    set("repeat", every ? `${every === 2 ? "La 2 săptămâni" : "Săptămânal"}${$("ev-until").value ? ` <span class="np-rel">până pe ${escapeHTML(shortDayLabel($("ev-until").value))}</span>` : ""}` : empty("Nu"));
}

/** Când scrii titlul: ce înțeleg completez în proprietățile pe care nu le-ai ales tu. */
function applyEventText() {
    const p = parseEventText($("ev-title").value);
    if (p.type && !npForm.manual.has("type")) npSetType(p.type);
    if (!npForm.manual.has("subject")) $("ev-subject").value = p.subject || (npForm.presetSubject ?? "");
    if (p.date && !npForm.manual.has("date")) { $("ev-date").value = p.date; $("ev-date").removeAttribute("data-auto"); }
    else if (!p.date && !npForm.manual.has("date") && npForm.autoDate) { $("ev-date").setAttribute("data-auto", ""); $("ev-date").value = npForm.presetDate; }
    if (!npForm.manual.has("time")) $("ev-time").value = p.time || (npForm.presetTime ?? "");
    syncEventForm();
}

/* ---------- alegerea unei proprietăți (meniul mic de sub rând) ---------- */
function npOption(prop, value, html, on = false, extra = "") {
    return `<button type="button" class="np-opt ${on ? "is-on" : ""}" data-action="np-set" data-prop="${prop}" data-value="${escapeHTML(value)}" role="option" aria-selected="${on}" ${extra}>${html}${on ? `<span class="np-check">${icon("check")}</span>` : ""}</button>`;
}

function npPopHTML(prop) {
    const today = getLocalDateKey();
    if (prop === "type") {
        return EVENT_TYPES.map(t => npOption("type", t, `<span class="np-tag t-${EVENT_TYPE_CLASS[t]}">${icon(EVENT_TYPE_ICON[t])} ${escapeHTML(t)}</span>`, npType() === t)).join("");
    }
    if (prop === "subject") {
        const cur = $("ev-subject").value;
        return `<input type="search" class="np-search" id="np-search" placeholder="Caută o materie…" autocomplete="off" aria-label="Caută o materie">
            <div class="np-opts" id="np-subject-opts">
                ${subjectsBySoonest().map(m => npOption("subject", m, `<span class="np-tag np-subj" style="${subjectStyle(m)}">${escapeHTML(m)}</span>`, m === cur, `data-search="${escapeHTML(foldText(`${m} ${shortSubjectName(m)}`))}"`)).join("")}
                ${npOption("subject", "", `<span class="np-empty">Fără materie</span>`, !cur, 'data-search="-"')}
            </div>`;
    }
    if (prop === "date") {
        const cur = $("ev-date").value;
        const subject = $("ev-subject").value;
        const next = subject ? nextLessonDate(subject) : null;
        const opts = [];
        if (next) opts.push([next, `Ora de ${shortSubjectName(subject)}`]);
        [[0, "Azi"], [1, "Mâine"], [2, "Poimâine"], [7, "Peste o săptămână"]].forEach(([n, l]) => { const d = addDays(today, n); if (d !== next) opts.push([d, l]); });
        return opts.map(([d, l]) => npOption("date", d, `<span>${escapeHTML(l)}</span><span class="np-rel">${escapeHTML(shortDayLabel(d))}</span>`, d === cur)).join("")
            + `<label class="np-other">Altă zi <input type="date" id="np-date-input" value="${escapeHTML(cur)}"></label>`;
    }
    if (prop === "time") {
        const cur = $("ev-time").value;
        return npOption("time", "", `<span class="np-empty">Fără oră</span>`, !cur)
            + `<div class="np-times">${["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"].map(t => `<button type="button" class="np-time ${t === cur ? "is-on" : ""}" data-action="np-set" data-prop="time" data-value="${t}">${t}</button>`).join("")}</div>`
            + `<label class="np-other">Altă oră <input type="time" id="np-time-input" value="${escapeHTML(cur)}"></label>`;
    }
    if (prop === "repeat") {
        const cur = $("ev-repeat").value;
        return [["0", "Nu se repetă"], ["1", "Săptămânal"], ["2", "La 2 săptămâni"]].map(([v, l]) => npOption("repeat", v, escapeHTML(l), v === cur)).join("")
            + (cur !== "0" ? `<label class="np-other">Până pe <input type="date" id="np-until-input" value="${escapeHTML($("ev-until").value)}" min="${escapeHTML($("ev-date").value)}"></label>` : "");
    }
    return "";
}

function npOpen(prop) {
    const pop = $("np-pop");
    if (!pop) return;
    if (npForm.prop === prop && !pop.hidden) { npClose(); return; }
    npForm.prop = prop;
    const btn = $(`np-val-${prop}`);
    document.querySelectorAll(".np-val").forEach(b => b.setAttribute("aria-expanded", String(b === btn)));
    pop.innerHTML = npPopHTML(prop);
    pop.hidden = false;
    // sub rândul ales, în interiorul paginii
    const host = pop.parentElement.getBoundingClientRect(), r = btn.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom - host.top + 4)}px`;
    pop.style.left = `${Math.round(Math.max(0, r.left - host.left))}px`;
    (pop.querySelector("#np-search") || pop.querySelector(".np-opt.is-on, .np-time.is-on") || pop.querySelector("button, input"))?.focus({ preventScroll: true });
}

function npClose(focusBack = true) {
    const pop = $("np-pop");
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    const prop = npForm.prop;
    npForm.prop = "";
    document.querySelectorAll(".np-val").forEach(b => b.setAttribute("aria-expanded", "false"));
    if (focusBack) $(`np-val-${prop}`)?.focus({ preventScroll: true });
}

function npSet(prop, value, { close = true } = {}) {
    npForm.manual.add(prop);
    if (prop === "type") npSetType(value);
    if (prop === "subject") $("ev-subject").value = state.subjects[value] ? value : "";
    if (prop === "date" && DATE_KEY_RE.test(value)) { $("ev-date").value = value; $("ev-date").removeAttribute("data-auto"); }
    if (prop === "time") $("ev-time").value = TIME_RE.test(value) ? value : "";
    if (prop === "repeat") { $("ev-repeat").value = ["0", "1", "2"].includes(value) ? value : "0"; if (value === "0") $("ev-until").value = ""; }
    if (prop === "until") { $("ev-until").value = DATE_KEY_RE.test(value) ? value : ""; npForm.manual.delete("until"); }
    syncEventForm();
    if (prop === "repeat" && value !== "0") { npOpen("repeat"); npOpen("repeat"); return; } // rămâne deschis, apare „Până pe”
    if (close) npClose();
}

/** Tastele din formularul de eveniment: Enter în titlu salvează, Escape închide întâi meniul mic. */
function npKeydown(event) {
    if (!document.querySelector("#action-modal .np")) return;
    const pop = $("np-pop");
    if (event.key === "Escape" && pop && !pop.hidden) { event.preventDefault(); event.stopImmediatePropagation(); npClose(); return; }
    if (event.target.id === "ev-title" && event.key === "Enter" && !event.isComposing) { event.preventDefault(); $("action-modal-confirm")?.click(); return; }
    if (event.target.id === "np-search" && event.key === "Enter") {
        event.preventDefault();
        $("np-subject-opts")?.querySelector(".np-opt:not([hidden])")?.click();
        return;
    }
    if (pop && !pop.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        const items = [...pop.querySelectorAll(".np-opt:not([hidden]), .np-time")];
        if (!items.length) return;
        event.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    }
}
document.addEventListener("keydown", npKeydown, true);
document.addEventListener("input", event => {
    if (event.target.id === "ev-title" && document.querySelector("#action-modal .np")) applyEventText();
    if (event.target.id === "np-search") {
        const q = foldText(event.target.value.trim());
        $("np-subject-opts")?.querySelectorAll(".np-opt").forEach(o => { o.hidden = Boolean(q) && !o.dataset.search.includes(q); });
    }
});
document.addEventListener("change", event => {
    const id = event.target.id;
    if (id === "np-date-input") npSet("date", event.target.value);
    if (id === "np-time-input") npSet("time", event.target.value);
    if (id === "np-until-input") { npSet("until", event.target.value, { close: false }); npClose(); }
});
document.addEventListener("pointerdown", event => {
    const pop = $("np-pop");
    if (pop && !pop.hidden && !pop.contains(event.target) && !event.target.closest(".np-val")) npClose(false);
}, true);

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
        title: URN_RULES.cleanText(eventTitleFrom(field("ev-title"), type, subject), URN_RULES.LIMITS.eventTitle) || eventTitleFrom("", type, subject),
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
        Object.assign(npForm, { manual: new Set(["type", "subject", "date", "time", "repeat"]), prop: "", autoDate: false, presetSubject: ev.subject, presetDate: start, presetTime: ev.time || "" });
        openModal({
            layout: "panel",
            title: "Eveniment",
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
    // ce vine deja ales (ziua din calendar, materia din orar) nu se mai schimbă după ce scrii
    const manual = new Set([...(DATE_KEY_RE.test(date) ? ["date"] : []), ...(preset ? ["subject"] : [])]);
    Object.assign(npForm, { manual, prop: "", autoDate: !DATE_KEY_RE.test(date), presetSubject: preset, presetDate: when, presetTime: "" });
    openModal({
        layout: "panel",
        title: "Eveniment nou",
        confirmText: "Adaugă",
        body: eventFormHTML({ type: EVENT_TYPES.includes(type) ? type : "Test", subject: preset, date: when, title: "" }, { autoDate: !DATE_KEY_RE.test(date) }),
        onConfirm: () => {
            const values = readEventForm();
            if (!values) return;

            const ev = { id: uid(), title: values.title, time: values.time, type: values.type, subject: values.subject, description: values.description };
            if (values.repeat) ev.repeat = values.repeat;
            if (!allowEvent(ev, values.date)) return;
            (state.calendar[values.date] ||= []).push(ev);

            addActivity(`Ai adăugat „${ev.title}” pentru ${getDateLabel(values.date)}${ev.repeat ? " (se repetă)" : ""}.`);
            ui.cal.date = values.date;
            closeActionModal();
            refresh();
            showToast(`Ai adăugat „${ev.title}”, ${relativeDayLabel(values.date)}.`);
        }
    });
    syncEventForm();
    // Cu materia deja aleasă, de obicei vrei doar să confirmi; altfel scrii direct titlul.
    (preset ? $("action-modal-confirm") : $("ev-title"))?.focus();
}

function saveEventEdits(id, values) {
    const found = findEvent(id);
    if (!found) {
        closeActionModal();
        showToast("⚠️ Evenimentul nu mai există.");
        return;
    }
    const { ev, start } = found;
    if (!allowEvent({ ...ev, ...values }, values.date, ev.id)) return;

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
    const moveWhy = realEventProblem(ev, to, ev.id);
    if (moveWhy) { showToast(`⚠️ ${moveWhy}`, { duration: 4500 }); return; }

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
    if (nowDone && ev.doingDates?.[date]) { delete ev.doingDates[date]; if (!Object.keys(ev.doingDates).length) delete ev.doingDates; }
    state.pal.events = Math.max(0, state.pal.events + (nowDone ? 1 : -1)); // XP pentru coleg
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
    if (!allowGrade(ev.subject, { val: v, date })) return;
    withUndo(`Ai adăugat nota ${v} la ${ev.subject} („${ev.title}”).`, () => {
        state.subjects[ev.subject].grades.push({ id: uid(), val: v, type: GRADE_TYPE_FOR_EVENT[ev.type] || "Test", date, eventId: ev.id, eventDate: date });
        addActivity(`Ai adăugat nota ${v} (${GRADE_TYPE_FOR_EVENT[ev.type] || "Test"}) la ${ev.subject}.`);
    });
    celebrateGrade(v);
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

/** Schimbările din câmpurile dialogului (formularul de eveniment). */
function handleModalChange(event) {
    const el = event.target;
    if (el.id === "modal-grade-mat") syncGradeSubjectChips();
    if (el.id === "ev-date") el.removeAttribute("data-auto"); // a ales singur ziua: n-o mai mutăm
    if (el.id === "ev-subject" || el.id === "ev-repeat" || el.id === "ev-date" || el.name === "ev-type") {
        npForm.manual.add(el.id === "ev-subject" ? "subject" : el.id === "ev-date" ? "date" : el.id === "ev-repeat" ? "repeat" : "type");
        syncEventForm();
    }
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
        const col = event.target.closest?.(".cal-col, .ag-day");
        if (!dragging || !col) return;
        event.preventDefault();
        body.querySelectorAll(".drop-target").forEach(el => el !== col && el.classList.remove("drop-target"));
        col.classList.add("drop-target");
    });
    body.addEventListener("drop", event => {
        const col = event.target.closest?.(".cal-col, .ag-day");
        if (!dragging || !col) return;
        event.preventDefault();
        const { id, date } = dragging;
        dragging = null;
        moveOccurrence(id, date, col.dataset.date);
    });

    $("action-modal-body").addEventListener("change", handleModalChange);
}
