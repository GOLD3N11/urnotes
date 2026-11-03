const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const dir = process.argv[2];
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8")
  .replace(/<script src="https:[^>]+><\/script>/, "")
  .replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.HTMLElement.prototype.scrollIntoView = () => {};
let downloads = [];
w.Blob.prototype.text = function () { return new Promise(r => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(this); }); };
w.HTMLAnchorElement.prototype.click = function () {};
w.URL.createObjectURL = b => { downloads.push(b); return "blob:x"; };
w.URL.revokeObjectURL = () => {};
w.eval(require("./app_src")(dir) + "\n;window.__t={state,get sim(){return sim},importBackupFile,parseBackup,summarizeData,plural};");
const T = w.__t, $ = id => w.document.getElementById(id);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const toasts = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent);
const assert = (c, m) => { if (!c) { console.log("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => { if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  // seed data
  T.state.subjects["Matematică"] = { ore: 4, target: 10, grades: [{ val: 9, type: "Test" }, { val: 10, type: "Teză" }], priority: true, excludeFromGPA: false };
  T.state.subjects["Fizică"] = { ore: 2, target: 10, grades: [{ val: 7, type: "Test" }], priority: false, excludeFromGPA: false };
  T.state.calendar["2026-10-20"] = [{ id: "e1", title: "Test „Mate” <b>", time: "08:00", type: "Test", subject: "Matematică", description: "" }];
  T.state.settings.appearance.theme = "dark";
  T.sim.scenarios[0].hypo["Fizică"] = [{ id: "h1", val: 10, type: "Test" }];
  click(w.document.querySelector('[data-action="nav"][data-tab="tab-setari"]'));
  assert(/Nu ai exportat/.test($("backup-status").textContent), "status says never exported");

  // EXPORT
  click(w.document.querySelector('[data-action="backup-export"]'));
  assert(downloads.length === 1, "export triggered a download");
  const exported = await downloads[0].text();
  const json = JSON.parse(exported);
  assert(json.app === "evidenta-scolara-pro" && json.version === 1, "header ok");
  assert(json.data.subjects["Matematică"].grades.length === 2 && json.data.simulator.scenarios[0].hypo["Fizică"], "subjects + simulator exported");
  assert(/Ultimul export/.test($("backup-status").textContent), "status shows last export");

  // change data, then IMPORT the export back
  T.state.subjects = { "Chimie": { ore: 1, target: 10, grades: [{ val: 5, type: "Test" }], priority: false, excludeFromGPA: false } };
  T.state.calendar = {};
  T.state.settings.appearance.theme = "light";
  await T.importBackupFile(new w.File([exported], "backup.json", { type: "application/json" }));
  assert(!$("action-modal").hidden, "preview modal opened");
  const body = $("action-modal-body").textContent;
  assert(/2 materii · 3 note · 1 eveniment · 1 scenariu/.test(body), "preview counts incoming: " + body.match(/\d+ materi[ei][^\n]*/)?.[0]);
  assert(/1 materie · 1 notă · 0 evenimente/.test(body), "preview counts current");
  click($("action-modal-confirm"));
  assert($("action-modal").hidden, "modal closed");
  assert(Object.keys(T.state.subjects).join() === "Matematică,Fizică", "subjects restored");
  assert(T.state.settings.appearance.theme === "dark", "settings restored");
  assert(w.document.body.classList.contains("dark-mode") && w.document.documentElement.style.getPropertyValue("--accent-color").toLowerCase() === "#ffd25e", "theme re-applied (brand accent in dark)");
  assert(T.sim.scenarios[0].hypo["Fizică"]?.length === 1, "simulator restored");
  assert(JSON.parse(w.localStorage.getItem("pro_catalog_db_v4"))["Matematică"], "persisted to localStorage");
  assert(!$("backup-undo").hidden, "undo bar visible");

  // UNDO
  click(w.document.querySelector('[data-action="backup-undo"]'));
  click($("action-modal-confirm"));
  assert(Object.keys(T.state.subjects).join() === "Chimie" && T.state.settings.appearance.theme === "light", "undo restored pre-import data");
  assert($("backup-undo").hidden && !w.localStorage.getItem("pro_backup_undo_v4"), "undo cleared");

  // BAD FILES
  for (const [txt, re, label] of [
    ["not json", /JSON valid/, "invalid JSON rejected"],
    ['{"foo":1}', /nu pare/, "foreign JSON rejected"],
    ['{"app":"evidenta-scolara-pro","version":99,"data":{}}', /mai nouă/, "newer version rejected"],
  ]) {
    await T.importBackupFile(new w.File([txt], "x.json"));
    assert(re.test(toasts().at(-1)) && $("action-modal").hidden, label);
  }

  // HOSTILE / messy content is sanitized
  const evil = { app: "evidenta-scolara-pro", version: 1, data: {
    subjects: JSON.parse('{"__proto__":{"ore":1,"grades":[]},"Ok":{"ore":"abc","grades":[{"val":11},{"val":"8","type":"Hack"},null,{"val":3}]},"Bad":5}'),
    calendar: { "nu-e-data": [{ title: "x" }], "2026-11-01": [{ title: "<img src=x onerror=alert(1)>", type: "Bomb", time: "99" }] },
    settings: { goals: "x", appearance: { theme: "neon", accent: "javascript:" }, calc: { rounding: 7 } },
    simulator: { scenarios: "nope" } } };
  const p = T.parseBackup(JSON.stringify(evil)).loaded;
  assert(Object.keys(p.data.subjects).join() === "Ok", "only valid subjects kept, __proto__ skipped");
  assert(Object.getPrototypeOf(p.data.subjects) === w.Object.prototype || Object.getPrototypeOf(p.data.subjects) === Object.prototype, "prototype untouched");
  assert(p.data.subjects.Ok.grades.map(g => g.val + g.type).join() === "8Altele,3Altele" && p.data.subjects.Ok.ore === 2, "grades/ore sanitized");
  assert(Object.keys(p.data.calendar).join() === "2026-11-01" && p.data.calendar["2026-11-01"][0].type === "Personal" && p.data.calendar["2026-11-01"][0].time === "", "calendar sanitized");
  assert(p.data.settings.goals.targetGPA === 10 && p.data.settings.appearance.theme === "system" && p.data.settings.appearance.accent === "yellow" && p.data.settings.calc.rounding === "2", "settings sanitized");
  assert(p.sim.scenarios.length === 1, "bad simulator → default");

  // Import into an EMPTY app → no undo snapshot, no danger styling
  T.state.subjects = {}; T.state.calendar = {};
  await T.importBackupFile(new w.File([exported], "b.json"));
  assert(/nimic nu se pierde/.test($("action-modal-body").textContent), "empty-app import message");
  click($("action-modal-confirm"));
  assert(!w.localStorage.getItem("pro_backup_undo_v4") && $("backup-undo").hidden, "no undo snapshot for empty app");

  assert([T.plural(1,"notă","note"), T.plural(5,"notă","note"), T.plural(20,"notă","note"), T.plural(101,"notă","note")].join("|") === "1 notă|5 note|20 de note|101 note", "Romanian plurals");

  // reload from storage still works (loadState path)
  const raw = w.localStorage.getItem("pro_catalog_db_v4");
  assert(JSON.parse(raw)["Matematică"].grades.length === 2, "storage consistent after import");
  console.log(process.exitCode ? "\nSOME TESTS FAILED" : "\nALL PASSED");
})().catch(e => { console.error(e); process.exitCode = 1; });
