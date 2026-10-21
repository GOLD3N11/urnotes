/* urNotes · Simulatorul.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== SIMULATOR ==================== */
/*
 * Notele ipotetice trăiesc doar în `sim` (cheie de stocare separată).
 * Proiecțiile se obțin rulând același calculateMetrics() pe o COPIE a materiilor
 * cu notele ipotetice adăugate, deci cifrele sunt identice cu ce ar arăta catalogul,
 * iar state.subjects nu este atins niciodată.
 */
const SIM_LIMITS = { scenarios: 6, perSubject: 30, nameLength: 40 };

let sim = defaultSim();

function defaultSim() {
    const id = uid();
    return {
        active: id,
        selected: "",
        addType: "Test",
        scenarios: [{ id, name: "Scenariul 1", hypo: {} }]
    };
}

function normalizeHypo(h) {
    if (!isPlainObject(h)) return null;
    const val = parseStrictInteger(h.val, 1, 10);
    if (val === null) return null;
    const entry = {
        id: String(h.id || uid()),
        val,
        type: GRADE_TYPES.includes(h.type) ? h.type : "Altele"
    };
    if (h.eventId) entry.eventId = String(h.eventId);
    return entry;
}

/** Validează datele Simulatorului (din localStorage sau dintr-un backup). */
function parseSimulator(raw) {
    if (!isPlainObject(raw) || !Array.isArray(raw.scenarios)) return defaultSim();

    const scenarios = raw.scenarios.filter(isPlainObject).slice(0, SIM_LIMITS.scenarios).map((sc, i) => ({
        id: String(sc.id || uid()),
        name: String(sc.name || `Scenariul ${i + 1}`).slice(0, SIM_LIMITS.nameLength),
        hypo: Object.fromEntries(
            Object.entries(isPlainObject(sc.hypo) ? sc.hypo : {})
                .map(([mat, list]) => [mat, (Array.isArray(list) ? list : []).map(normalizeHypo).filter(Boolean)])
                .filter(([, list]) => list.length)
        )
    }));

    if (scenarios.length === 0) return defaultSim();

    return {
        active: scenarios.some(s => s.id === raw.active) ? raw.active : scenarios[0].id,
        selected: typeof raw.selected === "string" ? raw.selected : "",
        addType: GRADE_TYPES.includes(raw.addType) ? raw.addType : "Test",
        scenarios
    };
}

/** Testele/examenele viitoare, indexate după id. */
function upcomingExamIndex() {
    const today = getLocalDateKey();
    const links = gradeLinks();
    const map = new Map();
    occurrencesBetween(today, addDays(today, 120)).forEach(({ ev, date, key }) => {
        if (EXAM_TYPES.has(ev.type) && !isOccurrenceDone(ev, date, links)) map.set(key, { ...ev, id: key, date });
    });
    return map;
}

/**
 * Curăță notele ipotetice care nu mai au sens: materia a fost ștearsă,
 * sau testul din calendar a fost șters / a trecut (nota reală o înlocuiește).
 */
function pruneSimulator() {
    const exams = upcomingExamIndex();
    sim.scenarios.forEach(sc => {
        for (const mat of Object.keys(sc.hypo)) {
            if (!state.subjects[mat]) {
                delete sc.hypo[mat];
                continue;
            }
            sc.hypo[mat] = sc.hypo[mat].filter(h => !h.eventId || exams.get(h.eventId)?.subject === mat);
            if (sc.hypo[mat].length === 0) delete sc.hypo[mat];
        }
    });
    if (!state.subjects[sim.selected]) {
        sim.selected = Object.keys(state.subjects)[0] || "";
    }
}

function activeScenario() {
    return sim.scenarios.find(s => s.id === sim.active) || sim.scenarios[0];
}

function hypoCount(scenario) {
    return Object.values(scenario.hypo).reduce((n, list) => n + list.length, 0);
}

/** Copie a materiilor reale + notele ipotetice (+ opțional o notă de test pentru marja de siguranță). */
function projectedSubjects(scenario, extra = null) {
    const out = {};
    for (const [mat, sub] of Object.entries(state.subjects)) {
        const hypo = scenario.hypo[mat] || [];
        const probe = extra && extra.mat === mat ? [extra.grade] : [];
        out[mat] = hypo.length || probe.length
            ? { ...sub, grades: [...sub.grades, ...hypo, ...probe] }
            : sub;
    }
    return out;
}

function projectMetrics(scenario) {
    return calculateMetrics(projectedSubjects(scenario));
}

/** Cea mai mică notă (1–10) cu care condiția e îndeplinită; null dacă nici 10 nu ajunge. */
function lowestGradeThatPasses(scenario, mat, passes) {
    for (let g = 1; g <= 10; g++) {
        const m = calculateMetrics(projectedSubjects(scenario, { mat, grade: { val: g } }));
        if (passes(m)) return g;
    }
    return null;
}

/* ---------- formatare ---------- */
function fmtAvg(d) {
    return d && d.exactAvg > 0 ? d.exactAvg.toFixed(2) : "-";
}

function fmtAvgWithRound(d) {
    return d && d.exactAvg > 0 ? `${d.exactAvg.toFixed(2)} <span class="sim-round">(→ ${d.roundedAvg})</span>` : "-";
}

function deltaHTML(before, after) {
    if (!(after > 0) || !(before > 0)) return `<span class="sim-delta">—</span>`;
    const diff = roundValue(after - before, 2);
    if (diff === 0) return `<span class="sim-delta">±0.00</span>`;
    return `<span class="sim-delta ${diff > 0 ? "up" : "down"}">${diff > 0 ? "+" : ""}${diff.toFixed(2)}</span>`;
}

function statusChangeHTML(before, after) {
    if (!before || !after || before.statusClass === after.statusClass) return "";
    if (after.statusClass === "badge-danger") return `<span class="badge badge-danger">intră în risc</span>`;
    if (before.statusClass === "badge-danger") return `<span class="badge badge-ok">iese din risc</span>`;
    return "";
}

function gradeOptions(selected, { empty = null } = {}) {
    const opts = empty !== null ? [`<option value="">${empty}</option>`] : [];
    for (let v = 10; v >= 1; v--) opts.push(`<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`);
    return opts.join("");
}

/* ---------- randare ---------- */
function renderSimulator() {
    const root = $("sim-root");
    if (!root) return;

    pruneSimulator();
    const focusId = root.contains(document.activeElement) ? document.activeElement.id : "";

    if (Object.keys(state.subjects).length === 0) {
        root.innerHTML = `
            <div class="glass-card empty-state">
                <div class="empty-state-icon" aria-hidden="true">${icon("flask")}</div>
                <h3>Simulatorul are nevoie de materii</h3>
                <p>Adaugă o materie, apoi încearcă aici note ipotetice fără să-ți afectezi notele reale.</p>
                <button class="btn btn-primary" type="button" data-action="add-subject">+ Adaugă Materie</button>
            </div>`;
        return;
    }

    const scenario = activeScenario();
    const projected = projectMetrics(scenario);

    root.innerHTML = `
        ${scenarioBarHTML(scenario)}
        <div class="sim-layout">
            ${subjectPanelHTML(scenario, projected)}
            <div class="sim-side">
                ${safetyPanelHTML(scenario, projected)}
                ${projectionSummaryHTML(projected)}
            </div>
            ${generalPanelHTML(scenario, projected)}
            ${comparePanelHTML()}
        </div>`;

    if (focusId) $(focusId)?.focus();
}

function scenarioBarHTML(scenario) {
    const canAdd = sim.scenarios.length < SIM_LIMITS.scenarios;
    return `
        <div class="glass-card sim-scenario-bar">
            <div class="sim-scenario-chips" role="group" aria-label="Scenarii">
                ${sim.scenarios.map(sc => `
                    <button type="button" class="sim-chip ${sc.id === scenario.id ? "active" : ""}" data-action="sim-scenario" data-id="${escapeHTML(sc.id)}"
                        aria-pressed="${sc.id === scenario.id}">
                        ${escapeHTML(sc.name)} <span class="sim-chip-count">${hypoCount(sc)}</span>
                    </button>`).join("")}
                <button type="button" class="sim-chip sim-chip-add" data-action="sim-new" ${canAdd ? "" : "disabled"}
                    title="${canAdd ? "Scenariu nou, gol" : `Maximum ${SIM_LIMITS.scenarios} scenarii`}">${icon("plus")} Nou</button>
            </div>
            <div class="sim-scenario-actions">
                <button type="button" class="btn btn-text" data-action="sim-duplicate" aria-label="Duplică scenariul" title="Duplică" ${canAdd ? "" : "disabled"}>${icon("copy")}<span>Duplică</span></button>
                <button type="button" class="btn btn-text" data-action="sim-rename" aria-label="Redenumește scenariul" title="Redenumește">${icon("pen")}<span>Redenumește</span></button>
                <button type="button" class="btn btn-text" data-action="sim-clear" aria-label="Golește scenariul" title="Golește" ${hypoCount(scenario) ? "" : "disabled"}>${icon("eraser")}<span>Golește</span></button>
                <button type="button" class="btn btn-text text-danger" data-action="sim-delete" aria-label="Șterge scenariul" title="Șterge" ${sim.scenarios.length > 1 ? "" : "disabled"}>${icon("trash")}<span>Șterge</span></button>
            </div>
        </div>`;
}

function subjectPanelHTML(scenario, projected) {
    const mat = sim.selected;
    const sub = state.subjects[mat];
    const now = metrics.subjects[mat];
    const next = projected.subjects[mat];
    const hypo = scenario.hypo[mat] || [];
    const manual = hypo.filter(h => !h.eventId);
    const slots = [...upcomingExamIndex().values()]
        .filter(ev => ev.subject === mat)
        .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));

    const realChips = sub.grades.length
        ? sub.grades.map(g => `<span class="grade-tag is-static">${escapeHTML(g.val)}</span>`).join("")
        : `<span class="muted-small">Nicio notă reală încă.</span>`;

    const hypoChips = manual.length
        ? manual.map(h => `
            <button type="button" class="grade-tag hypo" data-action="sim-remove" data-id="${escapeHTML(h.id)}"
                title="Elimină nota ipotetică" aria-label="Elimină nota ipotetică ${h.val}">
                ${h.val} <small>(${escapeHTML(h.type)})</small> <span aria-hidden="true">&times;</span>
            </button>`).join("")
        : `<span class="muted-small">Apasă o notă de mai jos ca s-o adaugi.</span>`;

    const slotRows = slots.length
        ? slots.map(ev => {
            const h = hypo.find(x => x.eventId === ev.id);
            return `
                <div class="sim-slot ${h ? "filled" : ""}">
                    <div class="sim-slot-info">
                        <b>${escapeHTML(ev.title)}</b>
                        <small>${escapeHTML(ev.type)} · ${escapeHTML(getDateLabel(ev.date))}${ev.time ? `, ${escapeHTML(ev.time)}` : ""}</small>
                    </div>
                    <label class="sr-only" for="sim-slot-${escapeHTML(ev.id)}">Nota estimată pentru ${escapeHTML(ev.title)}</label>
                    <select id="sim-slot-${escapeHTML(ev.id)}" class="glass-select sim-mini" data-slot-val="${escapeHTML(ev.id)}">
                        ${gradeOptions(h?.val ?? null, { empty: "—" })}
                    </select>
                </div>`;
        }).join("")
        : `<p class="muted-small">Nu ai teste sau examene programate la ${escapeHTML(mat)}. Le poți adăuga din Calendar.</p>`;

    // Ce notă îți trebuie la următoarea evaluare ca să ajungi (sau să rămâi) la țintă, socotind și notele ipotetice
    const extra = hypo.map(h => ({ val: h.val, type: h.type }));
    const okGoal = d => reachesTarget(d, sub.target);
    const goalPlan = (() => {
        for (let g = 1; g <= 10; g++) if (okGoal(metricsWithExtraGrades(mat, [...extra, { val: g }]).subjects[mat])) return { next: g };
        for (let k = 2; k <= 20; k++) if (okGoal(metricsWithExtraGrades(mat, [...extra, ...Array.from({ length: k }, () => ({ val: 10 }))]).subjects[mat])) return { tens: k };
        return { impossible: true };
    })();
    const goalPill = goalPlan ? planPill(goalPlan) : null;
    const reachedNow = reachesTarget(next, sub.target);
    const chips = Object.keys(state.subjects).map(m => {
        const d = projected.subjects[m];
        const has = state.subjects[m].grades.length || scenario.hypo[m]?.length;
        return `<button type="button" class="sim-subj-chip ${m === mat ? "is-on" : ""}" data-action="sim-chip-subject" data-mat="${escapeHTML(m)}" aria-pressed="${m === mat}">
            <span class="sim-subj-name">${escapeHTML(m)}</span>
            <b class="tone-${has ? gradeTone(d.exactAvg) : "none"}">${has ? d.exactAvg.toFixed(2) : "–"}</b>
            ${scenario.hypo[m]?.length ? `<i class="sim-subj-dot" title="are note ipotetice" aria-label="are note ipotetice"></i>` : ""}
        </button>`;
    }).join("");

    return `
        <section class="glass-card sim-panel" id="sim-subject-card" aria-labelledby="sim-subject-title">
            <div class="sim-subj-strip" role="group" aria-label="Alege materia">${chips}</div>
            <div class="sim-panel-head">
                <h3 id="sim-subject-title">${icon("flask")} Note ipotetice</h3>
                <select id="sim-subject" class="glass-select sim-subject-select" aria-label="Materia simulată">
                    ${Object.keys(state.subjects).map(m => `<option value="${escapeHTML(m)}" ${m === mat ? "selected" : ""} ${scenario.hypo[m]?.length ? `data-meta="${escapeHTML(plural(scenario.hypo[m].length, "ipotetică", "ipotetice"))}"` : ""}>${escapeHTML(m)}</option>`).join("")}
                </select>
            </div>

            <div class="sim-stats">
                <div class="sim-stat">
                    <span class="kpi-title">Acum</span>
                    <div class="sim-stat-value">${fmtAvgWithRound(now)}</div>
                    <span class="badge ${now.statusClass}">${escapeHTML(now.status)}</span>
                </div>
                <div class="sim-stat projected">
                    <span class="kpi-title">Cu notele ipotetice</span>
                    <div class="sim-stat-value">${fmtAvgWithRound(next)} ${deltaHTML(now.exactAvg, next.exactAvg)}</div>
                    <span class="badge ${next.statusClass}">${escapeHTML(next.status)}</span> ${statusChangeHTML(now, next)}
                </div>
            </div>
            <p class="sim-need ${reachedNow ? "is-ok" : ""}">${icon("target")} ${reachedNow
                ? `Ești la ținta ${fmtTarget(sub.target)}.${goalPill ? ` Ca s-o păstrezi la următoarea notă: <span class="azi-need is-${goalPill.tone}">${escapeHTML(goalPill.text)}</span>` : ""}`
                : goalPill ? `Ca să ajungi la ținta ${fmtTarget(sub.target)}: <span class="azi-need is-${goalPill.tone}">${escapeHTML(goalPill.text)}</span>${goalPlan.next ? " la următoarea notă" : ""}.` : `Ținta ${fmtTarget(sub.target)} nu mai e în calculul acestui modul.`}</p>

            <div class="sim-row">
                <span class="sim-row-label">Reale</span>
                <div class="grades-wrapper">${realChips}</div>
            </div>
            <div class="sim-row">
                <span class="sim-row-label">Ipotetice</span>
                <div class="grades-wrapper">${hypoChips}</div>
            </div>

            <div class="sim-add">
                <div class="sim-grade-buttons" role="group" aria-label="Adaugă o notă ipotetică">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" id="sim-add-${v}" class="sim-grade-btn" data-action="sim-add" data-val="${v}">${v}</button>`).join("")}
                </div>
                <div class="sim-add-options">
                    <label for="sim-add-type">Tip</label>
                    <select id="sim-add-type" class="glass-select sim-mini">${optionsHTML(GRADE_TYPES, sim.addType)}</select>
                    <button type="button" class="btn btn-text" data-action="sim-clear-subject" ${hypo.length ? "" : "disabled"}>Golește materia</button>
                </div>
            </div>

            ${slots.length ? `
            <div class="sim-calendar">
                <h4>${icon("calendar")} Din calendar</h4>
                <p class="muted-small mb-3">Alege nota la care te aștepți la testele programate. Dispar automat după data testului.</p>
                ${slotRows}
            </div>` : ""}
        </section>`;
}

function safetyPanelHTML(scenario, projected) {
    const mat = sim.selected;
    const sub = state.subjects[mat];
    const base = projected.subjects[mat];
    const { riskThreshold } = state.settings.calc;
    const { minGPA } = state.settings.goals;
    const hasHypo = (scenario.hypo[mat] || []).length > 0;

    const result = g => g === null
        ? { text: "imposibil, nici cu 10", tone: "danger" }
        : g === 1
            ? { text: "orice notă", tone: "ok" }
            : { text: `minim ${g}`, tone: g >= 9 ? "warn" : "neutral" };

    const rows = [];

    rows.push({
        label: `Rămâi peste pragul de risc (${riskThreshold.toFixed(2)})`,
        ...result(lowestGradeThatPasses(scenario, mat, m => m.subjects[mat].exactAvg >= riskThreshold))
    });

    if (base.roundedAvg > 0) {
        rows.push({
            label: `Păstrezi media ${base.roundedAvg} la ${mat}`,
            ...result(lowestGradeThatPasses(scenario, mat, m => m.subjects[mat].roundedAvg >= base.roundedAvg))
        });
    }

    if (sub.excludeFromGPA) {
        rows.push({ label: `Media generală ≥ ${minGPA.toFixed(2)}`, text: "materia e exclusă din medie", tone: "neutral" });
    } else {
        rows.push({
            label: `Media generală rămâne ≥ ${minGPA.toFixed(2)}`,
            ...result(lowestGradeThatPasses(scenario, mat, m => m.globalAvg >= minGPA))
        });
    }

    return `
        <section class="glass-card sim-panel" aria-labelledby="sim-safety-title">
            <h3 id="sim-safety-title">${icon("shield")} Marja de siguranță</h3>
            <p class="muted-small mt-2">
                Cea mai mică notă pe care o poți lua la următoarea evaluare la <b>${escapeHTML(mat)}</b>${hasHypo ? ", după notele ipotetice din acest scenariu" : ""}.
            </p>
            <div class="sim-safety-list">
                ${rows.map(r => `
                    <div class="sim-safety-row">
                        <span>${escapeHTML(r.label)}</span>
                        <span class="sim-result ${r.tone}">${escapeHTML(r.text)}</span>
                    </div>`).join("")}
            </div>
            <p class="subtitle mt-3">Pragul de risc și media minimă se schimbă din Setări.</p>
        </section>`;
}

/** În coloana din dreapta: media generală și materiile în risc, acum → cu notele ipotetice. */
function projectionSummaryHTML(projected) {
    return `
        <section class="glass-card sim-panel" aria-labelledby="sim-proj-title">
            <h3 id="sim-proj-title">${icon("trend-up")} Media generală proiectată</h3>
            <div class="sim-big-numbers">
                <div>
                    <span class="kpi-title">Media generală</span>
                    <div class="sim-big">${metrics.globalAvg > 0 ? metrics.globalAvg.toFixed(2) : "-"} <span aria-hidden="true">→</span>
                        <span class="sim-big-projected">${projected.globalAvg > 0 ? projected.globalAvg.toFixed(2) : "-"}</span>
                        ${deltaHTML(metrics.globalAvg, projected.globalAvg)}</div>
                </div>
                <div>
                    <span class="kpi-title">Materii în risc</span>
                    <div class="sim-big">${metrics.riskCount} <span aria-hidden="true">→</span> <span class="sim-big-projected">${projected.riskCount}</span></div>
                </div>
            </div>
        </section>`;
}

function generalPanelHTML(scenario, projected) {
    const method = state.settings.calc.method === "weighted" ? "ponderată după numărul de ore" : "media aritmetică a materiilor";
    const all = Object.keys(state.subjects);
    // Implicit doar materiile care se schimbă (sau au note ipotetice) — restul tabelului ar fi doar repetiție.
    const changed = all.filter(mat => (scenario.hypo[mat] || []).length > 0 || metrics.subjects[mat].exactAvg !== projected.subjects[mat].exactAvg);
    const shown = ui.simAll ? all : changed;
    const rows = shown.map(mat => {
        const a = metrics.subjects[mat];
        const b = projected.subjects[mat];
        const touched = (scenario.hypo[mat] || []).length > 0;
        const excluded = state.subjects[mat].excludeFromGPA;
        return `
            <tr class="${touched ? "touched" : ""} ${mat === sim.selected ? "selected" : ""}">
                <th scope="row">
                    <button type="button" class="sim-link" data-action="sim-pick-subject" data-mat="${escapeHTML(mat)}">${escapeHTML(mat)}</button>
                    ${excluded ? `<small class="muted-small">(exclusă)</small>` : ""}
                </th>
                <td>${fmtAvg(a)}</td>
                <td>${fmtAvg(b)}</td>
                <td>${deltaHTML(a.exactAvg, b.exactAvg)}</td>
                <td>${statusChangeHTML(a, b)}</td>
            </tr>`;
    }).join("");

    return `
        <section class="glass-card sim-panel sim-wide" aria-labelledby="sim-general-title">
            <div class="sim-panel-head">
                <h3 id="sim-general-title">${icon("chart")} Proiecția pe materii</h3>
                <button type="button" class="btn btn-text btn-sm" data-action="sim-toggle-all" aria-pressed="${Boolean(ui.simAll)}">${ui.simAll ? "Doar cele schimbate" : `Toate materiile (${all.length})`}</button>
            </div>
            ${shown.length ? `
            <div class="table-scroll">
                <table class="sim-table">
                    <thead><tr><th scope="col">Materie</th><th scope="col">Acum</th><th scope="col">Proiectat</th><th scope="col">Diferență</th><th scope="col"><span class="sr-only">Schimbare de status</span></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>` : `<p class="sim-empty-line">Nimic schimbat încă. Apasă o notă ipotetică mai sus și aici apar materiile afectate.</p>`}
            <p class="subtitle mt-3">Calculată ca ${method}, la fel ca în restul aplicației. Apasă pe o materie ca s-o simulezi.</p>
        </section>`;
}

function comparePanelHTML() {
    // Cu un singur scenariu nu ai ce compara: doar o invitație scurtă, nu un tabel care repetă proiecția.
    if (sim.scenarios.length < 2) {
        return `
        <section class="glass-card sim-panel sim-wide sim-compare-invite" aria-labelledby="sim-compare-title">
            <div class="sim-panel-head">
                <h3 id="sim-compare-title">${icon("scale")} Compară scenariile</h3>
                <button type="button" class="btn btn-glass btn-sm" data-action="sim-new">${icon("plus")} Scenariu nou</button>
            </div>
            <p class="muted-small">Fă încă un scenariu (de ex. „dacă teza merge prost”) și le vezi aici unul lângă altul.</p>
        </section>`;
    }
    const columns = [
        { id: null, name: "Real", m: metrics, count: 0 },
        ...sim.scenarios.map(sc => ({ id: sc.id, name: sc.name, m: projectMetrics(sc), count: hypoCount(sc) }))
    ];
    const best = Math.max(...columns.map(c => c.m.globalAvg));
    const cell = (col, value, changed, extra = "") =>
        `<td class="${col.id === sim.active ? "active-col" : ""} ${changed ? "changed" : ""} ${extra}">${value}</td>`;

    const subjectRows = Object.keys(state.subjects)
        .filter(mat => columns.some(c => c.id && c.m.subjects[mat].exactAvg !== metrics.subjects[mat].exactAvg))
        .map(mat => `
        <tr>
            <th scope="row">${escapeHTML(mat)}</th>
            ${columns.map(c => cell(c, fmtAvg(c.m.subjects[mat]), c.id && c.m.subjects[mat].exactAvg !== metrics.subjects[mat].exactAvg)).join("")}
        </tr>`).join("");

    return `
        <section class="glass-card sim-panel sim-wide" aria-labelledby="sim-compare-title">
            <h3 id="sim-compare-title">${icon("scale")} Compară scenariile</h3>
            <div class="table-scroll mt-3">
                <table class="sim-table sim-compare">
                    <thead>
                        <tr>
                            <th scope="col"><span class="sr-only">Indicator</span></th>
                            ${columns.map(c => c.id
                                ? `<th scope="col" class="${c.id === sim.active ? "active-col" : ""}"><button type="button" class="sim-link" data-action="sim-scenario" data-id="${escapeHTML(c.id)}">${escapeHTML(c.name)}</button></th>`
                                : `<th scope="col">Real</th>`).join("")}
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="sim-compare-key">
                            <th scope="row">Media generală</th>
                            ${columns.map(c => cell(c, c.m.globalAvg > 0 ? c.m.globalAvg.toFixed(2) : "-", c.id && c.m.globalAvg !== metrics.globalAvg,
                                c.m.globalAvg === best && best > 0 && columns.filter(x => x.m.globalAvg === best).length < columns.length ? "best" : "")).join("")}
                        </tr>
                        <tr>
                            <th scope="row">Materii în risc</th>
                            ${columns.map(c => cell(c, c.m.riskCount, c.id && c.m.riskCount !== metrics.riskCount)).join("")}
                        </tr>
                        <tr>
                            <th scope="row">Note ipotetice</th>
                            ${columns.map(c => cell(c, c.id ? c.count : "—", false)).join("")}
                        </tr>
                        ${subjectRows}
                    </tbody>
                </table>
            </div>
        </section>`;
}

/* ---------- acțiuni ---------- */
function commitSim() {
    saveState();
    renderSimulator();
}

function addHypo(mat, entry) {
    const scenario = activeScenario();
    const list = (scenario.hypo[mat] ||= []);
    if (list.length >= SIM_LIMITS.perSubject) {
        showToast(`⚠️ Poți avea cel mult ${SIM_LIMITS.perSubject} note ipotetice pe materie.`);
        return;
    }
    list.push({ id: uid(), ...entry });
}

function removeHypo(id) {
    const scenario = activeScenario();
    for (const mat of Object.keys(scenario.hypo)) {
        scenario.hypo[mat] = scenario.hypo[mat].filter(h => h.id !== id);
        if (scenario.hypo[mat].length === 0) delete scenario.hypo[mat];
    }
}

function setSlot(eventId, val) {
    const ev = upcomingExamIndex().get(eventId);
    if (!ev || !state.subjects[ev.subject]) return;

    const scenario = activeScenario();
    const list = scenario.hypo[ev.subject] || [];
    const existing = list.find(h => h.eventId === eventId);

    if (val === null) {
        if (existing) removeHypo(existing.id);
        return;
    }
    if (existing) {
        existing.val = val;
    } else {
        addHypo(ev.subject, { val, type: ev.type === "Examen" ? "Teză" : "Test", eventId });
    }
}

function promptScenarioName(title, initial, onSave) {
    openModal({
        title,
        confirmText: "Salvează",
        body: `
            <div class="form-group">
                <label for="sim-scenario-name">Nume scenariu</label>
                <input type="text" id="sim-scenario-name" class="glass-input" maxlength="${SIM_LIMITS.nameLength}" value="${escapeHTML(initial)}" autocomplete="off">
            </div>`,
        onConfirm: () => {
            const name = field("sim-scenario-name").trim().replace(/\s+/g, " ");
            if (!name) {
                showToast("⚠️ Introdu un nume pentru scenariu.");
                return;
            }
            onSave(name);
            closeActionModal();
            commitSim();
        }
    });
    $("sim-scenario-name")?.select();
}

function nextScenarioName() {
    let n = sim.scenarios.length + 1;
    while (sim.scenarios.some(s => s.name === `Scenariul ${n}`)) n++;
    return `Scenariul ${n}`;
}

const SIM_ACTIONS = {
    "sim-scenario": el => {
        sim.active = el.dataset.id;
        commitSim();
    },
    "sim-toggle-all": () => {
        ui.simAll = !ui.simAll;
        renderSimulator();
        document.querySelector('[data-action="sim-toggle-all"]')?.focus();
    },
    "sim-new": () => {
        if (sim.scenarios.length >= SIM_LIMITS.scenarios) return;
        promptScenarioName("Scenariu nou", nextScenarioName(), name => {
            const sc = { id: uid(), name, hypo: {} };
            sim.scenarios.push(sc);
            sim.active = sc.id;
        });
    },
    "sim-duplicate": () => {
        if (sim.scenarios.length >= SIM_LIMITS.scenarios) return;
        const src = activeScenario();
        promptScenarioName("Duplică scenariul", `${src.name} (copie)`.slice(0, SIM_LIMITS.nameLength), name => {
            const hypo = Object.fromEntries(Object.entries(src.hypo).map(([mat, list]) => [mat, list.map(h => ({ ...h, id: uid() }))]));
            const sc = { id: uid(), name, hypo };
            sim.scenarios.push(sc);
            sim.active = sc.id;
        });
    },
    "sim-rename": () => {
        const sc = activeScenario();
        promptScenarioName("Redenumește scenariul", sc.name, name => { sc.name = name; });
    },
    "sim-clear": () => {
        const sc = activeScenario();
        withUndo(`Ai golit „${sc.name}” (${plural(hypoCount(sc), "notă ipotetică", "note ipotetice")}).`, () => { sc.hypo = {}; });
    },
    "sim-delete": () => {
        if (sim.scenarios.length < 2) return;
        const sc = activeScenario();
        withUndo(`Ai șters scenariul „${sc.name}”.`, () => {
            sim.scenarios = sim.scenarios.filter(s => s.id !== sc.id);
            sim.active = sim.scenarios[0].id;
        });
    },
    "sim-add": el => {
        if (!state.subjects[sim.selected]) return;
        addHypo(sim.selected, { val: Number(el.dataset.val), type: sim.addType });
        commitSim();
    },
    "sim-remove": el => {
        removeHypo(el.dataset.id);
        commitSim();
    },
    "sim-clear-subject": () => {
        delete activeScenario().hypo[sim.selected];
        commitSim();
    },
    "sim-chip-subject": el => {
        sim.selected = el.dataset.mat;
        commitSim();
        document.querySelector(`.sim-subj-chip[data-mat="${CSS.escape(el.dataset.mat)}"]`)?.focus({ preventScroll: true });
    },
    "sim-pick-subject": el => {
        sim.selected = el.dataset.mat;
        commitSim();
        $("sim-subject-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
};

function bindSimulatorEvents() {
    $("sim-root")?.addEventListener("change", event => {
        const el = event.target;

        if (el.id === "sim-subject") {
            sim.selected = el.value;
        } else if (el.id === "sim-add-type") {
            sim.addType = GRADE_TYPES.includes(el.value) ? el.value : "Test";
            saveState();
            return;
        } else if (el.dataset.slotVal !== undefined) {
            setSlot(el.dataset.slotVal, el.value === "" ? null : parseStrictInteger(el.value, 1, 10));
        } else {
            return;
        }
        commitSim();
    });
}

registerTab("tab-simulator", { render: renderSimulator, title: "Ce-ar fi dacă", icon: "target", group: "grades", parent: "tab-catalog" });
