/* urNotes · Stocare: încărcare, curățare, salvare.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== STOCARE ==================== */
const lastWritten = {};
let storageErrorShown = false;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function loadState() {
    applyLoadedData(readStoredData(name => safeParseJSON(localStorage.getItem(KEYS[name]), null)));

    // urNotes: cine avea culoarea implicită de dinainte (albastru) trece o singură dată pe violetul noii mărci.
    try {
        if (!localStorage.getItem(KEYS.brand)) {
            if (state.settings.appearance.accent === "blue") state.settings.appearance.accent = "violet";
            localStorage.setItem(KEYS.brand, "urnotes");
        }
    } catch (_) { /* fără stocare: rămâne culoarea din setări */ }

    // Cheia veche de alerte nu mai e folosită.
    try {
        localStorage.removeItem(KEYS.alerts);
    } catch (_) { /* ignorăm */ }
}

/**
 * Citește și validează toate datele printr-o funcție `read(nume)`.
 * Aceeași funcție servește la pornire (din localStorage) și la importul unui backup,
 * deci un fișier importat trece prin exact aceleași verificări ca datele salvate.
 * Nu modifică starea aplicației: întoarce un obiect nou.
 */
/* ---------- MIGRAȚII ----------
   Formatul datelor are un număr de versiune (DATA_SCHEMA), salvat lângă date și în backup/cont.
   Când formatul se schimbă: crești DATA_SCHEMA și adaugi aici o migrare care primește datele brute
   (exact cum au fost citite) și le aduce la noul format. Migrările rulează în ordine, o singură dată. */
const DATA_SCHEMA = 4;
const MIGRATIONS = [
    // 2: apare arhiva anilor școlari (anul în curs rămâne cum era)
    { to: 2, run: raw => { if (!Array.isArray(raw.archive)) raw.archive = []; } },
    // 3: apar examenele (EN / Bac) și colegul care crește (nivel, garderobă)
    { to: 3, run: raw => { raw.exams ||= null; raw.pal ||= null; } },
    // 4: fiecare materie are o pagină cu notițe (blocuri); cele vechi pornesc goale
    { to: 4, run: () => {} }
];

function migrateRaw(raw, from) {
    MIGRATIONS.filter(m => m.to > from && m.to <= DATA_SCHEMA).sort((a, b) => a.to - b.to).forEach(m => m.run(raw));
    return raw;
}

function readStoredData(read) {
    const meta = read("meta");
    const from = Number.isInteger(meta?.schema) ? meta.schema : 1;
    if (from > DATA_SCHEMA) console.warn(`Datele au formatul ${from}, mai nou decât al aplicației (${DATA_SCHEMA}). Le citesc cât pot.`);
    const raw = migrateRaw(Object.fromEntries(["settings", "subjects", "calendar", "timetable", "purtare", "activity", "history",
        "alertMeta", "achievements", "plan", "archive", "exams", "pal", "simulator"].map(name => [name, read(name)])), from);
    read = name => raw[name] ?? null;
    const data = {
        settings: read("settings"),
        subjects: read("subjects"),
        calendar: read("calendar"),
        timetable: read("timetable"),
        purtare: read("purtare"),
        activity: read("activity"),
        history: read("history"),
        alertMeta: read("alertMeta"),
        achievements: read("achievements"),
        plan: read("plan"),
        archive: read("archive"),
        exams: read("exams"),
        pal: read("pal")
    };
    normalizeState(data);
    return { data, sim: parseSimulator(read("simulator")) };
}

function applyLoadedData({ data, sim: loadedSim }) {
    Object.assign(state, data);
    sim = loadedSim;
    if (remindTimer || state.settings.remind?.on) armReminderClock(); // ex. amintirile pornite pe alt dispozitiv
}

const cleanName = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Setări complete și valide, indiferent ce conține sursa. */
function sanitizeSettings(raw) {
    const s = deepMerge(DEFAULT_SETTINGS, raw);
    for (const group of Object.keys(DEFAULT_SETTINGS)) {
        if (group !== "modules" && !isPlainObject(s[group])) s[group] = clone(DEFAULT_SETTINGS[group]);
    }
    const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;

    return {
        goals: {
            primary: pick(s.goals.primary, ["gpa", "tens", "evals"], "gpa"),
            targetGPA: clampNumber(s.goals.targetGPA, 5, 10, 10),
            minGPA: clampNumber(s.goals.minGPA, 5, 10, 9)
        },
        calc: {
            // rev 2: media „ca în catalog” devine implicită; cine avea vechiul implicit (ponderată) trece o singură dată pe ea
            method: raw?.calc?.rev === 2 ? pick(s.calc.method, ["weighted", "arithmetic"], "arithmetic") : "arithmetic",
            rev: 2,
            rounding: pick(String(s.calc.rounding), ["2", "0"], "2"),
            riskThreshold: clampNumber(s.calc.riskThreshold, 1, 10, 8),
            riskDrop: clampNumber(s.calc.riskDrop, 0.1, 5, 0.5)
        },
        targets: {
            tens: clampInteger(s.targets.tens, 1, 1000, 20),
            evals: clampInteger(s.targets.evals, 1, 10000, 30)
        },
        appearance: {
            theme: pick(s.appearance.theme, ["system", "light", "dark"], "system"),
            accent: pick(s.appearance.accent, Object.keys(ACCENTS), "violet"),
            style: pick(s.appearance.style, APP_STYLES, "notion"),
            // (densitatea și cursoarele personalizate au fost scoase în v9)
        },
        school: {
            profile: typeof s.school?.profile === "string" && SETUP_PROFILES[s.school.profile] ? s.school.profile : "",
            cls: Number.isInteger(s.school?.cls) ? s.school.cls : 0,
            variant: typeof s.school?.variant === "string" ? s.school.variant.slice(0, 30) : "",
            lm2: LM2_CHOICES.includes(s.school?.lm2) ? s.school.lm2 : LM2_CHOICES[0],
            county: COUNTY_WEEK[s.school?.county] ? s.school.county : ""
        },
        remind: {
            on: s.remind?.on === true,
            time: REMIND_TIMES.includes(s.remind?.time) ? s.remind.time : "19:00",
            ahead: s.remind?.ahead !== false
        },
        modules: sanitizeModules(s.modules),
        report: {
            name: typeof s.report.name === "string" ? s.report.name.trim().slice(0, 60) : "",
            cls: typeof s.report.cls === "string" ? s.report.cls.trim().slice(0, 30) : "",
            period: typeof s.report.period === "string" && /^(year|30d|m[1-5])$/.test(s.report.period) ? s.report.period : "year",
            sections: Object.fromEntries(REPORT_SECTIONS.map(x => [x.key,
                isPlainObject(s.report.sections) && typeof s.report.sections[x.key] === "boolean" ? s.report.sections[x.key] : x.on]))
        },
        profile: {
            name: cleanName(s.profile.name, 40),
            buddy: cleanName(s.profile.buddy, 20) || DEFAULT_SETTINGS.profile.buddy
        }
    };
}

function normalizeGrade(g) {
    if (!isPlainObject(g)) return null;
    const val = Number(g.val);
    if (!Number.isFinite(val) || val < 1 || val > 10) return null;
    // Ponderea notelor a fost eliminată: fiecare notă contează o singură dată.
    const grade = { val, type: GRADE_TYPES.includes(g.type) ? g.type : "Altele" };
    if (typeof g.date === "string" && DATE_KEY_RE.test(g.date)) grade.date = g.date;
    // Legătura cu testul din calendar din care a fost adăugată nota.
    if (g.eventId && typeof g.eventDate === "string" && DATE_KEY_RE.test(g.eventDate)) {
        grade.eventId = String(g.eventId).slice(0, 100);
        grade.eventDate = g.eventDate;
    }
    return grade;
}

function normalizeEvent(ev, dateKey) {
    const out = {
        id: ev.id ? String(ev.id) : uid(),
        title: String(ev.title ?? "").trim().slice(0, 100) || "Eveniment",
        time: typeof ev.time === "string" && TIME_RE.test(ev.time) ? ev.time : "",
        type: EVENT_TYPES.includes(ev.type) ? ev.type : "Personal",
        subject: typeof ev.subject === "string" ? ev.subject : "",
        description: typeof ev.description === "string" ? ev.description.slice(0, 500) : ""
    };

    if (isPlainObject(ev.repeat)) {
        const until = typeof ev.repeat.until === "string" && DATE_KEY_RE.test(ev.repeat.until) && ev.repeat.until >= dateKey ? ev.repeat.until : "";
        out.repeat = { every: Number(ev.repeat.every) === 2 ? 2 : 1, until };
    }

    const done = {};
    if (isPlainObject(ev.doneDates)) {
        Object.keys(ev.doneDates).forEach(d => { if (DATE_KEY_RE.test(d) && ev.doneDates[d] === true) done[d] = true; });
    }
    if (ev.done === true) done[dateKey] = true;
    if (Object.keys(done).length) out.doneDates = done;
    // „În lucru” (panoul din Calendar)
    const doing = {};
    if (isPlainObject(ev.doingDates)) Object.keys(ev.doingDates).forEach(d => { if (DATE_KEY_RE.test(d) && ev.doingDates[d] === true && !done[d]) doing[d] = true; });
    if (Object.keys(doing).length) out.doingDates = doing;

    if (out.repeat && Array.isArray(ev.skipDates)) {
        const skip = [...new Set(ev.skipDates.filter(d => typeof d === "string" && DATE_KEY_RE.test(d)))];
        if (skip.length) out.skipDates = skip;
    }
    return out;
}

/** Repară și migrează datele vechi fără să piardă nimic valid. Lucrează pe obiectul primit. */
function normalizeState(s) {
    s.settings = sanitizeSettings(s.settings);
    s.purtare = sanitizePurtare(s.purtare);
    s.plan = sanitizePlan(s.plan);
    s.archive = sanitizeArchive(s.archive);
    s.exams = sanitizeExams(s.exams);
    s.pal = sanitizePal(s.pal);

    const meta = isPlainObject(s.alertMeta) ? s.alertMeta : {};
    s.alertMeta = {
        dismissed: isPlainObject(meta.dismissed) ? meta.dismissed : {},
        read: isPlainObject(meta.read) ? meta.read : {}
    };

    s.achievements = Object.fromEntries(
        ACHIEVEMENTS.map(a => [a.key, isPlainObject(s.achievements) && s.achievements[a.key] === true])
    );

    // Materii: păstrăm doar câmpurile salvate (versiunile vechi salvau și valorile calculate).
    const subjects = {};
    for (const [mat, sub] of Object.entries(isPlainObject(s.subjects) ? s.subjects : {})) {
        if (!isPlainObject(sub) || !mat.trim() || mat === "__proto__" || mat === PURTARE_KEY) continue;
        subjects[mat] = {
            ore: clampNumber(sub.ore, 0.5, MAX_ORE, 2),
            target: clampNumber(sub.target, 1, 10, 10),
            grades: (Array.isArray(sub.grades) ? sub.grades : []).map(normalizeGrade).filter(Boolean),
            priority: Boolean(sub.priority),
            excludeFromGPA: Boolean(sub.excludeFromGPA),
            notes: sanitizeNotes(sub.notes),
            ...(sanitizeSubjectIcon(sub.icon) ? { icon: sanitizeSubjectIcon(sub.icon) } : {})
        };
    }
    s.subjects = subjects;

    // Calendar: fiecare eveniment primește un id stabil; alertele vechi sunt migrate pe noul id.
    const calendar = {};
    for (const [dateKey, events] of Object.entries(isPlainObject(s.calendar) ? s.calendar : {})) {
        if (!DATE_KEY_RE.test(dateKey) || !Array.isArray(events)) continue;
        const list = events.filter(isPlainObject).map(raw => {
            const ev = normalizeEvent(raw, dateKey);
            const legacyId = `exam-${dateKey}-${normalizeLegacyId(raw.title)}`;
            ["dismissed", "read"].forEach(bucket => {
                if (s.alertMeta[bucket][legacyId]) s.alertMeta[bucket][examAlertId(ev)] = true;
            });
            return ev;
        });
        if (list.length) calendar[dateKey] = list;
    }
    s.calendar = calendar;

    // Orar: doar zilele Luni–Vineri și doar materii existente.
    const tt = isPlainObject(s.timetable) ? s.timetable : {};
    s.timetable = {};
    TIMETABLE_DAYS.forEach(day => {
        const list = (Array.isArray(tt[day]) ? tt[day] : []).filter(m => typeof m === "string" && subjects[m]).slice(0, TIMETABLE_MAX);
        if (list.length) s.timetable[day] = list;
    });

    ["dismissed", "read"].forEach(bucket => {
        Object.keys(s.alertMeta[bucket])
            .filter(id => id.startsWith("exam-") && !id.startsWith("exam:"))
            .forEach(id => delete s.alertMeta[bucket][id]);
    });

    s.history = (Array.isArray(s.history) ? s.history : [])
        .filter(item => isPlainObject(item) && DATE_KEY_RE.test(String(item.date)))
        .slice(-90);
    s.activity = (Array.isArray(s.activity) ? s.activity : []).filter(isPlainObject).slice(0, 100);
}

function normalizeLegacyId(value = "") {
    return String(value).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

function examAlertId(ev) {
    return `exam:${ev.id}`;
}

/** Scrie doar cheile care s-au schimbat de la ultima salvare. */
function saveState() {
    if (guest.on) return; // ca vizitator nu se salvează nimic (nici caietul de exemplu)
    saveCounter++;
    const payload = {
        [KEYS.settings]: state.settings,
        [KEYS.subjects]: state.subjects,
        [KEYS.calendar]: state.calendar,
        [KEYS.timetable]: state.timetable,
        [KEYS.purtare]: state.purtare,
        [KEYS.activity]: state.activity,
        [KEYS.achievements]: state.achievements,
        [KEYS.history]: state.history,
        [KEYS.alertMeta]: state.alertMeta,
        [KEYS.simulator]: sim,
        [KEYS.plan]: state.plan,
        [KEYS.archive]: state.archive,
        [KEYS.exams]: state.exams,
        [KEYS.pal]: state.pal,
        [KEYS.meta]: { schema: DATA_SCHEMA }
    };

    let changed = false;
    for (const [key, value] of Object.entries(payload)) {
        const json = JSON.stringify(value);
        if (lastWritten[key] === json) continue;
        changed = true;
        try {
            localStorage.setItem(key, json);
            lastWritten[key] = json;
        } catch (err) {
            console.error("Salvarea a eșuat.", err);
            if (!storageErrorShown) {
                storageErrorShown = true;
                showToast("⚠️ Datele nu au putut fi salvate. Verifică spațiul de stocare al browserului.");
            }
            return;
        }
    }
    if (changed) {
        onLocalDataChange();
        clearTimeout(saveState.remindTimer);
        saveState.remindTimer = setTimeout(() => syncReminderCache(), 1500); // amintirile pentru lucrătorul din fundal
    }
}
