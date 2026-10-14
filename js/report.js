/* urNotes · Raportul pentru printare.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== RAPORT PENTRU PRINTARE ==================== */
/*
 * Înainte de printare se deschide un panou: nume și clasă (pentru antet), perioada și secțiunile dorite.
 * Alegerile se păstrează în Setări (settings.report), deci și Ctrl+P din browser folosește ultimele opțiuni.
 */
function reportPeriod() {
    const id = state.settings.report.period;
    return statsPeriods().some(p => p.id === id && !p.disabled) ? id : "year";
}

function openReportPanel() {
    const r = state.settings.report;
    const period = reportPeriod();
    openModal({
        layout: "panel",
        title: "Raport pentru printare",
        guestOk: true,
        confirmText: "Printează",
        body: `
            <p class="modal-hint">Se deschide fereastra de printare a browserului. Ca să-l trimiți, alege „Salvează ca PDF”.</p>
            <div class="form-row">
                <div class="form-group">
                    <label for="rep-name">Numele elevului <span class="label-hint">(opțional)</span></label>
                    <input id="rep-name" class="glass-input" maxlength="60" autocomplete="name" value="${escapeHTML(r.name || state.settings.profile.name)}" placeholder="ex: Andrei Popescu">
                </div>
                <div class="form-group">
                    <label for="rep-cls">Clasa <span class="label-hint">(opțional)</span></label>
                    <input id="rep-cls" class="glass-input" maxlength="30" value="${escapeHTML(r.cls)}" placeholder="ex: a IX-a B">
                </div>
            </div>
            <div class="form-group">
                <label for="rep-period">Perioada</label>
                <select id="rep-period" class="glass-select">
                    ${statsPeriods().filter(p => !p.disabled).map(p => `<option value="${p.id}" ${p.id === period ? "selected" : ""}>${escapeHTML(p.label)}</option>`).join("")}
                </select>
            </div>
            <fieldset class="rep-sections">
                <legend>Ce include</legend>
                ${REPORT_SECTIONS.map(x => `
                    <label class="check-row"><input type="checkbox" id="rep-sec-${x.key}" ${r.sections[x.key] ? "checked" : ""}> ${escapeHTML(x.label)}</label>`).join("")}
            </fieldset>`,
        onConfirm: () => {
            r.name = field("rep-name").trim().slice(0, 60);
            r.cls = field("rep-cls").trim().slice(0, 30);
            r.period = field("rep-period") || "year";
            REPORT_SECTIONS.forEach(x => { r.sections[x.key] = Boolean($(`rep-sec-${x.key}`)?.checked); });
            saveState();
            closeActionModal();
            buildPrintReport();
            // Lăsăm panoul să se închidă înainte ca browserul să blocheze pagina cu fereastra de printare.
            setTimeout(() => window.print(), 50);
        }
    });
}

/** Graficul mediei generale, desenat simplu pentru hârtie (fără culori obligatorii). */
function reportChartSVG(timeline, target, risk) {
    if (timeline.length < 2) return `<p class="pr-empty">Graficul apare după note din cel puțin două zile diferite.</p>`;
    const W = 340, H = 130, L = 26, R = 8, T = 8, B = 18;
    const vals = timeline.map(p => p.avg);
    const lo = Math.max(1, Math.floor(Math.min(...vals, risk) - 0.5));
    const hi = 10;
    const x = i => L + (i * (W - L - R)) / (timeline.length - 1);
    const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const ticks = [];
    for (let v = hi; v >= lo; v -= hi - lo > 5 ? 2 : 1) ticks.push(v);
    const hl = (v, cls) => `<line class="${cls}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
    return `
        <svg class="pr-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evoluția mediei generale">
            ${ticks.map(v => `<text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>${hl(v, "pr-grid")}`).join("")}
            ${target <= 10 && target >= lo ? hl(target, "pr-target") : ""}
            ${risk >= lo ? hl(risk, "pr-risk") : ""}
            <polyline points="${pts}"/>
            ${vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="1.8"/>`).join("")}
            <text x="${L}" y="${H - 4}">${escapeHTML(shortDayLabel(timeline[0].date))}</text>
            <text x="${W - R}" y="${H - 4}" text-anchor="end">${escapeHTML(shortDayLabel(timeline.at(-1).date))}</text>
        </svg>
        <p class="pr-legend"><i class="pr-k-line"></i> media generală <i class="pr-k-target"></i> ținta ${target.toFixed(2)} <i class="pr-k-risk"></i> prag de risc ${risk.toFixed(2)}</p>`;
}

/** Ce notă îi trebuie unei materii la următoarea evaluare (risc întâi, apoi ținta). */
function reportNeed(mat, sub) {
    const d = metrics.subjects[mat];
    if (!sub.grades.length) return "orice notă";
    const risk = state.settings.calc.riskThreshold;
    const atRisk = d.exactAvg < risk;
    const plan = atRisk ? planForCondition(mat, x => x.exactAvg >= risk) : planForCondition(mat, x => reachesTarget(x, sub.target));
    if (plan.now) return "✓ ținta e atinsă";
    const what = atRisk ? "ieși din risc" : `ținta ${fmtTarget(sub.target)}`;
    if (plan.next) return `${plan.next === 1 ? "orice notă" : `minim ${plan.next}`} → ${what}`;
    if (plan.tens) return `${plan.tens} note de 10 → ${what}`;
    return `peste 20 de note de 10 → ${what}`;
}

function buildPrintReport() {
    const box = $("print-report");
    if (!box) return;
    const r = state.settings.report;
    const on = key => r.sections[key] !== false && (r.sections[key] ?? REPORT_SECTIONS.find(x => x.key === key)?.on);
    const s = state.settings;
    const periodId = reportPeriod();
    const range = periodRange(periodId);
    const subs = periodSubjects(range);
    const m = range ? calculateMetrics(subs) : metrics;
    const entries = statsEntries(subs, m).sort(STATS_SORTS.name);
    const p = metrics.purtare || purtareInfo();
    const now = new Date();
    const today = getLocalDateKey(now);
    const avg = m.globalAvg;
    const target = s.goals.targetGPA;
    const risk = s.calc.riskThreshold;
    const riskCount = entries.filter(e => e.standing.key === "risk").length;
    const modN = /^m([1-5])$/.exec(periodId)?.[1];
    const purtareVal = modN ? (p.modules[modN - 1].val ?? "–") : p.value;
    const periodText = range ? `${periodLabel(periodId)} · ${shortDayLabel(range.from)} – ${shortDayLabel(range.to)}` : `Tot anul școlar · ${shortDayLabel(s.modules[0].start)} – ${shortDayLabel(s.modules[4].end)}`;
    const who = [r.name, r.cls && `Clasa ${r.cls.replace(/^clasa\s+/i, "")}`].filter(Boolean).join(" · ");
    const gap = target - (m.rawGlobalAvg || 0);
    const status = avg <= 0 ? "încă fără note" : gap <= 0.004 ? "✓ ținta e atinsă" : `lipsesc ${gap.toFixed(2)} puncte până la țintă`;

    const gradeList = sub => {
        const chrono = gradesChrono(sub).map(x => x.g);
        if (!chrono.length) return `<span class="pr-muted">—</span>`;
        return chrono.map(g => `<span class="pr-g ${Number(g.val) < 5 ? "is-low" : Number(g.val) === 10 ? "is-ten" : ""}" title="${escapeHTML(g.type || "")}">${escapeHTML(g.val)}</span>`).join(" ");
    };

    const rows = entries.map(({ mat, sub, d, standing }) => `
        <tr class="is-${standing.key}">
            <th scope="row">${escapeHTML(mat)}${sub.excludeFromGPA ? ` <em>exclusă</em>` : ""}${sub.priority ? " ★" : ""}</th>
            ${on("grades") ? `<td class="pr-grades">${gradeList(sub)}</td>` : `<td>${sub.grades.length}</td>`}
            <td class="pr-num">${sub.grades.length ? d.exactAvg.toFixed(2) : "–"}</td>
            <td class="pr-num pr-final">${sub.grades.length ? d.roundedAvg : "–"}</td>
            <td class="pr-num">${fmtTarget(sub.target)}</td>
            ${on("need") ? `<td class="pr-need">${escapeHTML(reportNeed(mat, state.subjects[mat]))}</td>` : ""}
            <td class="pr-status">${standing.icon} ${standing.label}</td>
        </tr>`).join("");

    const modules = moduleAverages();
    const modulesHTML = `
        <section class="pr-block">
            <h2>Pe module</h2>
            <table class="pr-mini">
                <thead><tr><th>Modul</th><th>Perioada</th><th class="pr-num">Media</th><th class="pr-num">Note</th><th class="pr-num">Purtare</th></tr></thead>
                <tbody>${modules.map(x => `
                    <tr class="${x.status === "current" ? "is-current" : ""} ${x.status === "upcoming" ? "is-future" : ""}">
                        <th scope="row">Modulul ${x.n}${x.status === "current" ? " · acum" : ""}</th>
                        <td>${escapeHTML(moduleRange(x))}</td>
                        <td class="pr-num">${x.avg ? x.avg.toFixed(2) : "–"}</td>
                        <td class="pr-num">${x.status === "upcoming" ? "–" : x.grades}</td>
                        <td class="pr-num">${x.val ?? "–"}${x.reason ? `<small>${escapeHTML(x.reason)}</small>` : ""}</td>
                    </tr>`).join("")}</tbody>
            </table>
            <p class="pr-note">Media purtării pe an: ${p.avg.toFixed(2)}${state.purtare.excludeFromGPA ? " (exclusă din media generală)" : ""}.</p>
        </section>`;

    const timeline = averageTimeline().filter(pt => !range || (pt.date >= range.from && pt.date <= range.to));
    const chartHTML = `
        <section class="pr-block">
            <h2>Evoluția mediei generale</h2>
            ${reportChartSVG(timeline, target, risk)}
        </section>`;

    const links = gradeLinks();
    const upcoming = occurrencesBetween(today, addDays(today, 30)).filter(o => (NEEDS_GRADE.has(o.ev.type) || o.ev.type === "Temă") && !isOccurrenceDone(o.ev, o.date, links));
    const upcomingHTML = `
        <section class="pr-block">
            <h2>Urmează (30 de zile)</h2>
            ${upcoming.length ? `<ul class="pr-list">${upcoming.slice(0, 10).map(o => `
                <li><b>${escapeHTML(weekdayLabel(o.date))}</b> ${escapeHTML(o.ev.title)} <span class="pr-muted">· ${escapeHTML([o.ev.type, o.ev.subject && !foldText(o.ev.title).includes(foldText(o.ev.subject)) ? o.ev.subject : ""].filter(Boolean).join(", "))}</span></li>`).join("")}</ul>
                ${upcoming.length > 10 ? `<p class="pr-note">și încă ${upcoming.length - 10}.</p>` : ""}`
            : `<p class="pr-empty">Nicio evaluare sau temă programată.</p>`}
        </section>`;

    const tips = buildInsights(statsEntries()).slice(0, 5);
    const tipsHTML = `
        <section class="pr-block">
            <h2>Recomandări</h2>
            ${tips.length ? `<ol class="pr-list pr-tips">${tips.map(it => `<li><b>${escapeHTML(it.title)}.</b> ${escapeHTML(it.text)}</li>`).join("")}</ol>`
            : `<p class="pr-empty">Nicio materie în risc și minimul de note e atins.</p>`}
        </section>`;

    const pair = (a, b) => a && b ? `<div class="pr-cols">${a}${b}</div>` : (a || b || "");
    const planDaysList = state.plan.prefs.setup ? planDays().map(d => [d, planItemsOn(d)]).filter(([, items]) => items.length) : [];
    const planHTML = `
        <section class="pr-block">
            <h2>Planul de studiu · următoarele 7 zile</h2>
            ${planDaysList.length ? `<ul class="pr-list pr-plan">${planDaysList.map(([d, items]) => `<li><b>${escapeHTML(planDayLabel(d, getLocalDateKey()))}:</b> ${items.map(it => `${escapeHTML(it.mat)} (${escapeHTML(PLAN_KINDS[it.kind].label.toLocaleLowerCase("ro"))}, ${it.min} min${it.done ? ", făcut" : ""})`).join("; ")}</li>`).join("")}</ul>`
                : `<p class="pr-empty">${state.plan.prefs.setup ? "Nicio sesiune în următoarele 7 zile." : "Planul de studiu nu a fost încă făcut (pagina „Plan”)."}</p>`}
        </section>`;

    box.innerHTML = `
        <header class="pr-head">
            <div class="pr-title">
                <p class="pr-kicker">Raport școlar</p>
                <h1>${who ? escapeHTML(who) : "Situația la învățătură"}</h1>
                <p>${escapeHTML(periodText)}</p>
                <p class="pr-made">Generat pe ${escapeHTML(formatDateTime(now))}</p>
            </div>
            <div class="pr-avg">
                <span>Media generală${range ? ` · ${escapeHTML(periodLabel(periodId))}` : ""}</span>
                <b>${avg > 0 ? avg.toFixed(2) : "–"}</b>
                <small>ținta ${target.toFixed(2)} · ${escapeHTML(status)}</small>
            </div>
        </header>

        <section class="pr-kpis">
            <div><span>Purtare</span><b>${purtareVal}</b></div>
            <div class="${riskCount ? "is-risk" : ""}"><span>Materii în risc</span><b>${riskCount}</b><small>sub ${risk.toFixed(2)}</small></div>
            <div><span>Note</span><b>${m.totalGrades}</b><small>${plural(entries.filter(e => e.sub.grades.length).length, "materie", "materii")} cu note</small></div>
            <div><span>Note de 10</span><b>${m.tensCount}</b></div>
            <div><span>Note lipsă</span><b>${entries.reduce((n, e) => n + e.d.requiredNotes, 0)}</b><small>până la minim</small></div>
        </section>

        <section class="pr-block">
            <h2>Situația pe materii</h2>
            <table class="pr-table">
                <thead><tr>
                    <th scope="col">Materie</th>
                    <th scope="col">${on("grades") ? "Note" : "Nr. note"}</th>
                    <th scope="col" class="pr-num">Media</th>
                    <th scope="col" class="pr-num">Finală</th>
                    <th scope="col" class="pr-num">Ținta</th>
                    ${on("need") ? `<th scope="col">La următoarea notă</th>` : ""}
                    <th scope="col">Situație</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="pr-note">Media generală ${s.calc.method === "weighted" ? "ponderată după numărul de ore" : "aritmetică (ca în catalog)"}${state.purtare.excludeFromGPA ? "" : ", cu purtarea inclusă"}. „Finală” = media rotunjită. Notele sub 5 sunt subliniate, notele de 10 îngroșate.${on("need") ? " „La următoarea notă” e calculat pentru situația de azi." : ""}</p>
        </section>

        ${pair(on("chart") ? chartHTML : "", on("modules") ? modulesHTML : "")}
        ${pair(on("upcoming") ? upcomingHTML : "", on("tips") ? tipsHTML : "")}
        ${on("plan") ? planHTML : ""}

        ${on("sign") ? `
            <section class="pr-sign">
                <div><span>Am luat la cunoștință — părinte / tutore</span><i></i></div>
                <div><span>Data</span><i></i></div>
            </section>` : ""}`;
}

function printStatsReport() {
    openReportPanel();
}
