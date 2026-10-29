/* urNotes · Motorul de calcul: medii, realizări, alerte.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== MOTOR DE CALCUL ==================== */
/* Regulile de calcul sunt în shared/rules.js, comune cu serverul (aceeași medie peste tot). */
const emptyMetrics = () => URN_RULES.emptyMetrics();

/**
 * Calculează mediile pentru un set de materii.
 * Implicit cele reale; Simulatorul trimite o copie cu notele ipotetice adăugate.
 */
function calculateMetrics(subjects = state.subjects) {
    return URN_RULES.computeMetrics(subjects, {
        calc: state.settings.calc,
        purtare: purtareInfo(),
        purtareExcluded: state.purtare.excludeFromGPA,
        purtareWeight: PURTARE_WEIGHT
    });
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

    const fresh = ACHIEVEMENTS.filter(a => !state.achievements[a.key] && a.test(metrics));
    if (!fresh.length) return;
    fresh.forEach(a => { state.achievements[a.key] = true; });
    // un singur mesaj, chiar dacă s-au deblocat mai multe deodată (ex. după un import), și puțin după acțiune
    const msg = fresh.length === 1 ? fresh[0].toast : `🏆 ${fresh.length} realizări noi: ${fresh.map(a => a.label).join(", ")}.`;
    clearTimeout(checkAchievements.timer);
    checkAchievements.timer = setTimeout(() => showToast(msg, { duration: 4500 }), 700);
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
/** Rulează un pas; dacă eșuează (date ciudate, o versiune amestecată), îl notăm și mergem mai departe. */
function safeStep(name, fn) {
    try { return fn(); } catch (err) {
        console.error(`Pasul „${name}” a eșuat.`, err);
        reportRenderError(err);
        return undefined;
    }
}
/** Un singur mesaj discret, nu câte unul la fiecare redesenare. */
function reportRenderError() {
    if (reportRenderError.shown) return;
    reportRenderError.shown = true;
    setTimeout(() => showToast("⚠️ O parte din aplicație n-a putut fi afișată. Restul merge; reîncarcă pagina dacă lipsește ceva."), 0);
}

function refresh() {
    safeStep("guest", () => guestGuard()); // vizitatorii nu pot schimba nimic: o modificare ajunsă în date se anulează aici
    safeStep("programă", () => syncProgrammeHours());
    const m = safeStep("medii", () => calculateMetrics());
    if (m) metrics = m;
    safeStep("module", () => checkModuleRollover());
    safeStep("istoric", () => updateHistoryPoint());
    if (!guest.on) safeStep("realizări", () => checkAchievements()); // vizitatorii (și caietul de exemplu) nu primesc realizări
    safeStep("coleg", () => checkPalLevel());
    safeStep("plan", () => updatePlan());
    const a = safeStep("alerte", () => generateAlerts());
    if (Array.isArray(a)) alerts = a;
    safeStep("orar", () => pruneTimetable());
    safeStep("simulator", () => pruneSimulator());
    safeStep("salvare", () => saveState());

    safeStep("insignă", () => renderNotificationBadge());
    if (!$("notif-panel")?.hidden) safeStep("notificări", () => renderAlerts());
    safeStep("pagina", () => renderActiveTab({ keepSettingsForm: true }));
}
