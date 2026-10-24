/* urNotes · Starea aplicației (datele salvate), rezultatele calculate și starea interfeței.
   Se încarcă după toate fișierele cu funcții, fiindcă valorile inițiale le folosesc (defaultPlan, emptyMetrics…). */
"use strict";

/* ==================== STATE ==================== */
// `state` conține doar date salvate. Tot ce se calculează stă în `metrics`.
const state = {
    subjects: {},
    calendar: {},
    timetable: {},
    purtare: defaultPurtare(),
    activity: [],
    history: [],
    alertMeta: { dismissed: {}, read: {} },
    achievements: Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, false])),
    settings: clone(DEFAULT_SETTINGS),
    plan: defaultPlan(),
    archive: [],     // anii școlari încheiați (js/years.js)
    exams: defaultExams(), // Evaluarea Națională / Bacalaureat (js/exams.js)
    pal: defaultPal()      // colegul care crește (js/growth.js)
};

let metrics = emptyMetrics();
let alerts = [];

const ui = {
    activeTab: "tab-dashboard",
    cal: { view: (() => { try { const v = localStorage.getItem("urn_cal_view_v1"); return ["agenda", "week", "month", "table", "board"].includes(v) ? v : "agenda"; } catch (_) { return "agenda"; } })(), date: getLocalDateKey() }, // ziua în jurul căreia se afișează săptămâna/luna
    ttDraft: null,
    examSim: {},     // Examene: notele încercate în „Ce medie ai lua” (nu se salvează)
    ttDay: 1,
    // Catalog: materia deschisă, căutare, sortare, filtru; showDetail = pe telefon, detaliile acoperă lista
    catalog: { selected: "", query: "", sort: "risk", filter: "all", showDetail: false, autoPicked: true, collapsed: {} },
    charts: {},
    home: { day: null },     // Azi: null = automat (după-amiaza arată ziua următoare), "today" | "next"
    statsSort: "attention",
    statsPeriod: "year",   // perioada pentru Materii / Note / Timp
    statsAnimate: false,   // animațiile rulează la deschiderea tabului, nu la fiecare recalculare
    modalReturnFocus: null
};
