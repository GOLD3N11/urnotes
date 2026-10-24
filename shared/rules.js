/* urNotes · Regulile de calcul, comune aplicației și serverului (faza 5 din planul de arhitectură).
   Același fișier rulează în browser (ca script clasic: definește `URN_RULES`) și pe server (require),
   ca o medie să iasă la fel peste tot. Fără dependențe și fără stare: totul vine prin parametri. */
(function (root, factory) {
    "use strict";
    const rules = factory();
    if (typeof module === "object" && module.exports) module.exports = rules;
    else root.URN_RULES = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    /** Rotunjire „ca pe hârtie”: 8.495 → 8.50 (fără zgomotul virgulei mobile). */
    function roundValue(value, decimals = 2) {
        if (!Number.isFinite(value)) return 0;
        const factor = 10 ** decimals;
        return Math.round(Number((value * factor).toPrecision(12))) / factor;
    }

    function clampNumber(value, min, max, fallback) {
        const parsed = parseFloat(String(value).replace(",", "."));
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    }

    /** Purtarea pe module: 10 implicit, nota pusă de diriginte dacă există; modulele care n-au început nu contează. */
    function purtareSummary(modules, grades, today) {
        const list = Array.isArray(modules) ? modules : [];
        const year = list.length ? String(list[0].start).slice(0, 4) : "";
        const mods = list.map((m, i) => {
            const key = `${year}-${i + 1}`;
            const saved = grades && grades[key];
            const status = today < m.start ? "upcoming" : today > m.end ? "done" : "current";
            return {
                n: i + 1, key, start: m.start, end: m.end, status,
                val: status === "upcoming" ? null : (saved && saved.val != null ? saved.val : 10),
                reason: (saved && saved.reason) || "",
                changed: Boolean(saved)
            };
        });
        const started = mods.filter(m => m.status !== "upcoming");
        // Înainte de primul modul nota e 10 (se reînnoiește); după ultimul rămâne media anului.
        const avg = started.length ? started.reduce((s, m) => s + m.val, 0) / started.length : 10;
        return { modules: mods, avg };
    }

    function emptyMetrics() {
        return { subjects: {}, globalAvg: 0, rawGlobalAvg: 0, riskCount: 0, totalGrades: 0, tensCount: 0, maxGrade: null, minGrade: null, purtare: null };
    }

    /**
     * Mediile: pe materii (exactă, finală rotunjită la întreg, câte note mai trebuie, starea) și media generală.
     * opts = { calc: { method, rounding, riskThreshold }, purtare: { avg, ... } | null, purtareExcluded, purtareWeight }
     */
    function computeMetrics(subjects, opts) {
        const calc = opts.calc;
        const decimals = Number(calc.rounding);
        const m = emptyMetrics();
        let weightedSum = 0, weightTotal = 0, arithmeticSum = 0, arithmeticCount = 0;

        for (const [mat, sub] of Object.entries(subjects || {})) {
            const grades = Array.isArray(sub.grades) ? sub.grades : [];
            let sum = 0;
            const count = grades.length;
            grades.forEach(g => {
                const value = clampNumber(g.val, 1, 10, 1);
                sum += value;
                m.totalGrades++;
                if (value === 10) m.tensCount++;
                m.maxGrade = m.maxGrade === null ? value : Math.max(m.maxGrade, value);
                m.minGrade = m.minGrade === null ? value : Math.min(m.minGrade, value);
            });
            const rawAvg = count > 0 ? sum / count : 0;
            const exactAvg = count > 0 ? roundValue(rawAvg, decimals) : 0;
            const d = {
                rawAvg,
                exactAvg,
                // media la materie din catalog: media aritmetică exactă rotunjită la întreg (la ,50 în favoarea elevului)
                roundedAvg: count > 0 ? roundValue(rawAvg, 0) : 0,
                requiredNotes: Math.max(0, Math.ceil(sub.ore) + 3 - count)
            };
            if (count === 0) { d.status = "Fără note"; d.statusClass = "badge-warn"; }
            else if (exactAvg < calc.riskThreshold) { d.status = "Risc"; d.statusClass = "badge-danger"; m.riskCount++; }
            else { d.status = "Sigur"; d.statusClass = "badge-ok"; }

            if (!sub.excludeFromGPA && rawAvg > 0) {
                weightedSum += rawAvg * sub.ore;
                weightTotal += sub.ore;
                // „ca în catalog” (ROFUIP): media generală = media aritmetică a mediilor ÎNTREGI pe materii (+ purtarea)
                arithmeticSum += d.roundedAvg;
                arithmeticCount++;
            }
            m.subjects[mat] = d;
        }

        // Purtarea intră ca o materie, dar doar dacă există și alte medii.
        m.purtare = opts.purtare || null;
        if (m.purtare && !opts.purtareExcluded && arithmeticCount > 0) {
            const w = opts.purtareWeight ?? 1;
            weightedSum += m.purtare.avg * w;
            weightTotal += w;
            arithmeticSum += m.purtare.avg;
            arithmeticCount++;
        }
        m.rawGlobalAvg = calc.method === "weighted"
            ? (weightTotal > 0 ? weightedSum / weightTotal : 0)
            : (arithmeticCount > 0 ? arithmeticSum / arithmeticCount : 0);
        m.globalAvg = roundValue(m.rawGlobalAvg, decimals);
        return m;
    }

    return { roundValue, clampNumber, purtareSummary, emptyMetrics, computeMetrics };
});
