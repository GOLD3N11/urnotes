// Colegul pe fiecare pagină + navigarea pe grupuri
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

function boot(ls = {}, now = [2026, 9, 14, 17, 0]) {
  const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script[^>]*src=[^>]+><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
  w.CSS = { escape: s => s.replace(/"/g, '\\"') };
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  w.eval(`(() => { const Real = Date; let now = new Real(${now.join(",")}).getTime();
    class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
    window.Date = FakeDate; window.__setNow = (...a) => { now = new Real(...a).getTime(); }; })()`);
  for (const [k, v] of Object.entries(ls)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,palLines,presetModules,schoolYear,orthodoxEaster,SCHOOL_HOLIDAYS,isSchoolDay,sanitizeArchive,buildBackup,parseBackup,readStoredData,DATA_SCHEMA,nextYearPlan,get metrics(){return metrics},get sim(){return sim}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const toast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "";
  return { w, T, $, q, qa, click, toast };
}




const DATA = {
  "pro_setup_done_v4": "1", "pro_tour_done_v4": "1",
  "pro_catalog_db_v4": { "Matematică": { ore: 4, target: 10, grades: [{ val: 4, type: "Test", date: "2026-10-01" }] }, "Fizică": { ore: 3, target: 9, grades: [{ val: 10, type: "Test", date: "2026-10-02" }] } },
  "pro_calendar_db_v4": { "2026-10-15": [{ id: "t", title: "Test Fizică", type: "Test", subject: "Fizică" }] },
  "pro_settings_db_v4": { profile: { buddy: "Bubu" }, calc: { rev: 2, riskThreshold: 8 } }
};
(async () => {
  const { w, T, $, q, qa, click } = boot(DATA); await new Promise(r => setTimeout(r, 30));
  const nav = tab => click(q(`[data-action="nav"][data-tab="${tab}"]`));
  for (const tab of ["tab-plan", "tab-calendar", "tab-catalog", "tab-statistici", "tab-simulator", "tab-setari"]) {
    nav(tab);
    const pal = q(`#${tab} .page-pal`);
    assert(pal && pal.hidden && !pal.innerHTML && q(`#${tab} .page-intro h2 .page-ico`), `${tab}: header has a line icon and no mascot (brand: Tiți only on Azi, empty states, good news)`);
  }
  nav("tab-calendar");
  assert(T.palLines("tab-calendar").some(l => /Test Fizică, mâine/.test(l.text)), "calendar pal mood knows tomorrow's test");
  nav("tab-catalog");
  assert(T.palLines("tab-catalog").some(l => /Mate.*sub 8/.test(l.text)), "catalog pal mood knows the risk subject");
  // uneltele (Ce-ar fi dacă, Examene) stau în Progres; Progres rămâne aprins în meniu
  nav("tab-statistici");
  click(q('#tab-statistici .note-link[data-tab="tab-simulator"]'));
  assert(T.ui.activeTab === "tab-simulator" && q('.side-link[data-tab="tab-statistici"]').classList.contains("active"), "Ce-ar fi dacă opens from Progres; Progres stays lit");
  assert(!q('#tab-catalog .note-links'), "Note no longer repeats the tool links");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
  process.exit(process.exitCode || 0);
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; process.exit(1); });
