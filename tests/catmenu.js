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
  nav("tab-catalog");
  const row = () => qa(".cat-row").find(r => r.dataset.mat === "Fizica");
  const ev = (el, type, extra = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: 300, ...extra }));
  ev(row(), "dblclick");
  assert(!$("cat-menu").hidden && $("cat-menu-title").textContent === "Fizica", "double-click opens the subject menu");
  assert(qa('#cat-menu [role="menuitem"]').map(b => b.textContent.trim()).join("|") === "Editează materia|Adaugă o notă|Vedere simplificată", "3 options: edit, add grade, simplified view");
  assert(w.document.activeElement === q('#cat-menu [role="menuitem"]'), "focus on the first option");
  key("ArrowDown", {}, w.document.activeElement);
  assert(w.document.activeElement.dataset.action === "cat-menu-grade", "arrow keys move between options");
  key("Escape", {}, w.document.activeElement);
  assert($("cat-menu").hidden && w.document.activeElement?.dataset.mat === "Fizica", "Escape closes, focus back on the row");
  // vedere simplificată
  ev(row(), "dblclick"); click(q('[data-action="cat-menu-glance"]'));
  assert($("cat-menu").hidden && !$("action-modal").hidden && /Fizica · pe scurt/.test($("action-modal-title").textContent), "simplified view opens");
  const body = $("action-modal-body").textContent.replace(/\s+/g, " ");
  assert(/9\.50/.test(body) && /Ținta 9/.test(body) && /Testul de azi\./.test(body) && qa(".glance-grades .cat-grade-val").length === 2, "glance: average, target, next test, grades (" + body.slice(0, 160) + ")");
  click($("action-modal-confirm"));
  assert(!$("action-modal").hidden && $("action-modal-title").textContent === "Notă nouă · Fizica", "'Adaugă o notă' from the glance opens the grade form for that subject");
  click(q('[data-action="modal-cancel"]'));
  // clic dreapta → editare
  ev(row(), "contextmenu");
  assert(!$("cat-menu").hidden, "right-click opens the same menu");
  click(q('[data-action="cat-menu-edit"]'));
  assert(!$("action-modal").hidden && /Fizica/.test($("action-modal-body").innerHTML) && $("cat-menu").hidden, "edit option opens the subject editor");
  click(q('[data-action="modal-cancel"]'));
  // Shift+F10 de la tastatură, apoi „Adaugă o notă”
  row().focus(); key("F10", { shiftKey: true }, row());
  assert(!$("cat-menu").hidden, "Shift+F10 opens the menu from the keyboard");
  click(q('[data-action="cat-menu-grade"]'));
  assert(!$("action-modal").hidden && $("action-modal-title").textContent === "Notă nouă · Fizica", "add-grade option opens the grade form");
  click(q('[data-action="modal-cancel"]'));
  // clic în afară închide; purtarea nu are meniul
  ev(row(), "dblclick"); w.document.body.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  assert($("cat-menu").hidden, "clicking outside closes the menu");
  const pr = q(".cat-row.is-purtare"); if (pr) { ev(pr, "dblclick"); assert($("cat-menu").hidden, "no menu on the conduct row"); }
  console.log(process.exitCode ? "SOME FAILED" : "ALL PASSED");
})();
