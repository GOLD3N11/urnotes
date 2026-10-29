/* urNotes · Realism: aplicația nu primește lucruri care nu se pot întâmpla într-o școală adevărată.
   Regulile sunt în shared/rules.js (aceleași și pe server): cel mult 3 evaluări și 8 lucruri pe zi, o teză pe zi,
   un singur test pe zi la aceeași materie, teste doar în zilele de școală, note doar în zile de școală (cel mult 2 pe zi
   la o materie), materii doar din programa școlară, titluri fără „qwerty” și fără zeci de emoji.
   Plus: nu poți adăuga zeci de lucruri în câteva secunde, iar datele vechi nerealiste se pot curăța dintr-o atingere.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const R = typeof URN_RULES !== "undefined" ? URN_RULES : null;

/** Evenimentele dintr-o zi (cu tot cu cele care se repetă), fără cel cu id-ul dat. */
function dayEventsOn(date, excludeId = "") {
    return occurrencesBetween(date, date).filter(o => o.ev.id !== excludeId).map(o => o.ev);
}

/** E realist evenimentul `ev` pe ziua `date`? Întoarce motivul sau null. */
function realEventProblem(ev, date, excludeId = "") {
    if (!R) return null;
    return R.eventProblem(ev, date, dayEventsOn(date, excludeId), { modules: state.settings.modules });
}

/** Câte note sunt în ziua dată, la toate materiile (fără nota `skip`). */
function gradesOnDay(date, skip = null) {
    let n = 0;
    Object.values(state.subjects).forEach(sub => sub.grades.forEach(g => { if (g !== skip && g.date === date) n++; }));
    return n;
}

/** E realistă nota `grade` la `mat`? (`skip` = nota veche, când o editezi) */
function realGradeProblem(mat, grade, skip = null) {
    if (!R || !state.subjects[mat]) return null;
    const list = state.subjects[mat].grades.filter(g => g !== skip);
    return R.gradeProblem(grade, list, grade.date ? gradesOnDay(grade.date, skip) : 0, { today: getLocalDateKey(), modules: state.settings.modules });
}

/* „Zi de școală?” = isSchoolDay din js/azi.js (weekend, vacanțe și sărbători legale). */
/** Ultima zi de școală până la `date` inclusiv (pentru notele adăugate în weekend sau în vacanță). */
function lastSchoolDay(date = getLocalDateKey()) {
    let d = date;
    for (let i = 0; i < 60; i++) {
        if (isSchoolDay(d)) return d;
        d = addDays(d, -1);
    }
    return date;
}

/* ---------- prea repede: cel mult 8 adăugări în 20 de secunde ---------- */
const realBurst = [];
/** Întoarce true (și arată un mesaj) dacă elevul adaugă mai repede decât e omenește. */
function tooFast() {
    const now = Date.now();
    while (realBurst.length && now - realBurst[0] > 20000) realBurst.shift();
    if (realBurst.length >= 8) {
        showToast("⚠️ Ușor! Adaugi prea repede. Mai încearcă peste câteva secunde.");
        return true;
    }
    realBurst.push(now);
    return false;
}

/** Verificare comună înainte de a salva un eveniment: arată motivul și întoarce false dacă nu e realist. */
function allowEvent(ev, date, excludeId = "") {
    const why = realEventProblem(ev, date, excludeId);
    if (why) { showToast(`⚠️ ${why}`, { duration: 4500 }); return false; }
    return !tooFast();
}
function allowGrade(mat, grade, skip = null) {
    const why = realGradeProblem(mat, grade, skip);
    if (why) { showToast(`⚠️ ${why}`, { duration: 4500 }); return false; }
    return skip ? true : !tooFast();
}

/* ==================== CURĂȚENIA: datele vechi care nu pot fi reale ==================== */
/**
 * Ce nu e realist în datele de acum: evenimente în plus pe zi, dubluri, teste fără materie, teste în weekend/vacanță,
 * titluri la întâmplare, materii inventate fără note, note în plus pe zi.
 */
function findUnrealistic() {
    const out = { events: [], titles: [], subjects: [], grades: [] };
    if (!R) return out;
    const mods = state.settings.modules;
    const links = typeof gradeLinks === "function" ? gradeLinks() : null;
    Object.entries(state.calendar).forEach(([date, list]) => {
        const kept = [];
        list.forEach(ev => {
            const title = R.cleanText(ev.title, R.LIMITS.eventTitle);
            const junkTitle = !title || R.looksLikeJunk(title) || title !== ev.title;
            // evenimentele importate (ex. probele de examen) au id-uri speciale și rămân
            const keep = ev.id?.startsWith("exam-") || (links && typeof linkedGrade === "function" && linkedGrade(links, ev, date));
            const why = keep ? null : R.eventProblem({ ...ev, title: junkTitle && ev.subject ? "" : title }, date, kept, { modules: mods });
            if (why && !(junkTitle && /Titlul/.test(why))) out.events.push({ date, ev, why });
            else {
                kept.push(ev);
                if (junkTitle) out.titles.push({ date, ev, title: title && !R.looksLikeJunk(title) ? title : "" });
            }
        });
    });
    const known = typeof programmeRows === "function" && myProgramme() ? myProgrammeRows().map(r => r.name) : [];
    const names = Object.keys(state.subjects);
    const seen = [];
    names.forEach(name => {
        const sub = state.subjects[name];
        const twin = seen.find(n => R.subjectKey(n) === R.subjectKey(name));
        const bad = R.looksLikeJunk(name) || /\p{Extended_Pictographic}/u.test(name) || !R.isKnownSubject(name, known);
        if ((bad || twin) && !sub.grades.length && !Object.values(state.calendar).some(l => l.some(ev => ev.subject === name))) out.subjects.push({ name, why: twin ? `dublură a „${twin}”` : "nu e o materie din programă" });
        else seen.push(name);
    });
    Object.entries(state.subjects).forEach(([mat, sub]) => {
        const perDay = {};
        sub.grades.forEach(g => {
            if (!g.date) return;
            perDay[g.date] = (perDay[g.date] || 0) + 1;
            if (perDay[g.date] > R.LIMITS.gradesPerSubjectPerDay) out.grades.push({ mat, g });
        });
    });
    return out;
}
const unrealisticCount = f => f.events.length + f.titles.length + f.subjects.length + f.grades.length;

function cleanUnrealistic() {
    const f = findUnrealistic();
    const n = unrealisticCount(f);
    if (!n) { showToast("✅ Totul arată realist."); return; }
    withUndo(`✅ Am făcut curat: ${plural(n, "lucru", "lucruri")} nerealiste.`, () => {
        const dropEv = new Set(f.events.map(x => x.ev));
        Object.keys(state.calendar).forEach(date => {
            state.calendar[date] = state.calendar[date].filter(ev => !dropEv.has(ev));
            if (!state.calendar[date].length) delete state.calendar[date];
        });
        f.titles.forEach(({ ev, title }) => { ev.title = title || eventTitleFrom("", ev.type, ev.subject); });
        f.subjects.forEach(({ name }) => { delete state.subjects[name]; });
        const dropG = new Set(f.grades.map(x => x.g));
        Object.values(state.subjects).forEach(sub => { sub.grades = sub.grades.filter(g => !dropG.has(g)); });
        addActivity(`Curățenie: ${plural(f.events.length, "eveniment", "evenimente")}, ${plural(f.subjects.length, "materie", "materii")}, ${plural(f.grades.length, "notă", "note")} scoase.`);
    });
}

/** Cardul de pe Azi, când găsim date nerealiste (și butonul din Setări › Date). */
function realismCardHTML() {
    const f = findUnrealistic();
    const n = unrealisticCount(f);
    if (!n) return "";
    const bits = [
        f.events.length ? plural(f.events.length, "eveniment în plus", "evenimente în plus") : "",
        f.titles.length ? plural(f.titles.length, "titlu ciudat", "titluri ciudate") : "",
        f.subjects.length ? plural(f.subjects.length, "materie care nu există", "materii care nu există") : "",
        f.grades.length ? plural(f.grades.length, "notă în plus", "note în plus") : ""
    ].filter(Boolean);
    return `
        <div class="azi-card-head"><h3 id="azi-real-title">${icon("alert")} Ceva nu pare real</h3></div>
        <p class="azi-more-line">Am găsit ${escapeHTML(bits.join(", "))}: de exemplu zeci de teste în aceeași zi, teste fără materie sau în vacanță.</p>
        <div class="azi-next-actions"><button type="button" class="btn btn-primary btn-sm" data-action="reality-clean">${icon("sparkles")} Fă curat</button></div>`;
}

Object.assign(ACTIONS, {
    "reality-clean": () => cleanUnrealistic()
});
