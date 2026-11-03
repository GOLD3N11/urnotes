// Amintiri de seară + medii ca în catalog + formulare rapide
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

function boot(ls = {}, now = [2026, 9, 13, 18, 0]) {
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
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,reminderDigest,checkReminder,sanitizeSettings,roundValue,calculateMetrics,get metrics(){return metrics}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const toast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "";
  return { w, T, $, q, qa, click, toast };
}


const DATA = {
  "pro_setup_done_v4": "1", "pro_tour_done_v4": "1",
  "pro_catalog_db_v4": {
    "Matematica": { ore: 4, target: 10, grades: [{ val: 9, type: "Test", date: "2026-09-20" }, { val: 8, type: "Test", date: "2026-09-21" }] },
    "Fizica": { ore: 2, target: 9, grades: [{ val: 10, type: "Test", date: "2026-09-18" }, { val: 7, type: "Test", date: "2026-09-19" }] },
    "Chimie": { ore: 2, target: 9, grades: [{ val: 8, type: "Test", date: "2026-09-22" }] }
  },
  "pro_timetable_db_v4": { 1: ["Matematica"], 2: ["Fizica"], 3: ["Chimie", "Fizica"], 4: ["Matematica"], 5: ["Chimie"] },
  "pro_calendar_db_v4": {
    "2026-10-14": [{ id: "tf", title: "Test Fizica", type: "Test", subject: "Fizica" }, { id: "hc", title: "Temă Chimie", type: "Temă", subject: "Chimie", doneDates: { "2026-10-14": true } }],
    "2026-10-19": [{ id: "tm", title: "Test Matematica", type: "Test", subject: "Matematica" }],
    "2026-11-02": [{ id: "tn", title: "Test noiembrie", type: "Test", subject: "Chimie" }]
  },
  "pro_settings_db_v4": { remind: { on: true, time: "19:00" }, calc: { method: "weighted", rounding: "2" } }
};

(async () => {
  const { w, T, $, q, click, toast } = boot(DATA); await new Promise(r => setTimeout(r, 30));
  // migrare: vechiul implicit (ponderată, fără rev) trece pe „ca în catalog”
  assert(T.state.settings.calc.method === "arithmetic" && T.state.settings.calc.rev === 2, "calc: old default weighted migrates to arithmetic once");
  assert(T.sanitizeSettings({ calc: { method: "weighted", rev: 2 } }).calc.method === "weighted", "calc: an explicit choice (rev 2) is kept");
  // medii: 8.5→9, 8.5→9, 8 → (9+9+8 [+purtare 10]) / 4
  assert(T.metrics.subjects.Matematica.roundedAvg === 9 && T.metrics.subjects.Fizica.roundedAvg === 9, "catalog: 8.50 rounds up to 9");
  assert(T.roundValue(8.495, 2) === 8.5 && T.roundValue(8.475, 2) === 8.48 && T.roundValue(1.005, 2) === 1.01, "roundValue: float-safe .xx5 rounding");

  // amintiri
  assert(T.sanitizeSettings({ remind: { on: true, time: "03:13" } }).remind.time === "19:00", "remind: invalid time → 19:00");
  const d = T.reminderDigest("2026-10-13");
  assert(d && /Mâine: test la Fizica\./.test(d.body) && d.title === "Mâine: test la Fizica".replace(/^m/, "M") && !/Temă Chimie/.test(d.body) && d.exam, "digest: tomorrow's test, done homework left out");
  const fri = T.reminderDigest("2026-10-16");
  assert(fri && /Luni: test la Matematica/.test(fri.body), "digest: Friday looks ahead to Monday");
  assert(T.reminderDigest("2026-10-23") === null, "digest: before a long holiday only tomorrow counts (nothing → null)");

  assert(await T.checkReminder() === null, "check: before the chosen time → nothing");
  w.__setNow(2026, 9, 13, 19, 5);
  assert(await T.checkReminder() === "toast" && /Mâine: test la Fizica/.test(toast()), "check: after time → in-app reminder");
  assert(await T.checkReminder() === null, "check: only once per day");

  // Setări: cardul
  click(q('[data-action="nav"][data-tab="tab-setari"]'));
  assert($("set-remind-on").checked && !$("set-remind-time").disabled && q('[data-action="remind-test"]'), "settings: card reflects on + time");
  $("set-remind-on").checked = false; $("set-remind-on").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.settings.remind.on === false && $("set-remind-time").disabled, "settings: toggling off saves and disables time");
  $("set-remind-on").checked = true; $("set-remind-on").dispatchEvent(new w.Event("change", { bubbles: true }));
  $("set-remind-time").value = "21:00"; $("set-remind-time").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.settings.remind.on && T.state.settings.remind.time === "21:00", "settings: on + time saved");
  assert(JSON.parse(w.localStorage.getItem("pro_settings_db_v4")).remind.time === "21:00", "settings: persisted");
  click(q('[data-action="remind-test"]')); await new Promise(r => setTimeout(r, 250));
  assert(/Ai un test|Pentru mâine|Planul de azi|Mâine:|Un test se apropie|O notă de scris/.test([...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).join(" | ")), "settings: preview shows a reminder");

  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
  process.exit(process.exitCode || 0);
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; process.exit(1); });
