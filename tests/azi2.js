// Azi mai deșteaptă: următorul pas, „De făcut” pe zile, săptămâna ta, amintiri din timp
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
function boot(ls = {}, now = [2026, 9, 14, 10, 0]) { // miercuri 14 oct 2026
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
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,renderDashboard,reminderDigest,homeNextStep,homeWeekHTML,get metrics(){return metrics}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  return { w, T, $, q, qa, click };
}
const base = (cal = {}, subj) => ({
  pro_catalog_db_v4: subj || { "Fizica": { ore: 2, target: 9, grades: [{ val: 9, type: "Test", date: "2026-10-01" }, { val: 10, type: "Oral", date: "2026-10-13" }] }, "Chimie": { ore: 2, target: 9, grades: [{ val: 9, type: "Test", date: "2026-10-02" }] } },
  pro_calendar_db_v4: cal,
  pro_purtare_db_v4: { grades: {}, lastModule: "2026-1" },
  pro_setup_done_v4: "1", pro_tour_done_v4: "1"
});
const kick = () => new Promise(r => setTimeout(r, 30));

(async () => {
  // 1) o notă de scris
  let A = boot(base({ "2026-10-12": [{ id: "tc", title: "Test Chimie", type: "Test", subject: "Chimie" }], "2026-10-15": [{ id: "tf", title: "Test Fizica", type: "Test", subject: "Fizica" }] }));
  await kick();
  assert(!A.$("azi-next").hidden && /Ce ai luat la „Test Chimie”/.test(A.$("azi-next").textContent), "next step: ask for a missing grade first");
  A.click(A.q('#azi-next .qg-btn[data-val="8"]'));
  assert(A.T.state.subjects.Chimie.grades.some(g => g.val === 8), "quick grade from next step saves the grade");
  assert(/Mâine/.test(A.$("azi-next").textContent) && /Test la Fizica/.test(A.$("azi-next").textContent), "then: tomorrow's test becomes the next step");
  assert(A.q('#azi-next [data-action="open-in-sim"][data-mat="Fizica"]') && A.q('#azi-next [data-action="open-subject"][data-mat="Fizica"]'), "test step links to 'what I need' and the subject's notes");
  assert(!A.qa("#azi-todo .azi-item b").some(b => b.textContent === "Test Fizica"), "the next step isn't repeated in the list");

  // 2) o temă pentru mâine
  A = boot(base({ "2026-10-15": [{ id: "hw", title: "Temă română", type: "Temă", subject: "Chimie" }], "2026-10-20": [{ id: "tx", title: "Teză", type: "Examen", subject: "Fizica" }] }));
  await kick();
  assert(/De predat mâine/.test(A.$("azi-next").textContent) && /Temă română/.test(A.$("azi-next").textContent), "next step: homework due tomorrow");
  A.click(A.q('#azi-next [data-action="event-done"]'));
  assert(A.T.state.calendar["2026-10-15"][0].doneDates?.["2026-10-15"], "'Am făcut-o' marks it done");
  assert(/În 6 zile/.test(A.$("azi-next").textContent), "then: the upcoming exam");
  const groups = A.qa("#azi-todo .azi-group").map(h => h.textContent);
  assert(groups.join() === "" || groups.every(g => ["Au trecut — completează", "Azi", "Mâine", "Mai încolo"].includes(g)), "to-do grouped by day");

  // 3) o sesiune din plan
  A = boot(base({}));
  await kick();
  A.T.state.plan.prefs.setup = true;
  A.T.state.plan.items = [{ id: "p1", date: "2026-10-14", mat: "Fizica", kind: "review", min: 30, done: false, reason: "test vineri" }];
  A.T.renderDashboard();
  assert(/Din planul de azi/.test(A.$("azi-next").textContent) && A.q('#azi-next [data-action="focus-start"][data-id="p1"]'), "next step: today's plan session with a Start button");

  // 4) o materie la risc, apoi nimic
  A = boot(base({}, { "Fizica": { ore: 2, target: 9, grades: [{ val: 4, type: "Test", date: "2026-10-01" }, { val: 5, type: "Oral", date: "2026-10-05" }] } }));
  await kick();
  assert(/Fizica e la 4\.50/.test(A.$("azi-next").textContent) && A.$("azi-next").querySelector(".is-warm"), "next step: the at-risk subject");
  A = boot(base({}));
  await kick();
  assert(/Nimic urgent acum/.test(A.$("azi-next").textContent), "next step: all clear");

  // 5) săptămâna ta
  assert(!A.$("azi-week").hidden && /Săptămâna asta/.test(A.$("azi-week").textContent) && /1 notă nouă, media lor 10\.00/.test(A.$("azi-week").textContent), "week card: this week's grades");
  assert(/cea mai bună: 10 la Fizica/.test(A.$("azi-week").textContent) && /▲/.test(A.$("azi-week").textContent), "week card: best grade and average change");
  const mon = boot(base({ "2026-10-22": [{ id: "t2", title: "Test", type: "Test", subject: "Chimie" }] }), [2026, 9, 19, 9, 0]);
  await kick();
  assert(/Săptămâna trecută/.test(mon.$("azi-week").textContent) && /12 oct/.test(mon.$("azi-week").textContent), "on Monday: last week's recap");
  assert(/Săptămâna asta: Chimie/.test(mon.$("azi-week").textContent), "recap previews this week's tests");

  // 6) amintiri: din timp și notele de scris
  A = boot(base({ "2026-10-11": [{ id: "old", title: "Test vechi", type: "Test", subject: "Chimie" }], "2026-10-17": [{ id: "far", title: "Teză", type: "Test", subject: "Fizica" }] }));
  await kick();
  let d = A.T.reminderDigest("2026-10-14");
  assert(d && /Sâmbătă ai test la Fizica: începe să recapitulezi/.test(d.body) && /Scrie nota de la „Test vechi”/.test(d.body), "reminder: test in 3 days + grade to write");
  A.T.state.settings.remind.ahead = false;
  d = A.T.reminderDigest("2026-10-14");
  assert(d && !/recapitulezi/.test(d.body), "reminder: heads-up can be turned off");
  console.log(process.exitCode ? "" : "ALL PASSED");
})().catch(e => { console.log("CRASH", e.stack); process.exitCode = 1; });
