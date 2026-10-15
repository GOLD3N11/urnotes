/* urNotes · Motorul de calcul: medii, realizări, alerte.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== MOTOR DE CALCUL ==================== */
function emptyMetrics() {
    return {
        subjects: {},
        globalAvg: 0,
        rawGlobalAvg: 0,
        riskCount: 0,
        totalGrades: 0,
        tensCount: 0,
        maxGrade: null,
        minGrade: null,
        purtare: null
    };
}

/**
 * Calculează mediile pentru un set de materii.
 * Implicit cele reale; Simulatorul trimite o copie cu notele ipotetice adăugate.
 */
function calculateMetrics(subjects = state.subjects) {
    const calc = state.settings.calc;
    const decimals = Number(calc.rounding);
    const m = emptyMetrics();

    let weightedSum = 0;
    let weightTotal = 0;
    let arithmeticSum = 0;
    let arithmeticCount = 0;

    for (const [mat, sub] of Object.entries(subjects)) {
        let sum = 0;
        const count = sub.grades.length;

        sub.grades.forEach(g => {
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
            requiredNotes: Math.max(0, Math.ceil(sub.ore) + 3 - sub.grades.length)
        };

        if (sub.grades.length === 0) {
            d.status = "Fără note";
            d.statusClass = "badge-warn";
        } else if (exactAvg < calc.riskThreshold) {
            d.status = "Risc";
            d.statusClass = "badge-danger";
            m.riskCount++;
        } else {
            d.status = "Sigur";
            d.statusClass = "badge-ok";
        }

        if (!sub.excludeFromGPA && rawAvg > 0) {
            weightedSum += rawAvg * sub.ore;
            weightTotal += sub.ore;
            // „ca în catalog” (ROFUIP): media generală = media aritmetică a mediilor ÎNTREGI pe materii (+ purtarea)
            arithmeticSum += d.roundedAvg;
            arithmeticCount++;
        }

        m.subjects[mat] = d;
    }

    // Purtarea intră ca o materie, dar doar dacă există și alte medii (altfel media generală ar fi doar purtarea).
    m.purtare = purtareInfo();
    if (!state.purtare.excludeFromGPA && arithmeticCount > 0) {
        weightedSum += m.purtare.avg * PURTARE_WEIGHT;
        weightTotal += PURTARE_WEIGHT;
        arithmeticSum += m.purtare.avg;
        arithmeticCount++;
    }

    m.rawGlobalAvg = calc.method === "weighted"
        ? (weightTotal > 0 ? weightedSum / weightTotal : 0)
        : (arithmeticCount > 0 ? arithmeticSum / arithmeticCount : 0);
    m.globalAvg = roundValue(m.rawGlobalAvg, decimals);

    return m;
}

function updateHistoryPoint() {
    const today = getLocalDateKey();
    const existing = state.history.find(item => item.date === today);

    if (existing) {
        existing.average = metrics.globalAvg || 0;
        existing.totalGrades = metrics.totalGrades;
    } else if (metrics.totalGrades > 0) {
        state.history.push({ date: today, average: metrics.globalAvg || 0, totalGrades: metrics.totalGrades });
    }

    if (state.history.length > 90) {
        state.history = state.history.slice(-90);
    }
}

function checkAchievements() {
    if (metrics.totalGrades === 0) return;

    ACHIEVEMENTS.forEach(a => {
        if (!state.achievements[a.key] && a.test(metrics)) {
            state.achievements[a.key] = true;
            showToast(a.toast);
        }
    });
}

const NONOTE_GROUP_ID = "nonote:group";
const NONOTE_GROUP_MIN = 3;

function generateAlerts() {
    const list = [];
    const { dismissed, read } = state.alertMeta;
    const push = alert => {
        if (!dismissed[alert.id]) list.push({ ...alert, unread: read[alert.id] !== true });
    };

    // Materiile fără note: câte o alertă dacă sunt 1–2; altfel una singură (ex. imediat după configurare).
    const empty = Object.keys(state.subjects).filter(mat => state.subjects[mat].grades.length === 0);
    if (empty.length >= NONOTE_GROUP_MIN) {
        const shown = empty.slice(0, 3).join(", ");
        push({
            id: NONOTE_GROUP_ID,
            text: `Nu ai încă note la ${plural(empty.length, "materie", "materii")}: ${shown}${empty.length > 3 ? ` și încă ${empty.length - 3}` : ""}.`,
            type: "warning", icon: "note", filter: "empty"
        });
    } else {
        // Dacă elevul a ascuns alerta grupată, materiile rămase nu revin una câte una; apoi alerta grupată e „uitată”,
        // ca să poată apărea din nou într-o situație nouă (ex. după ce adaugă alte materii).
        ["dismissed", "read"].forEach(bucket => {
            if (!state.alertMeta[bucket][NONOTE_GROUP_ID]) return;
            empty.forEach(mat => { state.alertMeta[bucket][`nonote-${mat}`] = true; });
            delete state.alertMeta[bucket][NONOTE_GROUP_ID];
        });
        empty.forEach(mat => push({ id: `nonote-${mat}`, text: `Nu ai nicio notă înregistrată la ${mat}.`, type: "warning", icon: "note", mat }));
    }

    for (const [mat] of Object.entries(state.subjects)) {
        const d = metrics.subjects[mat];

        if (d.exactAvg > 0 && d.exactAvg < state.settings.calc.riskThreshold) {
            push({ id: `risk-${mat}`, text: `Media la ${mat} e sub pragul de risc: ${d.exactAvg.toFixed(2)}.`, type: "critical", icon: "alert", mat });
        }
    }

    const today = getLocalDateKey();
    const links = gradeLinks();
    occurrencesBetween(today, addDays(today, 60)).forEach(({ ev, date, key }) => {
        if (!EXAM_TYPES.has(ev.type) || isOccurrenceDone(ev, date, links)) return;
        push({
            id: `exam:${key}`,
            text: `${ev.type} „${ev.title}”${ev.subject ? ` la ${ev.subject}` : ""}, ${relativeDayLabel(date)} (${getDateLabel(date)}).`,
            type: "warning", icon: "calendar-check", date
        });
    });

    // Planul de azi: câte sesiuni mai sunt
    const planToday = state.plan.prefs.setup ? state.plan.items.filter(it => it.date === today && !it.done) : [];
    if (planToday.length) {
        push({
            id: `plan:${today}`,
            text: `Azi ai ${plural(planToday.length, "sesiune", "sesiuni")} în plan (${planToday.reduce((n, it) => n + it.min, 0)} min): ${planToday.map(it => it.mat).join(", ")}.`,
            type: "success", icon: "calendar-check", tab: "tab-plan"
        });
    }

    // Teste trecute fără notă: legătura dintre calendar și catalog.
    occurrencesBetween(addDays(today, -30), addDays(today, -1)).forEach(({ ev, date, key }) => {
        if (!NEEDS_GRADE.has(ev.type) || !state.subjects[ev.subject] || isOccurrenceDone(ev, date, links)) return;
        push({
            id: `ungraded:${key}`,
            text: `Ai avut „${ev.title}” la ${ev.subject} pe ${getDateLabel(date)}. Adaugă nota din Calendar.`,
            type: "warning", icon: "pen", date
        });
    });

    return list;
}

/** Șterge metadatele de alertă care nu mai corespund niciunei materii existente. */
function pruneSubjectAlertMeta() {
    const valid = new Set([NONOTE_GROUP_ID]);
    Object.keys(state.subjects).forEach(mat => {
        valid.add(`nonote-${mat}`);
        valid.add(`risk-${mat}`);
    });

    ["dismissed", "read"].forEach(bucket => {
        Object.keys(state.alertMeta[bucket])
            .filter(id => !isEventAlertId(id) && !valid.has(id))
            .forEach(id => delete state.alertMeta[bucket][id]);
    });
}

function isEventAlertId(id) {
    return id.startsWith("exam:") || id.startsWith("ungraded:") || id.startsWith("plan:");
}

/** Șterge starea alertelor (citit/eliminat) pentru toate aparițiile unui eveniment. */
function clearEventAlertMeta(ev) {
    const ids = [`exam:${ev.id}`, `ungraded:${ev.id}`];
    ["dismissed", "read"].forEach(bucket => {
        Object.keys(state.alertMeta[bucket])
            .filter(id => ids.some(base => id === base || id.startsWith(`${base}@`)))
            .forEach(id => delete state.alertMeta[bucket][id]);
    });
}

function clearAllEventAlertMeta() {
    ["dismissed", "read"].forEach(bucket => {
        Object.keys(state.alertMeta[bucket]).filter(isEventAlertId).forEach(id => delete state.alertMeta[bucket][id]);
    });
}

function addActivity(text) {
    const now = new Date();
    state.activity.unshift({
        id: uid(),
        ts: now.toISOString(),
        time: now.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
        text
    });
    if (state.activity.length > 100) {
        state.activity.length = 100;
    }
}

/**
 * Punctul central: recalculează, salvează, apoi redesenează doar tabul vizibil.
 * Salvarea are loc înainte de randare, așa că o eroare de afișare nu poate pierde date.
 */
function refresh() {
    guestGuard(); // vizitatorii nu pot schimba nimic: o modificare ajunsă în date se anulează aici
    syncProgrammeHours();
    metrics = calculateMetrics();
    checkModuleRollover();
    updateHistoryPoint();
    if (!guest.on) checkAchievements(); // vizitatorii (și caietul de exemplu) nu primesc realizări
    checkPalLevel();
    updatePlan();
    alerts = generateAlerts();
    pruneTimetable();
    pruneSimulator();
    saveState();

    renderNotificationBadge();
    if (!$("notif-panel")?.hidden) renderAlerts();
    renderActiveTab({ keepSettingsForm: true });
}
