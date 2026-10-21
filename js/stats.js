/* urNotes · Statistici.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== STATISTICI ==================== */
/*
 * Pagina are cinci secțiuni (Acum · Obiective · Materii · Note · Timp) cu un meniu lipit sus.
 * „Acum” și „Obiective” arată mereu situația de azi; „Materii”, „Note” și „Timp” urmează perioada aleasă
 * (tot anul, ultimele 30 de zile sau un modul). Toate cifrele vin din aceleași calcule ca restul aplicației.
 */
const TREND_WINDOW_DAYS = 21;
const TREND_STABLE = 0.05;
const STATS_SECTIONS = [
    { id: "sec-now", label: "Acum" },
    { id: "sec-goals", label: "Obiective" },
    { id: "sec-subjects", label: "Materii" },
    { id: "sec-grades", label: "Note" },
    { id: "sec-time", label: "Timp" }
];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const avgOfGrades = list => list.reduce((s, g) => s + Number(g.val), 0) / list.length;
const pctPos = v => `${Math.max(0, Math.min(100, ((v - 1) / 9) * 100)).toFixed(2)}%`;

/* ---------- perioada analizată ---------- */
function statsPeriods() {
    const p = metrics.purtare || purtareInfo();
    return [
        { id: "year", label: "Tot anul" },
        { id: "30d", label: "Ultimele 30 de zile" },
        ...p.modules.map(m => ({ id: `m${m.n}`, label: `Modulul ${m.n}${m.status === "current" ? " · acum" : ""}`, disabled: m.status === "upcoming" }))
    ];
}

function currentPeriod() {
    const ok = statsPeriods().find(p => p.id === ui.statsPeriod && !p.disabled);
    return ok ? ok.id : "year";
}

function periodRange(id = currentPeriod()) {
    const today = getLocalDateKey();
    if (id === "30d") return { from: addDays(today, -29), to: today };
    const m = /^m([1-5])$/.exec(id);
    if (m) {
        const mod = state.settings.modules[Number(m[1]) - 1];
        return { from: mod.start, to: mod.end < today ? mod.end : today };
    }
    return null;
}

function periodLabel(id = currentPeriod()) {
    return statsPeriods().find(p => p.id === id)?.label.replace(" · acum", "") || "Tot anul";
}

const inRange = (g, range) => !range || Boolean(g.date && g.date >= range.from && g.date <= range.to);

function periodSubjects(range) {
    if (!range) return state.subjects;
    return Object.fromEntries(Object.entries(state.subjects).map(([mat, sub]) => [mat, { ...sub, grades: sub.grades.filter(g => inRange(g, range)) }]));
}

/* ---------- calcule ---------- */
/**
 * Evoluția mediei generale, reconstruită din datele notelor (nu doar din zilele în care a fost deschisă aplicația).
 * Un punct pentru fiecare zi cu note; notele fără dată contează de la început.
 */
function averageTimeline() {
    const today = getLocalDateKey();
    const dates = new Set();
    Object.values(state.subjects).forEach(sub => sub.grades.forEach(g => {
        if (g.date && g.date <= today) dates.add(g.date);
    }));
    return [...dates].sort().slice(-60).map(date => {
        const subset = Object.fromEntries(Object.entries(state.subjects).map(([mat, sub]) => [
            mat, { ...sub, grades: sub.grades.filter(g => !g.date || g.date <= date) }
        ]));
        return { date, avg: calculateMetrics(subset).rawGlobalAvg };
    }).filter(p => p.avg > 0);
}

/** Cum s-a schimbat media generală: față de acum 30 de zile sau, dacă nu există, față de primul punct. */
function generalChange(timeline) {
    if (timeline.length < 2 || metrics.rawGlobalAvg <= 0) return null;
    const cutoff = addDays(getLocalDateKey(), -30);
    const past = [...timeline].reverse().find(p => p.date <= cutoff);
    const base = past || timeline[0];
    return { delta: metrics.rawGlobalAvg - base.avg, label: past ? "în ultimele 30 de zile" : `față de ${shortDayLabel(base.date)}` };
}

/**
 * Tendința unei materii: media de acum față de media de acum 3 săptămâni;
 * dacă toate notele sunt recente (sau toate vechi), față de media dinaintea ultimei note.
 */
function subjectTrend(sub) {
    const chrono = gradesChrono(sub).map(x => x.g);
    if (chrono.length < 2) return null;
    const cutoff = addDays(getLocalDateKey(), -TREND_WINDOW_DAYS);
    const older = chrono.filter(g => !g.date || g.date < cutoff);
    const now = avgOfGrades(chrono);
    if (older.length && older.length < chrono.length) {
        return { delta: now - avgOfGrades(older), basis: "față de acum 3 săptămâni" };
    }
    return { delta: now - avgOfGrades(chrono.slice(0, -1)), basis: "față de dinaintea ultimei note" };
}

function trendDirection(trend) {
    if (!trend) return "none";
    return trend.delta >= TREND_STABLE ? "up" : trend.delta <= -TREND_STABLE ? "down" : "flat";
}

function trendChipHTML(trend) {
    const dir = trendDirection(trend);
    if (dir === "none") return `<span class="trend-chip is-none" title="Tendința apare de la a doua notă">—</span>`;
    const sign = trend.delta > 0 ? "+" : "−";
    const icon = { up: "▲", down: "▼", flat: "■" }[dir];
    const text = dir === "flat" ? "stabil" : `${sign}${Math.abs(trend.delta).toFixed(2)}`;
    return `<span class="trend-chip is-${dir}" title="${escapeHTML(trend.basis)}"><span aria-hidden="true">${icon}</span> ${text}</span>`;
}

/** Starea unei materii: risc → sub țintă → la țintă (cu iconiță și text, nu doar culoare). */
function subjectStanding(sub, d) {
    if (!sub.grades.length) return { key: "none", label: "Fără note", icon: "○" };
    if (d.exactAvg < state.settings.calc.riskThreshold) return { key: "risk", label: "Risc", icon: "!" };
    if (!reachesTarget(d, sub.target)) return { key: "below", label: "Sub țintă", icon: "↓" };
    return { key: "ok", label: "La țintă", icon: "✓" };
}

function statsEntries(subs = state.subjects, m = metrics) {
    return Object.entries(subs).map(([mat, sub]) => ({
        mat,
        sub,
        d: m.subjects[mat],
        trend: subjectTrend(sub),
        standing: subjectStanding(sub, m.subjects[mat])
    }));
}

const STANDING_RANK = { risk: 0, below: 1, ok: 2, none: 3 };
const STATS_SORTS = {
    attention: (a, b) => STANDING_RANK[a.standing.key] - STANDING_RANK[b.standing.key]
        || (a.standing.key === "below" ? targetGap(b) - targetGap(a) : a.d.rawAvg - b.d.rawAvg)
        || a.mat.localeCompare(b.mat, "ro"),
    "avg-desc": (a, b) => b.d.rawAvg - a.d.rawAvg || a.mat.localeCompare(b.mat, "ro"),
    trend: (a, b) => (a.trend?.delta ?? 0) - (b.trend?.delta ?? 0) || a.mat.localeCompare(b.mat, "ro"),
    name: (a, b) => a.mat.localeCompare(b.mat, "ro")
};

function targetGap(e) {
    return (Number.isInteger(e.sub.target) ? e.sub.target - 0.5 : e.sub.target) - e.d.rawAvg;
}

/** Cât trage fiecare materie media generală în sus sau în jos: media fără ea, comparată cu media cu ea. */
function subjectImpacts(subs, m) {
    if (m.rawGlobalAvg <= 0) return [];
    return Object.entries(subs)
        .filter(([, sub]) => sub.grades.length && !sub.excludeFromGPA)
        .map(([mat, sub]) => {
            const without = calculateMetrics({ ...subs, [mat]: { ...sub, excludeFromGPA: true } }).rawGlobalAvg;
            return { mat, avg: m.subjects[mat].rawAvg, impact: without > 0 ? m.rawGlobalAvg - without : 0, without };
        })
        .filter(x => x.without > 0)
        .sort((a, b) => b.impact - a.impact);
}

/** Toate notele (cu materia lor), în ordine cronologică; notele fără dată primele. */
function allGradesChrono(subs) {
    const list = [];
    Object.entries(subs).forEach(([mat, sub]) => sub.grades.forEach((g, i) => list.push({ mat, g, i })));
    return list.sort((a, b) => (a.g.date || "").localeCompare(b.g.date || "") || a.mat.localeCompare(b.mat, "ro") || a.i - b.i);
}

function typeBreakdown(subs) {
    const map = new Map();
    Object.values(subs).forEach(sub => sub.grades.forEach(g => {
        const t = GRADE_TYPES.includes(g.type) ? g.type : "Altele";
        const x = map.get(t) || { n: 0, sum: 0, tens: 0 };
        x.n++;
        x.sum += Number(g.val);
        if (Number(g.val) === 10) x.tens++;
        map.set(t, x);
    }));
    return [...map.entries()].map(([type, x]) => ({ type, n: x.n, avg: x.sum / x.n, tens: x.tens })).sort((a, b) => b.n - a.n || b.avg - a.avg);
}

/** Cu cât a mutat fiecare notă media materiei ei (față de media dinaintea ei). */
function gradeDeltas(subs) {
    const deltas = new Map();
    Object.values(subs).forEach(sub => {
        const chrono = gradesChrono(sub).map(x => x.g);
        let sum = 0;
        chrono.forEach((g, k) => {
            const before = k ? sum / k : null;
            sum += Number(g.val);
            deltas.set(g, before === null ? null : sum / (k + 1) - before);
        });
    });
    return deltas;
}

function gradeRecords(subs) {
    const all = allGradesChrono(subs);
    if (all.length < 2) return null;
    const today = getLocalDateKey();
    let run9 = 0, best9 = 0, run10 = 0, best10 = 0;
    all.forEach(({ g }) => {
        const v = Number(g.val);
        run9 = v >= 9 ? run9 + 1 : 0;
        run10 = v === 10 ? run10 + 1 : 0;
        best9 = Math.max(best9, run9);
        best10 = Math.max(best10, run10);
    });

    const byMonth = new Map();
    const byDay = new Map();
    all.forEach(({ g }) => {
        if (!g.date) return;
        const mk = g.date.slice(0, 7);
        byMonth.set(mk, [...(byMonth.get(mk) || []), g]);
        byDay.set(g.date, (byDay.get(g.date) || 0) + 1);
    });
    const bestMonth = [...byMonth.entries()].filter(([, l]) => l.length >= 2)
        .map(([k, l]) => ({ k, avg: avgOfGrades(l), n: l.length })).sort((a, b) => b.avg - a.avg)[0] || null;
    const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];

    const counts = Object.entries(subs).map(([mat, sub]) => ({ mat, n: sub.grades.length })).sort((a, b) => b.n - a.n);
    const deltas = gradeDeltas(subs);
    let jump = null;
    all.forEach(({ mat, g }) => {
        const d = deltas.get(g);
        if (d !== null && d !== undefined && (!jump || d > jump.delta)) jump = { mat, g, delta: d };
    });
    const lastDated = [...all].reverse().find(x => x.g.date);

    return {
        best9,
        best10,
        bestMonth,
        busiest: busiest && busiest[1] >= 2 ? { date: busiest[0], n: busiest[1] } : null,
        topSubject: counts[0]?.n ? counts[0] : null,
        jump: jump && jump.delta > 0 ? jump : null,
        sinceLast: lastDated ? daysBetween(lastDated.g.date, today) : null,
        lastDated
    };
}

/** Media generală pe fiecare modul început (din notele cu dată din intervalul modulului). */
function moduleAverages() {
    const p = metrics.purtare || purtareInfo();
    return p.modules.map(m => {
        if (m.status === "upcoming") return { ...m, avg: null, grades: 0 };
        const subs = periodSubjects({ from: m.start, to: m.end });
        const mm = calculateMetrics(subs);
        return { ...m, avg: mm.rawGlobalAvg || null, grades: mm.totalGrades };
    });
}

function weekdayStats(subs) {
    const map = new Map();
    Object.values(subs).forEach(sub => sub.grades.forEach(g => {
        if (!g.date) return;
        const wd = parseDateKey(g.date).getDay();
        const x = map.get(wd) || { n: 0, sum: 0 };
        x.n++;
        x.sum += Number(g.val);
        map.set(wd, x);
    }));
    return WEEKDAY_ORDER
        .filter(wd => wd >= 1 && wd <= 5 || map.has(wd))
        .map(wd => ({ wd, n: map.get(wd)?.n || 0, avg: map.get(wd) ? map.get(wd).sum / map.get(wd).n : null }));
}

/**
 * „Ce-ar fi dacă”: adaugă la fiecare materie notele care îi lipsesc până la minim, toate cu valoarea `v`.
 * Fără note lipsă, adaugă câte o notă la fiecare materie.
 */
function whatIfSubjects(v) {
    const missingTotal = Object.keys(state.subjects).reduce((n, mat) => n + metrics.subjects[mat].requiredNotes, 0);
    const subs = Object.fromEntries(Object.entries(state.subjects).map(([mat, sub]) => {
        const k = missingTotal > 0 ? metrics.subjects[mat].requiredNotes : 1;
        return [mat, { ...sub, grades: [...sub.grades, ...Array.from({ length: k }, () => ({ val: v, type: "Test" }))] }];
    }));
    return { subs, added: missingTotal > 0 ? missingTotal : Object.keys(state.subjects).length, mode: missingTotal > 0 ? "missing" : "one-each" };
}

function whatIfNeededForTarget() {
    const target = state.settings.goals.targetGPA;
    for (let v = 1; v <= 10.0001; v += 0.1) {
        const r = calculateMetrics(whatIfSubjects(Math.round(v * 10) / 10).subs);
        if (r.rawGlobalAvg >= target - 0.005) return Math.round(v * 10) / 10;
    }
    return null;
}

/** Ritmul (note pe săptămână) și când ajungi la o țintă de număr de note. */
function paceTo(count, target, filter = () => true) {
    const dated = Object.values(state.subjects).flatMap(sub => sub.grades.filter(g => g.date && filter(g)));
    if (count >= target) return { done: true };
    if (dated.length < 2) return null;
    const first = dated.map(g => g.date).sort()[0];
    const weeks = Math.max(1, daysBetween(first, getLocalDateKey()) / 7);
    const rate = dated.length / weeks;
    if (rate <= 0) return null;
    const weeksLeft = (target - count) / rate;
    const eta = addDays(getLocalDateKey(), Math.ceil(weeksLeft * 7));
    const yearEnd = state.settings.modules[4].end;
    return { rate, eta, beforeYearEnd: eta <= yearEnd, needRate: Math.max(0, (target - count) / Math.max(1, daysBetween(getLocalDateKey(), yearEnd) / 7)) };
}

/** Concluziile, în ordinea importanței. Fiecare are o materie la care duce (dacă e cazul). */
function buildInsights(entries) {
    const items = [];
    const risk = state.settings.calc.riskThreshold;
    const graded = entries.filter(e => e.sub.grades.length);

    entries.filter(e => e.standing.key === "risk").sort((a, b) => a.d.rawAvg - b.d.rawAvg).forEach(e => {
        const plan = planForCondition(e.mat, d => d.exactAvg >= risk);
        const text = plan.impossible
            ? "Media nu mai poate trece pragul doar cu note noi în acest an; vorbește cu profesorul despre o recuperare."
            : plan.tens
                ? `Ca să ieși din risc îți trebuie ${plan.tens} note de 10 la rând.`
                : `La următoarea evaluare îți trebuie cel puțin ${plan.next} ca să ieși din risc.`;
        items.push({ tone: "critical", icon: "alert", mat: e.mat, title: `${e.mat}: media ${e.d.exactAvg.toFixed(2)}, sub pragul de risc (${risk.toFixed(2)})`, text });
    });

    entries.filter(e => trendDirection(e.trend) === "down" && e.trend.delta <= -0.3 && e.standing.key !== "risk")
        .sort((a, b) => a.trend.delta - b.trend.delta).slice(0, 2).forEach(e => {
            items.push({ tone: "warning", icon: "trend-down", mat: e.mat, title: `${e.mat} a scăzut cu ${Math.abs(e.trend.delta).toFixed(2)}`, text: `Media e acum ${e.d.exactAvg.toFixed(2)} (${e.trend.basis}).` });
        });

    entries.filter(e => e.standing.key === "below")
        .map(e => ({ e, plan: planForCondition(e.mat, d => reachesTarget(d, e.sub.target)) }))
        .filter(x => x.plan.next && x.plan.next >= 2)
        .sort((a, b) => a.plan.next - b.plan.next).slice(0, 2).forEach(({ e, plan }) => {
            items.push({ tone: "info", icon: "target", mat: e.mat, title: `${e.mat}: un ${plan.next} te aduce la ținta ${fmtTarget(e.sub.target)}`, text: `Media ar urca de la ${e.d.exactAvg.toFixed(2)} cu o singură notă de cel puțin ${plan.next}.` });
        });

    const missing = entries.filter(e => e.d.requiredNotes > 0).sort((a, b) => b.d.requiredNotes - a.d.requiredNotes || b.sub.ore - a.sub.ore);
    const totalMissing = missing.reduce((n, e) => n + e.d.requiredNotes, 0);
    if (totalMissing > 0) {
        const top = missing.slice(0, 3).map(e => `${e.mat} (${e.d.requiredNotes})`).join(", ");
        const none = entries.filter(e => !e.sub.grades.length).length;
        items.push({ tone: "info", icon: "note", mat: missing[0].mat, title: `Îți lipsesc ${plural(totalMissing, "notă", "note")} până la minimul de note`, text: `${none ? `${plural(none, "materie nu are", "materii nu au")} încă nicio notă. ` : ""}Cele mai multe lipsesc la ${top}.` });
    }

    entries.filter(e => trendDirection(e.trend) === "up" && e.trend.delta >= 0.3)
        .sort((a, b) => b.trend.delta - a.trend.delta).slice(0, 1).forEach(e => {
            items.push({ tone: "good", icon: "trend-up", mat: e.mat, title: `${e.mat} crește: +${e.trend.delta.toFixed(2)}`, text: `Media e acum ${e.d.exactAvg.toFixed(2)} (${e.trend.basis}). Continuă așa!` });
        });

    const best = [...graded].sort((a, b) => b.d.rawAvg - a.d.rawAvg)[0];
    if (best && best.d.exactAvg >= 9) {
        items.push({ tone: "good", icon: "star", mat: best.mat, title: `Cea mai bună materie: ${best.mat}`, text: `Media ${best.d.exactAvg.toFixed(2)}.` });
    }

    const purtare = metrics.purtare;
    if (purtare && purtare.value < 10) {
        items.push({ tone: "warning", icon: "medal", mat: PURTARE_KEY, title: `Purtarea e ${purtare.value} în ${purtare.current ? `Modulul ${purtare.current.n}` : "ultimul modul"}`, text: "Se reînnoiește la 10 la începutul modulului următor." });
    }

    return items.slice(0, 6);
}

/* ---------- animație: cifrele urcă, barele cresc (doar la deschiderea tabului / schimbarea perioadei) ---------- */
function countUpHTML(value, decimals = 0, extraClass = "") {
    const v = Number(value);
    return `<span class="count-up ${extraClass}" data-count="${v}" data-decimals="${decimals}">${v.toFixed(decimals)}</span>`;
}

function runStatsAnimations(root) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.remove("is-animating");
    void root.offsetWidth; // repornește animațiile CSS
    root.classList.add("is-animating");
    clearTimeout(runStatsAnimations.timer);
    runStatsAnimations.timer = setTimeout(() => root.classList.remove("is-animating"), 1400);

    const nodes = [...root.querySelectorAll(".count-up")];
    const start = performance.now();
    const duration = 750;
    const step = now => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        nodes.forEach(el => {
            const target = Number(el.dataset.count);
            el.textContent = (target * ease).toFixed(Number(el.dataset.decimals));
        });
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/* ---------- randare ---------- */
function renderStatistics() {
    const body = $("stats-body");
    if (!body) return;
    const year = statsEntries();
    const hasSubjects = year.length > 0;
    $("stats-empty").hidden = hasSubjects;
    body.hidden = !hasSubjects;
    $("stats-nav").hidden = !hasSubjects;
    if (!hasSubjects) {
        ["chartStatTrend", "chartStatDistributie"].forEach(destroyChart);
        return;
    }

    const period = currentPeriod();
    const range = periodRange(period);
    const subs = periodSubjects(range);
    const pm = range ? calculateMetrics(subs) : metrics;
    const timeline = averageTimeline();

    renderStatsNav(period);
    renderStatsHero(timeline);
    renderStatsKpis(year);
    renderStatsInsights(year);
    renderStatsTrends(year);
    renderStatsBrief();
    renderStatsGoals();
    renderStatsWhatIf();
    document.querySelectorAll(".period-badge").forEach(el => { el.innerHTML = `${icon("calendar")} ${escapeHTML(periodLabel(period))}`; });
    renderStatsSubjects(statsEntries(subs, pm), { range });
    renderStatsImpact(subs, pm);
    renderStatsTypes(subs);
    renderStatsRecords(subs);
    renderStatsRecent(subs);
    renderStatsModules(period);
    renderStatsWeekdays(subs);
    renderStatsHeatmap(range);
    renderStatsCharts(timeline, range, pm);

    if (ui.statsAnimate) {
        ui.statsAnimate = false;
        runStatsAnimations(body);
    }
}

function renderStatsNav(period) {
    const sel = $("stats-period");
    if (sel) {
        sel.innerHTML = statsPeriods().map(p => `<option value="${p.id}" ${p.id === period ? "selected" : ""} ${p.disabled ? "disabled" : ""}>${escapeHTML(p.label)}${p.disabled ? " (urmează)" : ""}</option>`).join("");
    }
}

function renderStatsHero(timeline) {
    const s = state.settings;
    const avg = metrics.globalAvg;
    const has = avg > 0;
    const target = s.goals.targetGPA;
    const change = generalChange(timeline);
    const gap = target - metrics.rawGlobalAvg;
    const purtare = metrics.purtare;
    const dir = change ? trendDirection(change) : "none";

    let verdict;
    if (!has) verdict = "Adaugă prima notă ca să-ți vezi media generală.";
    else if (gap <= 0.004) verdict = `✓ Ești la ținta de ${target.toFixed(2)}.`;
    else verdict = `Îți lipsesc ${gap.toFixed(2)} puncte până la ținta de ${target.toFixed(2)}.`;

    $("stats-hero").innerHTML = `
        <span class="kpi-title">Media generală</span>
        <div class="stats-hero-row">
            <b class="stats-hero-value ${has ? "" : "is-empty"}">${has ? countUpHTML(avg, 2) : "–"}</b>
            ${change ? `<span class="trend-chip is-${dir}" title="${escapeHTML(change.label)}">
                <span aria-hidden="true">${dir === "up" ? "▲" : dir === "down" ? "▼" : "■"}</span>
                ${dir === "flat" ? "stabilă" : `${change.delta > 0 ? "+" : "−"}${Math.abs(change.delta).toFixed(2)}`}
                <small>${escapeHTML(change.label)}</small></span>` : ""}
        </div>
        <p class="stats-hero-verdict">${escapeHTML(verdict)}</p>
        <div class="stats-meter" role="img" aria-label="${escapeHTML(has ? `Media ${avg.toFixed(2)} din 10; ținta ${target.toFixed(2)}; pragul de risc ${s.calc.riskThreshold.toFixed(2)}` : "Încă fără medie")}">
            <span class="stats-meter-risk" style="width:${pctPos(s.calc.riskThreshold)}"></span>
            ${has ? `<span class="stats-meter-fill anim-grow" style="width:${pctPos(metrics.rawGlobalAvg)}"></span>` : ""}
            <span class="stats-meter-target" style="left:${pctPos(target)}"></span>
        </div>
        <div class="stats-meter-scale" aria-hidden="true"><span>1</span><span>5</span><span>10</span></div>
        <p class="stats-hero-foot">
            ${escapeHTML(s.calc.method === "weighted" ? "Ponderată după ore" : "Media aritmetică")}
            ${state.purtare.excludeFromGPA ? "" : ` · include purtarea (${purtare?.value ?? 10})`}
            · <span class="legend-swatch is-risk"></span> risc sub ${s.calc.riskThreshold.toFixed(2)}
            · <span class="legend-swatch is-target"></span> ținta
        </p>`;
}

function renderStatsKpis(entries) {
    const risk = entries.filter(e => e.standing.key === "risk");
    const missing = entries.reduce((n, e) => n + e.d.requiredNotes, 0);
    const recentFrom = addDays(getLocalDateKey(), -30);
    const recent = entries.reduce((n, e) => n + e.sub.grades.filter(g => g.date && g.date >= recentFrom).length, 0);
    const share = metrics.totalGrades ? Math.round((metrics.tensCount / metrics.totalGrades) * 100) : 0;
    const tile = (title, value, caption, tone = "") => `
        <div class="glass-card stats-kpi ${tone}">
            <span class="kpi-title">${title}</span>
            <b>${countUpHTML(value)}</b>
            <small>${caption}</small>
        </div>`;

    $("stats-kpis").innerHTML = [
        tile("În risc", risk.length, risk.length ? escapeHTML(risk.slice(0, 2).map(e => e.mat).join(", ") + (risk.length > 2 ? "…" : "")) : "nicio materie", risk.length ? "is-danger" : "is-ok"),
        tile("Note lipsă", missing, missing ? "până la minimul pe materii" : "✓ minimul atins peste tot", missing ? "is-warn" : "is-ok"),
        tile("Note", metrics.totalGrades, recent ? `${plural(recent, "adăugată", "adăugate")} în ultimele 30 de zile` : "niciuna în ultimele 30 de zile"),
        tile("Note de 10", metrics.tensCount, metrics.totalGrades ? `${share}% din toate notele` : "încă niciuna")
    ].join("");
}

function renderStatsInsights(entries) {
    const items = buildInsights(entries);
    const list = $("stats-insights");
    if (items.length === 0) {
        list.innerHTML = `<li class="insight is-good"><span class="insight-icon" aria-hidden="true">${icon("sparkles")}</span>
            <span class="insight-main"><b>Totul arată bine</b><small>Nicio materie în risc și minimul de note e atins.</small></span></li>`;
        return;
    }
    const shown = ui.statsAllInsights ? items : items.slice(0, INSIGHTS_SHOWN);
    list.innerHTML = shown.map((it, i) => `
        <li class="insight is-${it.tone} anim-rise" style="--i:${i}">
            <span class="insight-icon" aria-hidden="true">${icon(it.icon)}</span>
            <span class="insight-main"><b>${escapeHTML(it.title)}</b><small>${escapeHTML(it.text)}</small></span>
            ${it.mat ? `<button type="button" class="btn btn-text insight-go" data-action="open-subject" data-mat="${escapeHTML(it.mat)}"
                aria-label="${escapeHTML(`Deschide ${it.mat === PURTARE_KEY ? "Purtare" : it.mat} în catalog`)}">Deschide →</button>` : ""}
        </li>`).join("") + (items.length > INSIGHTS_SHOWN ? `
        <li class="insights-more"><button type="button" class="btn btn-text" data-action="stats-insights-more" aria-expanded="${Boolean(ui.statsAllInsights)}">
            ${ui.statsAllInsights ? "Arată mai puține" : `Arată toate (încă ${items.length - INSIGHTS_SHOWN})`}</button></li>` : "");
}

const INSIGHTS_SHOWN = 4;

/** „Pe scurt”: câteva repere de azi, mereu utile (și când tendințele încă nu există). */
function renderStatsBrief() {
    const box = $("stats-brief");
    if (!box) return;
    const today = getLocalDateKey();
    const links = gradeLinks();
    const rows = [];
    const next = occurrencesBetween(today, addDays(today, 60)).find(o => NEEDS_GRADE.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links));
    rows.push(["Următoarea evaluare", next
        ? `<button type="button" class="brief-link" data-action="cal-goto" data-date="${next.date}">${escapeHTML(next.ev.title)}</button> <small>${escapeHTML(dayWord(next.date, today))}</small>`
        : `<small>nimic în următoarele 60 de zile</small>`]);
    const graded = Object.entries(state.subjects).filter(([, sub]) => sub.grades.length).map(([mat]) => ({ mat, avg: metrics.subjects[mat].exactAvg }));
    if (graded.length) {
        const best = graded.reduce((a, b) => (b.avg > a.avg ? b : a));
        const worst = graded.reduce((a, b) => (b.avg < a.avg ? b : a));
        const link = e => `<button type="button" class="brief-link" data-action="open-subject" data-mat="${escapeHTML(e.mat)}">${escapeHTML(e.mat)}</button> <b class="brief-num tone-${gradeTone(e.avg)}">${e.avg.toFixed(2)}</b>`;
        rows.push(["Cea mai bună medie", link(best)]);
        if (worst.mat !== best.mat) rows.push(["Cea mai slabă medie", link(worst)]);
        let last = null;
        Object.entries(state.subjects).forEach(([mat, sub]) => sub.grades.forEach(g => {
            if (g.date && (!last || g.date > last.g.date)) last = { mat, g };
        }));
        if (last) rows.push(["Ultima notă", `<b class="brief-num tone-${gradeTone(Number(last.g.val))}">${escapeHTML(last.g.val)}</b> la ${escapeHTML(last.mat)} <small>${escapeHTML(relativeDayLabel(last.g.date))}</small>`]);
    } else {
        rows.push(["Note", "<small>încă nicio notă</small>"]);
    }
    const p = metrics.purtare;
    rows.push(["Purtare", `<b class="brief-num">${p ? p.value : 10}</b>${p?.current ? ` <small>Modulul ${p.current.n}</small>` : ""}`]);
    box.innerHTML = rows.map(([k, v]) => `<div class="brief-row"><dt>${k}</dt><dd>${v}</dd></div>`).join("")
        + ($("stats-trends")?.closest(".glass-card")?.hidden ? `<p class="subtitle brief-note">${icon("arrows-v")} Tendințele (ce urcă, ce coboară) apar când o materie are cel puțin două note.</p>` : "");
}

function renderStatsTrends(entries) {
    const withTrend = entries.filter(e => e.trend);
    const up = withTrend.filter(e => trendDirection(e.trend) === "up").sort((a, b) => b.trend.delta - a.trend.delta);
    const down = withTrend.filter(e => trendDirection(e.trend) === "down").sort((a, b) => a.trend.delta - b.trend.delta);
    const flat = withTrend.filter(e => trendDirection(e.trend) === "flat").length;
    const col = (title, list, empty) => `
        <div class="trend-col">
            <h4>${title}</h4>
            ${list.length ? `<ul>${list.slice(0, 4).map(e => `
                <li><button type="button" class="trend-row" data-action="open-subject" data-mat="${escapeHTML(e.mat)}">
                    <span class="trend-row-name">${escapeHTML(e.mat)}</span>
                    <span class="trend-row-avg">${e.d.exactAvg.toFixed(2)}</span>
                    ${trendChipHTML(e.trend)}
                </button></li>`).join("")}</ul>` : `<p class="muted-small">${empty}</p>`}
        </div>`;

    // Fără tendințe, cardul ar fi doar o propoziție: îl ascundem, iar „Pe scurt” spune când apar.
    $("stats-trends").closest(".glass-card").hidden = withTrend.length === 0;
    $("stats-trends").innerHTML = withTrend.length === 0
        ? `<p class="muted-small stats-trends-empty">Tendințele apar când o materie are cel puțin două note. Fiecare materie e comparată cu media ei de acum 3 săptămâni.</p>`
        : `${col(`${icon("trend-up")} În creștere`, up, "Nicio materie în creștere.")}
           ${col(`${icon("trend-down")} În scădere`, down, "Nicio materie în scădere.")}
           <p class="subtitle trend-foot">${flat ? `${plural(flat, "materie stabilă", "materii stabile")} · ` : ""}comparat cu media de acum 3 săptămâni (sau dinaintea ultimei note)</p>`;
}

/* ---------- Obiective ---------- */
function ringHTML(pct, { label, value, sub, primary = false, tone = "" }) {
    const r = 34;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, pct));
    return `
        <div class="goal ${primary ? "is-primary" : ""} ${tone}">
            <svg class="goal-ring" viewBox="0 0 84 84" role="img" aria-label="${escapeHTML(`${label}: ${Math.round(p * 100)}%`)}">
                <circle class="goal-track" cx="42" cy="42" r="${r}"/>
                <circle class="goal-arc" cx="42" cy="42" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" style="--c:${c.toFixed(2)}"/>
                <text x="42" y="47" text-anchor="middle" class="goal-pct">${Math.round(p * 100)}%</text>
            </svg>
            <div class="goal-text">
                <span class="kpi-title">${label}${primary ? ' <span class="goal-star" title="Obiectivul principal din Setări">★</span>' : ""}</span>
                <b>${value}</b>
                <small>${sub}</small>
            </div>
        </div>`;
}

function renderStatsGoals() {
    const s = state.settings;
    const primary = s.goals.primary;
    const avg = metrics.rawGlobalAvg;
    const tens = metrics.tensCount;
    const evals = metrics.totalGrades;
    const paceTens = paceTo(tens, s.targets.tens, g => Number(g.val) === 10);
    const paceEvals = paceTo(evals, s.targets.evals);
    const paceText = (pace, unit) => {
        if (!pace) return "ritmul apare după câteva note cu dată";
        if (pace.done) return "✓ ținta e atinsă";
        return pace.beforeYearEnd
            ? `la ritmul actual o atingi pe ${shortDayLabel(pace.eta)}`
            : `la ritmul actual nu ajungi până în iunie; îți trebuie ~${pace.needRate.toFixed(1)} ${unit}/săpt.`;
    };

    $("stats-goals").innerHTML = [
        ringHTML(avg > 0 ? (avg - 1) / (s.goals.targetGPA - 1 || 1) : 0, {
            label: "Media generală", primary: primary === "gpa",
            value: `${avg > 0 ? countUpHTML(metrics.globalAvg, 2) : "–"} <span class="sim-round">/ ${s.goals.targetGPA.toFixed(2)}</span>`,
            sub: avg <= 0 ? "încă fără medie" : avg >= s.goals.targetGPA ? "✓ ținta e atinsă" : avg < s.goals.minGPA ? `sub minimul acceptat (${s.goals.minGPA.toFixed(2)})` : `peste minimul de ${s.goals.minGPA.toFixed(2)}`,
            tone: avg > 0 && avg < s.goals.minGPA ? "is-warn" : ""
        }),
        ringHTML(tens / s.targets.tens, {
            label: "Note de 10", primary: primary === "tens",
            value: `${countUpHTML(tens)} <span class="sim-round">/ ${s.targets.tens}</span>`,
            sub: escapeHTML(paceText(paceTens, "note de 10"))
        }),
        ringHTML(evals / s.targets.evals, {
            label: "Evaluări", primary: primary === "evals",
            value: `${countUpHTML(evals)} <span class="sim-round">/ ${s.targets.evals}</span>`,
            sub: escapeHTML(paceText(paceEvals, "note"))
        })
    ].join("");
}

/* ---------- Ce-ar fi dacă ---------- */
function renderStatsWhatIf() {
    const slider = $("whatif-range");
    if (!slider) return;
    if (!slider.dataset.bound) {
        slider.dataset.bound = "1";
        slider.addEventListener("input", () => updateWhatIf());
    }
    updateWhatIf();
}

function updateWhatIf() {
    const slider = $("whatif-range");
    const v = Number(slider.value);
    const { subs, added, mode } = whatIfSubjects(v);
    const r = calculateMetrics(subs);
    const now = metrics.rawGlobalAvg;
    const delta = now > 0 ? r.rawGlobalAvg - now : null;
    const riskNow = Object.values(metrics.subjects).filter(d => d.exactAvg > 0 && d.exactAvg < state.settings.calc.riskThreshold).length;
    const riskThen = Object.values(r.subjects).filter(d => d.exactAvg > 0 && d.exactAvg < state.settings.calc.riskThreshold).length;
    const needed = whatIfNeededForTarget();
    const target = state.settings.goals.targetGPA;
    slider.style.setProperty("--p", `${((v - slider.min) / (slider.max - slider.min)) * 100}%`);

    setText("whatif-value", v % 1 ? v.toFixed(1) : String(v));
    $("whatif-question").innerHTML = mode === "missing"
        ? `…iei în medie <b>${v % 1 ? v.toFixed(1) : v}</b> la cele <b>${added}</b> note care îți lipsesc până la minim`
        : `…iei <b>${v % 1 ? v.toFixed(1) : v}</b> la următoarea notă, la fiecare dintre cele ${added} materii`;
    $("whatif-result").innerHTML = `
        <div class="whatif-big">
            <span class="kpi-title">Media generală ar fi</span>
            <b>${r.rawGlobalAvg > 0 ? roundValue(r.rawGlobalAvg, Number(state.settings.calc.rounding)).toFixed(2) : "–"}</b>
            ${delta !== null ? `<span class="trend-chip is-${delta >= TREND_STABLE ? "up" : delta <= -TREND_STABLE ? "down" : "flat"}">${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)} față de acum</span>` : ""}
        </div>
        <div class="whatif-facts">
            <span><b>${riskThen}</b> ${riskThen === 1 ? "materie" : "materii"} în risc <small>(acum ${riskNow})</small></span>
            <span>${needed === null
                ? `Ținta de ${target.toFixed(2)} nu se atinge doar cu aceste note.`
                : needed <= 1 ? `Ținta de ${target.toFixed(2)} rămâne atinsă orice ai lua.` : `Pentru ținta de ${target.toFixed(2)}: media <b>${needed.toFixed(1)}</b> la aceste note.`}</span>
        </div>`;
}

/* ---------- Materii ---------- */
function sparklineSVG(sub) {
    const chrono = gradesChrono(sub).map(x => Number(x.g.val));
    if (chrono.length < 2) return `<span class="spark is-empty" aria-hidden="true"></span>`;
    const W = 64, H = 22;
    let sum = 0;
    const running = chrono.map((v, i) => (sum += v) / (i + 1));
    // Scara proprie (minim 1 punct), ca direcția să se vadă și când diferențele sunt mici.
    let lo = Math.min(...running), hi = Math.max(...running);
    if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
    const pts = running.map((a, i) => [(i / (running.length - 1)) * (W - 4) + 2, H - 2 - ((a - lo) / (hi - lo)) * (H - 4)]);
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}"/>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5"/>
    </svg>`;
}

function renderStatsSubjects(entries, { range = null } = {}) {
    const sort = STATS_SORTS[ui.statsSort] ? ui.statsSort : "attention";
    const sel = $("stats-sort");
    if (sel && sel.value !== sort) sel.value = sort;

    const graded = entries.filter(e => e.sub.grades.length).sort(STATS_SORTS[sort]);
    const none = entries.filter(e => !e.sub.grades.length).sort(STATS_SORTS.name);
    const risk = state.settings.calc.riskThreshold;

    const row = ({ mat, sub, d, trend, standing }, i) => `
        <li class="anim-rise" style="--i:${i}">
            <button type="button" class="stat-row is-${standing.key}" data-action="open-subject" data-mat="${escapeHTML(mat)}">
                <span class="stat-row-head">
                    <span class="stat-badge is-${standing.key}" title="${standing.label}"><span aria-hidden="true">${standing.icon}</span><span class="sr-only">${standing.label}</span></span>
                    <span class="stat-row-name">${escapeHTML(mat)}${sub.excludeFromGPA ? ' <span class="cat-tag">exclusă</span>' : ""}</span>
                </span>
                <span class="stat-track" aria-hidden="true">
                    <span class="stat-track-risk" style="width:${pctPos(risk)}"></span>
                    <span class="stat-track-fill anim-grow is-${standing.key}" style="width:${pctPos(d.rawAvg)}"></span>
                    <span class="stat-track-target" style="left:${pctPos(Math.min(10, sub.target))}"></span>
                </span>
                <span class="stat-row-avg"><b>${d.exactAvg.toFixed(2)}</b><small>→ ${d.roundedAvg} · ținta ${fmtTarget(sub.target)}</small></span>
                <span class="stat-row-meta">
                    ${sparklineSVG(sub)}
                    ${range ? "" : trendChipHTML(trend)}
                    <span class="stat-row-count ${!range && d.requiredNotes ? "is-missing" : ""}">${range ? plural(sub.grades.length, "notă", "note") : `${sub.grades.length}/${sub.grades.length + d.requiredNotes} note`}</span>
                </span>
            </button>
        </li>`;

    const p = metrics.purtare;
    const purtareRow = p && !range ? `<li><button type="button" class="stat-row is-purtare" data-action="open-subject" data-mat="${PURTARE_KEY}">
        <span class="stat-row-head"><span class="stat-badge is-purtare" aria-hidden="true">${icon("medal")}</span><span class="stat-row-name">Purtare</span></span>
        <span class="stat-track" aria-hidden="true"><span class="stat-track-fill anim-grow is-${p.value >= 10 ? "ok" : p.value >= 6 ? "below" : "risk"}" style="width:${pctPos(p.avg)}"></span></span>
        <span class="stat-row-avg"><b>${p.avg.toFixed(2)}</b><small>${p.current ? `Modulul ${p.current.n}: ${p.value}` : `ultimul modul: ${p.value}`}</small></span>
        <span class="stat-row-meta"><span class="stat-row-count">${state.purtare.excludeFromGPA ? "exclusă din medie" : "în media generală"}</span></span>
    </button></li>` : "";

    $("stats-subject-list").innerHTML = graded.length
        ? `<ol class="stat-rows">${graded.map(row).join("")}${purtareRow}</ol>`
        : `<p class="muted-small stats-no-graded">${range ? `Nicio notă în perioada „${escapeHTML(periodLabel())}”.` : "Încă nu ai note. Adaugă-le din <b>Materii & Note</b> și aici vei vedea fiecare materie față de ținta ei."}</p>`;

    $("stats-nogrades").innerHTML = none.length ? `
        <div class="nogrades-head">
            <span class="kpi-title">${range ? "Fără note în perioadă" : "Fără note încă"} · ${none.length}</span>
            <button type="button" class="btn btn-text" data-action="add-grade">+ Adaugă notă</button>
        </div>
        <div class="nogrades-chips">
            ${none.map(e => `<button type="button" class="nogrades-chip" data-action="open-subject" data-mat="${escapeHTML(e.mat)}">${escapeHTML(e.mat)}${range ? "" : `<small>${e.d.requiredNotes}</small>`}</button>`).join("")}
        </div>` : "";
}

function renderStatsImpact(subs, pm) {
    const list = subjectImpacts(subs, pm);
    const box = $("stats-impact");
    if (list.length < 2) {
        box.innerHTML = `<p class="muted-small chart-empty is-small">Apare când ai note la cel puțin două materii care intră în medie.</p>`;
        return;
    }
    const max = Math.max(...list.map(x => Math.abs(x.impact)), 0.01);
    const down = list.filter(x => x.impact < -0.005).sort((a, b) => a.impact - b.impact)[0];
    const up = list.filter(x => x.impact > 0.005)[0];

    box.innerHTML = `
        <p class="impact-lead">
            ${down ? `<b>${escapeHTML(down.mat)}</b> trage media în jos cu <b class="impact-neg">${Math.abs(down.impact).toFixed(2)}</b> (fără ea ai avea ${roundValue(down.without, 2).toFixed(2)}).` : "Nicio materie nu trage media în jos."}
            ${up ? ` <b>${escapeHTML(up.mat)}</b> o ridică cel mai mult: <b class="impact-pos">+${up.impact.toFixed(2)}</b>.` : ""}
        </p>
        <ol class="impact-rows">
            ${list.map((x, i) => {
                const w = (Math.abs(x.impact) / max) * 50;
                const sign = x.impact > 0.005 ? "pos" : x.impact < -0.005 ? "neg" : "zero";
                return `
                <li class="anim-rise" style="--i:${i}">
                    <button type="button" class="impact-row" data-action="open-subject" data-mat="${escapeHTML(x.mat)}"
                        aria-label="${escapeHTML(`${x.mat}: ${x.impact >= 0 ? "ridică" : "coboară"} media cu ${Math.abs(x.impact).toFixed(2)}`)}">
                        <span class="impact-name">${escapeHTML(x.mat)}</span>
                        <span class="impact-bar" aria-hidden="true">
                            <span class="impact-mid"></span>
                            <span class="impact-fill is-${sign} anim-grow" style="${sign === "neg" ? `right:50%;` : `left:50%;`}width:${w.toFixed(2)}%"></span>
                        </span>
                        <span class="impact-val is-${sign}">${x.impact >= 0 ? "+" : "−"}${Math.abs(x.impact).toFixed(2)}</span>
                    </button>
                </li>`;
            }).join("")}
        </ol>
        <p class="subtitle impact-legend"><span class="legend-swatch is-neg"></span> trage media în jos · <span class="legend-swatch is-pos"></span> o ridică · cifra = diferența față de media fără materia respectivă</p>`;
}

/* ---------- Note ---------- */
function renderStatsTypes(subs) {
    const list = typeBreakdown(subs);
    const box = $("stats-types");
    if (list.length === 0) {
        box.innerHTML = `<p class="muted-small chart-empty is-small">Nicio notă în perioadă.</p>`;
        return;
    }
    const best = list.length > 1 ? [...list].filter(x => x.n >= 2).sort((a, b) => b.avg - a.avg)[0] : null;
    const worst = list.length > 1 ? [...list].filter(x => x.n >= 2).sort((a, b) => a.avg - b.avg)[0] : null;
    const maxN = Math.max(...list.map(x => x.n));
    box.innerHTML = `
        ${best && worst && best.type !== worst.type ? `<p class="impact-lead">Cel mai bine îți merge la <b>${escapeHTML(best.type)}</b> (${best.avg.toFixed(2)}), cel mai slab la <b>${escapeHTML(worst.type)}</b> (${worst.avg.toFixed(2)}).</p>` : ""}
        <ol class="type-rows">
            ${list.map((x, i) => `
                <li class="type-row anim-rise" style="--i:${i}">
                    <span class="type-name">${escapeHTML(x.type)}<small>${plural(x.n, "notă", "note")}${x.tens ? ` · ${x.tens}× 10` : ""}</small></span>
                    <span class="type-track" aria-hidden="true"><span class="type-fill anim-grow" style="width:${pctPos(x.avg)}"></span></span>
                    <b class="type-avg">${x.avg.toFixed(2)}</b>
                    <span class="type-count" aria-hidden="true"><span style="width:${((x.n / maxN) * 100).toFixed(1)}%"></span></span>
                </li>`).join("")}
        </ol>
        <p class="subtitle impact-legend">bara: media pe scala 1–10 · linia subțire: câte note de acest tip</p>`;
}

function renderStatsRecords(subs) {
    const r = gradeRecords(subs);
    const box = $("stats-records");
    if (!r) {
        box.innerHTML = `<p class="muted-small chart-empty is-small">Recordurile apar de la două note.</p>`;
        return;
    }
    const monthName = k => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
    const tiles = [
        { icon: "flame", value: r.best9, label: "note de 9+ la rând", sub: "cea mai lungă serie" },
        { icon: "award", value: r.best10, label: r.best10 === 1 ? "notă de 10 la rând" : "note de 10 la rând", sub: "cea mai lungă serie de 10" },
        r.jump && { icon: "rocket", value: `+${r.jump.delta.toFixed(2)}`, label: `${r.jump.mat}`, sub: `cel mai mare salt după o notă (${r.jump.g.val}${r.jump.g.date ? `, ${shortDayLabel(r.jump.g.date)}` : ""})`, mat: r.jump.mat },
        r.bestMonth && { icon: "calendar-check", value: r.bestMonth.avg.toFixed(2), label: monthName(r.bestMonth.k), sub: `cea mai bună lună (${plural(r.bestMonth.n, "notă", "note")})` },
        r.busiest && { icon: "zap", value: r.busiest.n, label: weekdayLabel(r.busiest.date), sub: "cele mai multe note într-o zi" },
        r.topSubject && { icon: "notebook", value: r.topSubject.n, label: r.topSubject.mat, sub: "materia cu cele mai multe note", mat: r.topSubject.mat },
        r.sinceLast !== null && { icon: "timer", value: r.sinceLast, label: r.sinceLast === 1 ? "zi de la ultima notă" : "zile de la ultima notă", sub: r.lastDated ? `${r.lastDated.mat}: ${r.lastDated.g.val}` : "" }
    ].filter(Boolean);

    box.innerHTML = tiles.map((t, i) => `
        <${t.mat ? `button type="button" data-action="open-subject" data-mat="${escapeHTML(t.mat)}"` : "div"} class="record anim-rise" style="--i:${i}">
            <span class="record-icon" aria-hidden="true">${icon(t.icon)}</span>
            <b class="record-value">${typeof t.value === "number" ? countUpHTML(t.value) : escapeHTML(t.value)}</b>
            <span class="record-label">${escapeHTML(String(t.label))}</span>
            <small>${escapeHTML(t.sub)}</small>
        </${t.mat ? "button" : "div"}>`).join("");
}

function renderStatsRecent(subs) {
    const deltas = gradeDeltas(state.subjects);
    const list = allGradesChrono(subs).reverse().slice(0, 8);
    const box = $("stats-recent");
    // Cu puține note, Recorduri și Ultimele note stau una sub alta (altfel rămâne o gaură lângă lista scurtă).
    box.closest(".stats-grades-grid")?.classList.toggle("is-stacked", list.length < 4);
    if (list.length === 0) {
        box.innerHTML = `<p class="muted-small chart-empty is-small">Nicio notă în perioadă.</p>`;
        return;
    }
    box.innerHTML = `<ol class="recent-list">${list.map(({ mat, g }, i) => {
        const d = deltas.get(g);
        const dir = d === null || d === undefined ? "none" : d >= TREND_STABLE ? "up" : d <= -TREND_STABLE ? "down" : "flat";
        return `
            <li class="anim-rise" style="--i:${i}">
                <button type="button" class="recent-row" data-action="open-subject" data-mat="${escapeHTML(mat)}">
                    <span class="cat-grade-val tone-${gradeTone(Number(g.val))}">${escapeHTML(g.val)}</span>
                    <span class="recent-main"><b>${escapeHTML(mat)}</b><small>${escapeHTML(`${g.type || "Altele"} · ${g.date ? relativeDayLabel(g.date) : "fără dată"}`)}</small></span>
                    ${dir === "none" ? `<span class="trend-chip is-none" title="Prima notă la materie">prima</span>`
                        : `<span class="trend-chip is-${dir}" title="Cât a mutat media materiei">${dir === "up" ? "▲" : dir === "down" ? "▼" : "■"} ${dir === "flat" ? "0.00" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`}</span>`}
                </button>
            </li>`;
    }).join("")}</ol>`;
}

/* ---------- Timp ---------- */
function renderStatsModules(period) {
    const mods = moduleAverages();
    const box = $("stats-modules");
    const done = mods.filter(m => m.avg);
    if (done.length === 0) {
        box.innerHTML = `<p class="muted-small chart-empty is-small">Apare după primele note cu dată dintr-un modul.</p>`;
        return;
    }
    const prevDelta = (() => {
        if (done.length < 2) return null;
        const [a, b] = done.slice(-2);
        return { from: a.n, to: b.n, delta: b.avg - a.avg };
    })();
    box.innerHTML = `
        ${prevDelta ? `<p class="impact-lead">Modulul ${prevDelta.to} față de Modulul ${prevDelta.from}: <b class="${prevDelta.delta >= 0 ? "impact-pos" : "impact-neg"}">${prevDelta.delta >= 0 ? "+" : "−"}${Math.abs(prevDelta.delta).toFixed(2)}</b></p>` : ""}
        <div class="mod-cols">
            ${mods.map((m, i) => `
                <button type="button" class="mod-col ${m.status === "current" ? "is-current" : ""} ${m.avg ? "" : "is-empty"} ${period === `m${m.n}` ? "is-selected" : ""}"
                    data-action="stats-period" data-period="m${m.n}" ${m.status === "upcoming" ? "disabled" : ""}
                    aria-label="${escapeHTML(`Modulul ${m.n}${m.avg ? `: media ${m.avg.toFixed(2)}, ${plural(m.grades, "notă", "note")}` : ""}`)}">
                    <span class="mod-val">${m.avg ? m.avg.toFixed(2) : m.status === "upcoming" ? "" : "–"}</span>
                    <span class="mod-bar"><span class="anim-grow-y" style="height:${m.avg ? (((m.avg - 1) / 9) * 100).toFixed(1) : 0}%; --i:${i}"></span></span>
                    <span class="mod-name">M${m.n}${m.status === "current" ? " · acum" : ""}</span>
                    <small>${m.status === "upcoming" ? `din ${escapeHTML(shortDayLabel(m.start))}` : m.grades ? plural(m.grades, "notă", "note") : "fără note"}</small>
                </button>`).join("")}
        </div>
        <p class="subtitle impact-legend">Apasă pe un modul ca să vezi statisticile doar pentru el.</p>`;
}

function renderStatsWeekdays(subs) {
    const list = weekdayStats(subs);
    const box = $("stats-weekdays");
    const withData = list.filter(x => x.n);
    if (withData.length === 0) {
        box.innerHTML = `<p class="muted-small chart-empty is-small">Apare după note cu dată.</p>`;
        return;
    }
    const best = withData.filter(x => x.n >= 2).sort((a, b) => b.avg - a.avg)[0];
    box.innerHTML = `
        ${best ? `<p class="impact-lead">Ziua ta cea mai bună: <b>${WEEKDAY_LONG[best.wd]}</b> (${best.avg.toFixed(2)})</p>` : ""}
        <ol class="wd-bars" aria-label="Media notelor pe zile ale săptămânii">
            ${list.map((x, i) => `
                <li class="wd-col ${x.n ? "" : "is-empty"} ${best && best.wd === x.wd ? "is-best" : ""}" style="--i:${i}"
                    aria-label="${escapeHTML(`${WEEKDAY_LONG[x.wd]}: ${x.n ? `media ${x.avg.toFixed(2)}, ${plural(x.n, "notă", "note")}` : "nicio notă"}`)}">
                    <b class="wd-val" aria-hidden="true">${x.n ? x.avg.toFixed(2) : "–"}</b>
                    <span class="wd-track" aria-hidden="true">${x.n ? `<span class="wd-fill anim-grow-y" style="height:${pctPos(x.avg)}"></span>` : ""}</span>
                    <span class="wd-name" aria-hidden="true">${WEEKDAY_SHORT[x.wd]}</span>
                    <small aria-hidden="true">${x.n ? plural(x.n, "notă", "note") : "—"}</small>
                </li>`).join("")}
        </ol>`;
}

/** Hartă de activitate: o pătrățică pe zi, din septembrie până azi; culoarea = câte note ai primit. */
function renderStatsHeatmap(range) {
    const box = $("stats-heatmap");
    const today = getLocalDateKey();
    const mods = state.settings.modules;
    const byDay = new Map();
    Object.entries(state.subjects).forEach(([mat, sub]) => sub.grades.forEach(g => {
        if (!g.date) return;
        byDay.set(g.date, [...(byDay.get(g.date) || []), { mat, g }]);
    }));
    const dates = [...byDay.keys()].sort();
    let start = weekStart(dates[0] && dates[0] < mods[0].start ? dates[0] : mods[0].start);
    if (daysBetween(start, today) > 371) start = weekStart(addDays(today, -364));
    // Tot anul școlar, până în iunie: zilele care urmează apar estompate, ca să se vadă cât a trecut din an.
    const lastDay = mods[4].end > today ? mods[4].end : today;
    const end = addDays(weekStart(lastDay), 6);
    const inSchool = d => mods.some(m => d >= m.start && d <= m.end);

    const weeks = [];
    for (let w = start; w <= end; w = addDays(w, 7)) weeks.push(w);
    const total = dates.filter(d => d >= start).reduce((n, d) => n + byDay.get(d).length, 0);
    const activeDays = dates.filter(d => d >= start).length;

    const cell = date => {
        const items = byDay.get(date) || [];
        const n = items.length;
        const lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3;
        const cls = [
            "hm-cell", `l${lvl}`,
            date > today && "is-future",
            !inSchool(date) && "is-break",
            date === today && "is-today",
            range && (date < range.from || date > range.to) && "is-dim"
        ].filter(Boolean).join(" ");
        const lines = n ? items.map(({ mat, g }) => `${mat} · ${g.type || "Altele"}|${g.val}`).join("\n") : (inSchool(date) ? "Nicio notă|" : "Vacanță / weekend|");
        return `<span class="${cls}" data-tip-title="${escapeHTML(weekdayLabel(date))}" data-tip-lines="${escapeHTML(lines)}"></span>`;
    };

    let lastMonth = -1;
    const monthLabels = weeks.map(w => {
        const m = parseDateKey(w).getMonth();
        const label = m !== lastMonth ? MONTH_SHORT[m] : "";
        lastMonth = m;
        return `<span>${label}</span>`;
    }).join("");

    box.innerHTML = `
        <p class="impact-lead"><b>${plural(total, "notă", "note")}</b> în <b>${plural(activeDays, "zi", "zile")}</b> de la începutul anului școlar.</p>
        <div class="hm-scroll" id="hm-scroll" tabindex="0" role="region" aria-label="Activitatea pe zile (derulează orizontal)">
            <div class="hm" style="--weeks:${weeks.length}">
                <div class="hm-months" aria-hidden="true">${monthLabels}</div>
                <div class="hm-days" aria-hidden="true"><span>Lu</span><span></span><span>Mi</span><span></span><span>Vi</span><span></span><span></span></div>
                <div class="hm-grid" role="img" aria-label="${escapeHTML(`Activitate: ${plural(total, "notă", "note")} în ${plural(activeDays, "zi", "zile")}`)}">
                    ${weeks.map(w => `<div class="hm-week">${[0, 1, 2, 3, 4, 5, 6].map(i => cell(addDays(w, i))).join("")}</div>`).join("")}
                </div>
            </div>
        </div>
        <div class="hm-legend" aria-hidden="true">
            <span>mai puține</span><span class="hm-cell l0"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span>mai multe</span>
            <span class="hm-legend-break"><span class="hm-cell l0 is-break"></span> vacanță / weekend</span>
        </div>`;
    // Pe ecrane înguste, derulează până la săptămâna de azi.
    const scroller = $("hm-scroll");
    const todayCell = scroller?.querySelector(".hm-cell.is-today");
    if (scroller && todayCell) scroller.scrollLeft = Math.max(0, todayCell.offsetLeft - scroller.clientWidth * 0.6);
}

function renderStatsCharts(timeline, range, pm) {
    const theme = chartTheme();
    const target = state.settings.goals.targetGPA;
    const tl = range ? timeline.filter(p => p.date >= range.from && p.date <= range.to) : timeline;

    const trendEmpty = tl.length < 2;
    $("stats-trend-frame").hidden = trendEmpty;
    $("stats-trend-empty").hidden = !trendEmpty;
    if (trendEmpty) {
        destroyChart("chartStatTrend");
        $("stats-trend-empty").textContent = metrics.totalGrades
            ? (range ? "Prea puține zile cu note în perioada aleasă pentru un grafic." : "Graficul apare când ai note în cel puțin două zile diferite (cu dată).")
            : "Graficul apare după primele note.";
    } else {
        const values = tl.map(p => roundValue(p.avg, 2));
        const low = Math.max(1, Math.floor(Math.min(...values, target) - 0.5));
        const options = baseChartOptions(theme, { yMax: 10, tip: TIP.avg });
        options.scales.y = { ...options.scales.y, min: low, max: 10 };
        upsertChart("chartStatTrend", {
            type: "line",
            data: {
                labels: tl.map(p => getShortDateLabel(p.date)),
                datasets: [
                    { label: "Media generală", data: values, borderColor: theme.accent, backgroundColor: `${theme.accent}22`, pointBackgroundColor: theme.accent, pointBorderColor: theme.surface, pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, fill: true, tension: 0.25 },
                    { label: "Ținta", data: values.map(() => target), borderColor: theme.text, borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, fill: false }
                ]
            },
            options
        });
    }

    const dist = Array(10).fill(0);
    Object.values(periodSubjects(range)).forEach(sub => sub.grades.forEach(g => {
        const v = Math.round(Number(g.val));
        if (v >= 1 && v <= 10) dist[v - 1]++;
    }));
    const count = dist.reduce((a, b) => a + b, 0);
    const distEmpty = count < 3;
    $("stats-dist-frame").hidden = distEmpty;
    $("stats-dist-empty").hidden = !distEmpty;
    if (distEmpty) {
        destroyChart("chartStatDistributie");
        $("stats-dist-empty").textContent = `Distribuția apare de la 3 note (acum: ${plural(count, "notă", "note")}${range ? " în perioadă" : ""}).`;
    } else {
        upsertChart("chartStatDistributie", {
            type: "bar",
            data: { labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], datasets: [{ label: "Note", data: dist, backgroundColor: theme.accent, borderRadius: 4, maxBarThickness: 32, borderSkipped: "start" }] },
            options: baseChartOptions(theme, { legend: false, tip: TIP.distribution })
        });
    }
}

/* ---------- meniul secțiunilor (lipit sus) + evidențierea secțiunii vizibile ---------- */
function bindStatsNav() {
    const nav = $("stats-nav");
    if (!nav || nav.dataset.bound) return;
    nav.dataset.bound = "1";
    $("stats-period")?.addEventListener("change", event => setStatsPeriod(event.target.value));

    // Secțiunea activă = ultima al cărei început a trecut de meniul lipit.
    let ticking = false;
    const update = () => {
        ticking = false;
        if (ui.activeTab !== "tab-statistici" || nav.hidden) return;
        const line = nav.getBoundingClientRect().bottom + 48;
        let active = STATS_SECTIONS[0].id;
        STATS_SECTIONS.forEach(sec => {
            const el = $(sec.id);
            if (el && el.getBoundingClientRect().top <= line) active = sec.id;
        });
        // La finalul paginii, ultima secțiune e cea activă chiar dacă începutul ei nu a ajuns sus.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = STATS_SECTIONS[STATS_SECTIONS.length - 1].id;
        nav.querySelectorAll(".stats-nav-link").forEach(a => a.classList.toggle("active", a.dataset.target === active));
    };
    window.addEventListener("scroll", () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
}

function setStatsPeriod(id) {
    ui.statsPeriod = statsPeriods().some(p => p.id === id && !p.disabled) ? id : "year";
    ui.statsAnimate = true;
    renderStatistics();
}

/* ---------- raport pentru printare ---------- */

registerTab("tab-statistici", { render: renderStatistics, title: "Progresul tău", icon: "chart", group: "grades", parent: "tab-catalog" });
