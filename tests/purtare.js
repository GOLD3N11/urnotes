const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", e => console.log("CONSOLE ERR", e));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const plus = n => { const d = new Date(); d.setDate(d.getDate()+n); return key(d); };
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Matematică": { ore: 4, target: 10, grades: [{ val: 9, type: "Test" }] },
  "Purtare": { ore: 1, target: 10, grades: [{ val: 10, type: "Altele" }] }   // materie veche, adăugată manual
}));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,get metrics(){return metrics},purtareInfo,refresh,parseBackup,buildBackup,calculateMetrics,presetModules,RESET_OPTIONS};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const change = el => el.dispatchEvent(new w.Event("change", { bubbles: true }));
const toasts = () => qa(".toast .toast-text").map(t => t.textContent);
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const close = (a, b) => Math.abs(a - b) < 1e-9;
const setModules = list => { T.state.settings.modules = list; T.refresh(); };

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  const today = plus(0);

  // defaults: official 2026–2027 structure
  assert(JSON.stringify(T.state.settings.modules) === JSON.stringify(T.presetModules("2026-feb22")) && T.state.settings.modules[0].start === "2026-09-07" && T.state.settings.modules[4].end === "2027-06-18", "default modules = OM 3194/2026 (middle mobile week)");
  const p0 = T.purtareInfo("2026-10-08");
  assert(p0.current?.n === 1 && p0.value === 10 && p0.avg === 10, "8 oct 2026 → Modulul 1, purtare 10");
  assert(T.purtareInfo("2026-10-28").current === null && T.purtareInfo("2026-10-28").lastDone.n === 1 && T.purtareInfo("2026-10-28").next.n === 2, "autumn holiday → between M1 and M2");
  assert(T.purtareInfo("2027-02-24").next?.n === 4 && T.purtareInfo("2027-02-24").current === null, "mobile week (default) → vacation");
  assert(T.purtareInfo("2027-07-01").yearOver && T.purtareInfo("2026-08-01").started === 0 && T.purtareInfo("2026-08-01").avg === 10, "after/before school year");

  // custom modules around today: M1 done, M2 current
  const mods = [
    { start: plus(-60), end: plus(-30) }, { start: plus(-20), end: plus(15) },
    { start: plus(30), end: plus(60) }, { start: plus(70), end: plus(100) }, { start: plus(110), end: plus(140) }];
  const Y = mods[0].start.slice(0, 4);
  T.state.purtare.lastModule = `${Y}-2`;   // ca să nu declanșăm reînnoirea acum
  setModules(mods);

  // GPA ca în catalog (implicit): mediile întregi ale materiilor + purtarea; materia veche „Purtare” contează până e ștearsă
  // Mate 9, Purtare (veche) 10, secțiunea purtare 10 → (9+10+10)/3
  assert(close(T.metrics.rawGlobalAvg, 29 / 3), "GPA = catalog subject averages + purtare");

  click(q('[data-action="nav"][data-tab="tab-catalog"]'));
  const row = q("#cat-list .cat-row.is-purtare");
  assert(row && q("#cat-list .cat-row") === row && /Modulul 2/.test(row.textContent) && /se reînnoiește/.test(row.textContent), "purtare pinned first in list, shows module");
  assert(/cu purtarea/.test($("cat-summary").textContent), "summary says GPA includes purtare");

  // legacy subject banner + blocked name
  click(qa("#cat-list .cat-row").find(r => !r.classList.contains("is-purtare") && /Purtare/.test(r.textContent)));
  assert(/secție proprie/.test($("cat-detail").textContent), "legacy 'Purtare' subject shows migration banner");
  click(q('#cat-detail .alert-card [data-action="delete-subject"]')); click($("action-modal-confirm"));
  assert(!T.state.subjects["Purtare"], "legacy subject deleted from banner");
  click(q('#tab-catalog [data-action="add-subject"]'));
  assert(!$("subj-name") && /Alege programa|programa/.test($("action-modal-body").textContent), "no free names at all: without a programme, add subject asks to choose it"); click($("action-modal-cancel"));

  // detail
  click(q("#cat-list .cat-row.is-purtare"));
  assert(T.ui.catalog.selected === "__purtare__" && /Purtare/.test(q("#cat-detail .cat-title").textContent) && q("#cat-detail .cat-title use").getAttribute("href") === "#i-medal", "purtare detail opens");
  const cards = qa(".purtare-mod");
  assert(cards.length === 5 && cards[0].classList.contains("is-done") && cards[1].classList.contains("is-current") && cards[2].classList.contains("is-upcoming"), "5 module cards with status");
  assert(!cards[2].querySelector('[data-action="purtare-edit"]') && cards[0].querySelector('[data-action="purtare-edit"]'), "future modules not editable, past ones are");
  assert(q(".purtare-mod.is-current .purtare-mod-bar span"), "current module progress bar");

  // edit current module
  click(q('#cat-detail .cat-head-actions [data-action="purtare-edit"]'));
  assert($("purtare-val").value === "10" && /Modulul 2/.test($("action-modal-title").textContent), "edit dialog for current module");
  $("purtare-val").value = "8.5"; click($("action-modal-confirm"));
  assert(/întreg/.test(toasts().at(-1)) && !$("action-modal").hidden, "non-integer rejected");
  $("purtare-val").value = "8"; $("purtare-reason").value = "absențe nemotivate"; click($("action-modal-confirm"));
  assert(JSON.stringify(T.state.purtare.grades[`${Y}-2`]) === JSON.stringify({ val: 8, reason: "absențe nemotivate" }), "saved only the changed module");
  assert(/Purtare, Modulul 2: 10 → 8/.test(T.state.activity[0].text), "activity logged");
  // avg of started modules: (10 + 8)/2 = 9 → GPA (36 + 9)/5
  assert(T.metrics.purtare.avg === 9 && close(T.metrics.rawGlobalAvg, 45 / 5), "annual purtare = avg of started modules; GPA updated");
  assert(/Scăzută/.test(q("#cat-detail .badge-warn").textContent) && /absențe nemotivate/.test(q(".purtare-mod.is-current").textContent), "badge + reason shown");
  assert(/8/.test(q("#cat-list .cat-row.is-purtare .cat-row-avg b").textContent) && /media 9\.00/.test(q("#cat-list .cat-row.is-purtare").textContent), "list row shows module value + annual avg");

  // simulator consistency
  assert(close(T.calculateMetrics({ ...T.state.subjects }).rawGlobalAvg, T.metrics.rawGlobalAvg), "simulator projections include purtare");

  // revert
  click(q('#cat-detail .cat-head-actions [data-action="purtare-edit"]'));
  click(q('[data-action="purtare-reset"]'));
  assert(!T.state.purtare.grades[`${Y}-2`] && T.metrics.purtare.avg === 10, "Revino la 10 removes override");

  // set M2=7 then ROLLOVER: shift modules so M3 becomes current
  T.state.purtare.grades[`${Y}-2`] = { val: 7 };
  setModules([
    { start: plus(-90), end: plus(-60) }, { start: plus(-50), end: plus(-5) },
    { start: plus(-1), end: plus(30) }, { start: plus(40), end: plus(70) }, { start: plus(80), end: plus(110) }]);
  const Y2 = T.state.settings.modules[0].start.slice(0, 4);
  assert(T.metrics.purtare.current.n === 3 && T.metrics.purtare.value === 10, "new module starts at 10");
  assert(T.state.purtare.lastModule === `${Y2}-3` && /A început Modulul 3/.test(toasts().at(-1)) && /A început Modulul 3/.test(T.state.activity[0].text), "rollover: toast + activity");
  const before = T.state.activity.length; T.refresh();
  assert(T.state.activity.length === before, "rollover fires once");

  // vacation between modules
  setModules([
    { start: plus(-90), end: plus(-60) }, { start: plus(-50), end: plus(-3) },
    { start: plus(5), end: plus(30) }, { start: plus(40), end: plus(70) }, { start: plus(80), end: plus(110) }]);
  click(q("#cat-list .cat-row.is-purtare"));
  assert(T.metrics.purtare.current === null && T.metrics.purtare.value === 7 && /acum e vacanță/.test($("cat-detail").textContent) && /Modulul 3/.test($("cat-detail").textContent), "vacation: last module shown, next module date");

  // exclude from GPA
  click(q('[data-action="purtare-toggle-gpa"]'));
  assert(T.state.purtare.excludeFromGPA && T.metrics.rawGlobalAvg === 9 && /Exclusă din medie/.test($("cat-detail").textContent), "exclude from GPA");
  click(q('[data-action="purtare-toggle-gpa"]'));

  // no subjects → purtare alone doesn't create a GPA
  const saved = T.state.subjects; T.state.subjects = {}; T.refresh();
  assert(T.metrics.globalAvg === 0, "no subject grades → no GPA from purtare alone");
  T.state.subjects = saved; T.refresh();

  // SETTINGS: modules editor
  T.state.settings.modules = T.presetModules("2026-feb22"); T.refresh();
  click(q('[data-action="nav"][data-tab="tab-setari"]'));
  assert(qa(".module-row").length === 5 && $("set-module-preset").value === "2026-feb22", "settings: 5 module rows, preset detected");
  $("set-module-preset").value = "2026-mar01"; change($("set-module-preset"));
  assert($("set-mod-2-end").value === "2027-02-26" && $("set-mod-3-start").value === "2027-03-08", "preset select fills module 3/4 dates");
  assert(T.state.settings.modules[2].end === "2027-02-26" && T.state.settings.modules[3].start === "2027-03-08", "modules saved automatically");
  $("set-mod-1-start").value = "2026-10-01"; change($("set-mod-1-start"));
  assert($("set-module-preset").value === "custom", "manual edit → Personalizat");
  assert(/Modulul 2 trebuie să înceapă după/.test($("settings-status").textContent) && T.state.settings.modules[1].start === "2026-11-02" && $("set-mod-1-start").value === "2026-10-01", "overlapping dates: not saved, shown next to the title, your edit kept");

  // BACKUP round trip + hostile data
  T.state.purtare.grades["2026-1"] = { val: 9, reason: "întârzieri" };
  const back = T.parseBackup(JSON.stringify(T.buildBackup())).loaded.data;
  assert(back.purtare.grades["2026-1"].val === 9 && back.settings.modules[2].end === "2027-02-26", "backup keeps purtare + modules");
  const evil = { app: "evidenta-scolara-pro", version: 1, data: { purtare: { grades: { "2026-1": { val: 11 }, "x": { val: 5 }, "2026-2": { val: "7", reason: 5 }, "2026-3": { val: 10 } }, excludeFromGPA: "yes" },
    settings: { modules: [{ start: "2026-09-07", end: "2026-08-01" }] } } };
  const e = T.parseBackup(JSON.stringify(evil)).loaded.data;
  assert(JSON.stringify(e.purtare.grades) === JSON.stringify({ "2026-2": { val: 7 } }) && e.purtare.excludeFromGPA === false, "hostile purtare sanitized");
  assert(e.settings.modules[0].start === "2026-09-07" && e.settings.modules.length === 5 && e.settings.modules[0].end === "2026-10-23", "invalid modules → preset");

  // căutarea din Note găsește purtarea
  click(q('[data-action="nav"][data-tab="tab-catalog"]'));
  $("cat-search").value = "purt"; $("cat-search").dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(q("#cat-list .cat-row.is-purtare"), "Note search keeps Purtare visible");
  $("cat-search").value = ""; $("cat-search").dispatchEvent(new w.Event("input", { bubbles: true }));

  // reset grades clears purtare overrides
  T.RESET_OPTIONS[1].run(); T.refresh();
  assert(Object.keys(T.state.purtare.grades).length === 0, "reset grades → purtare back to 10");

  // persisted
  assert(JSON.parse(w.localStorage.getItem("pro_purtare_db_v4")).lastModule !== undefined, "purtare saved to localStorage");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
