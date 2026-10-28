/* urNotes · Examene: Evaluarea Națională (clasa a VIII-a) și Bacalaureatul (clasa a XII-a).
   Numărătoarea inversă, probele tale, rezultatele de la simulări și variante, media estimată și ce-ți trebuie.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- datele oficiale, pe ani școlari (anul în care începe) ----------
   Un an nou = o intrare nouă aici, după ordinul ministrului. Pentru anii nepublicați arătăm doar lunile obișnuite. */
const EXAM_CALENDAR = {
    2026: {
        en: {
            status: "proiect",
            source: "Calendarul Evaluării Naționale 2027 (proiect în consultare, Ministerul Educației)",
            dates: [
                ["2027-03-16", "Simularea Evaluării Naționale (16–18 martie)"],
                ["2027-03-30", "Rezultatele simulării"],
                ["2027-06-11", "Ultima zi de cursuri"],
                ["2027-06-22", "Limba și literatura română", "ro"],
                ["2027-06-24", "Matematică", "mate"],
                ["2027-06-25", "Limba și literatura maternă", "mat"],
                ["2027-06-30", "Rezultatele inițiale"],
                ["2027-07-07", "Rezultatele finale"]
            ]
        },
        bac: {
            status: "oficial",
            source: "Calendarul Bacalaureatului 2027 (ordinul ministrului, august 2026)",
            dates: [
                ["2027-03-22", "Simulare: Limba română (E.a)"],
                ["2027-03-23", "Simulare: proba obligatorie (E.c)"],
                ["2027-03-24", "Simulare: proba la alegere (E.d)"],
                ["2027-03-25", "Simulare: limba maternă (E.b)", "", "maternal"],
                ["2027-04-09", "Rezultatele simulării"],
                ["2027-04-12", "Proba A: română, oral (12–14 aprilie)"],
                ["2027-04-14", "Proba B: limba maternă, oral (14–16 aprilie)", "", "maternal"],
                ["2027-04-19", "Proba C: limbă străină (19–21 aprilie)"],
                ["2027-04-21", "Proba D: competențe digitale (21–23 aprilie)"],
                ["2027-06-04", "Ultima zi de cursuri"],
                ["2027-06-14", "E.a) Limba și literatura română", "ea"],
                ["2027-06-15", "E.c) Proba obligatorie a profilului", "ec"],
                ["2027-06-17", "E.d) Proba la alegere", "ed"],
                ["2027-06-18", "E.b) Limba și literatura maternă", "eb", "maternal"],
                ["2027-06-23", "Rezultatele inițiale"],
                ["2027-07-01", "Rezultatele finale"]
            ]
        }
    }
};

// calendarele examenelor publicate pe serverul urNotes (vezi SCHOOL_CACHE_KEY în config.js)
if (schoolRemote?.exams) for (const [k, v] of Object.entries(schoolRemote.exams)) if (/^\d{4}$/.test(k) && v && typeof v === "object") EXAM_CALENDAR[k] = v;

/* Probele scrise care intră în medie */
const EXAM_SUBJECTS = {
    en: [
        { key: "ro", label: "Limba și literatura română", short: "Română", catalog: "Limba și literatura română" },
        { key: "mate", label: "Matematică", short: "Matematică", catalog: "Matematică" },
        { key: "mat", label: "Limba și literatura maternă", short: "Maternă", catalog: "Limba și literatura maternă", maternal: true }
    ],
    bac: [
        { key: "ea", label: "E.a) Limba și literatura română", short: "Română", catalog: "Limba și literatura română" },
        { key: "ec", label: "E.c) Proba obligatorie", short: "E.c", choice: "ec" },
        { key: "ed", label: "E.d) Proba la alegere", short: "E.d", choice: "ed" },
        { key: "eb", label: "E.b) Limba și literatura maternă", short: "Maternă", catalog: "Limba și literatura maternă", maternal: true }
    ]
};

/* Probele E.c și E.d după profil (filiera teoretică: real/umanist; tehnologică; vocațională, majoritatea umanist).
   Lista exactă depinde de specializare; elevul o poate schimba. */
const BAC_REAL = { ec: ["Matematică"], ed: ["Fizică", "Chimie", "Biologie", "Informatică"] };
const BAC_UMAN = { ec: ["Istorie"], ed: ["Geografie", "Logică, argumentare și comunicare", "Psihologie", "Economie", "Sociologie", "Filosofie"] };
const BAC_TEHN = { ec: ["Matematică"], ed: ["Fizică", "Chimie", "Biologie"] };
const BAC_BY_PROFILE = {
    "mate-info": BAC_REAL, "stiinte": BAC_REAL,
    "filologie": BAC_UMAN, "sociale": BAC_UMAN, "arte-vizuale": BAC_UMAN, "muzica": BAC_UMAN, "coregrafie": BAC_UMAN,
    "teatru": BAC_UMAN, "sportiv": BAC_UMAN, "pedagogic": BAC_UMAN, "teologic": BAC_UMAN,
    "tehnic": BAC_TEHN, "servicii": BAC_TEHN, "resurse": BAC_TEHN
};
const BAC_ALL_EC = ["Matematică", "Istorie"];
const BAC_ALL_ED = [...new Set([...BAC_REAL.ed, ...BAC_UMAN.ed])];
const PRACTICE_KINDS = { sim: "Simulare", model: "Variantă / model", school: "Test la școală" };

/* ---------- date ---------- */
function defaultExams() {
    return { kind: "", ec: "", ed: "", maternal: false, maternalInAvg: true, target: 0, practice: [] };
}

function sanitizeExams(raw) {
    const e = defaultExams();
    if (!isPlainObject(raw)) return e;
    e.kind = raw.kind === "en" || raw.kind === "bac" ? raw.kind : "";
    e.ec = typeof raw.ec === "string" ? raw.ec.slice(0, 60) : "";
    e.ed = typeof raw.ed === "string" ? raw.ed.slice(0, 60) : "";
    e.maternal = raw.maternal === true;
    e.maternalInAvg = raw.maternalInAvg !== false;
    e.target = [0, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].includes(Number(raw.target)) ? Number(raw.target) : 0;
    const keys = new Set([...EXAM_SUBJECTS.en, ...EXAM_SUBJECTS.bac].map(s => s.key));
    e.practice = (Array.isArray(raw.practice) ? raw.practice : []).filter(isPlainObject).map(p => ({
        id: typeof p.id === "string" ? p.id.slice(0, 40) : uid(),
        subj: keys.has(p.subj) ? p.subj : null,
        val: roundValue(clampNumber(p.val, 1, 10, NaN), 2),
        date: typeof p.date === "string" && DATE_KEY_RE.test(p.date) ? p.date : getLocalDateKey(),
        kind: PRACTICE_KINDS[p.kind] ? p.kind : "model"
    })).filter(p => p.subj && Number.isFinite(p.val)).slice(-300);
    return e;
}

/** Ce examen are elevul: din clasă (VIII → EN, liceu → Bac), altfel ce a ales el. */
function examKind() {
    const sc = myProgramme();
    if (sc?.profile === "gimnaziu") return "en";
    if (sc && sc.cls >= 9) return "bac";
    return state.exams.kind || "bac";
}

/** Anul școlar în care dă examenul: anul ultimei clase (a VIII-a sau a XII-a). */
function examYear(kind = examKind()) {
    const sc = myProgramme();
    const last = kind === "en" ? 8 : 12;
    const now = yearOfModules().start;
    return sc?.cls ? now + Math.max(0, last - sc.cls) : now;
}

function examCalendar(kind = examKind(), year = examYear(kind)) {
    return EXAM_CALENDAR[year]?.[kind] || null;
}

const bacOptions = () => BAC_BY_PROFILE[myProgramme()?.profile] || null;
function bacChoice(which) {
    const saved = state.exams[which];
    const opts = bacOptions()?.[which] || [];
    return saved || opts[0] || (which === "ec" ? "Matematică" : "");
}

/** Probele scrise ale elevului (fără maternă, dacă n-o dă). */
function examSubjects(kind = examKind()) {
    return EXAM_SUBJECTS[kind].filter(s => !s.maternal || state.exams.maternal).map(s => {
        const name = s.choice ? bacChoice(s.choice) : s.catalog;
        return { ...s, name, label: s.choice ? `${s.key === "ec" ? "E.c" : "E.d"}) ${name || "alege proba"}` : s.label, short: s.choice ? shortSubjectName(name || s.short) : s.short };
    });
}

const trunc2 = v => Math.floor(v * 100 + 1e-7) / 100;

/** Estimarea pentru o probă: media ultimelor 3 rezultate; fără rezultate, media din catalog (dacă există). */
function examEstimate(s) {
    const list = state.exams.practice.filter(p => p.subj === s.key).sort((a, b) => a.date.localeCompare(b.date));
    if (list.length) {
        const last = list.slice(-3);
        return { val: roundValue(last.reduce((n, p) => n + p.val, 0) / last.length, 2), from: "practice", n: list.length, list };
    }
    const mat = s.name && findSubjectName(s.name);
    const d = mat && metrics.subjects[mat];
    if (d?.rawAvg > 0) return { val: roundValue(d.rawAvg, 2), from: "catalog", n: 0, list };
    return { val: 0, from: "none", n: 0, list };
}

/** Media examenului din note (EN: media de admitere; Bac: media generală), cu două zecimale, fără rotunjire. */
function examAverage(kind, vals) {
    const subs = examSubjects(kind).filter(s => !(kind === "en" && s.maternal && !state.exams.maternalInAvg));
    const list = subs.map(s => vals[s.key]).filter(v => v > 0);
    if (list.length < subs.length || !list.length) return null;
    const avg = trunc2(list.reduce((a, b) => a + b, 0) / list.length);
    if (kind === "en") return { avg, passed: null, subs };
    const low = subs.filter(s => vals[s.key] < 5);
    return { avg, passed: !low.length && avg >= 6, low, subs };
}

/** Câte puncte îți trebuie la proba cea mai slabă ca să ajungi la țintă (celelalte rămân la fel). */
function examNeed(kind, vals, target) {
    const r = examAverage(kind, vals);
    if (!r || !target) return null;
    if (r.avg >= target) return { ok: true };
    const weakest = [...r.subs].sort((a, b) => vals[a.key] - vals[b.key])[0];
    const others = r.subs.filter(s => s !== weakest).reduce((n, s) => n + vals[s.key], 0);
    const need = Math.ceil((target * r.subs.length - others) * 100 - 1e-7) / 100;
    return { ok: false, subject: weakest, need, possible: need <= 10 };
}

/* ---------- desenare ---------- */

function examHeroHTML(kind, cal) {
    const today = getLocalDateKey();
    const subs = new Set(examSubjects(kind).map(s => s.key));
    const dates = (cal?.dates || []).filter(([, , key, only]) => (!key || subs.has(key)) && (only !== "maternal" || state.exams.maternal));
    const first = dates.find(([d, , key]) => key && d >= today);
    const n = first ? daysBetween(today, first[0]) : null;
    const title = kind === "en" ? "Evaluarea Națională" : "Bacalaureatul";
    const year = examYear(kind) + 1;
    return `
        <div class="exam-hero-top">
            <div class="exam-count">
                ${n !== null ? `<b class="exam-days">${n}</b><span>${n === 1 ? "zi" : "de zile"} până la ${escapeHTML(first[1])}<small>${escapeHTML(longDateLabel(first[0]))} ${year}</small></span>`
                    : `<b class="exam-days exam-days-sm">${year}</b><span>${escapeHTML(title)} ${year}<small>${cal ? "probele scrise au trecut" : "calendarul nu e publicat încă: de obicei, probele scrise sunt în iunie"}</small></span>`}
            </div>
            ${state.settings.school.profile ? "" : `
                <div class="azi-seg exam-kind" role="group" aria-label="Ce examen dai">
                    <button type="button" data-action="exam-kind" data-kind="en" aria-pressed="${kind === "en"}">Evaluarea Națională</button>
                    <button type="button" data-action="exam-kind" data-kind="bac" aria-pressed="${kind === "bac"}">Bacalaureat</button>
                </div>`}
        </div>
        ${dates.length ? `
            <ol class="exam-timeline">
                ${dates.map(([d, label, key]) => `
                    <li class="${d < today ? "is-past" : ""} ${key ? "is-main" : ""} ${first && d === first[0] ? "is-next" : ""}">
                        <time datetime="${d}">${escapeHTML(shortDayLabel(d))}</time><span>${escapeHTML(label)}</span>
                    </li>`).join("")}
            </ol>
            <p class="exam-source">${icon("info")} ${escapeHTML(cal.source)}${cal.status === "proiect" ? ". Datele pot să se mai schimbe." : "."}</p>` : ""}`;
}

function examSubjectsHTML(kind) {
    const subs = examSubjects(kind);
    const opts = bacOptions();
    return `
        <h3>${icon("notebook")} Probele tale</h3>
        ${kind === "bac" ? `
            <div class="form-row exam-choices">
                <div class="form-group">
                    <label for="exam-ec">E.c) Proba obligatorie a profilului</label>
                    <select id="exam-ec" class="glass-select">${(opts ? [...new Set([...opts.ec, ...BAC_ALL_EC])] : BAC_ALL_EC).map(v => `<option ${v === bacChoice("ec") ? "selected" : ""}>${escapeHTML(v)}</option>`).join("")}</select>
                </div>
                <div class="form-group">
                    <label for="exam-ed">E.d) Proba la alegere</label>
                    <select id="exam-ed" class="glass-select">${(opts?.ed || BAC_ALL_ED).map(v => `<option ${v === bacChoice("ed") ? "selected" : ""}>${escapeHTML(v)}</option>`).join("")}</select>
                </div>
            </div>` : ""}
        <label class="remind-toggle exam-maternal">
            <input type="checkbox" id="exam-maternal" ${state.exams.maternal ? "checked" : ""}>
            <span><b>Dau și proba de limbă maternă</b><small>pentru cine învață în limba maternă (maghiară, germană etc.)</small></span>
        </label>
        <ul class="exam-subjects">
            ${subs.map(s => {
                const est = examEstimate(s);
                const dots = est.list.slice(-8);
                return `
                    <li>
                        <div class="exam-subj-main">
                            <b>${escapeHTML(s.label)}</b>
                            <small>${est.from === "practice" ? `${plural(est.n, "rezultat", "rezultate")} · media ultimelor ${Math.min(3, est.n)}` : est.from === "catalog" ? "estimat după media din catalog" : "încă niciun rezultat"}</small>
                            ${dots.length ? `<span class="exam-dots" aria-label="${escapeHTML(`Rezultate: ${dots.map(p => p.val.toFixed(2)).join(", ")}`)}">${dots.map(p => `<i style="--h:${(p.val / 10 * 100).toFixed(0)}%" class="${p.val < 5 ? "is-low" : ""}" title="${escapeHTML(`${p.val.toFixed(2)} · ${PRACTICE_KINDS[p.kind]} · ${shortDayLabel(p.date)}`)}"></i>`).join("")}</span>` : ""}
                        </div>
                        <b class="exam-est ${est.val && est.val < 5 ? "is-low" : ""}">${est.val ? est.val.toFixed(2) : "–"}</b>
                        <button type="button" class="btn btn-glass btn-sm" data-action="exam-practice" data-subj="${s.key}" aria-label="${escapeHTML(`Adaugă un rezultat la ${s.label}`)}">${icon("plus")}</button>
                    </li>`;
            }).join("")}
        </ul>`;
}

function examSimHTML(kind) {
    const subs = examSubjects(kind);
    const vals = {};
    subs.forEach(s => { vals[s.key] = ui.examSim[s.key] ?? examEstimate(s).val; });
    const r = examAverage(kind, vals);
    const target = state.exams.target;
    const need = examNeed(kind, vals, target);
    const label = kind === "en" ? "Media de admitere la liceu" : "Media la Bacalaureat";
    return `
        <h3>${icon("target")} Ce medie ai lua</h3>
        <p class="subtitle">Pornește de la rezultatele tale; schimbă notele ca să vezi ce s-ar întâmpla.</p>
        <div class="exam-steppers">
            ${subs.map(s => `
                <div class="exam-step">
                    <span>${escapeHTML(s.short)}</span>
                    <div class="exam-step-ctl">
                        <button type="button" class="btn btn-glass btn-sm" data-action="exam-step" data-subj="${s.key}" data-d="-0.25" aria-label="${escapeHTML(`Scade nota la ${s.short}`)}">−</button>
                        <b>${vals[s.key] ? vals[s.key].toFixed(2) : "–"}</b>
                        <button type="button" class="btn btn-glass btn-sm" data-action="exam-step" data-subj="${s.key}" data-d="0.25" aria-label="${escapeHTML(`Crește nota la ${s.short}`)}">+</button>
                    </div>
                </div>`).join("")}
        </div>
        <div class="exam-result ${r ? kind === "bac" ? (r.passed ? "is-pass" : "is-fail") : "" : ""}">
            <span>${label}</span>
            <b>${r ? r.avg.toFixed(2) : "–"}</b>
            <small>${!r ? "Pune câte o notă la fiecare probă (cu + sau din rezultatele tale)."
                : kind === "bac" ? (r.passed ? "Promovat: cel puțin 5 la fiecare probă și media cel puțin 6." : r.low.length ? `Nepromovat: sub 5 la ${r.low.map(s => s.short).join(", ")}.` : "Nepromovat: media trebuie să fie cel puțin 6.")
                : "Media de la Evaluarea Națională e media de admitere. Media din clasele V–VIII contează doar la egalitate."}</small>
        </div>
        <div class="form-group exam-target">
            <label for="exam-target">Ținta ta</label>
            <select id="exam-target" class="glass-select">
                <option value="0" ${!target ? "selected" : ""}>Fără țintă</option>
                ${[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(t => `<option value="${t}" ${t === target ? "selected" : ""}>${t.toFixed(2)}</option>`).join("")}
            </select>
        </div>
        ${need ? `<p class="exam-need ${need.ok ? "is-ok" : ""}">${need.ok ? `${icon("check")} Ești la țintă. Ține-o așa până în iunie!`
            : need.possible ? `${icon("target")} Ca să ajungi la ${target.toFixed(2)}, la ${escapeHTML(need.subject.short)} îți trebuie <b>${need.need.toFixed(2)}</b> (dacă restul rămân la fel).`
            : `${icon("alert")} ${target.toFixed(2)} nu se poate doar din ${escapeHTML(need.subject.short)}: crește și celelalte probe.`}</p>` : ""}
        ${Object.keys(ui.examSim).length ? `<button type="button" class="btn btn-text btn-sm" data-action="exam-sim-reset">${icon("refresh")} Înapoi la rezultatele mele</button>` : ""}`;
}

function examRulesHTML(kind) {
    return kind === "en" ? `
        <h3>${icon("info")} Cum se calculează</h3>
        <ul class="exam-rules">
            <li>Probe scrise: română și matematică (plus limba maternă, pentru cine a învățat în ea).</li>
            <li>Media de la Evaluarea Națională = media aritmetică a notelor, cu două zecimale, <b>fără rotunjire</b>. Ea e media de admitere la liceu.</li>
            <li>Media claselor V–VIII nu mai intră în media de admitere; departajează doar la medii egale.</li>
            <li>Media se calculează și dacă ai o notă sub 5. Cine a dat limba maternă poate cere să nu i se ia în calcul.</li>
        </ul>
        ${state.exams.maternal ? `<label class="remind-toggle mt-2"><input type="checkbox" id="exam-maternal-avg" ${state.exams.maternalInAvg ? "checked" : ""}><span><b>Limba maternă intră în media mea</b><small>altfel nu poți fi repartizat la clasele cu predare în limba maternă</small></span></label>` : ""}` : `
        <h3>${icon("info")} Cum se calculează</h3>
        <ul class="exam-rules">
            <li>Probele orale și digitale (A, B, C, D) dau calificative sau niveluri, nu note în medie.</li>
            <li>Media = media aritmetică a probelor scrise (E.a, E.c, E.d, plus E.b pentru limba maternă).</li>
            <li>Promovezi cu <b>cel puțin 5 la fiecare probă scrisă</b> și <b>media cel puțin 6</b>.</li>
            <li>Probele E.c și E.d depind de profil; ${bacOptions() ? "ți le-am propus după programa ta, dar" : ""} verifică-le cu dirigintele.</li>
        </ul>`;
}

function renderExams() {
    const root = $("exam-root");
    if (!root) return;
    const kind = examKind();
    const cal = examCalendar(kind);
    root.innerHTML = `
        <section class="glass-card exam-hero" aria-label="Numărătoare inversă">${examHeroHTML(kind, cal)}</section>
        <div class="exam-grid">
            <section class="glass-card exam-card" aria-label="Probele tale">${examSubjectsHTML(kind)}</section>
            <section class="glass-card exam-card" aria-label="Ce medie ai lua">${examSimHTML(kind)}</section>
            <section class="glass-card exam-card exam-card-wide" aria-label="Cum se calculează">${examRulesHTML(kind)}</section>
        </div>`;
    setText("h-examene", kind === "en" ? "Evaluarea Națională" : "Bacalaureatul");
    const btn = document.querySelector('#tab-examene [data-action="exam-to-calendar"]');
    if (btn) btn.hidden = !cal || examCalendarAdded(kind, cal);
}

/** Pe Azi: câte zile mai sunt, doar în anul examenului (null în rest). */
function homeExamInfo() {
    const kind = examKind();
    const cal = examCalendar(kind);
    const sc = myProgramme();
    if (!cal || !sc || sc.cls !== (kind === "en" ? 8 : 12)) return null;
    const today = getLocalDateKey();
    const subs = new Set(examSubjects(kind).map(s => s.key));
    const first = cal.dates.find(([d, , key]) => key && subs.has(key) && d >= today);
    if (!first) return null;
    const vals = Object.fromEntries(examSubjects(kind).map(s => [s.key, examEstimate(s).val]));
    const r = examAverage(kind, vals);
    return { n: daysBetween(today, first[0]), label: kind === "en" ? "Zile până la EN" : "Zile până la Bac", avg: r?.avg || 0 };
}

/* ---------- acțiuni ---------- */
function openExamPractice(subj = "") {
    if (!requireAccount()) return;
    const kind = examKind();
    const subs = examSubjects(kind);
    const pre = subs.find(s => s.key === subj) || subs[0];
    openModal({
        layout: "panel",
        title: "Rezultat la examen",
        confirmText: "Salvează",
        body: `
            <div class="form-group">
                <span class="form-label" id="ep-subj-l">Proba</span>
                <div class="ev-subj-strip" role="radiogroup" aria-labelledby="ep-subj-l">
                    ${subs.map(s => `<button type="button" class="ev-subj-chip ep-chip ${s === pre ? "is-on" : ""}" data-action="ep-pick" data-subj="${s.key}" role="radio" aria-checked="${s === pre}">${escapeHTML(s.short)}</button>`).join("")}
                </div>
                <input type="hidden" id="ep-subj" value="${pre.key}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="ep-int">Nota</label>
                    <select id="ep-int" class="glass-select">${Array.from({ length: 10 }, (_, i) => i + 1).map(v => `<option value="${v}" ${v === 8 ? "selected" : ""}>${v}</option>`).join("")}</select>
                </div>
                <div class="form-group">
                    <label for="ep-dec">Zecimale</label>
                    <select id="ep-dec" class="glass-select">${Array.from({ length: 20 }, (_, i) => i * 5).map(v => `<option value="${v}">,${String(v).padStart(2, "0")}</option>`).join("")}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="ep-kind">Ce a fost</label>
                    <select id="ep-kind" class="glass-select">${Object.entries(PRACTICE_KINDS).map(([k, l]) => `<option value="${k}" ${k === "model" ? "selected" : ""}>${l}</option>`).join("")}</select>
                </div>
                <div class="form-group">
                    <label for="ep-date">Data</label>
                    <input type="date" id="ep-date" class="glass-input" value="${getLocalDateKey()}" max="${getLocalDateKey()}">
                </div>
            </div>`,
        onConfirm: () => {
            const s = $("ep-subj").value;
            const val = Math.min(10, Number(field("ep-int")) + Number(field("ep-dec")) / 100);
            const date = DATE_KEY_RE.test(field("ep-date")) ? field("ep-date") : getLocalDateKey();
            if (!subs.some(x => x.key === s) || !(val >= 1)) return;
            closeActionModal();
            withUndo(`Am salvat ${val.toFixed(2)} la ${subs.find(x => x.key === s).short}.`, () => {
                state.exams.practice.push({ id: uid(), subj: s, val: roundValue(val, 2), date, kind: PRACTICE_KINDS[field("ep-kind")] ? field("ep-kind") : "model" });
                delete ui.examSim[s];
                addActivity(`Ai trecut ${val.toFixed(2)} la ${subs.find(x => x.key === s).short} (${PRACTICE_KINDS[field("ep-kind")] || "variantă"}).`);
            });
        }
    });
}

const examEventId = (kind, key) => `exam-${kind}-${examYear(kind)}-${key}`;
function examCalendarAdded(kind, cal) {
    const subs = new Set(examSubjects(kind).map(s => s.key));
    return cal.dates.filter(([, , key]) => key && subs.has(key)).every(([d, , key]) => (state.calendar[d] || []).some(ev => ev.id === examEventId(kind, key)));
}

/** Probele scrise apar în calendar ca „Examen” (și planul le pregătește singur). */
function addExamsToCalendar() {
    if (!requireAccount()) return;
    const kind = examKind();
    const cal = examCalendar(kind);
    if (!cal) return;
    const subs = examSubjects(kind);
    withUndo("Am pus probele examenului în calendar.", () => {
        cal.dates.forEach(([d, label, key]) => {
            const s = subs.find(x => x.key === key);
            if (!s || (state.calendar[d] || []).some(ev => ev.id === examEventId(kind, key))) return;
            const mat = s.name && findSubjectName(s.name);
            (state.calendar[d] ||= []).push({ id: examEventId(kind, key), title: `${kind === "en" ? "EN" : "Bac"}: ${s.label.replace(/^E\.[a-d]\) /, "")}`, type: "Examen", subject: mat || "", time: "09:00", description: label });
        });
        addActivity(`Ai pus în calendar probele de la ${kind === "en" ? "Evaluarea Națională" : "Bacalaureat"}.`);
    });
}

function onExamFieldChange(el) {
    if (!el.closest?.("#tab-examene")) return false;
    const map = { "exam-ec": "ec", "exam-ed": "ed" };
    if (!canEdit()) { renderExams(); requireAccount(); return true; }
    if (map[el.id]) state.exams[map[el.id]] = el.value;
    else if (el.id === "exam-maternal") state.exams.maternal = el.checked;
    else if (el.id === "exam-maternal-avg") state.exams.maternalInAvg = el.checked;
    else if (el.id === "exam-target") { state.exams.target = Number(el.value) || 0; refresh(); return true; } // notele încercate rămân
    else return false;
    ui.examSim = {};
    refresh();
    return true;
}
document.addEventListener("change", event => onExamFieldChange(event.target));

Object.assign(ACTIONS, {
    "exam-practice": el => openExamPractice(el.dataset.subj),
    "exam-to-calendar": () => addExamsToCalendar(),
    "exam-kind": el => {
        if (!requireAccount()) return;
        state.exams.kind = el.dataset.kind === "en" ? "en" : "bac";
        ui.examSim = {};
        refresh();
    },
    "exam-step": el => {
        const kind = examKind();
        const s = examSubjects(kind).find(x => x.key === el.dataset.subj);
        if (!s) return;
        const cur = ui.examSim[s.key] ?? (examEstimate(s).val || 7);
        ui.examSim[s.key] = Math.min(10, Math.max(1, roundValue(cur + Number(el.dataset.d), 2)));
        renderExams();
        document.querySelector(`[data-action="exam-step"][data-subj="${s.key}"][data-d="${el.dataset.d}"]`)?.focus();
    },
    "exam-sim-reset": () => { ui.examSim = {}; renderExams(); },
    "ep-pick": el => {
        $("ep-subj").value = el.dataset.subj;
        document.querySelectorAll(".ep-chip").forEach(b => { const on = b.dataset.subj === el.dataset.subj; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(on)); });
    }
});
["exam-step", "exam-sim-reset"].forEach(a => GUEST_OK.add(a));

registerTab("tab-examene", { render: renderExams, title: "Examene", icon: "graduation", group: "stats", parent: "tab-statistici" });

PAL_LINES["tab-examene"] = () => {
    const kind = examKind();
    const subs = examSubjects(kind);
    const est = subs.map(s => ({ s, e: examEstimate(s) }));
    const out = [];
    const none = est.filter(x => x.e.from !== "practice");
    const weak = est.filter(x => x.e.val > 0).sort((a, b) => a.e.val - b.e.val)[0];
    if (none.length) out.push(line(`Rezolvă o variantă la ${none[0].s.short} și trece nota aici: așa îți estimez media mai bine decât din catalog.`));
    if (weak && weak.e.val < 7) out.push(line(`${weak.s.short} e proba la care ai cel mai mult de câștigat (${weak.e.val.toFixed(2)}). Câte o variantă pe săptămână face minuni.`, "worried"));
    else if (weak) out.push(line(`Arăți bine! Cea mai slabă probă e ${weak.s.short}, cu ${weak.e.val.toFixed(2)}.`, "happy"));
    out.push(line(kind === "en" ? "La liceu intri doar cu media de la Evaluarea Națională, deci fiecare sutime contează." : "La Bac îți trebuie cel puțin 5 la fiecare probă scrisă și media cel puțin 6."));
    out.push(line("Pune datele examenului în calendar: planul îți pregătește singur recapitulările.", "happy"));
    return out;
};
