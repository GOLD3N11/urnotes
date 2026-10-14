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
    plan: "pro_plan_db_v4"            // planul de studiu: preferințe de timp + sesiuni (vezi PLANUL MEU)
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

/** Structura anului școlar 2026–2027 (OM nr. 3194/2026). Modulele 3–4 depind de vacanța mobilă a județului. */
const MODULE_PRESETS = {
    "2026-feb15": { label: "2026–2027 · vacanța mobilă 15–21 februarie", m3End: "2027-02-12", m4Start: "2027-02-22" },
    "2026-feb22": { label: "2026–2027 · vacanța mobilă 22–28 februarie", m3End: "2027-02-19", m4Start: "2027-03-01" },
    "2026-mar01": { label: "2026–2027 · vacanța mobilă 1–7 martie", m3End: "2027-02-26", m4Start: "2027-03-08" }
};
const DEFAULT_MODULE_PRESET = "2026-feb22";

/* Structura anului școlar 2026–2027 (Ministerul Educației): zilele libere din timpul modulelor
   și ultima zi de cursuri, mai devreme pentru a XII-a (4 iunie) și a VIII-a (11 iunie). */
const SCHOOL_HOLIDAYS = {
    "2026-11-30": "Sf. Andrei", "2026-12-01": "Ziua Națională", "2026-12-25": "Crăciunul",
    "2027-01-01": "Anul Nou", "2027-01-06": "Boboteaza", "2027-01-07": "Sf. Ioan",
    "2027-04-30": "Vinerea Mare", "2027-05-03": "Paștele (a doua zi)", "2027-05-04": "zi liberă după Paște", "2027-06-01": "Ziua Copilului"
};
const SCHOOL_NOTES = { "2026-10-05": "Ziua Educației", "2027-03-28": "Paștele catolic", "2027-05-02": "Paștele ortodox" };
const LAST_DAY_BY_CLASS = { 12: "2027-06-04", 8: "2027-06-11" };

function presetModules(id = DEFAULT_MODULE_PRESET, cls = 0) {
    const p = MODULE_PRESETS[id] || MODULE_PRESETS[DEFAULT_MODULE_PRESET];
    return [
        { start: "2026-09-07", end: "2026-10-23" },
        { start: "2026-11-02", end: "2026-12-22" },
        { start: "2027-01-11", end: p.m3End },
        { start: p.m4Start, end: "2027-04-23" },
        { start: "2027-05-05", end: LAST_DAY_BY_CLASS[cls] || "2027-06-18" }
    ];
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
const COUNTIES = Object.keys(COUNTY_WEEK).sort((a, b) => a.localeCompare(b, "ro"));
const countyOptions = selected => `<option value="">Alege județul…</option>${COUNTIES.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("")}`;

const REMIND_TIMES = ["16:00", "17:00", "18:00", "19:00", "19:30", "20:00", "20:30", "21:00", "22:00"];

const DEFAULT_SETTINGS = {
    goals: { primary: "gpa", targetGPA: 10, minGPA: 9 },
    calc: { method: "arithmetic", rounding: "2", riskThreshold: 8, riskDrop: 0.5, rev: 2 },
    // Amintirea de seară: ce ai mâine (teste, teme) și ce-a rămas din planul de azi
    remind: { on: false, time: "19:00" },
    targets: { tens: 20, evals: 30 },
    appearance: { theme: "system", accent: "violet", density: "normal", cursor: "off" },
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
    { key: "ten_evals", icon: "notebook", label: "10 evaluări", toast: "📚 10 evaluări înregistrate!", test: m => m.totalGrades >= 10 }
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
