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
  // nota: fără confirmare, cu Anulează
  nav("tab-catalog"); click(q('.cat-row[data-mat="Fizica"]') || [...w.document.querySelectorAll(".cat-row")].find(r => /Fizica/.test(r.textContent)));
  const before = JSON.stringify(T.state.subjects.Fizica.grades);
  click(q('#cat-detail [data-action="delete-grade"]'));
  assert($("action-modal").hidden && T.state.subjects.Fizica.grades.length === 1, "grade deleted at once, no confirm dialog");
  assert(/Ai șters nota/.test(lastToast()) && toastBtn() && /Anulează/.test(toastBtn().textContent), "toast says what was deleted + Anulează");
  click(toastBtn());
  assert(JSON.stringify(T.state.subjects.Fizica.grades) === before && /pus totul la loc/.test(lastToast()), "Anulează restores the grade exactly");
  assert(JSON.parse(w.localStorage.getItem("pro_catalog_db_v4")).Fizica.grades.length === 2, "restored grade is saved");

  // materia: Ctrl+Z
  click(q('#cat-detail [data-action="delete-subject"]'));
  assert(!T.state.subjects.Fizica && /Ai șters materia Fizica și 2 note/.test(lastToast()), "subject deleted at once (message counts grades)");
  assert(!T.sim.scenarios[0].hypo.Fizica, "its simulator grades are pruned too");
  key("z", { ctrlKey: true });
  assert(T.state.subjects.Fizica?.grades.length === 2 && T.sim.scenarios[0].hypo.Fizica?.length === 1, "Ctrl+Z brings back subject + simulator grades");
  assert(T.state.timetable[4].includes("Fizica"), "timetable entry restored too");
  assert(q("#cat-detail .cat-title")?.textContent === "Fizica", "restored subject is selected again");
  key("z", { ctrlKey: true });
  assert(T.state.subjects.Fizica, "second Ctrl+Z does nothing (undo used)");

  // anularea expiră dacă între timp s-a schimbat altceva
  click(q('#cat-detail [data-action="delete-grade"]'));
  const undo = toastBtn();
  T.state.subjects.Romana.grades.push({ val: 10, type: "Test", date: "2026-10-08" }); T.refresh();
  click(undo);
  assert(T.state.subjects.Fizica.grades.length === 1 && T.state.subjects.Romana.grades.length === 2 && /Nu mai pot anula/.test(lastToast()), "undo refused after other changes (keeps newer data)");

  // Ctrl+Z într-un câmp nu anulează
  click(q('#cat-detail [data-action="delete-grade"]'));
  const field = $("cat-search"); field.focus(); key("z", { ctrlKey: true }, field);
  assert(T.state.subjects.Fizica.grades.length === 0, "Ctrl+Z while typing is left to the field");

  // eveniment simplu + serie
  nav("tab-calendar");
  T.ui.cal.date = "2026-10-12"; T.refresh();
  click(q('.cal-ev[data-id="ex2"] .cal-ev-main')); click(q('[data-action="event-delete"]'));
  assert($("action-modal").hidden && !T.state.calendar["2026-10-12"] && /Ai șters „Lucrare cap. 3”/.test(lastToast()), "single event deleted at once");
  click(toastBtn());
  assert(T.state.calendar["2026-10-12"]?.[0].id === "ex2", "event restored");
  click(q('.cal-ev[data-id="rep"][data-date="2026-10-13"] .cal-ev-main')); click(q('[data-action="event-delete"]'));
  assert(qa("#action-modal-body .reset-option-card").length === 2, "repeating event still asks: only this / whole series");
  click(q('[data-action="event-delete-one"]'));
  assert($("action-modal").hidden && T.state.calendar["2026-10-13"][0].skipDates.includes("2026-10-13") && /doar pe/.test(lastToast()), "only this occurrence, with undo");
  click(toastBtn());
  assert(!T.state.calendar["2026-10-13"][0].skipDates?.includes("2026-10-13"), "occurrence restored");

  // notificare ascunsă
  click($("notif-btn"));
  const n = T.alerts.length;
  click(q('#alerte-container [data-action="dismiss-alert"]'));
  assert(T.alerts.length === n - 1 && /Notificare ascunsă/.test(lastToast()), "dismiss notification, with undo");
  click(toastBtn());
  assert(T.alerts.length === n, "notification back");
  key("Escape");

  // anularea închide un formular deschis (ar lucra pe date vechi) + mesajul de confirmare are iconița potrivită
  nav("tab-catalog"); click([...w.document.querySelectorAll(".cat-row")].find(r => /Romana/.test(r.textContent)));
  const romBefore = T.state.subjects.Romana.grades.length;
  click(q('#cat-detail [data-action="delete-grade"]'));
  const undoBtn = toastBtn();
  click(q('#cat-detail [data-action="edit-subject"]'));
  assert(!$("action-modal").hidden, "edit panel open while the undo toast is visible");
  click(undoBtn);
  assert($("action-modal").hidden && T.state.subjects.Romana.grades.length === romBefore, "undo closes the open form and restores the grade");
  const t = [...w.document.querySelectorAll(".toast")].at(-1);
  assert(t.querySelector(".toast-text").textContent === "Am pus totul la loc." && t.querySelector("use").getAttribute("href") === "#i-undo", "confirmation toast: clean text + undo icon");

  // simulator: scenariu
  nav("tab-simulator");
  T.sim.active = "s2"; T.refresh();
  click(q('[data-action="sim-delete"]'));
  assert(T.sim.scenarios.length === 1 && $("action-modal").hidden && /Plan B/.test(lastToast()), "scenario deleted at once");
  click(toastBtn());
  assert(T.sim.scenarios.length === 2, "scenario restored");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
