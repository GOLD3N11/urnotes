/* urNotes · Planul meu.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== PLANUL MEU ==================== */
/*
 * Un plan de studiu pe 7 zile, făcut din ce știe deja aplicația: note și ținte, materiile la risc,
 * testele și temele din calendar, orarul. Elevul spune o singură dată cât timp are; restul e automat.
 *
 * Reguli (fără AI, merge offline):
 *   – înaintea unui test: „învață” cu ~4 zile înainte, „exersează” cu ~2 zile, „recapitulează” în ajun;
 *   – o temă: o sesiune în ziua dinainte;
 *   – o materie la risc: 2 sesiuni pe săptămână, de preferință în ajunul orei ei (din orar);
 *   – o materie sub țintă: o sesiune (două dacă e marcată prioritară);
 *   – timpul rămas: încă o recapitulare pentru materiile care au nevoie, fără să treacă de minutele zilei;
 *   – preferințele elevului: materiile „îmi place” primesc o sesiune în plus (chiar și la țintă),
 *     iar cele „doar la teste” apar în plan numai înaintea testelor (fără teme, risc sau recapitulări).
 * Planul se reface singur când se schimbă ceva (un test nou, o notă). Sesiunile bifate sau mutate de elev rămân.
 * Totul e determinist (id-uri din cerere + zi), ca două dispozitive să ajungă la același plan, fără conflicte la sincronizare.
 */
const PLAN_DAYS = 7;
const PLAN_KEEP_DAYS = 60;
const PLAN_KINDS = {
    homework: { label: "Temă", icon: "note", rank: 0 },
    review: { label: "Recapitulează", icon: "repeat", rank: 1 },
    practice: { label: "Exersează", icon: "pen", rank: 2 },
    learn: { label: "Învață", icon: "notebook", rank: 3 },
    free: { label: "Studiu", icon: "book", rank: 4 }
};
const PLAN_MINUTES = [0, 15, 30, 45, 60, 90, 120, 150, 180];
const PLAN_SESSIONS = [15, 20, 25, 30, 45, 60];
const EV_ARTICLE = { Test: "testul", Examen: "examenul", Proiect: "proiectul", Prezentare: "prezentarea", "Temă": "tema" };

function defaultPlan() {
    return { prefs: { school: 45, weekend: 60, session: 30, rest: -1, calendar: true, setup: false, subjects: {} }, items: [], removed: {}, sig: "" };
}

function sanitizePlan(raw) {
    const plan = defaultPlan();
    if (!isPlainObject(raw)) return plan;
    const pr = isPlainObject(raw.prefs) ? raw.prefs : {};
    plan.prefs = {
        school: clampInteger(pr.school, 0, 600, 45),
        weekend: clampInteger(pr.weekend, 0, 600, 60),
        session: PLAN_SESSIONS.includes(Number(pr.session)) ? Number(pr.session) : 30,
        rest: Number.isInteger(Number(pr.rest)) && Number(pr.rest) >= -1 && Number(pr.rest) <= 6 ? Number(pr.rest) : -1,
        calendar: pr.calendar !== false,
        setup: pr.setup === true,
        // Preferințele pe materii: „fav” = îmi place (mai mult timp), „tests” = doar înaintea testelor; restul = normal
        subjects: Object.fromEntries(Object.entries(isPlainObject(pr.subjects) ? pr.subjects : {})
            .filter(([mat, v]) => typeof mat === "string" && mat.trim() && mat !== "__proto__" && mat.length <= 60 && (v === "fav" || v === "tests")).slice(0, 80))
    };
    const today = getLocalDateKey();
    const cutoff = addDays(today, -PLAN_KEEP_DAYS);
    plan.items = (Array.isArray(raw.items) ? raw.items : []).filter(isPlainObject).map(it => ({
        id: String(it.id || uid()).slice(0, 200),
        date: typeof it.date === "string" && DATE_KEY_RE.test(it.date) ? it.date : "",
        mat: typeof it.mat === "string" ? it.mat.trim().slice(0, 60) : "",
        kind: PLAN_KINDS[it.kind] ? it.kind : "free",
        min: clampInteger(it.min, 5, 240, 30),
        reason: typeof it.reason === "string" ? it.reason.slice(0, 160) : "",
        done: it.done === true,
        manual: it.manual === true,
        demand: typeof it.demand === "string" ? it.demand.slice(0, 200) : ""
    })).filter(it => it.date && it.mat && it.date >= cutoff).slice(0, 600);
    plan.removed = Object.fromEntries(Object.entries(isPlainObject(raw.removed) ? raw.removed : {})
        .filter(([, until]) => typeof until === "string" && DATE_KEY_RE.test(until) && until >= today).slice(0, 300));
    plan.sig = typeof raw.sig === "string" ? raw.sig.slice(0, 40) : "";
    return plan;
}

const subjectPref = mat => state.plan.prefs.subjects[mat] || "normal";
const planDays = (today = getLocalDateKey()) => Array.from({ length: PLAN_DAYS }, (_, i) => addDays(today, i));

/** Câte minute are elevul într-o zi: ziua liberă = 0; în vacanță și în weekend, timpul de weekend. */
function planMinutesOn(date) {
    const p = state.plan.prefs;
    const wd = parseDateKey(date).getDay();
    if (wd === p.rest) return 0;
    return isSchoolDay(date) ? p.school : p.weekend;
}

const weekdayLower = date => WEEKDAY_LONG[parseDateKey(date).getDay()].toLocaleLowerCase("ro");
function eventPhrase(type, date, from) {
    const what = EV_ARTICLE[type] || "evaluarea";
    const n = daysBetween(from, date);
    if (n === 0) return `${what} de azi`;
    if (n === 1) return `${what} de mâine`;
    const d = parseDateKey(date);
    return n <= 6 ? `${what} de ${weekdayLower(date)}` : `${what} din ${d.getDate()} ${MONTHS[d.getMonth()].toLocaleLowerCase("ro")}`;
}

function hashText(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/** Tot ce influențează planul; dacă nu s-a schimbat nimic, planul nu se reface. */
function planSignature(today) {
    const links = gradeLinks();
    const occ = occurrencesBetween(today, addDays(today, PLAN_DAYS + 4))
        .filter(o => (NEEDS_GRADE.has(o.ev.type) || o.ev.type === "Temă") && state.subjects[o.ev.subject])
        .map(o => [o.key, o.ev.type, o.ev.subject, isOccurrenceDone(o.ev, o.date, links) ? 1 : 0]);
    const subs = Object.entries(state.subjects).map(([m, s]) => [m, s.ore, s.target, s.priority ? 1 : 0, metrics.subjects[m]?.exactAvg ?? 0, s.grades.length]);
    return hashText(JSON.stringify([today, state.plan.prefs, occ, subs, state.timetable, state.settings.calc.riskThreshold, state.settings.modules, state.plan.removed]));
}

/** Cererile de studiu: ce ar trebui făcut, cu zilele potrivite în ordinea preferinței. */
function planDemands(today) {
    const S = state.plan.prefs.session;
    const half = Math.max(15, Math.round(S / 2 / 5) * 5);
    const days = planDays(today);
    const inPlan = date => date >= today && date <= days[days.length - 1];
    const links = gradeLinks();
    const out = [];
    const push = d => out.push({ ...d, candidates: d.candidates.filter(inPlan) });

    // 1. Testele (până la 10 zile înainte)
    occurrencesBetween(addDays(today, 1), addDays(today, PLAN_DAYS + 3)).forEach(o => {
        if (!NEEDS_GRADE.has(o.ev.type) || !state.subjects[o.ev.subject] || isOccurrenceDone(o.ev, o.date, links)) return;
        const D = daysBetween(today, o.date);
        const at = k => addDays(o.date, -k);
        const base = { mat: o.ev.subject, test: true };
        const why = from => `pentru ${eventPhrase(o.ev.type, o.date, from)}`;
        if (D >= 4) push({ ...base, id: `t|${o.key}|learn`, kind: "learn", min: S, prio: 100 - D, candidates: [at(4), at(3), at(5), at(2)], why });
        if (D >= 2) push({ ...base, id: `t|${o.key}|practice`, kind: "practice", min: S, prio: 101 - D, candidates: [at(2), at(3), at(1)], why });
        push({ ...base, id: `t|${o.key}|review`, kind: "review", min: D === 1 ? S : half, prio: 102 - D, candidates: [at(1), at(2)], why });
    });
    // 2. Temele (nu și la materiile „doar la teste”)
    occurrencesBetween(addDays(today, 1), addDays(today, PLAN_DAYS)).forEach(o => {
        if (o.ev.type !== "Temă" || !state.subjects[o.ev.subject] || subjectPref(o.ev.subject) === "tests" || isOccurrenceDone(o.ev, o.date, links)) return;
        const D = daysBetween(today, o.date);
        push({ id: `h|${o.key}`, mat: o.ev.subject, kind: "homework", min: S, prio: 95 - D, test: true,
            candidates: [addDays(o.date, -1), addDays(o.date, -2)], why: from => eventPhrase("Temă", o.date, from) });
    });
    // 3. Materiile la risc și cele sub țintă
    const risk = state.settings.calc.riskThreshold;
    const spread = [1, 3, 5, 0, 2, 4, 6].map(i => days[i]);
    const classEves = mat => days.filter(d => lessonsOn(addDays(d, 1)).includes(mat));
    const orderFor = mat => [...new Set([...classEves(mat), ...spread])];
    const need = [];
    statsEntries().forEach(e => {
        const pref = subjectPref(e.mat);
        if (pref === "tests") return; // elevul vrea să o învețe doar înaintea testelor
        if (e.standing.key === "risk") {
            const p = planForCondition(e.mat, d => d.exactAvg >= risk);
            need.push({ e, prio: 80 + Math.min(8, (risk - e.d.rawAvg) * 2), count: 2, why: () => `ca să ieși din risc (${p.next ? `${planPill(p).text} la următoarea notă` : `îți trebuie ${planPill(p).text}`})` });
        } else if (e.standing.key === "below") {
            need.push({ e, prio: 60 + Math.min(8, Math.max(0, targetGap(e)) * 4) + (e.sub.priority || pref === "fav" ? 8 : 0), count: e.sub.priority || pref === "fav" ? 2 : 1, why: () => `ca să ajungi la ținta de ${fmtTarget(e.sub.target)}` });
        } else if (pref === "fav") {
            need.push({ e, prio: 66, count: 1, why: () => "pentru că îți place" });
        }
    });
    need.sort((a, b) => b.prio - a.prio).forEach(n => {
        const order = orderFor(n.e.mat);
        for (let k = 1; k <= n.count; k++) {
            // a doua sesiune: pornește de la mijlocul săptămânii, ca să nu cadă lângă prima
            const cand = k === 1 ? order : [...order.slice(Math.ceil(order.length / 2)), ...order.slice(0, Math.ceil(order.length / 2))];
            push({ id: `s|${n.e.mat}|${k}`, mat: n.e.mat, kind: "practice", min: S, prio: n.prio - k, candidates: cand, why: n.why });
        }
    });
    // 4. Timp rămas: încă o recapitulare pentru cine are nevoie
    need.forEach(n => push({ id: `x|${n.e.mat}`, mat: n.e.mat, kind: "review", min: S, prio: 20 + n.prio / 10,
        candidates: [...spread].reverse(), why: () => "ca să fixezi ce ai învățat" }));
    return out.sort((a, b) => b.prio - a.prio);
}

/** Reface planul pe următoarele 7 zile; păstrează istoricul, sesiunile bifate și pe cele schimbate de elev. */
function buildPlan(today = getLocalDateKey()) {
    const p = state.plan;
    const days = planDays(today);
    const end = days[days.length - 1];
    const kept = p.items.filter(it => it.date < today || it.done || (it.manual && it.date <= end && state.subjects[it.mat]));
    const recent = addDays(today, -10);
    const satisfied = new Set(kept.filter(it => it.demand && (it.date >= today || (it.done && it.date >= recent))).map(it => it.demand));
    const cap = Object.fromEntries(days.map(d => [d, planMinutesOn(d)]));
    const busy = new Map(days.map(d => [d, new Set()]));
    kept.filter(it => it.date >= today && it.date <= end).forEach(it => {
        cap[it.date] -= it.min;
        busy.get(it.date).add(it.mat);
    });

    const fresh = [];
    planDemands(today).forEach(d => {
        if (satisfied.has(d.id) || p.removed[d.id] || !d.candidates.length) return;
        let date = d.candidates.find(c => cap[c] >= d.min && !busy.get(c).has(d.mat));
        if (!date && d.test) date = d.candidates.find(c => !busy.get(c).has(d.mat)) || d.candidates[0]; // testele încap oricum
        if (!date) return;
        cap[date] -= d.min;
        busy.get(date).add(d.mat);
        satisfied.add(d.id);
        fresh.push({ id: `${d.id}|${date}`, date, mat: d.mat, kind: d.kind, min: d.min, reason: d.why(date), done: false, manual: false, demand: d.id });
    });
    p.items = [...kept, ...fresh];
    p.sig = planSignature(today);
}

/** Apelată la fiecare calcul: reface planul doar dacă s-a schimbat ceva care îl influențează. */
function updatePlan() {
    if (!state.plan.prefs.setup) return;
    const today = getLocalDateKey();
    if (planSignature(today) !== state.plan.sig) buildPlan(today);
}

const planItemsOn = date => state.plan.items
    .filter(it => it.date === date)
    .sort((a, b) => Number(a.done) - Number(b.done) || PLAN_KINDS[a.kind].rank - PLAN_KINDS[b.kind].rank || a.mat.localeCompare(b.mat, "ro"));

/** Zile la rând cu planul făcut (zilele fără sesiuni nu rup șirul; azi nu-l rupe cât timp nu s-a terminat). */
function planStreak(today = getLocalDateKey()) {
    let count = 0;
    for (let i = 0; i < PLAN_KEEP_DAYS; i++) {
        const date = addDays(today, -i);
        const items = state.plan.items.filter(it => it.date === date);
        if (!items.length) continue;
        if (items.every(it => it.done)) count++;
        else if (i > 0) break;
    }
    return count;
}

function planWeekProgress(today = getLocalDateKey()) {
    const end = addDays(today, PLAN_DAYS - 1);
    const items = state.plan.items.filter(it => it.date >= today && it.date <= end);
    const done = items.filter(it => it.done);
    return { total: items.length, done: done.length, minutes: items.reduce((n, it) => n + it.min, 0), doneMinutes: done.reduce((n, it) => n + it.min, 0) };
}

/** Ținte pe modul: ce notă trebuie, unde, pentru materiile care au nevoie. */
function planGoals() {
    const risk = state.settings.calc.riskThreshold;
    const nextTest = mat => upcomingForSubject(mat, 6).find(ev => NEEDS_GRADE.has(ev.type));
    const goals = statsEntries()
        .filter(e => e.standing.key === "risk" || e.standing.key === "below")
        .sort((a, b) => STANDING_RANK[a.standing.key] - STANDING_RANK[b.standing.key] || a.d.rawAvg - b.d.rawAvg)
        .map(e => {
            const isRisk = e.standing.key === "risk";
            const plan = planForCondition(e.mat, isRisk ? d => d.exactAvg >= risk : d => reachesTarget(d, e.sub.target));
            return { mat: e.mat, avg: e.d.exactAvg, risk: isRisk, goal: isRisk ? `ieși din risc (${risk.toFixed(2)})` : `ajungi la ${fmtTarget(e.sub.target)}`, pill: planPill(plan), plan, test: nextTest(e.mat), testsOnly: subjectPref(e.mat) === "tests" };
        });
    Object.entries(state.subjects).forEach(([mat, sub]) => {
        const test = !sub.grades.length && nextTest(mat);
        if (test) goals.push({ mat, avg: 0, first: true, goal: "prima notă", test });
    });
    return goals;
}

/* ---------- desenare ---------- */
/** Ce faci concret într-o sesiune, pe scurt (apare și în cronometru). */
const PLAN_HOWTO = {
    learn: "Citește lecția, fă-ți o schemă și scrie 3 întrebări la care știi răspunsul.",
    practice: "Rezolvă exerciții de tipul celor de la test; verifică-te la final.",
    review: "Recapitulează schema și greșelile tale; încearcă 2–3 exerciții rapide.",
    homework: "Fă tema de la cap la coadă, apoi recitește-o o dată.",
    free: "Lucrează la ce simți că ai nevoie la materia asta."
};

function planItemHTML(it, { compact = false } = {}) {
    const k = PLAN_KINDS[it.kind];
    const id = escapeHTML(it.id);
    const label = `${it.mat}: ${k.label}, ${it.min} minute`;
    const today = getLocalDateKey();
    return `
        <li class="plan-item ${it.done ? "is-done" : ""} kind-${it.kind}">
            <label class="plan-check">
                <input type="checkbox" data-action="plan-toggle" data-id="${id}" ${it.done ? "checked" : ""} aria-label="${escapeHTML(`${it.done ? "Făcut" : "De făcut"}: ${label}`)}">
                <span class="plan-box" aria-hidden="true">${icon("check")}</span>
            </label>
            <span class="plan-main">
                <b>${escapeHTML(it.mat)}${subjectPref(it.mat) === "fav" ? ` <span class="plan-fav-star" title="Îți place">${icon("star")}</span>` : ""}</b>
                <small><span class="plan-kind">${icon(k.icon)} ${k.label}</span> · ${it.min} min</small>
                ${it.reason && !compact ? `<small class="plan-why">${icon("info")} De ce: ${escapeHTML(it.reason)}</small>` : ""}
            </span>
            ${!it.done && it.date <= addDays(today, 0) ? `<button type="button" class="btn btn-glass btn-sm plan-start" data-action="focus-start" data-id="${id}" aria-label="${escapeHTML(`Începe: ${label}`)}">${icon("timer")} <span>Începe</span></button>` : ""}
            ${compact ? "" : `
                <span class="plan-tools">
                    <button type="button" class="icon-btn btn btn-text" data-action="plan-move" data-id="${id}" aria-label="${escapeHTML(`Mută: ${label}`)}" title="Mută în altă zi">${icon("arrows-v")}</button>
                    <button type="button" class="icon-btn btn btn-text" data-action="plan-delete" data-id="${id}" aria-label="${escapeHTML(`Șterge: ${label}`)}" title="Scoate din plan">${icon("trash")}</button>
                </span>`}
        </li>`;
}

function planDayLabel(date, today) {
    const n = daysBetween(today, date);
    const wd = WEEKDAY_LONG[parseDateKey(date).getDay()];
    return n === 0 ? `Azi · ${wd}` : n === 1 ? `Mâine · ${wd}` : longDateLabel(date);
}

const PLAN_CHIPS_SCHOOL = [15, 30, 45, 60, 90];
const PLAN_CHIPS_WEEKEND = [0, 30, 60, 90, 120];
const planMinFmt = v => v === 0 ? "deloc" : v < 60 ? `${v} min` : `${Math.floor(v / 60)} h${v % 60 ? ` ${v % 60}` : ""}`;

function planPrefsHTML(prefix = "plan") {
    const p = state.plan.prefs;
    const near = (list, v) => list.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best, list[0]);
    const chips = (name, list, value, label) => `
        <div class="plan-q">
            <span class="plan-q-label" id="${prefix}-${name}-l">${label}</span>
            <div class="plan-chips" role="radiogroup" aria-labelledby="${prefix}-${name}-l">
                ${list.map(v => `<label class="plan-chip"><input type="radio" name="${prefix}-${name}" value="${v}" ${v === near(list, value) ? "checked" : ""}><span>${planMinFmt(v)}</span></label>`).join("")}
            </div>
        </div>`;
    return `
        <div class="plan-prefs">
            ${chips("school", PLAN_CHIPS_SCHOOL, p.school, "Cât poți învăța într-o zi de școală?")}
            ${chips("weekend", PLAN_CHIPS_WEEKEND, p.weekend, "Și în weekend sau în vacanță?")}
        </div>
        <details class="plan-more">
            <summary>Mai multe opțiuni <small>(cât ține o sesiune, zi liberă, materiile preferate)</small></summary>
            <div class="plan-more-body">
                <div class="form-row">
                    <div class="form-group">
                        <label for="${prefix}-session">O sesiune durează</label>
                        <select id="${prefix}-session" class="glass-select">${PLAN_SESSIONS.map(v => `<option value="${v}" ${v === p.session ? "selected" : ""}>${v} min</option>`).join("")}</select>
                    </div>
                    <div class="form-group">
                        <label for="${prefix}-rest">Zi liberă</label>
                        <select id="${prefix}-rest" class="glass-select">
                            <option value="-1" ${p.rest === -1 ? "selected" : ""}>Fără zi liberă</option>
                            ${WEEKDAY_ORDER.map(wd => `<option value="${wd}" ${p.rest === wd ? "selected" : ""}>${WEEKDAY_LONG[wd]}</option>`).join("")}
                        </select>
                    </div>
                </div>
                <label class="check-row plan-cal-row"><input type="checkbox" id="${prefix}-calendar" ${p.calendar ? "checked" : ""}> Arată sesiunile și în Calendar</label>
                ${planSubjectPrefsHTML(prefix)}
            </div>
        </details>`;
}

const PLAN_PREFS = [
    { v: "fav", label: "Îmi place", hint: "mai mult timp" },
    { v: "normal", label: "Normal", hint: "" },
    { v: "tests", label: "Doar la teste", hint: "" }
];

/** Ce materii îi plac elevului și pe care vrea să le învețe doar înaintea testelor. */
function planSubjectPrefsHTML(prefix) {
    const mats = Object.keys(state.subjects);
    if (!mats.length) return "";
    return `
        <fieldset class="plan-favs" id="${prefix}-favs">
            <legend>Ce materii îți plac?</legend>
            <p class="subtitle">„Îmi place” primește mai mult timp. „Doar la teste” apare în plan numai înaintea testelor.</p>
            ${mats.map((mat, i) => `
                <div class="plan-fav-row" role="radiogroup" aria-label="${escapeHTML(mat)}" data-mat="${escapeHTML(mat)}">
                    <span class="plan-fav-name">${escapeHTML(mat)}</span>
                    <span class="azi-seg plan-fav-seg">
                        ${PLAN_PREFS.map(o => `<label class="plan-fav-opt"><input type="radio" name="${prefix}-fav-${i}" value="${o.v}" ${subjectPref(mat) === o.v ? "checked" : ""}><span>${o.v === "fav" ? `${icon("star")} ` : ""}${o.label}</span></label>`).join("")}
                    </span>
                </div>`).join("")}
        </fieldset>`;
}

function readPlanPrefs(prefix = "plan") {
    const p = state.plan.prefs;
    const picked = name => document.querySelector(`input[name="${prefix}-${name}"]:checked`)?.value ?? field(`${prefix}-${name}`);
    p.school = clampInteger(picked("school"), 0, 600, p.school);
    p.weekend = clampInteger(picked("weekend"), 0, 600, p.weekend);
    p.session = PLAN_SESSIONS.includes(Number(field(`${prefix}-session`))) ? Number(field(`${prefix}-session`)) : p.session;
    const rest = Number(field(`${prefix}-rest`));
    p.rest = Number.isInteger(rest) && rest >= -1 && rest <= 6 ? rest : -1;
    p.calendar = Boolean($(`${prefix}-calendar`)?.checked);
    const subjects = {};
    document.querySelectorAll(`#${prefix}-favs .plan-fav-row`).forEach(row => {
        const v = row.querySelector("input:checked")?.value;
        if ((v === "fav" || v === "tests") && state.subjects[row.dataset.mat]) subjects[row.dataset.mat] = v;
    });
    p.subjects = subjects;
    p.setup = true;
}

function renderPlan() {
    const box = $("plan-body");
    if (!box) return;
    const p = state.plan;
    const tools = $("plan-tools");
    if (tools) tools.hidden = !p.prefs.setup;
    if (!p.prefs.setup) {
        box.innerHTML = `
            <section class="glass-card plan-setup" aria-labelledby="plan-setup-title">
                <div class="plan-setup-buddy" aria-hidden="true">${buddySVG("happy")}</div>
                <div class="plan-setup-main">
                    <h3 id="plan-setup-title">Hai să-ți facem un plan${firstName() ? `, ${escapeHTML(firstName())}` : ""}!</h3>
                    <p class="subtitle">Spune-mi cât timp ai, iar eu împart săptămâna: înainte de teste, pentru teme și pentru materiile care au nevoie de tine. Îl poți schimba oricând.</p>
                    ${planPrefsHTML("plan")}
                    <button type="button" class="btn btn-primary" data-action="plan-create">${icon("sparkles")} Fă-mi planul</button>
                </div>
            </section>`;
        return;
    }
    const today = getLocalDateKey();
    const days = planDays(today);
    if (!days.includes(ui.planDay)) ui.planDay = today;
    const sel = ui.planDay;
    const prog = planWeekProgress(today);
    const streak = planStreak(today);
    const goals = planGoals();
    const mod = moduleAt(today);
    const pct = prog.total ? Math.round(prog.done / prog.total * 100) : 0;
    const todayItems = planItemsOn(today);
    const todayDone = todayItems.filter(it => it.done).length;
    const next = todayItems.find(it => !it.done);
    const links = gradeLinks();
    const eventsOn = date => occurrencesBetween(date, date).filter(o => !isOccurrenceDone(o.ev, o.date, links));
    const ring = (done, total, size) => {
        const r = (size - 8) / 2, c = 2 * Math.PI * r, part = total ? done / total : 0;
        return `<svg class="plan-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="plan-ring-bg"/>
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="plan-ring-fg" stroke-dasharray="${(c * part).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
    };
    const selItems = planItemsOn(sel);
    const selMinutes = planMinutesOn(sel);
    const selEvents = eventsOn(sel);

    box.innerHTML = `
        <section class="glass-card plan-today" aria-labelledby="plan-today-title">
            <div class="plan-today-ring">${ring(todayDone, todayItems.length, 92)}<b>${todayItems.length ? `${todayDone}/${todayItems.length}` : "–"}</b></div>
            <div class="plan-today-main">
                <h3 id="plan-today-title">${todayItems.length
                    ? todayDone === todayItems.length ? `Gata pe azi${firstName() ? `, ${escapeHTML(firstName())}` : ""}! 🎉` : `Azi ai ${plural(todayItems.length - todayDone, "sesiune", "sesiuni")} (${todayItems.filter(it => !it.done).reduce((n, it) => n + it.min, 0)} min)`
                    : "Azi n-ai nimic în plan"}</h3>
                <p class="subtitle">${next
                    ? `Urmează <b>${escapeHTML(next.mat)}</b>: ${escapeHTML(PLAN_KINDS[next.kind].label.toLocaleLowerCase("ro"))}, ${next.min} min${next.reason ? `, ${escapeHTML(next.reason)}` : ""}.`
                    : todayItems.length ? "Ai bifat tot. Restul zilei e al tău." : "Timp liber sau de citit ce-ți place."}</p>
                <div class="plan-today-actions">
                    ${next ? `<button type="button" class="btn btn-primary" data-action="focus-start" data-id="${escapeHTML(next.id)}">${icon("timer")} Începe acum · ${next.min} min</button>` : ""}
                    <span class="plan-chip-stat" title="Zile la rând în care ai bifat tot">${icon("flame")} ${plural(streak, "zi", "zile")} la rând</span>
                    <span class="plan-chip-stat" title="Cât din săptămână ai făcut">${icon("trend-up")} ${pct}% din săptămână</span>
                </div>
            </div>
        </section>

        <nav class="plan-strip" aria-label="Zilele săptămânii">
            ${days.map(date => {
                const items = planItemsOn(date);
                const used = items.reduce((n, it) => n + it.min, 0);
                const minutes = planMinutesOn(date);
                const load = minutes ? Math.min(1, used / minutes) : 0;
                const done = items.length && items.every(it => it.done);
                const tests = eventsOn(date).filter(o => NEEDS_GRADE.has(o.ev.type)).length;
                const d = parseDateKey(date);
                return `
                <button type="button" class="plan-strip-day ${date === sel ? "is-on" : ""} ${date === today ? "is-today" : ""} ${done ? "is-done" : ""} ${minutes === 0 ? "is-rest" : ""}" data-action="plan-day" data-date="${date}" aria-pressed="${date === sel}" aria-label="${escapeHTML(`${planDayLabel(date, today)}: ${items.length ? `${plural(items.length, "sesiune", "sesiuni")}, ${used} minute` : minutes === 0 ? "zi liberă" : "nimic programat"}${tests ? `, ${plural(tests, "test", "teste")}` : ""}`)}">
                    <span class="plan-strip-wd">${date === today ? "Azi" : WEEKDAY_SHORT[d.getDay()]}</span>
                    <b class="plan-strip-n">${d.getDate()}</b>
                    <span class="plan-strip-load" aria-hidden="true"><i style="height:${Math.round(load * 100)}%"></i></span>
                    <span class="plan-strip-meta" aria-hidden="true">${done ? icon("check") : items.length ? `${used}′` : minutes === 0 ? "liber" : "–"}</span>
                    ${tests ? `<span class="plan-strip-test" aria-hidden="true" title="test">${tests}</span>` : ""}
                </button>`;
            }).join("")}
        </nav>

        <div class="plan-grid">
            <section class="glass-card plan-week" aria-labelledby="plan-day-title">
                <div class="azi-card-head"><h3 id="plan-day-title">${icon("calendar-check")} ${escapeHTML(planDayLabel(sel, today))}</h3>
                    <span class="cat-count">${selMinutes === 0 && !selItems.length ? "zi liberă" : `${selItems.reduce((n, it) => n + it.min, 0)} din ${selMinutes} min`}</span></div>
                ${selEvents.length ? `<p class="plan-day-events">${icon("flag")} În ziua asta: ${selEvents.map(o => escapeHTML(o.ev.title || o.ev.type)).join(", ")}</p>` : ""}
                ${selItems.length ? `<ul class="plan-list">${selItems.map(it => planItemHTML(it)).join("")}</ul>`
                    : `<p class="plan-empty">${selMinutes === 0 ? "Zi liberă: odihnește-te, îți prinde bine." : "Nimic programat: timp liber sau de citit ce-ți place."}</p>`}
                <button type="button" class="btn btn-text btn-sm plan-add-here" data-action="plan-add" data-date="${sel}">${icon("plus")} Adaugă o sesiune în ziua asta</button>
            </section>
            <div class="plan-side">
                <section class="glass-card plan-goals" aria-labelledby="plan-goals-title">
                    <div class="azi-card-head"><h3 id="plan-goals-title">${icon("target")} Ținte pe modul ${helpDot("target")}</h3></div>
                    ${mod ? `<p class="subtitle">Până la sfârșitul modulului ${mod.n} (${escapeHTML(longDateLabel(mod.end).split(", ")[1])}).</p>` : ""}
                    ${goals.length ? `<ul class="plan-goal-list">${goals.map(g => `
                        <li><button type="button" class="azi-watch-row" data-action="open-subject" data-mat="${escapeHTML(g.mat)}">
                            <span class="azi-watch-main"><b>${escapeHTML(g.mat)}</b>
                                <small>${g.first
                                    ? `Prima notă: ${escapeHTML(eventPhrase(g.test.type, g.test.date, today))}.`
                                    : `Ca să ${escapeHTML(g.goal)}: ${g.plan.next ? `<span class="azi-need is-${g.pill.tone}">${escapeHTML(g.pill.text)}</span> la următoarea notă` : `<span class="azi-need is-${g.pill.tone}">${escapeHTML(g.pill.text)}</span>`}${g.test ? ` (${escapeHTML(eventPhrase(g.test.type, g.test.date, today))})` : ""}.${g.testsOnly ? ` <span class="plan-goal-note">Planific doar înaintea testelor.</span>` : ""}`}</small>
                            </span>
                            ${g.first ? "" : `<span class="azi-lesson-avg tone-${gradeTone(g.avg)}">${g.avg.toFixed(2)}</span>`}
                        </button></li>`).join("")}</ul>`
                        : emptyNote(Object.keys(state.subjects).length ? "Toate materiile sunt la țintă. Planul se ocupă doar de teste și teme." : "Adaugă-ți materiile ca să-ți pot face ținte.")}
                </section>
                <details class="glass-card plan-how">
                    <summary>${icon("bulb")} Cum îți fac planul?</summary>
                    <ul>
                        <li><b>Înainte de un test:</b> învăți cu ~4 zile înainte, exersezi cu 2 zile înainte și recapitulezi în ajun.</li>
                        <li><b>O temă:</b> o sesiune în ziua dinainte.</li>
                        <li><b>O materie la risc:</b> 2 sesiuni pe săptămână, de preferat în ajunul orei ei.</li>
                        <li><b>Sub țintă:</b> o sesiune pe săptămână (două dacă e prioritară).</li>
                        <li>Nu trec niciodată de timpul pe care mi l-ai dat. Ce bifezi sau muți rămâne cum ai lăsat.</li>
                    </ul>
                </details>
            </div>
        </div>`;
}

/** Cardul „Planul de azi” de pe pagina Azi. */
function homePlanHTML(today) {
    if (!state.plan.prefs.setup) {
        return `
            ${homeCardHead("azi-plan-title", "calendar-check", "Planul de azi")}
            <p class="azi-more-line">Spune-mi cât timp ai de învățat și îți împart săptămâna pe teste, teme și materiile care au nevoie.</p>
            <button type="button" class="btn btn-primary btn-sm" data-action="nav" data-tab="tab-plan">${icon("sparkles")} Fă-ți un plan</button>`;
    }
    const items = planItemsOn(today);
    const done = items.filter(it => it.done).length;
    const next = items.length ? null : state.plan.items.filter(it => it.date > today && !it.done).sort((a, b) => a.date.localeCompare(b.date))[0];
    return `
        ${homeCardHead("azi-plan-title", "calendar-check", "Planul de azi", items.length ? `<span class="cat-count">${done} din ${items.length}</span>` : "")}
        ${items.length
            ? `<ul class="plan-list is-compact">${items.map(it => planItemHTML(it, { compact: true })).join("")}</ul>
               ${done === items.length ? `<p class="plan-done-line">${icon("check-circle")} Gata pe azi! ${planStreak(today) > 1 ? `${planStreak(today)} zile la rând.` : ""}</p>` : ""}`
            : `<p class="azi-more-line">Azi n-ai nimic în plan.${next ? ` Următoarea sesiune: ${escapeHTML(next.mat)}, ${escapeHTML(relativeDay(next.date))}.` : ""}</p>`}
        <button type="button" class="btn btn-text btn-sm" data-action="nav" data-tab="tab-plan">${icon("calendar-check")} Tot planul</button>`;
}

/* ---------- cronometrul de concentrare ---------- */
/* „Începe” deschide un cronometru pentru sesiune; la final (sau cu „Am terminat”) sesiunea se bifează.
   Ecranul telefonului rămâne aprins cât merge cronometrul (unde browserul permite). */
const focusRun = { it: null, total: 0, startedAt: 0, elapsed: 0, paused: false, timer: 0, wake: null, title: "" };

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function startFocus(id) {
    const it = findPlanItem(id);
    if (!it || it.done) return;
    const k = PLAN_KINDS[it.kind];
    Object.assign(focusRun, { it, total: it.min * 60000, startedAt: Date.now(), elapsed: 0, paused: false, title: document.title });
    openModal({
        title: `${it.mat} · ${k.label}`,
        confirmText: "Am terminat",
        cancelText: "Renunț",
        body: `
            <div class="focus" id="focus-timer">
                <div class="focus-dial">
                    <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" class="focus-bg"/><circle cx="100" cy="100" r="88" class="focus-fg" id="focus-arc" transform="rotate(-90 100 100)"/></svg>
                    <div class="focus-time"><b id="focus-left" role="timer" aria-live="off">${it.min}:00</b><small id="focus-state">rămase</small></div>
                </div>
                <p class="focus-how">${icon(k.icon)} ${escapeHTML(PLAN_HOWTO[it.kind] || PLAN_HOWTO.free)}</p>
                ${it.reason ? `<p class="focus-why">De ce acum: ${escapeHTML(it.reason)}</p>` : ""}
                <div class="focus-tools">
                    <button type="button" class="btn btn-glass" data-action="focus-pause" id="focus-pause">${icon("clock")} Pauză</button>
                    <button type="button" class="btn btn-glass" data-action="focus-more">${icon("plus")} 5 min</button>
                </div>
                <p class="focus-tip">Pune telefonul cu ecranul în jos și nu te uita la notificări până la final. Poți închide fereastra oricând.</p>
            </div>`,
        onConfirm: () => finishFocus(true)
    });
    if (!$("focus-timer")) return; // (vizitator: s-a deschis autentificarea)
    clearInterval(focusRun.timer);
    focusRun.timer = setInterval(tickFocus, 500);
    tickFocus();
    navigator.wakeLock?.request?.("screen").then(lock => { focusRun.wake = lock; }).catch(() => {});
}

function focusLeft() {
    const ran = focusRun.elapsed + (focusRun.paused ? 0 : Date.now() - focusRun.startedAt);
    return Math.max(0, focusRun.total - ran);
}

function tickFocus() {
    const box = $("focus-timer");
    if (!box || !focusRun.it) { stopFocus(); return; }
    const left = focusLeft();
    const m = Math.floor(left / 60000), sec = Math.floor(left % 60000 / 1000);
    const text = `${m}:${String(sec).padStart(2, "0")}`;
    $("focus-left").textContent = text;
    const c = 2 * Math.PI * 88;
    $("focus-arc").setAttribute("stroke-dasharray", `${(c * (1 - left / focusRun.total)).toFixed(1)} ${c.toFixed(1)}`);
    document.title = `${focusRun.paused ? "⏸" : "⏱"} ${text} · ${focusRun.it.mat}`;
    if (left <= 0) finishFocus(true, { auto: true });
}

function toggleFocusPause() {
    if (!focusRun.it) return;
    if (focusRun.paused) { focusRun.startedAt = Date.now(); focusRun.paused = false; }
    else { focusRun.elapsed += Date.now() - focusRun.startedAt; focusRun.paused = true; }
    $("focus-pause").innerHTML = focusRun.paused ? `${icon("timer")} Continuă` : `${icon("clock")} Pauză`;
    $("focus-state").textContent = focusRun.paused ? "în pauză" : "rămase";
    tickFocus();
}

function stopFocus() {
    clearInterval(focusRun.timer);
    focusRun.timer = 0;
    if (focusRun.title) document.title = focusRun.title;
    focusRun.wake?.release?.().catch?.(() => {});
    focusRun.wake = null;
    focusRun.it = null;
}

function finishFocus(done, { auto = false } = {}) {
    const it = focusRun.it;
    stopFocus();
    closeActionModal();
    if (!it || !done || !findPlanItem(it.id)) return;
    it.done = true;
    refresh();
    const today = getLocalDateKey();
    const left = state.plan.items.filter(x => x.date === today && !x.done);
    buddyReact(left.length ? "happy" : "love");
    if (auto) { try { navigator.vibrate?.([120, 80, 120]); } catch (_) { /* fără vibrație */ } }
    showToast(left.length ? `✅ Bravo! ${it.mat} e bifată. Mai ai ${plural(left.length, "sesiune", "sesiuni")} azi.` : "🎉 Gata planul de azi!");
}

/* ---------- acțiuni ---------- */
const findPlanItem = id => state.plan.items.find(it => it.id === id);

function togglePlanItem(el) {
    const it = findPlanItem(el.dataset.id);
    if (!it) return;
    it.done = Boolean(el.checked);
    const today = getLocalDateKey();
    const todays = state.plan.items.filter(x => x.date === today);
    refresh();
    if (it.done && it.date === today) buddyReact(todays.every(x => x.done) ? "love" : "giggle");
    // focusul rămâne pe aceeași bifă după redesenare
    document.querySelector(`[data-action="plan-toggle"][data-id="${CSS.escape(it.id)}"]`)?.focus();
}

function openPlanMove(id) {
    const it = findPlanItem(id);
    if (!it) return;
    const today = getLocalDateKey();
    openModal({
        title: `Mută: ${it.mat}`,
        confirmText: "",
        cancelText: "Renunță",
        body: `
            <p class="modal-hint">În ce zi vrei să faci sesiunea „${escapeHTML(PLAN_KINDS[it.kind].label)}” (${it.min} min)?</p>
            <div class="plan-move-days">
                ${planDays(today).map(d => `<button type="button" class="btn ${d === it.date ? "btn-primary" : "btn-glass"}" data-action="plan-move-to" data-id="${escapeHTML(it.id)}" data-date="${d}" ${d === it.date ? 'aria-current="true"' : ""}>${escapeHTML(planDayLabel(d, today))}</button>`).join("")}
            </div>`
    });
}

function movePlanItem(id, date) {
    const it = findPlanItem(id);
    if (!it || !DATE_KEY_RE.test(date)) return;
    it.date = date;
    it.manual = true;
    closeActionModal();
    refresh();
    showToast(`Am mutat ${it.mat} pe ${planDayLabel(date, getLocalDateKey()).toLocaleLowerCase("ro")}.`);
}

function deletePlanItem(id) {
    const it = findPlanItem(id);
    if (!it) return;
    withUndo(`Am scos ${it.mat} din plan.`, () => {
        state.plan.items = state.plan.items.filter(x => x !== it);
        if (it.demand) state.plan.removed[it.demand] = addDays(getLocalDateKey(), PLAN_DAYS); // nu-l pune la loc săptămâna asta
    });
}

function openPlanAdd(preDate = "") {
    const mats = Object.keys(state.subjects);
    if (!mats.length) {
        showToast("⚠️ Adaugă întâi o materie în catalog.");
        return;
    }
    const today = getLocalDateKey();
    openModal({
        title: "Adaugă o sesiune",
        confirmText: "Adaugă",
        body: `
            <div class="form-group"><label for="plan-add-mat">Materia</label>
                <select id="plan-add-mat" class="glass-select">${mats.map(m => `<option>${escapeHTML(m)}</option>`).join("")}</select></div>
            <div class="form-group"><label for="plan-add-day">Ziua</label>
                <select id="plan-add-day" class="glass-select">${planDays(today).map(d => `<option value="${d}" ${d === preDate ? "selected" : ""}>${escapeHTML(planDayLabel(d, today))}</option>`).join("")}</select></div>
            <div class="form-group"><label for="plan-add-kind">Ce faci</label>
                <select id="plan-add-kind" class="glass-select">${Object.entries(PLAN_KINDS).map(([k, v]) => `<option value="${k}" ${k === "practice" ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
            <div class="form-group"><label for="plan-add-min">Cât timp</label>
                <select id="plan-add-min" class="glass-select">${PLAN_SESSIONS.map(v => `<option value="${v}" ${v === state.plan.prefs.session ? "selected" : ""}>${v} min</option>`).join("")}</select></div>`,
        onConfirm: () => {
            const mat = field("plan-add-mat");
            const date = field("plan-add-day");
            if (!state.subjects[mat] || !DATE_KEY_RE.test(date)) return;
            const kind = PLAN_KINDS[field("plan-add-kind")] ? field("plan-add-kind") : "practice";
            state.plan.items.push({ id: `m|${uid()}`, date, mat, kind, min: clampInteger(field("plan-add-min"), 5, 240, 30), reason: "adăugată de tine", done: false, manual: true, demand: "" });
            closeActionModal();
            refresh();
            showToast(`✅ Am pus ${mat} în plan.`);
        }
    });
}

function openPlanPrefs() {
    openModal({
        title: "Timpul și materiile tale",
        confirmText: "Salvează și refă planul",
        body: planPrefsHTML("planm"),
        onConfirm: () => {
            readPlanPrefs("planm");
            closeActionModal();
            rebuildPlanNow();
        }
    });
}

function rebuildPlanNow() {
    // Refacerea de mână pune la loc și ce ai scos din plan săptămâna asta (dar nu atinge ce ai bifat sau mutat).
    state.plan.removed = {};
    buildPlan();
    refresh();
    showToast("✅ Planul a fost refăcut.");
}

/** Mascota reacționează scurt (fără text) — ex. când bifezi o sesiune. */
function buddyReact(mood) {
    const btn = document.querySelector("#azi-buddy .buddy-poke");
    if (!btn) return;
    btn.innerHTML = buddySVG(mood);
    clearTimeout(buddyPoke.timer);
    buddyPoke.timer = setTimeout(() => {
        if (buddyPoke.rest && document.contains(btn)) btn.innerHTML = buddySVG(buddyPoke.rest.mood);
    }, 3500);
}

const PLAN_ACTIONS = {
    "plan-toggle": el => togglePlanItem(el),
    "plan-move": el => openPlanMove(el.dataset.id),
    "plan-move-to": el => movePlanItem(el.dataset.id, el.dataset.date),
    "plan-delete": el => deletePlanItem(el.dataset.id),
    "plan-add": el => openPlanAdd(el?.dataset?.date || ""),
    "plan-day": el => {
        ui.planDay = el.dataset.date;
        renderPlan();
        document.querySelector(`.plan-strip-day[data-date="${el.dataset.date}"]`)?.focus({ preventScroll: true });
    },
    "focus-start": el => startFocus(el.dataset.id),
    "focus-pause": () => toggleFocusPause(),
    "focus-more": () => { if (focusRun.it) { focusRun.total += 5 * 60000; tickFocus(); } },
    "plan-prefs": () => openPlanPrefs(),
    "plan-rebuild": () => rebuildPlanNow(),
    "plan-create": () => {
        readPlanPrefs("plan");
        buildPlan();
        refresh();
        const n = planWeekProgress().total;
        showToast(n ? `✅ Gata! Ți-am pus ${plural(n, "sesiune", "sesiuni")} în următoarele 7 zile.` : "✅ Planul e gata. Momentan nu e nimic urgent de pus în el.");
        buddyReact("love");
    }
};

registerTab("tab-plan", { render: renderPlan, title: "Plan", icon: "calendar-check", group: "day" });
