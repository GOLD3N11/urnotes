/* urNotes · Catalogul: lista materiilor, detaliile, meniul unei materii.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- MATERII (CATALOG) ---------- */
/*
 * Listă + panou de detalii. Pe ecrane mari se văd amândouă; pe telefon,
 * lista ocupă ecranul, iar alegerea unei materii deschide detaliile (cu „← Înapoi”).
 */
const CATALOG_FILTERS = {
    all: { label: "Toate", test: () => true },
    risk: { label: `${icon("alert")} Risc`, test: e => e.d.statusClass === "badge-danger" },
    empty: { label: "Fără note", test: e => e.sub.grades.length === 0 },
    priority: { label: `${icon("star")} Prioritare`, test: e => e.sub.priority }
};

const byName = (a, b) => a.mat.localeCompare(b.mat, "ro");
const avgOf = e => (e.sub.grades.length ? e.d.rawAvg : null);
function byAvg(dir) {
    return (a, b) => {
        const x = avgOf(a), y = avgOf(b);
        if (x === null && y === null) return byName(a, b);
        if (x === null) return 1;   // materiile fără note rămân la final
        if (y === null) return -1;
        return (x - y) * dir || byName(a, b);
    };
}
const STATUS_RANK = { "badge-danger": 0, "badge-warn": 1, "badge-ok": 2 };

const CATALOG_SORTS = {
    group: byName, // în interiorul fiecărui grup (vezi CATALOG_GROUPS)
    name: byName,
    "avg-desc": byAvg(-1),
    "avg-asc": byAvg(1),
    risk: (a, b) => STATUS_RANK[a.d.statusClass] - STATUS_RANK[b.d.statusClass] || byAvg(1)(a, b),
    missing: (a, b) => b.d.requiredNotes - a.d.requiredNotes || byName(a, b)
};

/* Lista „pe stare”: grupuri care se pot strânge, cele care cer atenție primele. */
const CATALOG_GROUPS = [
    { key: "risk", label: "La risc", tone: "danger" },
    { key: "below", label: "Sub țintă", tone: "warn" },
    { key: "ok", label: "La țintă", tone: "ok" },
    { key: "none", label: "Fără note", tone: "none" }
];

/** Materiile vizibile, în ordinea în care apar pe ecran, împărțite pe grupuri (sau un singur grup, la altă sortare). */
function catalogGroups() {
    const visible = visibleCatalogEntries();
    if (ui.catalog.sort !== "group") return [{ key: "all", label: "", entries: visible }];
    return CATALOG_GROUPS
        .map(g => ({ ...g, entries: visible.filter(e => subjectStanding(e.sub, e.d).key === g.key) }))
        .filter(g => g.entries.length);
}

/** Ordinea pentru „materia anterioară / următoare”: purtarea (dacă e în listă), apoi materiile, ca pe ecran. */
function catalogOrder() {
    return [...(purtareVisibleInList() ? [PURTARE_KEY] : []), ...catalogGroups().flatMap(g => g.entries.map(e => e.mat))];
}

function stepCatalog(dir) {
    const order = catalogOrder();
    if (order.length < 2) return;
    const i = order.indexOf(ui.catalog.selected);
    const next = order[(i < 0 ? 0 : i + dir + order.length) % order.length];
    selectCatalogSubject(next);
    $("cat-nav")?.querySelector(`[data-action="cat-step"][data-dir="${dir}"]`)?.focus({ preventScroll: true });
}

/** Bara de deasupra detaliilor: ‹ › între materii, poziția, iar pe telefon o bandă cu toate materiile. */
function renderCatalogNav() {
    const nav = $("cat-nav");
    if (!nav) return;
    const order = catalogOrder();
    const i = order.indexOf(ui.catalog.selected);
    if (order.length < 2 || i < 0) {
        nav.innerHTML = "";
        nav.hidden = true;
        return;
    }
    nav.hidden = false;
    const name = mat => mat === PURTARE_KEY ? "Purtare" : mat;
    const prev = order[(i - 1 + order.length) % order.length];
    const next = order[(i + 1) % order.length];
    nav.innerHTML = `
        <div class="cat-nav-bar">
            <button type="button" class="btn btn-glass cat-step" data-action="cat-step" data-dir="-1" aria-label="${escapeHTML(`Materia anterioară: ${name(prev)}`)}" title="${escapeHTML(name(prev))} (←)">${icon("chevron", "is-flip")}<span class="cat-step-name">${escapeHTML(name(prev))}</span></button>
            <span class="cat-nav-pos" aria-live="polite">${i + 1} din ${order.length}</span>
            <button type="button" class="btn btn-glass cat-step is-next" data-action="cat-step" data-dir="1" aria-label="${escapeHTML(`Materia următoare: ${name(next)}`)}" title="${escapeHTML(name(next))} (→)"><span class="cat-step-name">${escapeHTML(name(next))}</span>${icon("chevron")}</button>
        </div>
        <div class="cat-strip" role="tablist" aria-label="Alege materia">
            ${order.map(mat => {
                const d = mat === PURTARE_KEY ? null : metrics.subjects[mat];
                const tone = mat === PURTARE_KEY ? "ok" : statusTone(d);
                const on = mat === ui.catalog.selected;
                return `<button type="button" role="tab" class="cat-strip-chip ${on ? "is-on" : ""}" aria-selected="${on}" data-action="cat-select" data-mat="${escapeHTML(mat)}"><i class="cat-dot ${tone}" aria-hidden="true"></i>${escapeHTML(name(mat))}</button>`;
            }).join("")}
        </div>`;
    // materia aleasă, la mijlocul benzii (fără să miște pagina)
    const strip = nav.querySelector(".cat-strip");
    const chip = strip?.querySelector(".is-on");
    if (strip && chip && strip.clientWidth) strip.scrollLeft = chip.offsetLeft - strip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
}

/** Text fără diacritice, pentru căutare: „matematica” găsește „Matematică”. */
function foldText(value) {
    return String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("ro");
}

function catalogEntries() {
    return Object.entries(state.subjects).map(([mat, sub]) => ({ mat, sub, d: metrics.subjects[mat] }));
}

function visibleCatalogEntries() {
    const { filter, query, sort } = ui.catalog;
    const q = foldText(query.trim());
    return catalogEntries()
        .filter(e => (CATALOG_FILTERS[filter] || CATALOG_FILTERS.all).test(e))
        .filter(e => !q || foldText(e.mat).includes(q))
        .sort(CATALOG_SORTS[sort] || byName);
}

function gradeTone(value) {
    return value >= 9 ? "hi" : value >= 7 ? "mid" : value >= 5 ? "low" : "fail";
}

function statusTone(d) {
    return d.statusClass === "badge-danger" ? "danger" : d.statusClass === "badge-warn" ? "warn" : "ok";
}

function fmtTarget(target) {
    return Number.isInteger(target) ? String(target) : target.toFixed(2);
}

function fmtNumber(value) {
    return Number.isInteger(value) ? String(value) : String(roundValue(value, 2));
}

/** Notele în ordine cronologică (cele fără dată primele), cu indexul lor real. */
function gradesChrono(sub) {
    return sub.grades
        .map((g, i) => ({ g, i }))
        .sort((a, b) => (a.g.date || "").localeCompare(b.g.date || "") || a.i - b.i);
}

/** Ținta e media finală dorită: un număr întreg se compară cu media rotunjită. */
function reachesTarget(d, target) {
    if (!d || d.exactAvg <= 0) return false;
    return Number.isInteger(target) ? d.roundedAvg >= target : d.exactAvg >= target;
}

function metricsWithExtraGrades(mat, extra) {
    const sub = state.subjects[mat];
    return calculateMetrics({ ...state.subjects, [mat]: { ...sub, grades: [...sub.grades, ...extra] } });
}

/**
 * Ce îți trebuie ca o condiție să fie îndeplinită la materia dată:
 * cea mai mică notă următoare, sau câte note de 10 la rând, sau „imposibil” (peste 20).
 */
function planForCondition(mat, ok) {
    const now = ok(metrics.subjects[mat]);
    for (let g = 1; g <= 10; g++) {
        if (ok(metricsWithExtraGrades(mat, [{ val: g }]).subjects[mat])) return { now, next: g };
    }
    for (let k = 2; k <= 20; k++) {
        if (ok(metricsWithExtraGrades(mat, Array.from({ length: k }, () => ({ val: 10 }))).subjects[mat])) return { now, tens: k };
    }
    return { now, impossible: true };
}

function planPill(plan) {
    if (plan.impossible) return { text: "peste 20 de note de 10", tone: "danger" };
    if (plan.tens) return { text: `${plan.tens} note de 10 la rând`, tone: "danger" };
    if (plan.next === 1) return { text: "orice notă", tone: "ok" };
    return { text: `minim ${plan.next}`, tone: plan.next >= 9 ? "warn" : "neutral" };
}

function daysUntil(dateKey) {
    return Math.round((parseDateKey(dateKey) - parseDateKey(getLocalDateKey())) / 86400000);
}

function relativeDay(dateKey) {
    const n = daysUntil(dateKey);
    return n === 0 ? "azi" : n === 1 ? "mâine" : `în ${plural(n, "zi", "zile")}`;
}

function upcomingForSubject(mat, limit = 4) {
    const today = getLocalDateKey();
    const links = gradeLinks();
    return occurrencesBetween(today, addDays(today, 365))
        .filter(o => o.ev.subject === mat && !isOccurrenceDone(o.ev, o.date, links))
        .slice(0, limit)
        .map(o => ({ ...o.ev, date: o.date }));
}

/* ---------- randare ---------- */
function renderCatalog() {
    const layout = $("catalog-layout");
    if (!layout) return;

    const entries = catalogEntries();

    // Selecția rămâne validă: dacă materia a dispărut, alegem prima din listă (sau purtarea, care există mereu).
    if (ui.catalog.selected !== PURTARE_KEY && !state.subjects[ui.catalog.selected]) {
        ui.catalog.selected = (catalogGroups()[0]?.entries[0] || entries[0])?.mat || PURTARE_KEY;
        ui.catalog.showDetail = false;
        ui.catalog.autoPicked = true; // aleasă automat: pe telefon nu o evidențiem în listă
    }

    // Câmpurile statice păstrează valorile (ex. după un import sau o resetare).
    if ($("cat-search").value !== ui.catalog.query) $("cat-search").value = ui.catalog.query;
    $("cat-sort").value = ui.catalog.sort;

    renderCatalogSummary(entries);
    renderCatalogFilters(entries);
    renderCatalogList();
    renderCatalogDetail();
    layout.classList.toggle("show-detail", ui.catalog.showDetail);
    layout.classList.toggle("auto-pick", ui.catalog.autoPicked);
    $("tab-catalog").classList.toggle("cat-detail-open", ui.catalog.showDetail);
    renderCatalogNav();
}

function renderCatalogSummary(entries) {
    const priority = entries.filter(e => e.sub.priority).length;
    const excluded = entries.filter(e => e.sub.excludeFromGPA).length;
    const missing = entries.reduce((n, e) => n + e.d.requiredNotes, 0);
    const method = (state.settings.calc.method === "weighted" ? "ponderată după ore" : "ca în catalog")
        + (state.purtare.excludeFromGPA ? "" : " · cu purtarea");
    const tile = (title, value, caption, extra = "") => `
        <div class="glass-card cat-sum ${extra}">
            <span class="kpi-title">${title}</span>
            <b class="cat-sum-value">${value}</b>
            <small>${caption}</small>
        </div>`;

    $("cat-summary").innerHTML = [
        tile("Media generală", metrics.globalAvg > 0 ? metrics.globalAvg.toFixed(2) : "-", escapeHTML(method), "is-accent"),
        tile("Materii", entries.length, escapeHTML([priority && `${priority} prioritare`, excluded && `${excluded} excluse`].filter(Boolean).join(" · ") || "toate în medie")),
        tile("Note", metrics.totalGrades, missing > 0 ? `încă ${plural(missing, "notă necesară", "note necesare")}` : "✓ minimul atins peste tot"),
        tile("În risc", metrics.riskCount, `sub ${state.settings.calc.riskThreshold.toFixed(2)}`, metrics.riskCount > 0 ? "is-danger" : "")
    ].join("");
}

function renderCatalogFilters(entries) {
    $("cat-filters").innerHTML = Object.entries(CATALOG_FILTERS).map(([key, f]) => {
        const count = entries.filter(f.test).length;
        const active = ui.catalog.filter === key;
        return `
            <button type="button" class="cat-chip ${active ? "active" : ""}" data-action="cat-filter" data-filter="${key}" aria-pressed="${active}">
                ${f.label} <span class="cat-chip-count">${count}</span>
            </button>`;
    }).join("");
}

function renderCatalogList() {
    const list = $("cat-list");
    const visible = visibleCatalogEntries();
    const pinned = purtareVisibleInList() ? purtareRowHTML() : "";

    if (visible.length === 0) {
        list.innerHTML = pinned + (Object.keys(state.subjects).length === 0
            ? `
            <div class="cat-list-empty">
                <p>Nu ai încă nicio materie.</p>
                <button type="button" class="btn btn-primary" data-action="add-subject">+ Adaugă materie</button>
            </div>`
            : `
            <div class="cat-list-empty">
                <p>Nicio materie nu se potrivește.</p>
                <button type="button" class="btn btn-glass" data-action="cat-clear-filters">Arată toate materiile</button>
            </div>`);
        return;
    }

    const rowHTML = ({ mat, sub, d }) => {
        const selected = mat === ui.catalog.selected;
        const hasGrades = sub.grades.length > 0;
        const meta = [
            plural(sub.grades.length, "notă", "note"),
            `${fmtNumber(sub.ore)} ${sub.ore === 1 ? "oră" : "ore"}`,
            `ținta ${fmtTarget(sub.target)}`
        ].join(" · ");
        return `
            <button type="button" class="cat-row ${selected ? "selected" : ""}" data-action="cat-select" data-mat="${escapeHTML(mat)}"
                ${selected ? 'aria-current="true"' : ""}>
                <span class="cat-dot ${statusTone(d)}" aria-hidden="true"></span>
                <span class="cat-row-main">
                    <span class="cat-row-name">${sub.priority ? '<span class="cat-star" aria-label="prioritară">★</span>' : ""}${escapeHTML(mat)}</span>
                    <span class="cat-row-meta">${escapeHTML(meta)}${sub.excludeFromGPA ? ' · <span class="cat-tag">exclusă</span>' : ""}${inProgramme(mat) ? "" : ' · <span class="cat-tag is-warn">în afara programei</span>'}</span>
                </span>
                <span class="cat-row-avg">
                    <b>${hasGrades ? d.exactAvg.toFixed(2) : "–"}</b>
                    <small>${hasGrades ? `→ ${d.roundedAvg}` : escapeHTML(d.status)}</small>
                </span>
            </button>`;
    };
    const searching = Boolean(ui.catalog.query.trim());
    list.innerHTML = pinned + catalogGroups().map(g => {
        if (!g.label) return g.entries.map(rowHTML).join("");
        const open = searching || !ui.catalog.collapsed[g.key] || g.entries.some(e => e.mat === ui.catalog.selected && !ui.catalog.autoPicked);
        return `
            <div class="cat-group tone-${g.tone} ${open ? "" : "is-closed"}">
                <button type="button" class="cat-group-head" data-action="cat-group" data-group="${g.key}" aria-expanded="${open}">
                    ${icon("chevron", "cat-group-chev")}<span>${g.label}</span><span class="cat-group-count">${g.entries.length}</span>
                    ${open ? "" : `<span class="cat-group-peek">${escapeHTML(g.entries.slice(0, 3).map(e => e.mat).join(", "))}${g.entries.length > 3 ? "…" : ""}</span>`}
                </button>
                ${open ? g.entries.map(rowHTML).join("") : ""}
            </div>`;
    }).join("");
}

function renderCatalogDetail() {
    if (ui.catalog.selected === PURTARE_KEY) {
        renderPurtareDetail();
        return;
    }
    const pane = $("cat-detail");
    const mat = ui.catalog.selected;
    const sub = state.subjects[mat];
    if (!sub) {
        pane.innerHTML = "";
        return;
    }

    const d = metrics.subjects[mat];
    const safeMat = escapeHTML(mat);
    const chrono = gradesChrono(sub);
    const last = chrono[chrono.length - 1];
    const minTotal = sub.grades.length + d.requiredNotes;
    const reached = reachesTarget(d, sub.target);
    const gap = (Number.isInteger(sub.target) ? sub.target - 0.5 : sub.target) - d.exactAvg;

    const stat = (title, value, caption, tone = "") => `
        <div class="cat-stat ${tone}">
            <span class="kpi-title">${title}</span>
            <b>${value}</b>
            <small>${caption}</small>
        </div>`;

    pane.innerHTML = `
        <div class="glass-card cat-detail-card">
            <button type="button" class="btn btn-text cat-back" data-action="cat-back">← Toate materiile</button>

            <header class="cat-detail-head">
                <div class="cat-detail-title-wrap">
                    <div class="cat-title-row">
                        <h3 class="cat-title" id="cat-detail-title" tabindex="-1">${safeMat}</h3>
                        <span class="badge ${d.statusClass}">${escapeHTML(d.status)}</span>${d.statusClass === "badge-danger" ? helpDot("risk") : ""}
                        ${sub.excludeFromGPA ? `<span class="badge cat-badge-muted">${icon("ban")} Exclusă din medie</span>` : ""}
                        ${inProgramme(mat) ? "" : `<span class="badge badge-warn" title="Nu e în programa ta (${escapeHTML(programmeLabel())}). Din „Editează” o poți înlocui cu o materie din programă, păstrând notele.">În afara programei</span>`}
                    </div>
                    <p class="subtitle">${fmtNumber(sub.ore)} ${sub.ore === 1 ? "oră" : "ore"} pe săptămână · ținta ${fmtTarget(sub.target)}</p>
                </div>
                <div class="cat-head-actions">
                    <button type="button" class="btn-star ${sub.priority ? "active" : ""}" data-action="toggle-priority" data-mat="${safeMat}"
                        aria-pressed="${sub.priority}" title="${sub.priority ? "Scoate din prioritare" : "Marchează ca prioritară"}" aria-label="Materie prioritară">★</button>
                    <button type="button" class="btn btn-glass" data-action="edit-subject" data-mat="${safeMat}">${icon("pen")} Editează</button>
                    <button type="button" class="btn btn-primary" data-action="add-grade" data-mat="${safeMat}">+ Notă</button>
                </div>
            </header>

            ${isLegacyPurtareName(mat) ? `
                <div class="alert-card warning">
                    <span>${icon("medal")} Purtarea are acum o secție proprie, preinstalată, care se reînnoiește la fiecare modul. Această materie ar fi numărată de două ori în media generală.</span>
                    <button type="button" class="btn btn-glass" data-action="delete-subject" data-mat="${safeMat}">Șterge materia veche</button>
                </div>` : ""}

            <div class="cat-stats">
                ${stat("Media", sub.grades.length ? `${d.exactAvg.toFixed(2)} <span class="sim-round">→ ${d.roundedAvg}</span>` : "–",
                    sub.grades.length ? "exactă → finală" : "încă fără note")}
                ${stat("Ținta", fmtTarget(sub.target),
                    !sub.grades.length ? "media finală dorită" : reached ? "✓ atinsă" : `lipsesc ${Math.max(0.01, roundValue(gap, 2)).toFixed(2)} puncte`,
                    sub.grades.length ? (reached ? "is-ok" : "is-warn") : "")}
                ${stat("Note", sub.grades.length,
                    d.requiredNotes > 0 ? `încă ${d.requiredNotes} până la minim ${minTotal}` : `✓ minim ${minTotal} atins`,
                    d.requiredNotes > 0 ? "is-warn" : "is-ok")}
                ${stat("Ultima notă", last ? `<span class="cat-grade-val tone-${gradeTone(Number(last.g.val))}">${escapeHTML(last.g.val)}</span>` : "–",
                    last ? escapeHTML(`${last.g.type || "Altele"}${last.g.date ? ` · ${getShortDateLabel(last.g.date)}` : ""}`) : "nimic încă")}
            </div>

            <div class="cat-detail-grid">
                ${targetHelperHTML(mat, sub)}
                <section class="cat-block" aria-labelledby="cat-trend-title">
                    <h4 id="cat-trend-title">${icon("trend-up")} Evoluție</h4>
                    ${trendSVG(sub, chrono)}
                </section>
            </div>

            <section class="cat-block" aria-labelledby="cat-grades-title">
                <div class="cat-block-head">
                    <h4 id="cat-grades-title">${icon("note")} Note <span class="cat-count">${sub.grades.length}</span></h4>
                    ${sub.grades.length ? '<span class="subtitle">cele mai noi primele</span>' : ""}
                </div>
                ${gradesListHTML(mat, chrono)}
            </section>

            <section class="cat-block" aria-labelledby="cat-upcoming-title">
                <h4 id="cat-upcoming-title">${icon("calendar")} Următoarele evaluări</h4>
                ${upcomingHTML(mat)}
            </section>

            <footer class="cat-detail-foot">
                <button type="button" class="btn btn-text text-danger" data-action="delete-subject" data-mat="${safeMat}">${icon("trash")} Șterge materia</button>
            </footer>
        </div>`;
}

function targetHelperHTML(mat, sub) {
    const risk = state.settings.calc.riskThreshold;
    const targetPlan = planForCondition(mat, d => reachesTarget(d, sub.target));
    const riskPlan = planForCondition(mat, d => d.exactAvg >= risk);

    const row = (label, hint, plan) => {
        const pill = planPill(plan);
        return `
            <div class="sim-safety-row cat-plan-row">
                <span><b>${label}</b><small>${hint}</small></span>
                <span class="sim-result ${pill.tone}">${escapeHTML(pill.text)}</span>
            </div>`;
    };

    return `
        <section class="cat-block" aria-labelledby="cat-target-title">
            <h4 id="cat-target-title">${icon("target")} Ce îți trebuie ${helpDot("need")}</h4>
            <p class="muted-small">La următoarea evaluare la ${escapeHTML(mat)}:</p>
            <div class="sim-safety-list">
                ${row(targetPlan.now ? `Păstrezi ținta ${fmtTarget(sub.target)}` : `Ajungi la ținta ${fmtTarget(sub.target)}`,
                    targetPlan.now ? "✓ deja atinsă" : "media finală dorită", targetPlan)}
                ${row(riskPlan.now ? `Rămâi peste ${risk.toFixed(2)}` : `Ieși din risc (${risk.toFixed(2)})`,
                    riskPlan.now ? "pragul de risc din Setări" : "acum ești sub prag", riskPlan)}
            </div>
            <button type="button" class="btn btn-text cat-sim-link" data-action="open-in-sim" data-mat="${escapeHTML(mat)}">${icon("target")} Încearcă scenarii în Simulator →</button>
        </section>`;
}

/** Grafic mic, fără bibliotecă: notele (puncte) + media pe parcurs (linie) + țintă și prag. */
function trendSVG(sub, chrono) {
    if (chrono.length < 2) {
        return `<p class="muted-small cat-trend-empty">Graficul apare de la a doua notă.</p>`;
    }

    const W = 320, H = 120, L = 22, R = 10, T = 10, B = 10;
    const n = chrono.length;
    const risk = state.settings.calc.riskThreshold;
    const target = Math.min(10, sub.target);
    const values = chrono.map(({ g }) => Number(g.val));

    // Axa se adaptează notelor (ex. 5–10), ca diferențele mici să se vadă; include ținta și pragul.
    const lo = Math.max(1, Math.floor(Math.min(...values, risk, target)) - 1);
    const hi = 10;
    const step = hi - lo <= 4 ? 1 : hi - lo <= 8 ? 2 : 3;
    const ticks = [];
    for (let v = hi; v >= lo; v -= step) ticks.push(v);

    const x = i => L + (i * (W - L - R)) / (n - 1);
    const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo);

    let sum = 0;
    const running = chrono.map(({ g }, i) => {
        sum += Number(g.val);
        return [x(i), y(sum / (i + 1))];
    });
    const path = running.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
    const hline = (v, cls) => `<line class="${cls}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;

    return `
        <svg class="cat-trend" viewBox="0 0 ${W} ${H}" role="img"
            aria-label="Evoluția mediei la această materie: de la ${Number(chrono[0].g.val)} la ${(sum / n).toFixed(2)}">
            ${ticks.map(v => `<line class="trend-grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
                <text class="trend-axis" x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join("")}
            ${hline(target, "trend-target")}
            ${hline(risk, "trend-risk")}
            <path class="trend-avg" d="${path}"/>
            ${chrono.map(({ g }, i) => `<circle class="trend-dot tone-${gradeTone(Number(g.val))}" cx="${x(i).toFixed(1)}" cy="${y(Number(g.val)).toFixed(1)}" r="4.5" data-tip-title="${escapeHTML(`${g.type || "Altele"}${g.date ? ` · ${getShortDateLabel(g.date)}` : ""}`)}" data-tip-value="${escapeHTML(g.val)}"/>`).join("")}
        </svg>
        <div class="cat-trend-legend" aria-hidden="true">
            <span><i class="lg-dot"></i>note</span>
            <span><i class="lg-avg"></i>media pe parcurs</span>
            <span><i class="lg-target"></i>ținta</span>
            <span><i class="lg-risk"></i>prag risc</span>
        </div>`;
}

function gradesListHTML(mat, chrono) {
    if (chrono.length === 0) {
        return `
            <div class="cat-grades-empty">
                <p class="muted-small">Nu există note la ${escapeHTML(mat)}.</p>
                <button type="button" class="btn btn-primary" data-action="add-grade" data-mat="${escapeHTML(mat)}">+ Adaugă prima notă</button>
            </div>`;
    }

    const safeMat = escapeHTML(mat);
    return `
        <ul class="cat-grades">
            ${[...chrono].reverse().map(({ g, i }) => `
                <li class="cat-grade">
                    <span class="cat-grade-val tone-${gradeTone(Number(g.val))}">${escapeHTML(g.val)}</span>
                    <span class="cat-grade-info">
                        <b>${escapeHTML(g.type || "Altele")}</b>
                        <small>${g.date ? escapeHTML(getDateLabel(g.date)) : "fără dată"}</small>
                    </span>
                    <span class="cat-grade-actions">
                        <button type="button" class="btn btn-glass icon-btn" data-action="edit-grade" data-mat="${safeMat}" data-index="${i}"
                            title="Editează nota" aria-label="Editează nota ${escapeHTML(g.val)} (${escapeHTML(g.type || "Altele")})">${icon("pen")}</button>
                        <button type="button" class="btn btn-glass icon-btn cat-del" data-action="delete-grade" data-mat="${safeMat}" data-index="${i}"
                            title="Șterge nota" aria-label="Șterge nota ${escapeHTML(g.val)} (${escapeHTML(g.type || "Altele")})">${icon("trash")}</button>
                    </span>
                </li>`).join("")}
        </ul>`;
}

function upcomingHTML(mat) {
    const events = upcomingForSubject(mat);
    if (events.length === 0) {
        return `<p class="muted-small">Nimic programat la ${escapeHTML(mat)}.
            <button type="button" class="btn btn-text cat-inline-btn" data-action="add-event" data-mat="${escapeHTML(mat)}">+ Adaugă în calendar</button></p>`;
    }
    return `
        <ul class="cat-upcoming">
            ${events.map(ev => `
                <li>
                    <button type="button" class="cat-upcoming-item" data-action="show-date" data-date="${escapeHTML(ev.date)}">
                        <span class="cat-upcoming-when ${daysUntil(ev.date) <= 2 ? "soon" : ""}">${escapeHTML(relativeDay(ev.date))}</span>
                        <span class="cat-upcoming-main">
                            <b>${escapeHTML(ev.title)}</b>
                            <small>${escapeHTML(`${ev.type} · ${getDateLabel(ev.date)}${ev.time ? `, ${ev.time}` : ""}`)}</small>
                        </span>
                        <span aria-hidden="true">→</span>
                    </button>
                </li>`).join("")}
        </ul>`;
}

/* ---------- interacțiuni ---------- */
function selectCatalogSubject(mat, { showDetail = true } = {}) {
    if (mat !== PURTARE_KEY && !state.subjects[mat]) return;
    const listHadFocus = $("cat-list")?.contains(document.activeElement);
    const changed = mat !== ui.catalog.selected;
    ui.catalog.selected = mat;
    ui.catalog.showDetail = showDetail;
    ui.catalog.autoPicked = false;
    renderCatalog();

    // O materie nouă se vede de la început: detaliile pornesc de sus, iar pagina nu rămâne derulată sub ele.
    if (changed) {
        const pane = $("cat-detail-pane");
        if (pane) pane.scrollTop = 0;
        const top = $("catalog-layout")?.getBoundingClientRect().top ?? 0;
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h")) || 0;
        if (top < bar) window.scrollBy({ top: top - bar - 12 });
        // în listă, materia aleasă rămâne la vedere (ex. după ‹ ›)
        $("cat-list")?.querySelector(".cat-row.selected")?.scrollIntoView({ block: "nearest" });
    }
    // Pe telefon lista dispare: ducem focusul și pagina la detalii.
    const listVisible = $("cat-list")?.offsetParent !== null;
    if (showDetail && !listVisible) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        $("cat-detail-title")?.focus({ preventScroll: true });
    } else if (listHadFocus) {
        document.querySelector("#cat-list .cat-row.selected")?.focus();
    }
}

function openSubjectInCatalog(mat) {
    if (mat !== PURTARE_KEY && !state.subjects[mat]) return;
    ui.catalog.selected = mat;
    ui.catalog.showDetail = true;
    ui.catalog.autoPicked = false;
    // Dacă filtrele ar ascunde materia, le resetăm ca să fie vizibilă în listă.
    const hidden = mat === PURTARE_KEY ? !purtareVisibleInList() : !visibleCatalogEntries().some(e => e.mat === mat);
    if (hidden) {
        ui.catalog.filter = "all";
        ui.catalog.query = "";
    }
    switchTab("tab-catalog");
    const card = document.querySelector("#cat-detail .cat-detail-card");
    if (card) {
        card.classList.add("flash");
        setTimeout(() => card.classList.remove("flash"), 1600);
    }
}

function openSubjectInSimulator(mat) {
    if (!state.subjects[mat]) return;
    sim.selected = mat;
    saveState();
    switchTab("tab-simulator");
}

function bindCatalogEvents() {
    const search = $("cat-search");
    const runSearch = debounce(() => {
        ui.catalog.query = search.value;
        renderCatalogList();
        renderCatalogNav();
    }, 100);
    search.addEventListener("input", runSearch);
    search.addEventListener("keydown", event => {
        if (event.key === "Escape" && search.value) {
            event.stopPropagation();
            search.value = "";
            ui.catalog.query = "";
            renderCatalogList();
            renderCatalogNav();
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            $("cat-list").querySelector(".cat-row")?.focus();
        }
    });

    $("cat-sort").addEventListener("change", event => {
        ui.catalog.sort = CATALOG_SORTS[event.target.value] ? event.target.value : "name";
        renderCatalogList();
    });

    // Săgețile sus/jos navighează prin listă.
    $("cat-list").addEventListener("keydown", event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const rows = [...$("cat-list").querySelectorAll(".cat-row")];
        const i = rows.indexOf(document.activeElement);
        if (i < 0) return;
        event.preventDefault();
        const next = rows[event.key === "ArrowDown" ? i + 1 : i - 1];
        if (next) next.focus();
        else if (event.key === "ArrowUp") search.focus();
    });
}

/* ---------- meniul unei materii (dublu-clic, clic dreapta, apăsare lungă sau Shift+F10 pe rând) ---------- */
const catMenu = { mat: "", returnFocus: null, openedAt: 0, last: { mat: "", t: 0, x: 0, y: 0 } };

function openCatMenu(mat, x, y, returnFocus = null) {
    if (!state.subjects[mat]) return;
    const menu = $("cat-menu");
    if (!menu.hidden && catMenu.mat === mat) return;
    catMenu.openedAt = performance.now();
    catMenu.mat = mat;
    catMenu.returnFocus = returnFocus;
    $("cat-menu-title").textContent = mat;
    menu.hidden = false;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const vw = document.documentElement.clientWidth || innerWidth;
    menu.style.left = `${Math.max(8, Math.min(vw - w - 8, x))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, y))}px`;
    menu.querySelector("[role='menuitem']")?.focus({ preventScroll: true });
}

function closeCatMenu({ restoreFocus = true } = {}) {
    const menu = $("cat-menu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const back = catMenu.returnFocus;
    catMenu.returnFocus = null;
    if (restoreFocus && back && document.contains(back)) back.focus({ preventScroll: true });
}

/** „Pe scurt”: media, ținta, ce-ți trebuie, notele și următorul test — fără restul detaliilor. */
function openSubjectGlance(mat) {
    const sub = state.subjects[mat];
    if (!sub) return;
    const d = metrics.subjects[mat];
    const has = sub.grades.length > 0;
    const reached = reachesTarget(d, sub.target);
    const plan = has && !reached ? planForCondition(mat, x => reachesTarget(x, sub.target)) : null;
    const pill = plan ? planPill(plan) : null;
    const next = upcomingForSubject(mat, 6).find(ev => NEEDS_GRADE.has(ev.type));
    const today = getLocalDateKey();
    openModal({
        title: `${mat} · pe scurt`,
        guestOk: true,
        confirmText: "Adaugă o notă",
        cancelText: "Închide",
        body: `
            <div class="glance">
                <div class="glance-top">
                    <div class="glance-avg tone-${has ? gradeTone(d.exactAvg) : "none"}">
                        <b>${has ? d.exactAvg.toFixed(2) : "–"}</b>
                        <small>${has ? `media · finală ${d.roundedAvg}` : "încă fără note"}</small>
                    </div>
                    <div class="glance-facts">
                        <span><b>Ținta</b> ${fmtTarget(sub.target)}${has ? (reached ? ` · <span class="azi-need is-ok">atinsă</span>` : "") : ""}</span>
                        <span><b>Stare</b> <span class="badge ${d.statusClass}">${escapeHTML(d.status)}</span></span>
                        <span><b>Ore</b> ${fmtNumber(sub.ore)} pe săptămână</span>
                    </div>
                </div>
                ${plan ? `<p class="glance-need">${icon("target")} Ca să ajungi la ${fmtTarget(sub.target)}: ${plan.next
                    ? `<span class="azi-need is-${pill.tone}">${escapeHTML(pill.text)}</span> la următoarea notă`
                    : `ai nevoie de <span class="azi-need is-${pill.tone}">${escapeHTML(pill.text)}</span>`}.</p>` : ""}
                ${next ? `<p class="glance-next">${icon("calendar-check")} ${escapeHTML(capitalize(eventPhrase(next.type, next.date, today)))}.</p>` : ""}
                <div class="glance-grades" aria-label="Note"><span class="glance-label">${has ? plural(sub.grades.length, "notă", "note") : "Note"}</span>
                    ${has ? gradesChrono(sub).map(({ g }) => `<span class="cat-grade-val tone-${gradeTone(Number(g.val))}" title="${escapeHTML(`${g.type || "Altele"}${g.date ? ` · ${getShortDateLabel(g.date)}` : ""}`)}">${escapeHTML(g.val)}</span>`).join("")
                        : `<span class="subtitle">Nicio notă încă.</span>`}
                </div>
            </div>`,
        onConfirm: () => {
            closeActionModal();
            openAddGradeModal(mat);
        }
    });
}

/** ← → între materii (când nu scrii nimic) și glisare stânga/dreapta pe detalii, pe telefon. */
function bindCatalogNav() {
    document.addEventListener("keydown", event => {
        if (ui.activeTab !== "tab-catalog" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        if (isTyping(event.target) || event.target.closest?.("select, .cat-menu") || document.body.classList.contains("modal-open") || tour.open) return;
        event.preventDefault();
        stepCatalog(event.key === "ArrowLeft" ? -1 : 1);
    });
    const pane = $("cat-detail");
    if (!pane) return;
    let start = null;
    pane.addEventListener("touchstart", event => {
        const t = event.touches[0];
        const edge = t.clientX < 24 || t.clientX > innerWidth - 24; // marginile sunt ale gestului „înapoi” din Safari
        start = event.touches.length === 1 && !edge && !event.target.closest(".cat-strip, input, select, textarea") ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    }, { passive: true });
    pane.addEventListener("touchend", event => {
        if (!start) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const quick = Date.now() - start.at < 700;
        start = null;
        if (quick && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) stepCatalog(dx < 0 ? 1 : -1);
    }, { passive: true });
}

registerTab("tab-catalog", { render: renderCatalog, title: "Catalog", icon: "notebook", group: "grades" });
