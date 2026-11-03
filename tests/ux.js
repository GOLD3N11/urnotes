const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
// Ceas fix: joi 8 oct 2026, 09:30 (Modulul 1)
w.eval(`(() => { const Real = Date; let now = new Real(2026, 9, 8, 9, 30).getTime();
  class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
  window.Date = FakeDate; window.__setNow = (...a) => { now = new Real(...a).getTime(); }; })()`);
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Matematica": { ore: 4, target: 10, grades: [{ val: 3, type: "Test", date: "2026-09-20" }, { val: 5, type: "Ascultare", date: "2026-10-02" }] },
  "Fizica": { ore: 2, target: 9, grades: [{ val: 9, type: "Test", date: "2026-09-18" }, { val: 10, type: "Proiect", date: "2026-10-06" }] },
  "Chimie": { ore: 2, target: 9, grades: [] },
  "Romana": { ore: 4, target: 10, priority: true, grades: [{ val: 8, type: "Teză", date: "2026-09-25" }] }
}));
w.localStorage.setItem("pro_timetable_db_v4", JSON.stringify({ 4: ["Matematica", "Fizica", "Romana"], 5: ["Chimie", "Fizica"], 1: ["Romana"] }));
w.localStorage.setItem("pro_calendar_db_v4", JSON.stringify({
  "2026-10-08": [{ id: "tf", title: "Test Fizica", type: "Test", subject: "Fizica", time: "08:00" }],
  "2026-10-09": [{ id: "hr", title: "Temă Romana", type: "Temă", subject: "Romana" }],
  "2026-10-10": [{ id: "ex", title: "Teză Matematica", type: "Examen", subject: "Matematica" }],
  "2026-10-05": [{ id: "tc", title: "Test Chimie", type: "Test", subject: "Chimie" }],
  "2026-10-06": [{ id: "hf", title: "Temă Fizica", type: "Temă", subject: "Fizica" }],
  "2026-10-12": [{ id: "ex2", title: "Lucrare cap. 3", type: "Test", subject: "Romana" }],
  "2026-10-13": [{ id: "rep", title: "Temă Fizica", type: "Temă", subject: "Fizica", repeat: { every: 1, until: "" } }]
}));
w.localStorage.setItem("pro_simulator_db_v4", JSON.stringify({ active: "s1", selected: "Fizica", scenarios: [{ id: "s1", name: "Scenariul 1", hypo: { Fizica: [{ id: "h1", val: 9, type: "Test" }] } }, { id: "s2", name: "Plan B", hypo: {} }] }));
w.localStorage.setItem("pro_settings_db_v4", JSON.stringify({ appearance: { accent: "blue" } }));
w.localStorage.setItem("pro_purtare_db_v4", JSON.stringify({ grades: {}, lastModule: "2026-1" }));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,get metrics(){return metrics},get sim(){return sim},get alerts(){return alerts}};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const txt = id => $(id).textContent.replace(/\s+/g, " ").trim();
const at = (...a) => { w.__setNow(...a); T.ui.home.day = null; T.refresh(); };

const toastBtn = () => [...w.document.querySelectorAll(".toast:not(.leaving) .toast-action")].at(-1);
const lastToast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1);
const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
const nav = tab => click(q(`[data-action="nav"][data-tab="${tab}"]`));
(async () => {
  await new Promise(r => setTimeout(r, 50));
  // nota: butoanele 1–10 și Azi/Ieri
  const b = w.document.createElement("button"); b.dataset.action = "add-grade"; b.dataset.mat = "Chimie"; w.document.body.append(b); click(b);
  // „+ Notă” deschide bara de adăugat (faza 3), cu materia aleasă și tipul Notă
  const vals = qa("#cc-overlay .cc-val");
  assert(!$("cc-overlay").hidden && vals.length === 10 && q("#cc-overlay .cc-subj.is-on")?.dataset.mat === "Chimie", "10 grade buttons in the add bar, subject preset");
  click(q('#cc-overlay .cc-val[data-val="7"]'));
  assert(q("#cc-overlay .cc-val.is-on")?.dataset.val === "7", "pick 7");
  click(q('#cc-overlay .cc-val[data-val="9"]'));
  assert(q("#cc-overlay .cc-val.is-on")?.dataset.val === "9", "pick 9 replaces it");
  click(qa("#cc-overlay .cc-day").find(x => x.textContent.trim() === "Ieri"));
  assert(q("#cc-overlay .cc-day.is-on")?.dataset.date === "2026-10-07", "Ieri → yesterday");
  click(qa("#cc-overlay .cc-day").find(x => x.textContent.trim() === "Azi"));
  assert(q("#cc-overlay .cc-day.is-on")?.dataset.date === "2026-10-08", "Azi → today");
  click(q("#cc-overlay .cc-add"));
  await new Promise(r => setTimeout(r, 20));
  assert($("cc-overlay").hidden, "bar closes after adding");
  assert(T.state.subjects.Chimie.grades.some(g => g.val == 9 && g.date === "2026-10-08"), "grade saved with today's date");
  // simulatorul: doar materiile schimbate
  nav("tab-simulator");
  const rows = () => qa("#tab-simulator tbody tr").length;
  const before = rows();
  const tog = q('[data-action="sim-toggle-all"]');
  assert(tog && /Toate materiile/.test(tog.textContent), "toggle offered");
  click(tog);
  assert(rows() > before && /Doar cele schimbate/.test(q('[data-action="sim-toggle-all"]').textContent), `toggle shows all (${before} → ${rows()})`);
  console.log(process.exitCode ? "SOME FAILED" : "ALL PASSED");
})();
