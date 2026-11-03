const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", e => console.log("CONSOLE ERR", e));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
let scrolledTo = null;
w.HTMLElement.prototype.scrollIntoView = function () { scrolledTo = this.id; }; w.scrollTo = () => {};
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const plus = n => { const d = new Date(); d.setDate(d.getDate()+n); return key(d); };
const close = (a, b, e = 1e-9) => Math.abs(a - b) < e;
// modules around today: M1 done (−60..−25), M2 current (−20..+20)
const mods = [{ start: plus(-60), end: plus(-25) }, { start: plus(-20), end: plus(20) }, { start: plus(30), end: plus(60) }, { start: plus(70), end: plus(100) }, { start: plus(110), end: plus(140) }];
w.localStorage.setItem("pro_settings_db_v4", JSON.stringify({ modules: mods, calc: { method: "arithmetic" }, targets: { tens: 10, evals: 20 }, goals: { targetGPA: 9.5, minGPA: 8, primary: "tens" } }));
w.localStorage.setItem("pro_purtare_db_v4", JSON.stringify({ grades: {}, lastModule: `${mods[0].start.slice(0,4)}-2` }));
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Matematică": { ore: 4, target: 10, grades: [{ val: 6, type: "Test", date: plus(-50) }, { val: 4, type: "Test", date: plus(-10) }] },
  "Engleză": { ore: 2, target: 10, grades: [{ val: 9, type: "Test", date: plus(-45) }, { val: 10, type: "Temă", date: plus(-8) }, { val: 10, type: "Temă", date: plus(-8) }] },
  "Istorie": { ore: 1, target: 10, grades: [{ val: 10, type: "Ascultare", date: plus(-40) }, { val: 10, type: "Ascultare", date: plus(-5) }] },
  "Chimie": { ore: 2, target: 9, grades: [] }
}));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,get metrics(){return metrics},refresh,subjectImpacts,typeBreakdown,gradeRecords,moduleAverages,weekdayStats,whatIfSubjects,whatIfNeededForTarget,calculateMetrics,periodRange,periodSubjects,paceTo};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  click(q('[data-action="nav"][data-tab="tab-statistici"]'));
  assert(!$("stats-nav").hidden && qa(".stats-nav-link").length === 5, "section menu with 5 sections");
  assert(qa("#stats-period option").map(o => o.textContent).join("|").startsWith("Tot anul|Ultimele 30 de zile|Modulul 1|Modulul 2 · acum|Modulul 3 (urmează)"), "period options incl. modules (future disabled)");
  assert(q('#stats-period option[value="m3"]').disabled, "future module disabled");

  // impact (ca în catalog): mediile pe materii se rotunjesc la întreg: G = mean(5, 10 (9.667), 10, purtare 10) ; fără Mate = mean(10,10,10)
  const imp = T.subjectImpacts(T.state.subjects, T.metrics);
  const mate = imp.find(x => x.mat === "Matematică");
  const G = (5 + 10 + 10 + 10) / 4, Gw = (10 + 10 + 10) / 3;
  assert(close(T.metrics.rawGlobalAvg, G) && close(mate.impact, G - Gw) && mate.impact < 0, "impact: Matematică pulls GPA down by exactly G − G(without)");
  assert(imp[0].impact > 0 && imp.at(-1).mat === "Matematică", "impact sorted: pulls-up first, Matematică last");
  assert(/Matematică<\/b> trage media în jos cu/.test($("stats-impact").innerHTML) && qa(".impact-row").length === 3, "impact card: lead sentence + 3 rows (Chimie has no grades)");
  assert(q(".impact-fill.is-neg") && q(".impact-fill.is-pos"), "diverging bars both sides");

  // types
  const types = T.typeBreakdown(T.state.subjects);
  assert(types[0].type === "Test" && types[0].n === 3 && close(types[0].avg, 19/3) && types.find(t => t.type === "Temă").tens === 2, "type breakdown counts + averages");
  assert(/Cel mai bine îți merge la <b>(Temă|Ascultare)<\/b>/.test($("stats-types").innerHTML) && /cel mai slab la <b>Test<\/b>/.test($("stats-types").innerHTML), "types lead: best vs worst");

  // records
  const r = T.gradeRecords(T.state.subjects);
  assert(r.best10 === 3 && r.best9 >= 3, "records: streaks of 10 / 9+");
  assert(r.busiest.n === 2 && r.busiest.date === plus(-8), "records: busiest day");
  assert(r.topSubject.mat === "Engleză" && r.topSubject.n === 3, "records: subject with most grades");
  assert(r.jump && r.jump.mat === "Engleză" && close(r.jump.delta, 0.5), "records: biggest jump (Engleză 9→9.5)");
  assert(r.sinceLast === 5, "records: days since last grade");
  assert(qa(".record").length >= 6, "record tiles rendered");

  // recent feed
  const recent = qa(".recent-row");
  assert(recent.length === 7 && /Istorie/.test(recent[0].textContent), "latest grades, newest first");
  assert(/▼ −1\.00/.test(qa(".recent-row").find(x => /Matematică/.test(x.textContent) && /Test/.test(x.textContent)).textContent), "grade effect: Matematică 4 moved avg 6→5 (−1.00)");

  // modules
  const ma = T.moduleAverages();
  assert(ma[0].grades === 3 && ma[1].grades === 4 && ma[2].avg === null, "module averages: grade counts per module, future empty");
  assert(qa(".mod-col").length === 5 && q(".mod-col.is-current .mod-name").textContent.includes("M2"), "module columns, current marked");

  // weekdays + heatmap
  const wds = T.weekdayStats(T.state.subjects);
  assert(wds.filter(x => x.wd >= 1 && x.wd <= 5).length === 5 && wds.reduce((n, x) => n + x.n, 0) === 7, "weekday stats cover all dated grades");
  const cells = qa(".hm-grid .hm-cell");
  assert(cells.length % 7 === 0 && cells.length >= 7 * 9, "heatmap grid: whole weeks since school start");
  const busy = q(`.hm-grid .hm-cell[data-tip-title="${w.eval ? "" : ""}"]`);
  const lvl2 = qa(".hm-grid .hm-cell.l2");
  assert(lvl2.length === 1 && /Engleză · Temă\|10\nEngleză · Temă\|10/.test(lvl2[0].dataset.tipLines), "heatmap: 2-grade day at level 2 with tooltip lines");
  assert(q(".hm-grid .hm-cell.is-today") && qa(".hm-grid .hm-cell.is-break").length > 0, "heatmap marks today and vacations/weekends");
  assert(/7 note<\/b> în <b>6 zile/.test($("stats-heatmap").innerHTML), "heatmap summary sentence");

  // goals + pace
  const rings = qa(".goal");
  assert(rings.length === 3 && rings[1].classList.contains("is-primary") && /★/.test(rings[1].textContent), "3 goal rings, primary goal (tens) starred");
  assert(rings[1].querySelector(".count-up").dataset.count === "4" && /\/ 10/.test(rings[1].textContent), "tens ring shows 4 / 10");
  assert(/ritmul actual/.test(rings[2].textContent) || /ținta e atinsă/.test(rings[2].textContent), "pace estimate shown");

  // what-if
  const missing = Object.values(T.metrics.subjects).reduce((n, d) => n + d.requiredNotes, 0);
  assert(new RegExp(`cele <b>${missing}</b> note`).test($("whatif-question").innerHTML), "what-if asks about the missing grades");
  const slider = $("whatif-range");
  slider.value = "10"; slider.dispatchEvent(new w.Event("input", { bubbles: true }));
  const r10 = T.calculateMetrics(T.whatIfSubjects(10).subs).rawGlobalAvg;
  assert($("whatif-value").textContent === "10" && $("whatif-result").textContent.includes(r10.toFixed(2)), "slider 10 → projected average updates");
  slider.value = "5"; slider.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(/materii? în risc/.test($("whatif-result").textContent) && /▼|−/.test($("whatif-result").textContent), "slider 5 → lower average + risk count");
  const need = T.whatIfNeededForTarget();
  assert(need === null || (need >= 1 && need <= 10), "needed average for target computed");

  // PERIOD FILTER: module 1 only
  $("stats-period").value = "m1"; $("stats-period").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.ui.statsPeriod === "m1" && qa(".period-badge").every(b => /Modulul 1/.test(b.textContent)), "period → Modulul 1, badges updated");
  const rows = qa("#stats-subject-list .stat-row:not(.is-purtare) .stat-row-name").map(e => e.textContent.trim());
  assert(rows.length === 3 && !q("#stats-subject-list .stat-row.is-purtare"), "rows recomputed for M1 (3 subjects with M1 grades, no purtare row)");
  assert(/6\.00/.test(qa(".stat-row").find(x => /Matematică/.test(x.textContent)).textContent), "Matematică M1 average = 6.00 (only M1 grade)");
  assert(qa(".recent-row").length === 3, "latest grades limited to M1");
  assert(q(".mod-col.is-selected .mod-name").textContent.startsWith("M1"), "module column highlighted for selected period");
  assert(qa(".hm-grid .hm-cell.is-dim").length > 0, "heatmap dims days outside the period");
  assert(/în perioadă/.test($("stats-nogrades").textContent), "no-grade chips relabelled for period");
  // goals / now unaffected by period
  assert(qa(".goal")[1].querySelector(".count-up").dataset.count === "4", "Obiective still show whole-year numbers");
  // module column click → period M2
  click(qa(".mod-col")[1]);
  assert(T.ui.statsPeriod === "m2" && $("stats-period").value === "m2", "clicking a module column filters to it");
  // last 30 days
  $("stats-period").value = "30d"; $("stats-period").dispatchEvent(new w.Event("change", { bubbles: true }));
  const rr = T.periodRange("30d");
  assert(rr.to === plus(0) && rr.from === plus(-29), "30-day range");
  $("stats-period").value = "year"; $("stats-period").dispatchEvent(new w.Event("change", { bubbles: true }));

  // section menu jump
  click(q('.stats-nav-link[data-target="sec-time"]'));
  assert(scrolledTo === "sec-time", "menu jumps to section");

  // animations flagged on tab open
  click(q('[data-action="nav"][data-tab="tab-dashboard"]')); click(q('[data-action="nav"][data-tab="tab-statistici"]'));
  assert(qa("#stats-body .count-up").length >= 8, "numbers set up for count-up animation");

  // empty period
  T.state.subjects = { "Română": { ore: 4, target: 10, grades: [], priority: false, excludeFromGPA: false } }; T.refresh();
  assert(/Recordurile apar/.test($("stats-records").textContent) && /Apare când ai note la cel puțin două materii/.test($("stats-impact").textContent) && /Nicio notă/.test($("stats-types").textContent), "every new card has an empty state");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
