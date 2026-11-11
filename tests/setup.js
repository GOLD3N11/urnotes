const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
function boot(seed = {}) {
  const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
  let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
  w.CSS = { escape: s => s.replace(/"/g, '\\"') };
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  w.eval(`(() => { const Real = Date; const now = new Real(2026, 9, 8, 9, 30).getTime();
    class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
    window.Date = FakeDate; })()`);
  for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,get alerts(){return alerts}};");
  const $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
  const toasts = () => qa(".toast .toast-text").map(t => t.textContent);
  return { w, T: w.__t, $, q, qa, click, key, toasts };
}
const rowByName = (qa, name) => qa(".setup-row").find(li => li.dataset.name === name);

(async () => {
  // --- 1. prima pornire: caiet gol → asistentul apare
  let A = boot();
  await new Promise(r => setTimeout(r, 30));
  let { w, T, $, q, qa, click, key, toasts } = A;
  assert(!$("setup").hidden && /Bun venit/.test($("setup-body").textContent), "empty notebook: setup opens with welcome");
  assert($("setup-steps").classList.contains("is-hidden") && q("#setup-foot").innerHTML === "", "welcome: no steps bar, actions are the two choices");
  key("n");
  assert($("quick-add").hidden, "shortcuts are off while setup is open");
  click(q('#setup-body [data-action="setup-next"]'));
  assert(/Ce profil ai/.test(txt()), "step 1: profile");
  function txt() { return $("setup-body").textContent; }
  assert(q('#setup-foot [data-action="setup-next"]').disabled, "Continue disabled until a profile is chosen");
  assert(qa(".setup-profile").length === 15 && qa(".setup-group").map(h => h.textContent).join("|") === "Liceu teoretic|Liceu vocațional|Liceu tehnologic|Gimnaziu și altele" && !$("setup-steps").classList.contains("is-hidden") && q("#setup-steps .is-current").textContent.includes("Profil"), "15 profiles in 4 groups (no free 'Altă specializare') + step indicator");
  click(q('[data-action="setup-profile"][data-id="mate-info"]'));
  assert(q('[data-id="mate-info"]').getAttribute("aria-checked") === "true" && !q('#setup-foot [data-action="setup-next"]').disabled, "choosing a profile enables Continue");
  click(q('#setup-foot [data-action="setup-next"]'));
  assert(/Materiile tale/.test(txt()) && qa(".setup-row").length === 17, "step 2: 16 subjects + Opțional for mate-info IX (new plan) (" + qa(".setup-row").length + ")");
  const mate = rowByName(qa, "Matematică");
  assert(mate && /^4 ore/.test(mate.querySelector(".setup-hours-fixed").textContent) && !mate.querySelector('[data-action="setup-hours"]'), "Matematică: 4 ore, fixed (no +/−)");
  assert(rowByName(qa, "TIC").querySelector(".setup-check").disabled, "compulsory subjects can't be unticked");
  const rel = rowByName(qa, "Religie").querySelector(".setup-check");
  assert(!rel.disabled, "Religie can be unticked");
  rel.checked = false; rel.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(rowByName(qa, "Religie").classList.contains("is-off"), "unticking crosses the subject out");
  // fără nume libere: nu există câmpuri de redenumire și nici „altă materie”
  assert(!q(".setup-name") && !q("#setup-new") && !q("[data-setup-add]"), "no free subject names in setup");
  assert(rowByName(qa, "Dirigenție") && /Dezvoltare personală/.test(rowByName(qa, "Dirigenție").textContent), "IX: Dirigenție (the framework's Dezvoltare personală și consiliere)");
  // limba modernă 2 se alege dintr-o listă
  const lm2 = q(".setup-lm2"); lm2.value = "Limba germană"; lm2.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(rowByName(qa, "Limba germană") && !rowByName(qa, "Limba franceză"), "LM2 picked from a list");
  // opționalul: o singură linie, debifată; scriind tema se bifează
  const optRow = qa(".setup-row").find(li => li.dataset.kind === "opt");
  assert(optRow && optRow.classList.contains("is-off"), "Opțional row, off by default");
  const topic = optRow.querySelector(".setup-opt-topic"); topic.value = "Educație financiară"; topic.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(optRow.querySelector(".setup-check").checked, "typing the optional's topic ticks it");
  click(q('#setup-foot [data-action="setup-next"]'));
  assert(/Ținta și anul școlar/.test(txt()), "step 3: targets");
  assert(q('[data-action="setup-method"][data-v="arithmetic"]').getAttribute("aria-checked") === "true", "fresh start: arithmetic average preselected");
  click(q('[data-action="setup-target"][data-v="9.5"]'));
  click(q('[data-action="setup-risk"][data-v="7"]'));
  $("setup-preset").value = "2026-mar01"; $("setup-preset").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(q('[data-action="setup-target"][data-v="9.5"]').getAttribute("aria-pressed") === "true", "target chip selected");
  click(q('#setup-foot [data-action="setup-next"]'));
  assert(/Adaug 16 materii, cu ținta 9\.50/.test(txt()), "step 4: summary (" + txt().replace(/\s+/g, " ").slice(0, 80) + ")");
  click(q('[data-action="setup-back"]'));
  assert(q('[data-action="setup-target"][data-v="9.5"]').getAttribute("aria-pressed") === "true" && $("setup-preset").value === "2026-mar01", "Back keeps choices");
  click(q('#setup-foot [data-action="setup-next"]'));
  click(q('[data-action="setup-finish"]:not([data-timetable])'));
  const names = Object.keys(T.state.subjects);
  assert($("setup").hidden && names.length === 16 && names.includes("Limba germană") && names.includes("Opțional · Educație financiară") && names.includes("Dirigenție") && names.includes("TIC") && !names.includes("Religie"), "finish: subjects created as chosen");
  assert(T.state.subjects["Dirigenție"].excludeFromGPA === true, "high-school Dirigenție doesn't count in the average");
  assert(st0().school.profile === "mate-info" && st0().school.cls === 9 && st0().school.lm2 === "Limba germană", "programme saved");
  function st0() { return T.state.settings; }
  assert(T.state.subjects["Matematică"].ore === 4 && T.state.subjects["Matematică"].target === 9.5, "hours + target saved per subject");
  const st = T.state.settings;
  assert(st.goals.targetGPA === 9.5 && st.calc.riskThreshold === 7 && st.calc.method === "arithmetic" && st.modules[2].end === "2027-02-26", "settings: target, risk, method, module preset");
  assert(w.localStorage.getItem("pro_setup_done_v4") === "1" && JSON.parse(w.localStorage.getItem("pro_catalog_db_v4"))["Fizică"], "saved; setup marked done");
  assert(T.ui.activeTab === "tab-dashboard" && /Gata!/.test(toasts().at(-1)), "lands on Azi with a confirmation");

  // --- 2. după „Sari peste”, nu mai apare
  A = boot(); await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  click(q('[data-action="setup-skip"]'));
  assert($("setup").hidden && w.localStorage.getItem("pro_setup_done_v4") === "1", "Sari peste closes and remembers");
  assert(q('#azi-day [data-action="setup-open"]'), "Azi empty state offers the profile setup");
  click(q('#azi-day [data-action="setup-open"]'));
  assert(!$("setup").hidden, "…which reopens it");
  A = boot({ "pro_setup_done_v4": "1" }); await new Promise(r => setTimeout(r, 30));
  assert(A.$("setup").hidden, "not shown again after it was skipped");

  // --- 3. gimnaziu
  A = boot(); await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  click(q('#setup-body [data-action="setup-next"]'));
  click(q('[data-action="setup-profile"][data-id="gimnaziu"]'));
  assert(q('[data-action="setup-class"][data-cls="5"]').getAttribute("aria-pressed") === "true", "gimnaziu: class picker (V selected)");
  click(q('[data-action="setup-class"][data-cls="6"]'));
  click(q('#setup-foot [data-action="setup-next"]'));
  const g = qa(".setup-row").map(li => li.dataset.name);
  assert(g.includes("Fizică") && !g.includes("Chimie") && !g.some(n => /latin/i.test(n)), "class VI: Fizică, no Chimie/Latină");
  const gh = n => Number(qa(".setup-row").find(li => li.dataset.name === n)?.querySelector(".setup-hours-fixed").textContent.split(" ")[0]);
  assert(gh("Limba și literatura română") === 4 && gh("Istorie") === 1 && gh("Biologie") === 2 && gh("Educație fizică și sport") === 2 && g.includes("Dirigenție") && !g.includes("Consiliere și dezvoltare personală"), "class VI hours from OMENCS 3590/2016");

  // --- 3a. clasa contează
  A = boot(); await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  click(q('#setup-body [data-action="setup-next"]'));
  click(q('[data-action="setup-profile"][data-id="mate-info"]'));
  assert(qa('[data-action="setup-class"]').map(b => b.textContent).join(",") === "a IX-a,a X-a,a XI-a,a XII-a" && q('[data-cls="9"]').getAttribute("aria-pressed") === "true", "high-school profile: class picker IX–XII (IX first)");
  assert(/planul-cadru nou/.test(q(".setup-note").textContent), "IX: note says new framework");
  click(q('[data-cls="11"]'));
  assert(/din 2009/.test(q(".setup-note").textContent) && /Holocaustul/.test(q(".setup-note").textContent), "XI: note says 2009 framework + 2023 change");
  click(q('#setup-foot [data-action="setup-next"]'));
  const row = n => qa(".setup-row").find(li => li.dataset.name === n);
  const hrs = n => Number(row(n)?.querySelector(".setup-hours-fixed").textContent.split(" ")[0]);
  assert(/clasa a XI-a/.test(q("#setup-body h2").textContent), "subjects step title shows the class");
  assert(hrs("Informatică") === 4 && hrs("Chimie") === 1 && hrs("Limba franceză") === 2 && !row("TIC") && !row("Educație artistică"), "mate-info XI: Informatică 4, Chimie 1, no TIC / Educație artistică");
  assert(row("Economie") && !row("Științe socio-umane"), "XI: Economie as the socio-human subject");
  const holo = row("Istoria evreilor. Holocaustul");
  assert(holo && !holo.classList.contains("is-off") && hrs("Istoria evreilor. Holocaustul") === 1, "XI: Holocaust history is compulsory (1 h)");
  click(q('[data-action="setup-back"]'));
  click(q('[data-cls="12"]')); click(q('#setup-foot [data-action="setup-next"]'));
  assert(row("Filosofie") && !row("Economie") && row("Istoria comunismului din România") && !row("Istoria evreilor. Holocaustul"), "XII: Filosofie + Istoria comunismului");
  click(q('[data-action="setup-back"]'));
  click(q('[data-cls="10"]')); click(q('#setup-foot [data-action="setup-next"]'));
  assert(row("Psihologie") && row("TIC") && hrs("Informatică") === 1 && hrs("Fizică") === 3 && row("Educație antreprenorială"), "X: Psihologie, TIC, Informatică 1, Fizică 3, Educație antreprenorială");
  click(q('[data-action="setup-back"]'));
  click(q('[data-cls="11"]'));
  click(q('[data-action="setup-profile"][data-id="filologie"]'));
  assert(q('[data-cls="11"]').getAttribute("aria-pressed") === "true", "class carries over when switching profile");
  click(q('#setup-foot [data-action="setup-next"]'));
  assert(!row("Matematică") && hrs("Limba franceză") === 3 && hrs("Limba latină") === 2 && row("Științe") && row("Literatură universală") && row("Sociologie") && !row("Fizică"), "filologie XI: no Matematică, LM2 3 h, Latină 2, Științe, Literatură universală, Sociologie");
  click(q('[data-action="setup-back"]'));
  click(q('[data-action="setup-profile"][data-id="tehnic"]'));
  click(q('#setup-foot [data-action="setup-next"]'));
  assert(hrs("Cultură de specialitate") === 6 && hrs("Pregătire practică") === 5 && hrs("Matematică") === 3, "tehnic XI: specialty + practice hours");
  click(q('[data-action="setup-back"]'));
  click(q('[data-action="setup-profile"][data-id="gimnaziu"]'));
  assert(q('[data-cls="5"]').getAttribute("aria-pressed") === "true" && /3590\/2016/.test(q(".setup-note").textContent), "gimnaziu: falls back to clasa a V-a, names its framework");
  click(q('[data-action="setup-profile"][data-id="mate-info"]')); click(q('[data-cls="12"]'));
  click(q('#setup-foot [data-action="setup-next"]')); click(q('#setup-foot [data-action="setup-next"]')); click(q('#setup-foot [data-action="setup-next"]'));
  click(q('[data-action="setup-finish"]:not([data-timetable])'));
  assert(T.state.settings.report.cls === "a XII-a" && T.state.subjects["Istoria comunismului din România"] && !T.state.subjects["Istoria evreilor. Holocaustul"], "class goes to the report header; XII subjects added");

  // --- 3b. arte vizuale: specializarea schimbă materiile de specialitate
  A = boot(); await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  click(q('#setup-body [data-action="setup-next"]'));
  click(q('[data-action="setup-profile"][data-id="arte-vizuale"]'));
  const extra = q(".setup-extra");
  assert(extra && extra.previousElementSibling.querySelector('[data-id="arte-vizuale"]') && q('[data-variant="plastice"]').getAttribute("aria-pressed") === "true", "Arte vizuale: specialization picker right under its group (Arte plastice preselected)");
  click(q('#setup-foot [data-action="setup-next"]'));
  let vn = qa(".setup-row").map(li => li.dataset.name);
  assert(vn.includes("Studiul formelor în desen") && vn.includes("Crochiuri") && vn.includes("Istoria artelor și a arhitecturii") && vn.includes("Educație muzicală") && !vn.includes("Educație artistică"), "Arte vizuale IX: new plan specialty subjects, Educație muzicală instead of Educație artistică");
  click(q('[data-action="setup-back"]'));
  click(q('[data-variant="arhitectura"]'));
  click(q('#setup-foot [data-action="setup-next"]'));
  vn = qa(".setup-row").map(li => li.dataset.name);
  assert(vn.includes("Atelier de arhitectură"), "Arhitectură IX: its own atelier");
  click(q('[data-action="setup-back"]')); click(q('[data-cls="11"]')); click(q('#setup-foot [data-action="setup-next"]'));
  vn = qa(".setup-row").map(li => li.dataset.name);
  assert(vn.includes("Geometrie descriptivă și perspectivă") && vn.includes("Matematică") && vn.includes("Procesarea computerizată a imaginii") && !vn.includes("Crochiuri"), "Arhitectură XI: its own specialty subjects");
  assert(new Set(vn.map(n => n.toLocaleLowerCase("ro"))).size === vn.length, "no duplicate subjects");
  click(q('[data-action="setup-back"]'));
  click(q('[data-action="setup-profile"][data-id="sportiv"]'));
  assert(q(".setup-extra [data-action='setup-class']") && !q(".setup-extra [data-action='setup-variant']"), "Sportiv: class picker only (no specialization)");
  click(q('#setup-foot [data-action="setup-next"]'));
  vn = qa(".setup-row").map(li => li.dataset.name);
  assert(vn.includes("Pregătire sportivă practică") && !vn.includes("Educație fizică"), "Sportiv: sports training replaces Educație fizică");
  click(q('[data-action="setup-back"]'));
  click(q('[data-action="setup-profile"][data-id="mate-info"]')); click(q('[data-cls="9"]')); click(q('[data-variant="intensiv"]'));
  click(q('#setup-foot [data-action="setup-next"]'));
  const ih = n => Number(qa(".setup-row").find(li => li.dataset.name === n)?.querySelector(".setup-hours-fixed").textContent.split(" ")[0]);
  assert(ih("Informatică") === 4 && ih("Matematică") === 4 && ih("Logică") === 1 && ih("Dirigenție") === 1, "mate-info IX intensiv: Informatică 4 + new common core (Logică, Dirigenție)");
  // fiecare profil: listă fără dubluri

  // --- 4. cu date existente: din căutare, nu dublează
  A = boot({ "pro_catalog_db_v4": { "Matematică": { ore: 4, target: 10, grades: [{ val: 9, type: "Test", date: "2026-10-01" }] } }, "pro_settings_db_v4": { calc: { method: "weighted" } } });
  await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  assert($("setup").hidden, "existing data: no automatic setup");
  click(q('#tab-setari [data-action="setup-open"]'));
  assert(!$("setup").hidden && /Configurare rapidă/.test($("setup-body").textContent), "Eu → 'Configurare rapidă' opens it");
  click(q('#setup-body [data-action="setup-next"]'));
  click(q('[data-action="setup-profile"][data-id="stiinte"]'));
  click(q('#setup-foot [data-action="setup-next"]'));
  const ex = rowByName(qa, "Matematică");
  assert(ex.classList.contains("is-existing") && /există deja/.test(ex.textContent), "existing subject marked 'există deja'");
  click(q('#setup-foot [data-action="setup-next"]'));
  assert(q(`[data-action="setup-method"][data-v="${T.state.settings.calc.method}"]`).getAttribute("aria-checked") === "true", "existing user: keeps current calc method");
  click(q('#setup-foot [data-action="setup-next"]'));
  click(q('[data-action="setup-finish"][data-timetable="1"]'));
  assert(T.state.subjects["Matematică"].grades.length === 1 && T.state.subjects["Matematică"].ore === 3, "existing subject: grades untouched, hours follow the programme (3)");
  assert(Object.keys(T.state.subjects).length === 16, "new subjects added alongside (" + Object.keys(T.state.subjects).length + ")");
  assert(!$("tt-overlay").hidden && /Orarul/.test($("tt-title").textContent), "'Completez orarul acum' opens the timetable editor");
  // --- pornirea rapidă: clasa → prima notă → gata (cont nou)
  A = boot(); await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  assert(q('#setup-body [data-action="setup-quick"]') && q('#setup-body [data-action="setup-next"]'), "welcome: quick start first, detailed path still there");
  click(q('[data-action="setup-quick"]'));
  assert(qa("#setup-steps li").map(li => li.textContent.trim()).join("|") === "1Clasa ta|2Prima notă|3Gata" && q('#setup-foot [data-action="setup-quick-next"]').disabled, "quick: 3 steps, Continue waits for a profile");
  click(q('[data-id="mate-info"]')); click(q('[data-cls="10"]'));
  click(q('#setup-foot [data-action="setup-quick-next"]'));
  const nSubs = Object.keys(T.state.subjects).length;
  assert(nSubs >= 10 && T.state.settings.school.profile === "mate-info" && T.state.settings.school.cls === 10 && w.localStorage.getItem("pro_setup_done_v4") === "1", "quick step 1 fills the class subjects (" + nSubs + ") and marks setup done");
  assert(/Ai deja o notă/.test($("setup-body").textContent) && q('#setup-foot [data-action="setup-quick-grade"]').disabled, "quick step 2: first grade, add waits for subject + grade");
  click(q('[data-action="setup-qmat"][data-mat="Matematică"]')); click(q('[data-action="setup-qval"][data-v="10"]'));
  assert(!q('#setup-foot [data-action="setup-quick-grade"]').disabled, "picking subject + grade enables Add");
  click(q('#setup-foot [data-action="setup-quick-grade"]'));
  assert(T.state.subjects["Matematică"].grades.length === 1 && T.state.subjects["Matematică"].grades[0].val === 10, "quick: the grade is saved");
  assert(/Gata/.test($("setup-body").textContent) && /Am pus 10 la Mate/.test($("setup-body").textContent) && q("#setup-body .buddy"), "quick step 3: Tiți says hi and recaps");
  click(q('[data-action="setup-quick-finish"]:not([data-timetable])'));
  assert($("setup").hidden && T.ui.activeTab === "tab-dashboard", "finish → Azi");
  // sari peste nota, apoi direct orarul
  A = boot(); await new Promise(r => setTimeout(r, 30)); ({ w, T, $, q, qa, click, key, toasts } = A);
  click(q('[data-action="setup-quick"]')); click(q('[data-id="mate-info"]')); click(q('#setup-foot [data-action="setup-quick-next"]'));
  click(q('[data-action="setup-quick-skip"]'));
  assert(/Gata/.test($("setup-body").textContent) && !Object.values(T.state.subjects).some(s => s.grades.length), "skip the grade: still done, no grade");
  click(q('[data-action="setup-quick-finish"][data-timetable="1"]'));
  assert($("setup").hidden && !$("tt-overlay").hidden, "finish with timetable opens the timetable");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
// --- date de module personalizate rămân; configurarea închide un formular deschis
(async () => {
  await new Promise(r => setTimeout(r, 300));
  const custom = [{ start: "2026-09-08", end: "2026-10-24" }, { start: "2026-11-03", end: "2026-12-21" }, { start: "2027-01-12", end: "2027-02-13" }, { start: "2027-02-24", end: "2027-04-22" }, { start: "2027-05-06", end: "2027-06-19" }];
  const A = boot({ "pro_setup_done_v4": "1", "pro_catalog_db_v4": { M: { ore: 1, target: 10, grades: [{ val: 9, type: "Test", date: "2026-10-01" }] } }, "pro_settings_db_v4": { modules: custom } });
  await new Promise(r => setTimeout(r, 30));
  const { w, T, $, q, click, key } = A;
  click(q('[data-action="add-grade"]'));
  assert(!$("cc-overlay").hidden, "the quick-add bar is open");
  click(q('#tab-setari [data-action="setup-open"]'));
  assert($("action-modal").hidden && $("cc-overlay").hidden && !$("setup").hidden && w.document.body.classList.contains("modal-open"), "opening setup closes the form first");
  assert(q("#setup-steps").classList.contains("is-hidden") && q("#setup-steps").getAttribute("aria-hidden") === "true", "welcome: steps bar kept invisible (layout stable)");
  click(q('#setup-body [data-action="setup-next"]')); click(q('[data-id="gimnaziu"]')); click(q('#setup-foot [data-action="setup-next"]')); click(q('#setup-foot [data-action="setup-next"]'));
  assert($("setup-preset").value === "keep" && /Păstrez datele mele/.test($("setup-preset").textContent), "custom module dates: 'Păstrez datele mele' preselected");
  click(q('#setup-foot [data-action="setup-next"]')); click(q('[data-action="setup-finish"]:not([data-timetable])'));
  assert(JSON.stringify(T.state.settings.modules) === JSON.stringify(custom), "custom module dates untouched after setup");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED (modules)");
})();
// --- alertă grupată pentru materiile fără note
(async () => {
  await new Promise(r => setTimeout(r, 400));
  const A = boot({ "pro_setup_done_v4": "1", "pro_catalog_db_v4": { A1: { ore: 1, target: 10, grades: [] }, B2: { ore: 1, target: 10, grades: [] }, C3: { ore: 1, target: 10, grades: [] }, D4: { ore: 1, target: 10, grades: [] } } });
  await new Promise(r => setTimeout(r, 30));
  const { w, T, $, q, qa, click } = A;
  const al = () => T.alerts.filter(a => a.icon === "note");
  assert(al().length === 1 && /la 4 materii: A1, B2, C3 și încă 1/.test(al()[0].text), "4 empty subjects → one grouped alert");
  assert($("notif-badge").textContent === "1", "badge counts it once");
  click($("notif-btn")); click(q('#alerte-container [data-action="alert-open"]'));
  assert(T.ui.activeTab === "tab-catalog" && T.ui.catalog.filter === "empty", "tapping it opens Catalog → 'Fără note'");
  T.state.subjects.A1.grades.push({ val: 9, type: "Test", date: "2026-10-01" }); T.state.subjects.B2.grades.push({ val: 9, type: "Test", date: "2026-10-01" }); T.refresh();
  assert(al().length === 2 && al().every(a => /Nu ai nicio notă înregistrată la (C3|D4)/.test(a.text)), "2 left → individual alerts again");
  // ascunsă ca grup → nu revine bucată cu bucată; apoi poate reapărea într-o situație nouă
  T.state.subjects.A1.grades = []; T.state.subjects.B2.grades = []; T.refresh();
  click($("notif-btn")); click([...w.document.querySelectorAll('#alerte-container [data-action="dismiss-alert"]')][0]);
  T.state.subjects.A1.grades.push({ val: 9, type: "Test", date: "2026-10-01" }); T.state.subjects.B2.grades.push({ val: 9, type: "Test", date: "2026-10-01" }); T.refresh();
  assert(al().length === 0, "dismissed group: remaining subjects don't come back one by one");
  T.state.subjects.E5 = { ore: 1, target: 10, grades: [] }; T.state.subjects.F6 = { ore: 1, target: 10, grades: [] }; T.refresh();
  assert(al().some(a => a.id === "nonote:group" || /E5|F6/.test(a.text)), "new empty subjects can be flagged again");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED (group)");
})();
