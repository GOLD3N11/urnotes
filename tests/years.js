// Anii școlari: motorul de calendar pe ani, arhiva, migrările
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

function boot(ls = {}, now = [2027, 5, 20, 10, 0]) {
  const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script[^>]*src=[^>]+><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
  w.CSS = { escape: s => s.replace(/"/g, '\\"') };
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  w.eval(`(() => { const Real = Date; let now = new Real(${now.join(",")}).getTime();
    class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
    window.Date = FakeDate; window.__setNow = (...a) => { now = new Real(...a).getTime(); }; })()`);
  for (const [k, v] of Object.entries(ls)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,presetModules,schoolYear,orthodoxEaster,SCHOOL_HOLIDAYS,isSchoolDay,sanitizeArchive,buildBackup,parseBackup,readStoredData,DATA_SCHEMA,nextYearPlan,get metrics(){return metrics},get sim(){return sim}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const toast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "";
  return { w, T, $, q, qa, click, toast };
}



const DATA = {
  "pro_setup_done_v4": "1", "pro_tour_done_v4": "1",
  "pro_catalog_db_v4": {
    "Matematică": { ore: 4, target: 10, grades: [{ val: 9, type: "Test", date: "2027-05-20" }, { val: 10, type: "Test", date: "2027-06-01" }] },
    "Fizică": { ore: 3, target: 9, grades: [{ val: 8, type: "Test", date: "2027-05-18" }] },
    "Limba și literatura română": { ore: 3, target: 10, grades: [{ val: 9, type: "Teză", date: "2027-03-01" }] }
  },
  "pro_calendar_db_v4": {
    "2027-06-02": [{ id: "old", title: "Test vechi", type: "Test", subject: "Fizică" }],
    "2027-09-10": [{ id: "fall", title: "Ceva în toamnă", type: "Personal", subject: "" }]
  },
  "pro_timetable_db_v4": { 1: ["Matematică", "Fizică"] },
  "pro_settings_db_v4": { school: { profile: "mate-info", cls: 11, variant: "intensiv", lm2: "Limba franceză", county: "Cluj" }, calc: { rev: 2 } }
};

(async () => {
  const { w, T, $, q, qa, click, toast } = boot(DATA); await new Promise(r => setTimeout(r, 30));
  // motorul anilor
  assert(T.orthodoxEaster(2027) === "2027-05-02" && T.orthodoxEaster(2028) === "2028-04-16", "Easter: 2027-05-02, 2028-04-16");
  const y27 = T.schoolYear(2027);
  assert(y27.estimated && y27.m1[0] === "2027-09-06" && y27.label === "2027–2028", "2027–2028 estimated, starts first Monday of September");
  assert(T.SCHOOL_HOLIDAYS["2027-12-01"] && T.SCHOOL_HOLIDAYS["2028-04-14"], "holidays known for the next year (incl. Easter Friday)");
  assert(T.presetModules("2026-feb15")[2].end === "2027-02-12" && T.presetModules("2026-mar01", 12)[4].end === "2027-06-04", "2026 presets unchanged");
  assert(!T.schoolYear(2026).estimated && T.schoolYear(2026).order.includes("3194"), "2026–2027 official");

  // migrare: date fără versiune → arhivă goală, schema curentă la salvare
  assert(Array.isArray(T.state.archive) && T.state.archive.length === 0, "migration: archive starts empty");
  T.refresh();
  assert(JSON.parse(w.localStorage.getItem("pro_meta_v4")).schema === T.DATA_SCHEMA, "meta: schema saved");

  // sfârșitul anului: card pe Azi
  assert(!$("azi-year").hidden && /Gata cu anul 2026–2027/.test($("azi-year").textContent), "Azi: end-of-year card");
  const gpa = T.metrics.globalAvg;
  click(q('#azi-year [data-action="year-close"]'));
  assert(/Închei anul 2026–2027/.test($("action-modal-title").textContent) && /clasa a XII-a/.test($("action-modal-body").textContent), "close dialog explains next class");
  click($("action-modal-confirm"));
  const a = T.state.archive[0];
  assert(a && a.year === 2026 && a.cls === 11 && a.gpa === gpa && a.subjects["Matematică"].grades.length === 2, "archive keeps the year's grades and GPA");
  assert(T.state.settings.school.cls === 12 && T.state.settings.modules[0].start === "2027-09-06", "next year: class XII, 2027 modules");
  assert(T.state.settings.modules[4].end === T.schoolYear(2027).lastDay[12], "XII: last day of the new year");
  assert(Object.values(T.state.subjects).every(s => s.grades.length === 0) && T.state.subjects["Matematică"], "subjects kept, grades cleared");
  assert(!T.state.calendar["2027-06-02"] && T.state.calendar["2027-09-10"], "old tests removed, autumn event kept");
  assert(T.state.history.length === 0 && T.state.plan.items.length === 0 && Object.keys(T.state.purtare.grades).length === 0, "history/plan/purtare reset");
  assert(/anul trecut/.test($("azi-tiles").textContent) || T.metrics.globalAvg === 0, "average tile mentions last year");

  // anulare
  click(q(".toast .toast-action"));
  assert(T.state.archive.length === 0 && T.state.settings.school.cls === 11 && T.state.subjects["Matematică"].grades.length === 2 && T.state.calendar["2027-06-02"], "undo restores everything");

  // din nou + Setări + vizualizare
  click(q('#azi-year [data-action="year-close"]')); click($("action-modal-confirm"));
  click(q('[data-action="nav"][data-tab="tab-setari"]'));
  assert(/2027–2028/.test($("year-setting").textContent) && q('[data-action="year-open"][data-year="2026"]'), "settings: new year + archive list");
  assert(/2027–2028/.test($("year-label").textContent) && /estimate/.test($("year-source").textContent), "modules card: next year, estimated");
  click(q('[data-action="year-open"][data-year="2026"]'));
  assert(/Anul 2026–2027/.test($("action-modal-title").textContent) && qa(".year-table tbody tr").length === 3, "archived year viewer");
  click($("action-modal-cancel"));

  // backup și cont: arhiva + versiunea merg cu datele
  const back = T.parseBackup(JSON.stringify(T.buildBackup())).loaded.data;
  assert(back.archive.length === 1 && back.archive[0].year === 2026, "backup round trip keeps archive");
  assert(T.buildBackup().data.meta.schema === T.DATA_SCHEMA, "backup carries schema");
  assert(T.sanitizeArchive([{ year: 2026, subjects: { X: { grades: [{ val: 11 }, { val: 9, type: "Test" }] } } }, { year: 2026 }, { year: "x" }])[0].subjects.X.grades.length === 1, "sanitizeArchive drops bad grades, duplicates, bad years");

  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
  process.exit(process.exitCode || 0);
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; process.exit(1); });
