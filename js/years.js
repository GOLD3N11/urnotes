/* urNotes · Anii școlari: arhiva anilor încheiați și trecerea în clasa următoare.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* La sfârșitul anului, notele și mediile lui se mută în arhivă (state.archive), iar caietul pornește curat pentru
   anul următor: aceleași materii (aliniate la programa clasei noi), modulele anului nou, fără teste vechi.
   Așa datele de zi cu zi rămân mici oricâți ani ar trece, iar anii trecuți se pot revedea oricând. */
const ARCHIVE_MAX_YEARS = 20;

/** Arhiva validată (din stocare, backup sau cont). */
function sanitizeArchive(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.filter(isPlainObject).map(y => {
        const year = Number(y.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || seen.has(year)) return null;
        seen.add(year);
        const subjects = {};
        for (const [mat, sub] of Object.entries(isPlainObject(y.subjects) ? y.subjects : {})) {
            if (!isPlainObject(sub) || !mat.trim() || mat === "__proto__") continue;
            subjects[mat] = {
                ore: clampNumber(sub.ore, 0.5, MAX_ORE, 1),
                excluded: Boolean(sub.excluded),
                grades: (Array.isArray(sub.grades) ? sub.grades : []).map(normalizeGrade).filter(Boolean)
                    .map(g => ({ val: g.val, type: g.type, ...(g.date ? { date: g.date } : {}) }))
            };
        }
        return {
            year,
            cls: Number.isInteger(y.cls) ? y.cls : 0,
            programme: typeof y.programme === "string" ? y.programme.slice(0, 160) : "",
            closedAt: typeof y.closedAt === "string" && DATE_KEY_RE.test(y.closedAt) ? y.closedAt : "",
            gpa: clampNumber(y.gpa, 0, 10, 0),
            purtare: clampNumber(y.purtare, 1, 10, 10),
            subjects
        };
    }).filter(Boolean).sort((a, b) => a.year - b.year).slice(-ARCHIVE_MAX_YEARS);
}

/** Media unei materii arhivate, ca în catalog (rotunjită la întreg); 0 fără note. */
function archivedAvg(sub) {
    if (!sub.grades.length) return 0;
    return roundValue(sub.grades.reduce((s, g) => s + g.val, 0) / sub.grades.length, 0);
}

const yearEntry = year => state.archive.find(y => y.year === Number(year)) || null;
const lastArchived = () => state.archive.at(-1) || null;

/** Clasa următoare din profilul elevului, sau null (a VIII-a → liceu, a XII-a → gata). */
function nextClassOf(sc) {
    const classes = SETUP_PROFILES[sc?.profile]?.classes;
    if (!classes) return null;
    const i = classes.indexOf(sc.cls);
    return i >= 0 && i < classes.length - 1 ? classes[i + 1] : null;
}

/** Instantaneul anului în curs, pentru arhivă. */
function snapshotYear() {
    const y = yearOfModules();
    const subjects = {};
    for (const [mat, sub] of Object.entries(state.subjects)) {
        subjects[mat] = { ore: sub.ore, excluded: Boolean(sub.excludeFromGPA), grades: clone(sub.grades).map(g => ({ val: g.val, type: g.type, ...(g.date ? { date: g.date } : {}) })) };
    }
    return {
        year: y.start,
        cls: state.settings.school.cls || 0,
        programme: programmeLabel(),
        closedAt: getLocalDateKey(),
        gpa: metrics.globalAvg || 0,
        purtare: roundValue((metrics.purtare || purtareInfo()).avg, 2),
        subjects
    };
}

/** Ce urmează după închidere: clasa nouă și un mesaj pentru dialog. */
function nextYearPlan() {
    const y = yearOfModules();
    const sc = myProgramme();
    const next = sc ? nextClassOf(sc) : null;
    const graduating = sc && !next;
    return {
        from: y,
        to: schoolYear(y.start + 1),
        cls: next,
        graduating,
        toHighSchool: graduating && sc.cls === 8,
        overDate: y.end && getLocalDateKey() > state.settings.modules[4].end
    };
}

/** Închide anul în curs: arhivează, apoi pregătește anul următor. Se poate anula din mesaj. */
function closeSchoolYear() {
    if (!requireAccount()) return;
    const plan = nextYearPlan();
    const settingsBefore = clone(state.settings);
    const simBefore = clone(sim);
    withUndo(`Am arhivat anul ${plan.from.label}. Bun venit în ${plan.to.label}!`, () => {
        const entry = snapshotYear();
        state.archive = sanitizeArchive([...state.archive.filter(y => y.year !== entry.year), entry]);

        const sc = state.settings.school;
        if (plan.cls) sc.cls = plan.cls;
        state.settings.modules = presetModules(countyPreset(sc.county, plan.to.start) || defaultPresetId(plan.to.start), sc.cls || 0);

        // Materiile rămân (cu ținte și priorități), fără note; se aliniază la programa clasei noi.
        for (const sub of Object.values(state.subjects)) sub.grades = [];
        if (myProgramme() && plan.cls) {
            Object.keys(state.subjects).filter(m => !inProgramme(m)).forEach(m => delete state.subjects[m]);
            missingProgrammeRows().filter(r => r.kind !== "opt" && !r.off).forEach(r => {
                state.subjects[r.name] = { ore: r.ore, target: 10, grades: [], priority: false, excludeFromGPA: r.kind === "dirig" && sc.cls >= 9 };
            });
            syncProgrammeHours();
        }
        pruneTimetable();

        // Din calendar rămân doar lucrurile de după anul încheiat (ex. ceva pus deja pentru toamnă).
        const keepFrom = addDays(settingsBefore.modules[4].end, 1);
        for (const date of Object.keys(state.calendar)) {
            if (date < keepFrom) delete state.calendar[date];
        }
        state.purtare = defaultPurtare();
        state.history = [];
        state.alertMeta = { dismissed: {}, read: {} };
        state.plan.items = [];
        state.plan.removed = {};
        state.plan.sig = "";
        sim = defaultSim();
        state.activity = [];
        addActivity(`Ai încheiat anul ${plan.from.label} cu media ${entry.gpa ? entry.gpa.toFixed(2) : "–"} și ai început ${plan.to.label}.`);
    }, {
        afterUndo: () => {
            state.settings = settingsBefore;
            sim = simBefore;
        }
    });
    closeActionModal();
    if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
    if (plan.toHighSchool) setTimeout(() => openSetup(1), 600); // de la a VIII-a la liceu: alege profilul
}

function promptCloseYear() {
    if (!requireAccount()) return;
    const plan = nextYearPlan();
    const m = metrics;
    const notes = [
        `Media generală ${m.globalAvg ? `<b>${m.globalAvg.toFixed(2)}</b>` : "–"}, ${plural(m.totalGrades, "notă", "note")} la ${plural(Object.keys(state.subjects).length, "materie", "materii")}: totul se păstrează în arhivă și le poți revedea oricând.`,
        plan.cls ? `Treci în <b>clasa a ${ROMAN[plan.cls]}-a</b>: materiile și orele se aliniază la programa ei.`
            : plan.toHighSchool ? "Ai terminat gimnaziul: după arhivare îți alegi profilul de liceu."
            : plan.graduating ? "Ai terminat ultima clasă. Arhiva rămâne a ta." : "Clasa rămâne aceeași (n-ai ales programa).",
        `Anul nou, ${plan.to.label}, începe pe ${escapeHTML(longDateLabel(presetModules(defaultPresetId(plan.to.start))[0].start))}${plan.to.estimated ? " (datele lui sunt estimate până apare ordinul ministrului)" : ""}.`,
        "Testele, temele și planul anului vechi dispar din calendar; orarul rămâne (verifică-l în septembrie)."
    ];
    openModal({
        title: `Închei anul ${plan.from.label}?`,
        confirmText: "Arhivează și începe anul nou",
        body: `
            ${plan.overDate ? "" : `<p class="year-warn">${icon("alert")} Anul încă nu s-a terminat: ultima zi de cursuri e ${escapeHTML(longDateLabel(state.settings.modules[4].end))}.</p>`}
            <ul class="year-steps">${notes.map(n => `<li>${n}</li>`).join("")}</ul>
            <p class="modal-hint">Te răzgândești? Imediat după, apasă „Anulează” în mesajul de jos.</p>`,
        onConfirm: closeSchoolYear
    });
}

/** Un an din arhivă, doar de citit. */
function openArchivedYear(year) {
    const y = yearEntry(year);
    if (!y) return;
    const rows = Object.entries(y.subjects)
        .map(([mat, sub]) => ({ mat, n: sub.grades.length, avg: archivedAvg(sub), excluded: sub.excluded }))
        .sort((a, b) => a.mat.localeCompare(b.mat, "ro"));
    const tone = v => v >= 9 ? "tone-hi" : v >= 7 ? "tone-mid" : v >= 5 ? "tone-low" : "tone-fail";
    openModal({
        layout: "panel",
        title: `Anul ${schoolYear(y.year).label}`,
        confirmText: "",
        cancelText: "Închide",
        guestOk: true,
        body: `
            <p class="modal-hint">${escapeHTML([y.programme, y.closedAt ? `încheiat pe ${longDateLabel(y.closedAt)}` : ""].filter(Boolean).join(" · "))}</p>
            <div class="year-kpis">
                <div><span>Media generală</span><b>${y.gpa ? y.gpa.toFixed(2) : "–"}</b></div>
                <div><span>Purtare</span><b>${y.purtare.toFixed(2).replace(/\.00$/, "")}</b></div>
                <div><span>Note</span><b>${rows.reduce((n, r) => n + r.n, 0)}</b></div>
            </div>
            <table class="year-table">
                <thead><tr><th>Materie</th><th>Note</th><th>Media</th></tr></thead>
                <tbody>${rows.map(r => `<tr><td>${escapeHTML(r.mat)}${r.excluded ? ` <small>(nu intră în medie)</small>` : ""}</td><td>${r.n}</td><td><b class="${r.avg ? tone(r.avg) : ""}">${r.avg || "–"}</b></td></tr>`).join("")}</tbody>
            </table>
            <button type="button" class="btn btn-text text-danger btn-sm mt-3" data-action="year-delete" data-year="${y.year}">${icon("trash")} Șterge anul din arhivă</button>`
    });
}

function deleteArchivedYear(year) {
    const y = yearEntry(year);
    if (!y || !requireAccount()) return;
    closeActionModal();
    withUndo(`Ai șters anul ${schoolYear(y.year).label} din arhivă.`, () => {
        state.archive = state.archive.filter(e => e.year !== y.year);
    });
}

/** Cardul „Anul școlar” din Setări: anul în curs + arhiva. */
function renderYearSetting() {
    const box = $("year-setting");
    if (!box) return;
    const plan = nextYearPlan();
    const sc = myProgramme();
    box.innerHTML = `
        <p class="year-now"><b>${escapeHTML(plan.from.label)}</b>${sc ? ` <small>clasa a ${ROMAN[sc.cls] || sc.cls}-a</small>` : ""}${plan.from.estimated ? ` <small class="year-est">date estimate</small>` : ""}</p>
        <p class="subtitle">${plan.overDate ? "Anul s-a terminat. Arhivează-l ca să pornești curat anul următor." : `La final (după ${escapeHTML(longDateLabel(state.settings.modules[4].end))}) îl arhivezi și treci în anul următor.`}</p>
        <button type="button" class="btn ${plan.overDate ? "btn-primary" : "btn-glass"} btn-sm mt-2" data-action="year-close">${icon("graduation")} Încheie anul ${escapeHTML(plan.from.label)}</button>
        ${state.archive.length ? `
            <h4 class="year-arch-title">Anii trecuți</h4>
            <ul class="year-arch">${[...state.archive].reverse().map(y => `
                <li><button type="button" data-action="year-open" data-year="${y.year}">
                    <span><b>${escapeHTML(schoolYear(y.year).label)}</b><small>${y.cls ? `clasa a ${ROMAN[y.cls] || y.cls}-a` : escapeHTML(y.programme || "")}</small></span>
                    <b class="year-gpa">${y.gpa ? y.gpa.toFixed(2) : "–"}</b>
                </button></li>`).join("")}
            </ul>` : ""}`;
    if (guest.on) box.querySelectorAll('[data-action="year-close"]').forEach(el => { el.disabled = true; el.setAttribute("data-guest-locked", ""); });
}

/** Pe Azi, după ultima zi de cursuri: invitația de a încheia anul. */
function homeYearHTML() {
    const plan = nextYearPlan();
    if (!plan.overDate || !metrics.totalGrades) return "";
    return `
        <h3 id="azi-year-title">${icon("graduation")} Gata cu anul ${escapeHTML(plan.from.label)}!</h3>
        <p class="subtitle">Media ta generală: <b>${metrics.globalAvg ? metrics.globalAvg.toFixed(2) : "–"}</b>. Arhivează anul ca să păstrezi notele și să pornești curat${plan.cls ? ` în clasa a ${ROMAN[plan.cls]}-a` : ""}.</p>
        <button type="button" class="btn btn-primary btn-sm mt-2" data-action="year-close">Încheie anul</button>`;
}

/** Comparația cu anul trecut, pentru cardul mediei. */
function lastYearLine() {
    const prev = lastArchived();
    if (!prev?.gpa) return "";
    const now = metrics.globalAvg;
    const diff = now ? now - prev.gpa : 0;
    return `<p class="azi-lastyear">${icon("layers")} Anul trecut: <b>${prev.gpa.toFixed(2)}</b>${now ? ` <span class="${diff >= 0 ? "is-up" : "is-down"}">(${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)})</span>` : ""}</p>`;
}

Object.assign(ACTIONS, {
    "year-close": () => promptCloseYear(),
    "year-open": el => openArchivedYear(el.dataset.year),
    "year-delete": el => deleteArchivedYear(el.dataset.year)
});
GUEST_OK.add("year-open");
