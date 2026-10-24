/* urNotes · Configurare: chei de stocare, constante, starea aplicației.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== CONFIGURARE ==================== */
// Cheile de stocare rămân identice, ca datele existente să fie păstrate.
const KEYS = {
    subjects: "pro_catalog_db_v4",
    settings: "pro_settings_db_v4",
    calendar: "pro_calendar_db_v4",
    alerts: "pro_alerts_db_v4", // nu se mai scrie: alertele se regenerează la fiecare calcul
    activity: "pro_activity_db_v4",
    achievements: "pro_achievements_db_v4",
    firstRun: "pro_has_run_v4",
    history: "pro_history_db_v4",
    alertMeta: "pro_alert_meta_db_v4",
    simulator: "pro_simulator_db_v4", // note ipotetice + scenarii; separat de notele reale
    backupUndo: "pro_backup_undo_v4", // copia datelor de dinainte de ultimul import (pentru „Anulează importul”)
    lastExport: "pro_last_export_v4", // momentul ultimului backup exportat
    timetable: "pro_timetable_db_v4", // orarul săptămânal: { 1: ["Matematică", ...], ... }
    purtare: "pro_purtare_db_v4",     // purtarea pe module: { grades: { "2026-2": { val, reason } }, ... }
    brand: "pro_brand_v4",            // a trecut o dată prin schimbarea mărcii (Zece → urNotes)
    plan: "pro_plan_db_v4",           // planul de studiu: preferințe de timp + sesiuni (vezi PLANUL MEU)
    archive: "pro_archive_db_v4",     // anii școlari încheiați: notele și mediile fiecărui an (vezi js/years.js)
    exams: "pro_exams_db_v4",
    pal: "pro_pal_db_v4",             // colegul: experiență, nivel, culoarea și accesoriul ales (js/growth.js)         // examenele: probele alese și rezultatele de la variante/simulări (js/exams.js)
    meta: "pro_meta_v4"               // versiunea formatului datelor (vezi MIGRAȚII în js/storage.js)
};


/* ==================== PURTARE ==================== */
/*
 * Purtarea e preinstalată în catalog și nu se poate șterge.
 * Pornește de la 10 la începutul fiecărui modul; se salvează doar modulele în care a fost modificată:
 *   state.purtare.grades["2026-2"] = { val: 9, reason: "..." }
 * Cheia = anul în care începe Modulul 1 + numărul modulului, deci schimbarea vacanței mobile nu pierde nimic.
 * În media generală intră media modulelor începute (ca o materie; în modul ponderat, cu 1 oră).
 */
const PURTARE_KEY = "__purtare__";
const PURTARE_WEIGHT = 1;
const PURTARE_KEY_RE = /^\d{4}-[1-5]$/;

/* ==================== ANII ȘCOLARI ==================== */
/* Structura oficială a fiecărui an școlar (ordinul ministrului), după anul în care începe.
   Un an nou publicat = o intrare nouă aici; până atunci, anii următori se estimează din ultimul an cunoscut
   (aceleași săptămâni, mutate la primul luni din septembrie; sărbătorile legale recalculate, inclusiv Paștele). */
const SCHOOL_YEAR_DATA = {
    2026: {
        order: "OM nr. 3194/2026",
        m1: ["2026-09-07", "2026-10-23"], m2: ["2026-11-02", "2026-12-22"], m3Start: "2027-01-11",
        m4End: "2027-04-23", m5Start: "2027-05-05", end: "2027-06-18",
        lastDay: { 12: "2027-06-04", 8: "2027-06-11" },
        // vacanța mobilă (de schi): săptămâna o alege inspectoratul județean
        mobile: { feb15: "2027-02-15", feb22: "2027-02-22", mar01: "2027-03-01" },
        holidays: {
            "2026-11-30": "Sf. Andrei", "2026-12-01": "Ziua Națională", "2026-12-25": "Crăciunul",
            "2027-01-01": "Anul Nou", "2027-01-06": "Boboteaza", "2027-01-07": "Sf. Ioan",
            "2027-04-30": "Vinerea Mare", "2027-05-03": "Paștele (a doua zi)", "2027-05-04": "zi liberă după Paște", "2027-06-01": "Ziua Copilului"
        },
        notes: { "2026-10-05": "Ziua Educației", "2027-03-28": "Paștele catolic", "2027-05-02": "Paștele ortodox" }
    }
};
/* Datele școlare de pe serverul urNotes (când există; vezi js/api.js), păstrate în browser de la ultima vizită:
   un ordin nou al ministrului ajunge fără o versiune nouă a aplicației. Se aplică înainte de orice calcul de mai jos. */
const SCHOOL_CACHE_KEY = "urn_school_data_v1";
const schoolRemote = (() => {
    try {
        const d = JSON.parse(localStorage.getItem(SCHOOL_CACHE_KEY) || "null");
        return d && typeof d === "object" && d.years && typeof d.years === "object" ? d : null;
    } catch (_) { return null; }
})();
const isRemoteYear = v => v && Array.isArray(v.m1) && Array.isArray(v.m2) && v.mobile && v.lastDay && typeof v.end === "string";
if (schoolRemote) for (const [k, v] of Object.entries(schoolRemote.years)) if (/^\d{4}$/.test(k) && isRemoteYear(v)) SCHOOL_YEAR_DATA[k] = v;
const MOBILE_WEEKS = { feb15: "15–21 februarie", feb22: "22–28 februarie", mar01: "1–7 martie" };

// Datele aici se calculează la încărcare, înainte de utils.js: folosim propriile mici funcții de dată.
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ymdParse = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const ymdShift = (k, n) => { const d = ymdParse(k); d.setDate(d.getDate() + n); return ymd(d); };
const firstMondaySep = y => { const d = new Date(y, 8, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return ymd(d); };
/** Paștele ortodox (calendarul iulian, convertit în gregorian). */
function orthodoxEaster(y) {
    const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
    const julian = new Date(y, month - 1, day);
    julian.setDate(julian.getDate() + 13); // diferența iulian–gregorian (1900–2099)
    return ymd(julian);
}

const schoolYearCache = {};
/** Anul școlar care începe în `start` (ex. 2027 = 2027–2028): datele oficiale sau o estimare (estimated: true). */
function schoolYear(start) {
    start = Number(start);
    if (schoolYearCache[start]) return schoolYearCache[start];
    const known = Object.keys(SCHOOL_YEAR_DATA).map(Number).sort((a, b) => a - b);
    let y;
    if (SCHOOL_YEAR_DATA[start]) {
        y = { ...SCHOOL_YEAR_DATA[start], estimated: false };
    } else {
        const base = known.filter(k => k < start).pop() ?? known[0];
        const b = SCHOOL_YEAR_DATA[base];
        const delta = Math.round((ymdParse(firstMondaySep(start)) - ymdParse(b.m1[0])) / 86400000);
        const sh = k => ymdShift(k, delta);
        const easter = orthodoxEaster(start + 1);
        y = {
            order: "", estimated: true,
            m1: b.m1.map(sh), m2: b.m2.map(sh), m3Start: sh(b.m3Start), m4End: sh(b.m4End), m5Start: sh(b.m5Start), end: sh(b.end),
            lastDay: Object.fromEntries(Object.entries(b.lastDay).map(([c, k]) => [c, sh(k)])),
            mobile: Object.fromEntries(Object.entries(b.mobile).map(([w, k]) => [w, sh(k)])),
            holidays: {
                [`${start}-11-30`]: "Sf. Andrei", [`${start}-12-01`]: "Ziua Națională", [`${start}-12-25`]: "Crăciunul",
                [`${start + 1}-01-01`]: "Anul Nou", [`${start + 1}-01-06`]: "Boboteaza", [`${start + 1}-01-07`]: "Sf. Ioan",
                [ymdShift(easter, -2)]: "Vinerea Mare", [ymdShift(easter, 1)]: "Paștele (a doua zi)", [`${start + 1}-06-01`]: "Ziua Copilului"
            },
            notes: { [`${start}-10-05`]: "Ziua Educației", [easter]: "Paștele ortodox" }
        };
    }
    y.start = start;
    y.label = `${start}–${start + 1}`;
    return (schoolYearCache[start] = y);
}

/** Anul școlar al unei zile: din august începe anul următor. */
const schoolYearOfDate = dateKey => { const [yy, mm] = dateKey.split("-").map(Number); return mm >= 8 ? yy : yy - 1; };
const FIRST_SCHOOL_YEAR = Math.min(...Object.keys(SCHOOL_YEAR_DATA).map(Number));
/** Anul școlar de azi (cel puțin primul an cunoscut). */
const currentSchoolYear = () => Math.max(FIRST_SCHOOL_YEAR, schoolYearOfDate(ymd(new Date())));

/* Variantele de module ale unui an: câte una pentru fiecare săptămână de vacanță mobilă. Id-ul: „2026-feb22”. */
function modulePresetsFor(start) {
    const y = schoolYear(start);
    return Object.fromEntries(Object.keys(y.mobile).map(w => [`${start}-${w}`, {
        label: `${y.label} · vacanța mobilă ${MOBILE_WEEKS[w]}${y.estimated ? " (estimat)" : ""}`, year: start, week: w
    }]));
}
/** Varianta după id („2026-feb22”), din orice an; null dacă id-ul nu e valid. */
function modulePreset(id) {
    const m = /^(\d{4})-(feb15|feb22|mar01)$/.exec(String(id || ""));
    return m ? modulePresetsFor(Number(m[1]))[id] : null;
}
/* Compatibilitate: căutările vechi de forma MODULE_PRESETS[id] merg pentru orice an */
const MODULE_PRESETS = new Proxy({}, {
    get: (_, id) => typeof id === "string" ? modulePreset(id) || undefined : undefined,
    has: (_, id) => Boolean(modulePreset(id)),
    ownKeys: () => Object.keys(modulePresetsFor(currentSchoolYear())),
    getOwnPropertyDescriptor: (_, id) => modulePreset(id) ? { enumerable: true, configurable: true, value: modulePreset(id) } : undefined
});
const defaultPresetId = (start = currentSchoolYear()) => `${start}-feb22`;
const DEFAULT_MODULE_PRESET = defaultPresetId(FIRST_SCHOOL_YEAR);

function presetModules(id = defaultPresetId(), cls = 0) {
    const p = modulePreset(id) || modulePreset(defaultPresetId());
    const y = schoolYear(p.year);
    const mobile = y.mobile[p.week];
    return [
        { start: y.m1[0], end: y.m1[1] },
        { start: y.m2[0], end: y.m2[1] },
        { start: y.m3Start, end: ymdShift(mobile, -3) },
        { start: ymdShift(mobile, 7), end: y.m4End },
        { start: y.m5Start, end: y.lastDay[cls] || y.end }
    ];
}

/* Sărbătorile și notele tuturor anilor (cei cunoscuți + câțiva estimați înainte), într-un singur tabel după dată */
const SCHOOL_HOLIDAYS = {};
const SCHOOL_NOTES = {};
for (let yr = FIRST_SCHOOL_YEAR; yr <= Math.max(currentSchoolYear(), FIRST_SCHOOL_YEAR) + 3; yr++) {
    Object.assign(SCHOOL_HOLIDAYS, schoolYear(yr).holidays);
    Object.assign(SCHOOL_NOTES, schoolYear(yr).notes);
}

/* Județul alege săptămâna vacanței mobile (decizia inspectoratului școlar, anunțată pentru 2026–2027). */
const COUNTY_WEEK = {
    "Alba": "2026-mar01", "Arad": "2026-mar01", "Argeș": "2026-feb22", "Bacău": "2026-feb22", "Bihor": "2026-feb22",
    "Bistrița-Năsăud": "2026-feb15", "Botoșani": "2026-feb22", "Brăila": "2026-feb22", "Brașov": "2026-feb22",
    "București": "2026-feb22", "Buzău": "2026-mar01", "Călărași": "2026-feb22", "Caraș-Severin": "2026-mar01",
    "Cluj": "2026-feb15", "Constanța": "2026-feb22", "Covasna": "2026-feb22", "Dâmbovița": "2026-feb22",
    "Dolj": "2026-feb15", "Galați": "2026-feb22", "Giurgiu": "2026-feb22", "Gorj": "2026-feb22", "Harghita": "2026-feb22",
    "Hunedoara": "2026-feb22", "Ialomița": "2026-feb22", "Iași": "2026-feb22", "Ilfov": "2026-feb22", "Maramureș": "2026-feb22",
    "Mehedinți": "2026-feb22", "Mureș": "2026-feb22", "Neamț": "2026-feb22", "Olt": "2026-feb22", "Prahova": "2026-feb22",
    "Sălaj": "2026-feb22", "Satu Mare": "2026-feb22", "Sibiu": "2026-feb22", "Suceava": "2026-feb15", "Teleorman": "2026-feb22",
    "Timiș": "2026-feb22", "Tulcea": "2026-feb22", "Vâlcea": "2026-feb22", "Vaslui": "2026-feb22", "Vrancea": "2026-feb22"
};
/** Săptămânile de schi de pe server: cel mai nou an publicat. */
function applyRemoteCounties(counties) {
    const years = Object.keys(counties || {}).filter(y => /^\d{4}$/.test(y)).sort();
    const last = years.at(-1);
    if (!last) return;
    for (const [c, w] of Object.entries(counties[last] || {})) if (["feb15", "feb22", "mar01"].includes(w)) COUNTY_WEEK[c] = `${last}-${w}`;
}
if (schoolRemote) applyRemoteCounties(schoolRemote.counties);
/** Varianta de module a județului într-un an (săptămâna de schi se presupune aceeași de la an la an până la noul ordin). */
const countyPreset = (county, start = currentSchoolYear()) => COUNTY_WEEK[county] ? `${start}-${COUNTY_WEEK[county].split("-")[1]}` : "";
const COUNTIES = Object.keys(COUNTY_WEEK).sort((a, b) => a.localeCompare(b, "ro"));
const countyOptions = selected => `<option value="">Alege județul…</option>${COUNTIES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("")}`;

/* Culoarea fiecărei materii (plăcile din Note, evenimentele din calendar, planul). Cele mai obișnuite au culoarea lor;
   restul primesc una stabilă, după nume. */
const SUBJECT_COLORS = ["tomato", "tangerine", "sun", "lime", "mint", "teal", "sky", "blue", "grape", "pink"];
const SUBJECT_COLOR_FIXED = {
    "Limba și literatura română": "tomato", "Matematică": "blue", "Limba engleză": "sky", "Fizică": "grape", "Chimie": "teal",
    "Biologie": "lime", "Istorie": "tangerine", "Geografie": "mint", "Informatică": "pink", "TIC": "pink",
    "Educație fizică și sport": "sun", "Educație fizică": "sun", "Religie": "sun", "Limba franceză": "sky", "Limba germană": "sky",
    "Logică, argumentare și comunicare": "grape", "Psihologie": "pink", "Economie": "mint", "Filosofie": "grape", "Dirigenție": "teal"
};
function subjectColor(mat = "") {
    if (SUBJECT_COLOR_FIXED[mat]) return SUBJECT_COLOR_FIXED[mat];
    let h = 0;
    for (const ch of String(mat)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
}
/** Pe culorile deschise scriem cu cerneală închisă, pe cele închise cu alb (contrast bun pe ambele). */
const LIGHT_SUBJECT_COLORS = new Set(["sun", "lime", "mint", "sky", "teal", "tangerine", "tomato", "pink"]);
const subjectStyle = mat => {
    const c = subjectColor(mat);
    // pe albastru și mov scriem cu alb, pe o nuanță puțin mai închisă (contrast de cel puțin 4.5:1)
    return LIGHT_SUBJECT_COLORS.has(c) ? `--subj: var(--c-${c}); --subj-ink: #16122A`
        : `--subj: var(--c-${c}); --subj-ink: #FFFFFF; --subj-chip: color-mix(in srgb, var(--c-${c}) 80%, #16122A)`;
};
/** Inițialele de pe placa materiei (ex. „Română” → „Ro”, „Limba engleză” → „En”). */
const subjectInitials = mat => { const s = shortSubjectName(mat).replace(/[^\p{L}\p{N} ]/gu, "").trim(); const w = s.split(/\s+/); return (w.length > 1 && w[1] ? w[0][0] + w[1][0] : s.slice(0, 2)).replace(/^./, c => c.toUpperCase()); };

/* Stilul aplicației: „notion” (simplu, ca o pagină albă) sau „urnotes” (colorat, cu post-it-uri) */
const APP_STYLES = ["notion", "urnotes"];

const REMIND_TIMES = ["16:00", "17:00", "18:00", "19:00", "19:30", "20:00", "20:30", "21:00", "22:00"];

const DEFAULT_SETTINGS = {
    goals: { primary: "gpa", targetGPA: 10, minGPA: 9 },
    calc: { method: "arithmetic", rounding: "2", riskThreshold: 8, riskDrop: 0.5, rev: 2 },
    // Amintirea de seară: ce ai mâine (teste, teme) și ce-a rămas din planul de azi
    remind: { on: false, time: "19:00", ahead: true },
    targets: { tens: 20, evals: 30 },
    appearance: { theme: "system", accent: "violet", style: "notion" },
    // Modulele anului școlar (pentru purtare): [{ start, end }] × 5
    modules: presetModules(),
    // Raportul pentru printare: datele de pe antet, perioada și secțiunile alese ultima dată
    report: { name: "", cls: "", period: "year", sections: {} },
    // Personalizare: cum îl cheamă pe elev și cum și-a botezat mascota (post-it-ul de pe pagina Azi)
    profile: { name: "", buddy: "Tiți" },
    // Programa elevului (aleasă în configurare): de ea depind materiile care se pot adăuga
    school: { profile: "", cls: 0, variant: "", lm2: "Limba franceză", county: "" }
};

const REPORT_SECTIONS = [
    { key: "grades", label: "Toate notele, pe fiecare materie", on: true },
    { key: "need", label: "Ce notă îți trebuie la următoarea evaluare", on: true },
    { key: "chart", label: "Graficul mediei generale", on: true },
    { key: "modules", label: "Mediile pe module și purtarea", on: true },
    { key: "upcoming", label: "Evaluările din următoarele 30 de zile", on: true },
    { key: "tips", label: "Recomandări", on: true },
    { key: "plan", label: "Planul de studiu pentru următoarele 7 zile", on: false },
    { key: "sign", label: "Loc pentru semnătura părintelui", on: false }
];

const ACHIEVEMENTS = [
    { key: "first_grade", icon: "trophy", label: "Prima notă", toast: "🏆 Prima notă înregistrată!", test: m => m.totalGrades >= 1 },
    { key: "five_tens", icon: "flame", label: "5 note de 10", toast: "🔥 Ai acumulat 5 note de 10!", test: m => m.tensCount >= 5 },
    { key: "high_avg", icon: "trend-up", label: "Media peste 9", toast: "📈 Media generală a depășit 9.00!", test: m => m.globalAvg >= 9 },
    { key: "perfect_10", icon: "target", label: "Media 10", toast: "🎯 Performanță maximă: media 10.00!", test: m => m.globalAvg >= 10 },
    { key: "ten_evals", icon: "notebook", label: "10 evaluări", toast: "📚 10 evaluări înregistrate!", test: m => m.totalGrades >= 10 },
    { key: "twenty_tens", icon: "medal", label: "20 de note de 10", toast: "🎖 20 de note de 10. Impresionant!", test: m => m.tensCount >= 20 },
    { key: "no_risk", icon: "shield", label: "Nicio materie la risc", toast: "🎯 Nicio materie la risc, cu cel puțin 15 note!", test: m => m.totalGrades >= 15 && m.riskCount === 0 },
    { key: "plan_10", icon: "calendar-check", label: "10 sesiuni din plan", toast: "✅ Ai făcut 10 sesiuni din plan!", test: () => state.pal.plan >= 10 },
    { key: "plan_50", icon: "flame", label: "50 de sesiuni din plan", toast: "🔥 50 de sesiuni din plan. Disciplină de campion!", test: () => state.pal.plan >= 50 },
    { key: "exam_first", icon: "graduation", label: "Prima variantă de examen", toast: "🎓 Primul rezultat la o variantă de examen!", test: () => state.exams.practice.length >= 1 },
    { key: "year_done", icon: "award", label: "Un an școlar încheiat", toast: "🏆 Primul an școlar arhivat!", test: () => state.archive.length >= 1 }
];

// Culoarea cernelii: o nuanță pentru caiet (luminos) și una mai deschisă, ca de cretă, pentru tablă (întunecat).
const ACCENTS = {
    violet: { light: "#5B3CC4", dark: "#C3A6FF" },
    blue: { light: "#2347C5", dark: "#8DB4FF" },
    pink: { light: "#B8336A", dark: "#FF9EC0" },
    green: { light: "#18794E", dark: "#8FDCAF" },
    orange: { light: "#C2410C", dark: "#FFB27A" }
};
const MONTHS = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
const GRADE_TYPES = ["Test", "Ascultare", "Temă", "Proiect", "Teză", "Altele"];
const EVENT_TYPES = ["Test", "Examen", "Temă", "Proiect", "Prezentare", "Personal"];
const EXAM_TYPES = new Set(["Test", "Examen"]);
