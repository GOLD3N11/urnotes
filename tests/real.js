const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+|shared\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
// joi, 8 oct 2026 (Modulul 1, zi de școală)
const BASE = new Date(2026, 9, 8, 10, 0).getTime();
w.eval(`(() => { const Real = Date; class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(${BASE}); else super(...a); } static now() { return ${BASE}; } } window.Date = FakeDate; })()`);
const seed = {
  pro_setup_done_v4: "1", pro_tour_done_v4: "1",
  pro_catalog_db_v4: { "Matematică": { ore: 4, target: 9, grades: [] }, "Fizică": { ore: 2, target: 9, grades: [] }, "Chimie": { ore: 2, target: 9, grades: [] }, "Biologie": { ore: 2, target: 9, grades: [] } }
};
for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,realBurst,findUnrealistic,cleanUnrealistic,lastSchoolDay,isSchoolDay,ccOpenGlobal,get R(){return URN_RULES}};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const toast = () => qa(".toast .toast-text").map(t => t.textContent).at(-1) || "";
const day = n => { const d = new Date(BASE); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const add = (type, mat, date, text = "") => {
  T.ccOpenGlobal({ type, mat, date });
  if (text) { $("cc-text").value = text; $("cc-text").dispatchEvent(new w.Event("input", { bubbles: true })); }
  const ccq = s => q("#cc-overlay-host " + s) || q("#cal-compose " + s);
  if (!mat) click(ccq('.cc-chip.cc-ghost') || ccq('[data-action="cc-subject"][data-mat=""]'));
  click(ccq(".cc-add"));
  q('[data-action="cc-overlay-close"]') && !$("cc-overlay").hidden && click(q('[data-action="cc-overlay-close"]'));
};
const on = date => (T.state.calendar[date] || []);

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  const tue = day(5); // marți 13 oct
  // evaluări pe zi
  add("Test", "Matematică", tue); add("Test", "Fizică", tue); add("Examen", "Chimie", tue);
  assert(on(tue).length === 3, "3 evaluations on a school day are fine");
  add("Test", "Biologie", tue);
  assert(on(tue).length === 3 && /cel mult 3 evaluări/.test(toast()), "a 4th evaluation the same day is refused");
  T.realBurst.length = 0;
  const wed = day(6);
  add("Examen", "Matematică", wed); add("Examen", "Fizică", wed);
  assert(on(wed).filter(e => e.type === "Examen").length === 1 && /o singură teză/.test(toast()), "one teză per day");
  add("Test", "Matematică", day(7)); add("Test", "Matematică", day(7));
  assert(on(day(7)).length === 1 && /deja un test la Matematică/.test(toast()), "no two tests at the same subject on one day");
  add("Test", "", day(7));
  assert(on(day(7)).length === 1 && /Alege materia/.test(toast()), "a test needs a subject");
  T.realBurst.length = 0;
  add("Test", "Chimie", day(2));
  assert(!on(day(2)).length && /weekend/.test(toast()), "no tests on Saturday");
  add("Test", "Chimie", "2026-10-28");
  assert(!on("2026-10-28").length && /vacanță/.test(toast()), "no tests in the autumn holiday");
  // titluri curățate
  add("Personal", "", day(8), "ziua lui 🎉🎉🎉🎉🎉 bunicu bunicu bunicu bunicu");
  const p = on(day(8))[0];
  assert(p && [...p.title].filter(c => /\p{Extended_Pictographic}/u.test(c)).length <= 2 && !/bunicu bunicu/i.test(p.title), "titles: emoji spam and repeated words cleaned: " + (p && p.title));
  // cel mult 8 lucruri pe zi
  T.realBurst.length = 0;
  const thu = day(14);
  ["Matematică", "Fizică", "Chimie", "Biologie"].forEach(m => add("Temă", m, thu));
  ["Matematică", "Fizică", "Chimie", "Biologie"].forEach(m => add("Proiect", m, thu));
  T.realBurst.length = 0;
  add("Prezentare", "Matematică", thu);
  assert(on(thu).length === 8 && /mai mult de 8/.test(toast()), "at most 8 things on one day");
  // prea repede
  T.realBurst.length = 0;
  for (let i = 0; i < 9; i++) add("Personal", "", day(30 + i), `lucru ${String.fromCharCode(97 + i)} nou`);
  assert(/prea repede/.test(toast()) && Array.from({ length: 9 }, (_, i) => on(day(30 + i)).length).reduce((a, b) => a + b, 0) === 8, "adding faster than a human is slowed down (8 in 20 s)");
  // note
  T.realBurst.length = 0;
  T.state.subjects["Fizică"].grades.push({ id: "g1", val: 8, type: "Test", date: day(0) }, { id: "g2", val: 9, type: "Test", date: day(0) }); T.refresh();
  T.ccOpenGlobal({ type: "Notă", mat: "Fizică" });
  click(q('#cc-overlay-host .cc-val[data-val="10"]')); click(q("#cc-overlay-host .cc-add"));
  assert(T.state.subjects["Fizică"].grades.length === 2 && /2 note pe zi/.test(toast()), "at most 2 grades per subject per day");
  click(q('[data-action="cc-overlay-close"]'));
  assert(T.R.gradeProblem({ val: 9, date: day(2) }, [], 0, { today: day(9), modules: T.state.settings.modules }), "grades: not on weekends");
  assert(T.R.gradeProblem({ val: 9, date: day(3) }, [], 0, { today: day(0), modules: T.state.settings.modules }), "grades: not from the future");
  assert(T.lastSchoolDay("2026-10-28") === "2026-10-23" && !T.isSchoolDay("2026-10-31"), "last school day before the holiday is Friday 23 Oct");
  // materii
  const names = Object.keys(T.state.subjects);
  assert(T.R.subjectProblem("hackerologie", names) && T.R.subjectProblem("Qqwertyui", names) && T.R.subjectProblem("Educație fizică", ["Educație fizică și sport"]) && !T.R.subjectProblem("Geografie", names) && !T.R.subjectProblem("Opțional – Educație financiară", names), "subjects: only real ones (or an optional), no duplicates");
  assert(T.R.subjectProblem("constructor", []) && T.R.subjectProblem("toString", []), "reserved JavaScript names are never subjects");
  // curățenie
  T.realBurst.length = 0;
  const spam = day(19);
  T.state.calendar[spam] = Array.from({ length: 30 }, (_, i) => ({ id: "s" + i, title: i % 2 ? "Qqwertyui" : "Test", type: "Test", subject: i % 3 ? "Matematică" : "" }));
  T.state.subjects["hackerologie"] = { ore: 1, target: 9, grades: [] };
  T.refresh();
  const f = T.findUnrealistic();
  assert(f.events.length >= 29 && f.subjects.some(s => s.name === "hackerologie") && !q("#azi-real").hidden && /nu pare real/.test($("azi-real").textContent), "spam found and shown on Azi: " + f.events.length + " events");
  click(q('#azi-real [data-action="reality-clean"]'));
  assert(on(spam).length <= 3 && !T.state.subjects["hackerologie"] && T.state.subjects["Matematică"] && on(spam).every(e => !/qwerty/i.test(e.title)), "cleanup keeps a realistic day and drops invented subjects");
  assert(q("#azi-real").hidden, "card goes away once clean");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
  process.exit(process.exitCode || 0);
})().catch(e => { console.error("CRASH", e); process.exit(1); });
