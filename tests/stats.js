const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {}; w.print = () => { w.__printed = true; };
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const plus = n => { const d = new Date(); d.setDate(d.getDate()+n); return key(d); };
w.localStorage.setItem("pro_purtare_db_v4", JSON.stringify({ grades: {}, lastModule: "2026-1" }));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,get metrics(){return metrics},refresh,subjectTrend,averageTimeline,buildInsights,statsEntries,generalChange};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const close = (a, b) => Math.abs(a - b) < 1e-9;

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));

  // 1. no subjects → friendly empty state
  click(q('[data-action="nav"][data-tab="tab-statistici"]'));
  assert(!$("stats-empty").hidden && $("stats-body").hidden, "no subjects → empty state, body hidden");

  // 2. subjects without grades → not blank: prompts, chips, placeholders
  T.state.subjects = { "Română": { ore: 4, target: 10, grades: [], priority: false, excludeFromGPA: false }, "Chimie": { ore: 2, target: 9, grades: [], priority: false, excludeFromGPA: false } };
  T.refresh();
  assert($("stats-empty").hidden && !$("stats-body").hidden, "subjects → body shown");
  assert(/Adaugă prima notă/.test($("stats-hero").textContent) && q(".stats-hero-value.is-empty"), "hero explains there's no average yet");
  assert(qa(".nogrades-chip").length === 2 && /Fără note încă · 2/.test($("stats-nogrades").textContent), "subjects without grades listed as chips");
  assert(/Încă nu ai note/.test($("stats-subject-list").textContent), "subject list explains what will appear");
  assert(!$("stats-trend-empty").hidden && $("stats-trend-frame").hidden && /după primele note/.test($("stats-trend-empty").textContent), "evolution chart: placeholder text instead of empty axes");
  assert(!$("stats-dist-empty").hidden && /de la 3 note/.test($("stats-dist-empty").textContent), "distribution: placeholder text");
  assert(/lipsesc 12 note/.test($("stats-insights").textContent), "insight: missing grades (4+3 + 2+3 = 12)");
  assert(/Tendințele apar/.test($("stats-trends").textContent), "trends explain when they appear");

  // 3. real data
  T.state.subjects = {
    "Matematică": { ore: 4, target: 10, grades: [{ val: 5, type: "Test", date: plus(-40) }, { val: 3, type: "Test", date: plus(-5) }], priority: false, excludeFromGPA: false },
    "Fizică": { ore: 2, target: 9, grades: [{ val: 10, type: "Test", date: plus(-35) }, { val: 9, type: "Test", date: plus(-30) }, { val: 6, type: "Test", date: plus(-3) }], priority: false, excludeFromGPA: false },
    "Engleză": { ore: 2, target: 10, grades: [{ val: 8, type: "Test", date: plus(-30) }, { val: 10, type: "Temă", date: plus(-2) }, { val: 10, type: "Test", date: plus(-1) }], priority: false, excludeFromGPA: false },
    "Română": { ore: 4, target: 9, grades: [{ val: 8, type: "Teză", date: plus(-10) }], priority: false, excludeFromGPA: false },
    "Istorie": { ore: 1, target: 10, grades: [{ val: 10, type: "Test", date: plus(-12) }, { val: 10, type: "Test", date: plus(-6) }], priority: false, excludeFromGPA: false },
    "Chimie": { ore: 2, target: 9, grades: [], priority: false, excludeFromGPA: false }
  };
  T.refresh();

  // trends
  const tr = T.subjectTrend(T.state.subjects["Fizică"]);       // now (25/3)=8.333 vs older (10,9)=9.5 → −1.167
  assert(close(tr.delta, 25 / 3 - 9.5) && /3 săptămâni/.test(tr.basis), "trend vs 3 weeks ago");
  const tr2 = T.subjectTrend(T.state.subjects["Istorie"]);      // both recent → vs before last grade: 10 vs 10 = 0
  assert(tr2.delta === 0 && /ultimei note/.test(tr2.basis), "all-recent fallback: vs before last grade");
  assert(T.subjectTrend(T.state.subjects["Română"]) === null, "one grade → no trend");

  // timeline from grade dates
  const tl = T.averageTimeline();
  assert(tl.length === 10 && tl[0].date === plus(-40) && tl.at(-1).date === plus(-1), "timeline: one point per grade date");
  assert(close(tl.at(-1).avg, T.metrics.rawGlobalAvg), "last timeline point = current general average");
  const ch = T.generalChange(tl);
  assert(ch && /30 de zile/.test(ch.label), "general change vs 30 days ago");

  // standing + ordering ('attention'): risk first, then below target by gap, ok last
  const names = () => qa("#stats-subject-list .stat-row:not(.is-purtare) .stat-row-name").map(e => e.textContent.trim());
  assert(names()[0] === "Matematică" && q(".stat-row.is-risk .stat-row-name").textContent.trim() === "Matematică", "Matematică (4.00) first, marked risk");
  assert(names().at(-1) === "Istorie" || names().slice(-2).includes("Istorie"), "on-target subjects last");
  assert(qa(".stat-row.is-ok").some(r => /Istorie/.test(r.textContent)), "Istorie at target ✓");
  assert(q(".stat-row.is-purtare") && /Purtare/.test(q(".stat-row.is-purtare").textContent), "purtare row at the end");
  assert(/2\/7 note/.test(qa(".stat-row").find(r => /Matematică/.test(r.textContent)).textContent), "grade count vs minimum (2/7)");
  // sort
  $("stats-sort").value = "trend"; $("stats-sort").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(names()[0] === "Fizică", "sort 'În scădere întâi' → Fizică first");
  $("stats-sort").value = "avg-desc"; $("stats-sort").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(names()[0] === "Istorie", "sort by average");
  $("stats-sort").value = "attention"; $("stats-sort").dispatchEvent(new w.Event("change", { bubbles: true }));

  // insights: primele 4, restul după „Arată toate”
  assert(qa("#stats-insights .insight").length <= 4 && q('[data-action="stats-insights-more"]'), "insights capped at 4 with 'Arată toate'");
  click(q('[data-action="stats-insights-more"]'));
  const ins = qa("#stats-insights .insight").map(li => li.textContent.replace(/\s+/g, " ").trim());
  assert(/Matematică: media 4\.00, sub pragul de risc/.test(ins[0]) && q("#stats-insights .insight").classList.contains("is-critical"), "insight #1: risk subject with plan");
  assert(/îți trebuie \d+ note de 10 la rând|cel puțin \d+ ca să ieși/.test(ins[0]), "risk insight says exactly what grade is needed");
  assert(ins.some(t => /Fizică a scăzut cu 1\.17/.test(t)), "slipping insight (Fizică −1.17)");
  assert(ins.some(t => /Engleză crește: \+/.test(t)), "improving insight (Engleză)");
  assert(ins.some(t => /lipsesc/.test(t)), "missing grades insight");
  assert(ins.length <= 6, "at most 6 suggestions");
  // trends card
  assert(/Engleză/.test(q(".trend-col:nth-child(1)").textContent) && /Fizică/.test(q(".trend-col:nth-child(2)").textContent), "trends card: Engleză up, Fizică down");

  // hero + kpis
  assert(/Îți lipsesc .* puncte până la ținta/.test($("stats-hero").textContent) && q(".stats-meter-fill") && q(".stats-meter-target"), "hero: verdict + meter with target");
  assert(/include purtarea/.test($("stats-hero").textContent), "hero says purtare is included");
  const k = qa(".stats-kpi").map(x => x.textContent.replace(/\s+/g, " "));
  assert(/În risc 1/.test(k[0]) && /Matematică/.test(k[0]) && /Note 11/.test(k[2]) && /Note de 10 5/.test(k[3]), "KPI tiles");

  // navigation from rows / insights
  click(qa(".stat-row").find(r => /Fizică/.test(r.textContent)));
  assert(T.ui.activeTab === "tab-catalog" && T.ui.catalog.selected === "Fizică", "subject row opens it in the catalog");
  click(q('[data-action="nav"][data-tab="tab-statistici"]'));
  click(q("#stats-insights .insight-go"));
  assert(T.ui.catalog.selected === "Matematică", "'Deschide →' on suggestion opens the subject");
  click(q('[data-action="nav"][data-tab="tab-statistici"]'));

  // print report
  click(q('[data-action="stats-print"]'));
  assert(!$("action-modal").hidden && $("rep-name") && $("rep-period") && $("rep-sec-sign") && !$("rep-sec-sign").checked, "print opens the options panel (name, period, sections)");
  $("rep-name").value = "Ana <b>X</b>"; $("rep-cls").value = "a X-a A"; $("rep-sec-sign").checked = true; $("rep-sec-tips").checked = false;
  click($("action-modal-confirm"));
  await new Promise(r => setTimeout(r, 80));
  const pr = $("print-report");
  assert(w.__printed && $("action-modal").hidden, "print dialog opened");
  assert(T.state.settings.report.name === "Ana <b>X</b>" && T.state.settings.report.sections.sign === true, "options remembered in settings");
  assert(/Ana <b>X<\/b> · Clasa a X-a A/.test(pr.querySelector("h1").textContent) && !pr.querySelector("h1 b"), "header shows name + class (escaped)");
  assert(pr.querySelectorAll(".pr-table tbody tr").length === 6, "report table: 6 subjects");
  assert(/Raport școlar/.test(pr.textContent) && !/Recomandări/.test(pr.textContent) && pr.querySelector(".pr-sign") && /Pe module/.test(pr.textContent) && /Media generală/.test(pr.textContent), "sections follow the options");
  assert(pr.querySelector(".pr-g.is-low") && pr.querySelector(".pr-chart polyline"), "grades listed (low ones marked) + chart");
  assert(pr.querySelector("tr.is-risk") && /Matematică/.test(pr.querySelector("tr.is-risk").textContent), "risk row highlighted in report");
  // beforeprint (Ctrl+P) rebuilds report
  pr.innerHTML = ""; w.dispatchEvent(new w.Event("beforeprint"));
  assert(pr.querySelector(".pr-table"), "Ctrl+P (beforeprint) builds the report too");

  // XSS safety in insights/rows
  T.state.subjects['<img src=x onerror="window.pwn=1">'] = { ore: 1, target: 10, grades: [{ val: 2, type: "Test", date: plus(-1) }], priority: false, excludeFromGPA: false };
  T.refresh();
  assert(!w.pwn && !q("#tab-statistici img") && !q("#print-report img"), "subject names escaped everywhere");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
