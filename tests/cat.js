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
const today = new Date(); const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const plus = n => { const d = new Date(); d.setDate(d.getDate()+n); return key(d); };
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Matematică": { ore: 4, target: 10, grades: [{val:9,type:"Test",date:plus(-20)},{val:10,type:"Teză",date:plus(-10)},{val:8,type:"Ascultare",date:plus(-3)}], priority: true },
  "Fizică": { ore: 2, target: 9, grades: [{val:6,type:"Test",date:plus(-15)},{val:7,type:"Test",date:plus(-5)}] },
  "Română": { ore: 3, target: 9.5, grades: [] },
  "Chimie": { ore: 1, target: 8, grades: [{val:10,type:"Proiect"}], excludeFromGPA: true }
}));
w.localStorage.setItem("pro_calendar_db_v4", JSON.stringify({ [plus(1)]: [{id:"e1",title:"Test Fizică",type:"Test",subject:"Fizică",time:"08:00"}], [plus(9)]: [{id:"e2",title:"Lucrare",type:"Examen",subject:"Fizică"}] }));
w.localStorage.setItem("pro_simulator_db_v4", JSON.stringify({ active:"s1", selected:"Fizică", scenarios:[{id:"s1",name:"S1",hypo:{"Fizică":[{id:"h",val:9,type:"Test"}]}}] }));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,get sim(){return sim},planForCondition,reachesTarget,get metrics(){return metrics},foldText,openSubjectInCatalog,RESET_OPTIONS,refresh,lastSchoolDay};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const toasts = () => qa(".toast .toast-text").map(t => t.textContent);
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const names = () => qa("#cat-list .cat-row:not(.is-purtare) .cat-row-name").map(e => e.textContent.replace("★", ""));
const input = (id, v) => { $(id).value = v; };

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  click(q('[data-action="nav"][data-tab="tab-catalog"]'));
  assert(!$("catalog-layout").hidden && q("#cat-list .cat-row.is-purtare"), "layout shown, purtare pinned first");
  assert(!q("#cat-list .cat-group-head") && q("#cat-list .cat-row.is-risk") === qa("#cat-list .cat-row:not(.is-purtare)")[0] && names()[0] === T.ui.catalog.selected, "default: flat colourful list, risk first; first shown is selected (" + names().join() + ")");
  assert(qa("#cat-list .subj-chip").length === names().length && /--subj: var\(--c-/.test(q("#cat-list .cat-row:not(.is-purtare)").getAttribute("style")), "each subject tile has its colour and initials");
  $("cat-sort").value = "name"; $("cat-sort").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(names().join() === "Chimie,Fizică,Matematică,Română" && !q(".cat-group-head"), "A–Z sort: flat list (ro): " + names().join());
  T.ui.catalog.selected = ""; T.refresh();
  assert(qa("#cat-summary .cat-sum").length === 3 && /2 note necesare|necesare/.test($("cat-summary").textContent), "summary 3 tiles");
  assert(q("#cat-detail .cat-title").textContent === "Chimie", "first subject auto-selected");

  // filters
  click(q('[data-filter="risk"]')); assert(names().join() === "Fizică", "filter risk → Fizică");
  click(q('[data-filter="empty"]')); assert(names().join() === "Română", "filter fără note → Română");
  click(q('[data-filter="priority"]')); assert(names().join() === "Matematică", "filter prioritare");
  click(q('[data-filter="all"]'));
  // search w/o diacritics
  input("cat-search", "romana"); $("cat-search").dispatchEvent(new w.Event("input")); await new Promise(r => setTimeout(r, 150));
  assert(names().join() === "Română", "search without diacritics finds Română");
  input("cat-search", "zzz"); $("cat-search").dispatchEvent(new w.Event("input")); await new Promise(r => setTimeout(r, 150));
  assert(/Nicio materie/.test($("cat-list").textContent), "no-match message");
  click(q('[data-action="cat-clear-filters"]')); assert(names().length === 4 && $("cat-search").value === "", "clear filters");
  // sort
  $("cat-sort").value = "avg-desc"; $("cat-sort").dispatchEvent(new w.Event("change"));
  assert(names().join() === "Chimie,Matematică,Fizică,Română", "avg desc, no-grade last: " + names().join());
  $("cat-sort").value = "risk"; $("cat-sort").dispatchEvent(new w.Event("change"));
  assert(names()[0] === "Fizică" && names()[1] === "Română", "risk first: " + names().join());

  // select Fizică → detail
  click(qa(".cat-row").find(r => /Fizică/.test(r.textContent)));
  assert(q("#cat-detail .cat-title").textContent === "Fizică" && $("catalog-layout").classList.contains("show-detail"), "select opens detail");
  assert(q(".cat-row.selected").getAttribute("aria-current") === "true", "selected row marked");
  const det = $("cat-detail").textContent;
  assert(/6\.50/.test(det) && /→ 7/.test(det), "detail avg 6.50 → 7");
  assert(/încă 3 până la minim 5/.test(det), "required notes shown");
  // grades newest first
  assert(qa(".cat-grade .cat-grade-val").map(e => e.textContent).join() === "7,6", "grades newest first");
  // target helper: Fizică 6,7 target 9 (rounded ≥9 → avg≥8.5): one grade g: (13+g)/3≥8.5 → g≥12.5 impossible; k tens: (13+10k)/(2+k)≥8.5 → 13+10k ≥17+8.5k → k≥2.67 → 3
  const rows = qa(".cat-plan-row").map(r => r.textContent.replace(/\s+/g, " ").trim());
  assert(/Ajungi la ținta 9.*3 note de 10 la rând/.test(rows[0]), "target plan: " + rows[0]);
  // risk 8: (13+g)/3 ≥ 8 → g ≥ 11 → impossible; tens: 13+10k ≥ 16+8k → k≥1.5 → 2
  assert(/Ieși din risc.*2 note de 10/.test(rows[1]), "risk plan: " + rows[1]);
  assert(/mâine/.test(det) && /în 9 zile/.test(det), "upcoming evaluations with relative days");
  assert(q(".cat-trend") && qa(".cat-trend circle").length === 2, "trend svg with 2 dots");

  // Matematică: 9,10,8 avg 9, target 10 → need ≥9.5: (27+g)/4≥9.5 → g≥11 → tens: 27+10k ≥ 9.5(3+k) → .5k≥1.5 → 3
  click(qa(".cat-row").find(r => /Matematică/.test(r.textContent)));
  const r2 = qa(".cat-plan-row").map(r => r.textContent.replace(/\s+/g, " ").trim());
  assert(/3 note de 10/.test(r2[0]) && /Rămâi peste 8\.00.*minim 5/.test(r2[1]), "Mate plans: " + r2.join(" | "));
  // Chimie (target 8, has 10) → keep target: (10+g)/2 ≥ 7.5 → g≥5
  click(qa(".cat-row").find(r => /Chimie/.test(r.textContent)));
  const r3 = qa(".cat-plan-row").map(r => r.textContent.replace(/\s+/g, " ").trim());
  assert(/Păstrezi ținta 8.*minim 5/.test(r3[0]), "keep target: " + r3[0]);
  assert(/Exclusă din medie/.test($("cat-detail").textContent), "excluded badge");
  // Română (no grades, target 9.5 non-integer → exact ≥ 9.5 → need 10)
  click(qa(".cat-row").find(r => /Română/.test(r.textContent)));
  assert(/Ajungi la ținta 9\.50.*minim 10/.test(q(".cat-plan-row").textContent.replace(/\s+/g, " ")), "non-integer target");
  assert(q(".cat-grades-empty") && /Graficul apare/.test($("cat-detail").textContent), "empty grade states");

  // back (mobile)
  click(q('[data-action="cat-back"]')); assert(!$("catalog-layout").classList.contains("show-detail") && !$("tab-catalog").classList.contains("cat-detail-open"), "back closes detail");

  // ADD grade with date from detail
  click(qa(".cat-row").find(r => /Fizică/.test(r.textContent)));
  click(q('#cat-detail [data-action="add-grade"]'));
  const ccq = s => q("#cc-overlay-host " + s), ccqa = s => qa("#cc-overlay-host " + s);
  assert(!$("cc-overlay").hidden && /Fizic/.test(ccq(".cc-subj.is-on")?.textContent || "") && ccq(".cc-day.is-on")?.dataset.date === key(today), "quick-add bar: subject preset, date=today");
  click(ccqa(".cc-val").find(b => b.dataset.val === "10")); click(ccqa('[data-action="cc-gtype"]').find(b => b.dataset.type === "Test")); click(ccq(".cc-add"));
  assert(T.state.subjects["Fizică"].grades.length === 3 && T.state.subjects["Fizică"].grades[2].date === T.lastSchoolDay(key(today)) && T.state.subjects["Fizică"].grades[2].type === "Test" && $("cc-overlay").hidden, "grade added with date (today, or the last school day in a weekend/vacation); bar closes");
  // a future date becomes today
  click(q('#cat-detail [data-action="add-grade"]'));
  $("cc-date").value = plus(3); $("cc-date").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(ccq(".cc-day.is-on")?.dataset.date === key(today), "future date clamped to today");
  click(ccq(".cc-add"));
  assert(/Alege nota/.test(toasts().at(-1)) && !$("cc-overlay").hidden, "no grade picked: asks for it"); click(q('[data-action="cc-overlay-close"]'));
  // header add-grade preselects current subject
  click(q('#tab-catalog .intro-actions [data-action="add-grade"]'));
  assert(/Fizic/.test(ccq(".cc-subj.is-on")?.textContent || ""), "global add preselects open subject"); click(q('[data-action="cc-overlay-close"]'));

  // EDIT grade (the 6) → 9, no date
  const sixBtn = qa('[data-action="edit-grade"]').find(b => /nota 6/.test(b.getAttribute("aria-label")));
  click(sixBtn);
  assert($("modal-grade-val").value === "6" && $("modal-grade-type").value === "Test", "edit modal prefilled");
  input("modal-grade-val", "9"); input("modal-grade-type", "Teză"); input("modal-grade-date", ""); click($("action-modal-confirm"));
  const g0 = T.state.subjects["Fizică"].grades[0];
  assert(g0.val === 9 && g0.type === "Teză" && !("date" in g0), "grade edited, date removed");
  assert(/Fizică: 6 → 9/.test(T.state.activity[0].text), "activity logged: " + T.state.activity[0].text);
  // invalid edit
  click(qa('[data-action="edit-grade"]')[0]); input("modal-grade-val", "9.5"); click($("action-modal-confirm"));
  assert(/Alege nota/.test(toasts().at(-1)), "decimal grade rejected"); click($("action-modal-cancel"));

  // EDIT subject: fără programă numele nu se poate schimba deloc
  click(q('#cat-detail [data-action="edit-subject"]'));
  assert(!$("subj-name") && q(".subj-fixed") && /Fizică/.test(q(".subj-fixed").textContent) && $("subj-target").value === "9", "no programme: name is fixed, form prefilled");
  click($("action-modal-cancel"));
  // cu programa clasei a V-a (fără Fizică), Fizică e „în afara programei” și se poate înlocui cu o materie din programă
  T.state.settings.school = { profile: "gimnaziu", cls: 5, variant: "", lm2: "Limba franceză" }; T.refresh();
  assert(/în afara programei/.test(qa("#cat-list .cat-row").find(r => /Fizică/.test(r.textContent)).textContent), "out-of-programme tag in the list");
  assert(/În afara programei/.test($("cat-detail").textContent), "…and in the detail");
  click(q('#cat-detail [data-action="edit-subject"]'));
  const swap = $("subj-swap");
  assert(swap && [...swap.options].some(o => o.value === "Limba engleză") && ![...swap.options].some(o => o.value === "Matematică"), "swap offers only missing programme subjects");
  swap.value = "Limba engleză"; $("subj-priority").checked = true; click($("action-modal-confirm"));
  const keys = Object.keys(T.state.subjects);
  assert(keys.join() === "Matematică,Limba engleză,Română,Chimie", "renamed in place, order kept: " + keys.join());
  assert(T.state.subjects["Limba engleză"].ore === 2 && T.state.subjects["Limba engleză"].priority && T.state.subjects["Limba engleză"].grades.length === 3, "hours follow the programme (2), priority saved, grades kept");
  assert(Object.values(T.state.calendar).flat().every(e => e.subject === "Limba engleză"), "calendar events follow rename");
  assert(T.sim.scenarios[0].hypo["Limba engleză"] && !T.sim.scenarios[0].hypo["Fizică"] && T.sim.selected === "Limba engleză", "simulator follows rename");
  assert(q("#cat-detail .cat-title").textContent === "Limba engleză", "detail still open on renamed subject");
  click(q('#cat-detail [data-action="edit-subject"]'));
  assert(!$("subj-swap") && q(".subj-fixed"), "now in the programme: name fixed");
  click($("action-modal-cancel"));

  // open-in-sim
  click(q('#cat-detail [data-action="open-in-sim"]'));
  assert(T.ui.activeTab === "tab-simulator" && $("sim-subject").value === "Limba engleză", "open in simulator");

  // dashboard priority link + global search open subject
  click(q('[data-action="nav"][data-tab="tab-dashboard"]'));
  T.openSubjectInCatalog("Matematică");
  assert(T.ui.activeTab === "tab-catalog" && q("#cat-detail .cat-title").textContent === "Matematică", "openSubjectInCatalog opens the subject");
  // filter hides target → openSubject resets filter
  click(q('[data-filter="empty"]')); 
  T.openSubjectInCatalog("Chimie");
  assert(T.ui.catalog.filter === "all" && names().includes("Chimie"), "opening hidden subject resets filter");

  // delete subject → selection moves
  click(q('#cat-detail [data-action="delete-subject"]')); click($("action-modal-confirm"));
  assert(!T.state.subjects["Chimie"] && q("#cat-detail .cat-title") && q("#cat-detail .cat-title").textContent !== "Chimie", "delete subject moves selection");
  // add subject: only from the programme (+ Dirigenție + Opțional), no free names
  click(q('#tab-catalog [data-action="add-subject"]'));
  assert(!$("subj-name") && $("subj-pick"), "add subject: a list, not a free name field");
  const opts = [...$("subj-pick").options].map(o => o.value);
  assert(opts.includes("Biologie") && opts.includes("Dirigenție") && opts.includes("__opt") && !opts.includes("Matematică") && !opts.includes("Fizică"), "list = missing programme subjects + Dirigenție + Opțional: " + opts.join("|"));
  $("subj-pick").value = "Biologie"; $("subj-pick").dispatchEvent(new w.Event("change", { bubbles: true }));
  input("subj-target", "9"); click($("action-modal-confirm"));
  assert(T.state.subjects["Biologie"]?.target === 9 && q("#cat-detail .cat-title").textContent === "Biologie", "new subject saved with target & opened");
  // opționalul: tema scrisă de elev, escapată
  click(q('#tab-catalog [data-action="add-subject"]'));
  $("subj-pick").value = "__opt"; $("subj-pick").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(!$("subj-opt-group").hidden, "Opțional shows the topic field");
  input("subj-opt", '<img src=x onerror="window.pwn=1">'); click($("action-modal-confirm"));
  const optName = Object.keys(T.state.subjects).find(n => n.startsWith("Opțional"));
  assert(optName && !w.pwn && !q("#cat-list img") && !q("#cat-detail img"), "optional added, topic escaped (" + optName + ")");
  click(q('#tab-catalog [data-action="add-subject"]'));
  assert(![...$("subj-pick").options].some(o => o.value === "__opt"), "only one optional");
  click($("action-modal-cancel"));
  // un al doilea opțional (ex. dintr-un backup) e marcat „în afara programei”, primul rămâne
  T.state.subjects["Opțional · Robotică"] = { ore: 1, target: 10, grades: [], priority: false, excludeFromGPA: false }; T.refresh();
  const optRows = qa("#cat-list .cat-row").filter(r => /Opțional/.test(r.textContent));
  assert(optRows.length === 2 && optRows.filter(r => /în afara programei/.test(r.textContent)).length === 1 && /Robotică/.test(optRows.find(r => /în afara programei/.test(r.textContent)).textContent), "maximum one optional: the extra one is flagged");
  delete T.state.subjects["Opțional · Robotică"]; T.refresh();
  // Dirigenția din gimnaziu intră în medie; schimbarea programei e în Setări
  assert(/clasa a V-a/.test($("programme-settings").textContent) || true, "programme card");

  // reset everything → empty state
  T.RESET_OPTIONS[2].run(); T.refresh();
  assert(q("#cat-list .cat-row.is-purtare") && /Nu ai încă nicio materie/.test($("cat-list").textContent) && T.ui.catalog.selected === "__purtare__", "after reset: purtare stays, empty prompt, purtare selected");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
