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
  T.ui.catalog.sort = "group"; // gruparea pe stare rămâne în cod (sortare), deși lista implicită e simplă
  nav("tab-catalog");
  const heads = () => qa("#cat-list .cat-group-head");
  const rowsNames = () => qa("#cat-list .cat-row:not(.is-purtare)").map(r => r.dataset.mat);
  assert(heads().map(h => h.querySelector("span").textContent).join("|") === "La risc|Sub țintă|La țintă|Fără note", "groups in order: risk, below target, at target, no grades");
  assert(rowsNames().join() === "Matematica,Romana,Fizica,Chimie", "subjects under their group: " + rowsNames().join());
  assert(T.ui.catalog.selected === "Matematica" && /1 din 5|2 din 5/.test($("cat-nav").textContent), "first shown subject selected; position shown (" + $("cat-nav").querySelector(".cat-nav-pos").textContent + ")");
  // strânge un grup
  click(heads()[2]);
  assert(heads()[2].getAttribute("aria-expanded") === "false" && !rowsNames().includes("Fizica") && /Fizica/.test(heads()[2].textContent), "group folds, shows a peek of its subjects");
  click(heads()[2]);
  assert(rowsNames().includes("Fizica"), "and unfolds");
  // ‹ ›
  const pos = () => $("cat-nav").querySelector(".cat-nav-pos").textContent;
  click(q('[data-action="cat-step"][data-dir="1"]'));
  assert(T.ui.catalog.selected === "Romana" && q("#cat-detail .cat-title").textContent === "Romana", "› goes to the next subject in list order");
  click(q('[data-action="cat-step"][data-dir="-1"]')); click(q('[data-action="cat-step"][data-dir="-1"]'));
  assert(T.ui.catalog.selected === "__purtare__" || T.ui.catalog.selected === T.state && false || /Purtare/.test($("cat-detail").textContent), "‹ reaches Purtare (first in the list)");
  click(q('[data-action="cat-step"][data-dir="-1"]'));
  assert(T.ui.catalog.selected === "Chimie", "wraps around to the last subject");
  // tastele ← →
  key("ArrowRight");
  assert(/Purtare/.test($("cat-detail").textContent), "→ key steps (wraps to Purtare)");
  key("ArrowRight");
  assert(T.ui.catalog.selected === "Matematica", "→ again: Matematica");
  $("cat-search").focus(); key("ArrowRight", {}, $("cat-search"));
  assert(T.ui.catalog.selected === "Matematica", "arrows ignored while typing in search");
  // banda de materii (telefon) și căutarea
  assert(qa("#cat-nav .cat-strip-chip").length === 5 && q("#cat-nav .cat-strip-chip.is-on").textContent.includes("Matematica"), "subject strip lists all, current highlighted");
  click(qa("#cat-nav .cat-strip-chip").find(c => c.dataset.mat === "Fizica"));
  assert(T.ui.catalog.selected === "Fizica", "tapping a chip opens that subject");
  $("cat-search").value = "fiz"; $("cat-search").dispatchEvent(new w.Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 150));
  assert(rowsNames().join() === "Fizica" && $("cat-nav").hidden, "search narrows the list; nav hides when only one subject is left");
  $("cat-search").value = ""; $("cat-search").dispatchEvent(new w.Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 150));
  // glisare pe detalii
  const pane = $("cat-detail");
  const touch = (type, x, y) => { const e = new w.Event(type, { bubbles: true }); e.touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }]; e.changedTouches = [{ clientX: x, clientY: y }]; pane.dispatchEvent(e); };
  const before = T.ui.catalog.selected;
  touch("touchstart", 300, 400); touch("touchend", 120, 410);
  assert(T.ui.catalog.selected !== before, "swipe left on the details → next subject");
  const after = T.ui.catalog.selected;
  touch("touchstart", 300, 400); touch("touchend", 290, 200);
  assert(T.ui.catalog.selected === after, "vertical swipe (scrolling) does nothing");
  // sortarea A–Z: listă simplă, fără grupuri
  $("cat-sort").value = "name"; $("cat-sort").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(!heads().length && rowsNames().join() === "Chimie,Fizica,Matematica,Romana", "A–Z: flat list, nav follows it");
  console.log(process.exitCode ? "SOME FAILED" : "ALL PASSED");
})();
