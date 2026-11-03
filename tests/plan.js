// Planul meu: motorul de planificare, bifele, editarea, legăturile cu restul aplicației
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

function boot(ls = {}, now = [2026, 9, 8, 9, 30]) {
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
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,get buddyRest(){return buddyPoke.rest},buildPrintReport,buildPlan,planSignature,planStreak,planGoals,get alerts(){return alerts}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const toast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "";
  return { w, T, $, q, qa, click, toast };
}

const DATA = {
  "pro_setup_done_v4": "1", "pro_tour_done_v4": "1",
  "pro_catalog_db_v4": {
    "Matematica": { ore: 4, target: 10, grades: [{ val: 4, type: "Test", date: "2026-09-20" }] },
    "Fizica": { ore: 2, target: 9, grades: [{ val: 10, type: "Test", date: "2026-09-18" }] },
    "Chimie": { ore: 2, target: 9, grades: [{ val: 8, type: "Test", date: "2026-09-22" }] },
    "Romana": { ore: 4, target: 10, priority: true, grades: [{ val: 8, type: "Teză", date: "2026-09-25" }] },
    "Engleza": { ore: 2, target: 10, grades: [] }
  },
  "pro_timetable_db_v4": { 1: ["Matematica", "Chimie"], 2: ["Romana"], 3: ["Chimie", "Fizica"], 4: ["Matematica"], 5: ["Romana", "Engleza"] },
  "pro_calendar_db_v4": {
    "2026-10-12": [{ id: "tf", title: "Test Fizica", type: "Test", subject: "Fizica" }],
    "2026-10-10": [{ id: "tm", title: "Teză Matematica", type: "Teză", subject: "Matematica" }],
    "2026-10-09": [{ id: "hr", title: "Temă Romana", type: "Temă", subject: "Romana" }],
    "2026-10-13": [{ id: "te", title: "Test Engleza", type: "Test", subject: "Engleza" }]
  }
};
// „Teză” nu e un tip de eveniment: devine „Personal” la normalizare — o folosim ca să verificăm că nu intră în plan.

(async () => {
  let A = boot(DATA); await new Promise(r => setTimeout(r, 30));
  let { w, T, $, q, qa, click, toast } = A;
  const nav = tab => click(q(`[data-action="nav"][data-tab="${tab}"]`));
  const items = () => T.state.plan.items;
  const on = d => items().filter(i => i.date === d);

  // --- înainte de configurare
  assert(/Fă-ți un plan/.test($("azi-plan").textContent), "Azi: card invites to make a plan");
  assert(!T.alerts.some(a => a.id.startsWith("plan:")), "no plan alert before setup");
  nav("tab-plan");
  assert(q('input[name="plan-school"]') && $("plan-tools").hidden && /Hai să-ți facem un plan/.test($("plan-body").textContent), "Plan page: free-time setup form");

  // --- crearea planului
  q('input[name="plan-school"][value="60"]').checked = true; q('input[name="plan-weekend"][value="90"]').checked = true; $("plan-session").value = "30"; $("plan-rest").value = "-1";
  click(q('[data-action="plan-create"]'));
  assert(T.state.plan.prefs.setup && T.state.plan.prefs.school === 60 && items().length > 0, "plan created (" + items().length + " sessions)");
  assert(/Ți-am pus \d+ sesiuni/.test(toast()), "toast tells how many sessions");
  assert(!$("plan-tools").hidden && qa(".plan-strip-day").length === 7, "7-day strip shown with tools");
  assert(q(".plan-strip-day.is-today.is-on") && /Azi ai \d+ sesiun/.test(q(".plan-today").textContent), "today selected; today card says how many sessions");
  const startBtn = q('.plan-today [data-action="focus-start"]');
  assert(startBtn && /Începe acum/.test(startBtn.textContent), "one big 'Începe acum' button for the next session");
  // cronometrul: se deschide, se poate pune pe pauză, „Am terminat” bifează
  const startId = startBtn.dataset.id;
  click(startBtn);
  assert(!$("action-modal").hidden && $("focus-timer") && /:/.test($("focus-left").textContent), "focus timer opens");
  click(q('[data-action="focus-pause"]'));
  assert(/pauză/.test($("focus-state").textContent) && /Continuă/.test($("focus-pause").textContent), "pause works");
  click(q('[data-action="focus-pause"]'));
  click($("action-modal-confirm"));
  assert(items().find(i => i.id === startId).done && $("action-modal").hidden, "'Am terminat' ticks the session");
  items().find(i => i.id === startId).done = false; T.refresh();
  click(q('.plan-today [data-action="focus-start"]')); click($("action-modal-cancel"));
  assert(!items().find(i => i.id === startId).done, "'Renunț' leaves it unticked");
  // banda: alegi o zi și vezi doar ziua aceea
  click(q('.plan-strip-day[data-date="2026-10-11"]'));
  assert(/duminică/i.test($("plan-day-title").textContent) && q('.plan-strip-day[data-date="2026-10-11"]').getAttribute("aria-pressed") === "true", "tapping a day shows that day");
  click(q('.plan-strip-day[data-date="2026-10-08"]'));
  const fiz = items().filter(i => i.mat === "Fizica").map(i => `${i.kind}@${i.date}`).sort();
  assert(fiz.includes("learn@2026-10-08") && fiz.includes("practice@2026-10-10") && fiz.includes("review@2026-10-11"), "test on Monday: learn 4 days before, practice 2, review the day before: " + fiz);
  const rom = items().filter(i => i.mat === "Romana" && i.kind === "homework");
  assert(rom.length === 1 && rom[0].date === "2026-10-08" && /tema de mâine/.test(rom[0].reason), "homework due tomorrow → a session today ('tema de mâine')");
  const mate = items().filter(i => i.mat === "Matematica");
  const mDays = new Set(mate.map(i => i.date));
  assert(mate.filter(i => i.demand.startsWith("s|")).length === 2 && mDays.size === mate.length, "risk subject: 2 practice sessions, never twice the same day");
  assert(mate.some(i => /ieși din risc/.test(i.reason)), "risk reason says what to do");
  assert(items().filter(i => i.mat === "Romana" && i.demand.startsWith("s|")).length === 2, "starred subject below target: 2 sessions");
  assert(items().some(i => i.mat === "Engleza" && i.kind === "learn" && i.date === "2026-10-09"), "subject without grades but with a test → still planned");
  // „Teză” (tip necunoscut → Personal) nu produce sesiuni de test
  assert(!items().some(i => i.demand.includes("tm")), "personal events don't create test sessions");
  // capacitatea: nicio zi peste minute (testele pot depăși)
  const over = [...new Set(items().map(i => i.date))].filter(d => {
    const used = on(d).reduce((n, i) => n + i.min, 0);
    const cap = ["2026-10-10", "2026-10-11"].includes(d) ? 90 : 60;
    return used > cap && !on(d).every(i => i.demand.startsWith("t|") || i.demand.startsWith("h|"));
  });
  over.forEach(d => console.log("   ", d, on(d).map(i => `${i.mat}/${i.kind}/${i.min}/${i.demand}`).join(" ; ")));
  assert(over.length === 0, "no day exceeds the free time (except forced test prep): " + over);
  // determinist
  const snap = JSON.stringify(items());
  T.state.plan.sig = ""; T.refresh();
  assert(JSON.stringify(items()) === snap, "rebuilding with the same data gives the identical plan (no sync conflicts)");
  assert(T.planSignature("2026-10-08") === T.state.plan.sig, "signature stored");

  // --- ținte
  const goals = T.planGoals();
  assert(goals[0].mat === "Matematica" && goals[0].risk && goals.some(g => g.mat === "Chimie") && goals.some(g => g.mat === "Engleza" && g.first), "goals: risk first, below-target, first grade");
  assert(/Ținte pe modul/.test($("plan-body").textContent) && /Prima notă: testul de marți/.test($("plan-body").textContent), "goals rendered (first grade at Tuesday's test)");

  // --- Azi: card, bife, alertă, mascota
  nav("tab-dashboard");
  const todayN = on("2026-10-08").length;
  assert(qa("#azi-plan .plan-item").length === todayN && /0 din/.test($("azi-plan").textContent), "Azi card lists today's sessions");
  assert(T.alerts.some(a => a.id === "plan:2026-10-08" && a.tab === "tab-plan"), "notification: today's sessions");
  const boxes = () => qa('#azi-plan [data-action="plan-toggle"]');
  const first = boxes()[0]; click(first);
  assert(on("2026-10-08").filter(i => i.done).length === 1 && JSON.parse(w.localStorage.getItem("pro_plan_db_v4")).items.some(i => i.done), "ticking marks done and saves");
  assert(q("#azi-buddy .buddy")?.dataset.mood === "giggle", "mascot reacts to a tick (no text)");
  for (let k = 0; k < 10 && boxes().some(b => !b.checked); k++) click(boxes().find(b => !b.checked));
  assert(on("2026-10-08").every(i => i.done) && /Gata pe azi/.test($("azi-plan").textContent), "all done → 'Gata pe azi'");
  assert(q("#azi-buddy .buddy")?.dataset.mood === "love", "mascot: hearts when the day's plan is done");
  assert(!T.alerts.some(a => a.id.startsWith("plan:")), "alert disappears when everything is done");
  T.refresh();
  assert(!q("#azi-buddy .buddy-bubble") && /Gata planul de azi/.test(T.buddyRest.text), "bubble congratulates");
  assert(T.planStreak("2026-10-08") === 1, "streak 1");

  // --- a doua zi: ce e bifat rămâne, șirul continuă
  w.__setNow(2026, 9, 9, 9, 0); T.refresh();
  assert(items().filter(i => i.date === "2026-10-08").every(i => i.done), "yesterday's ticks kept as history");
  assert(!items().some(i => i.date > "2026-10-15"), "plan stays within 7 days");
  assert(T.planStreak("2026-10-09") === 1, "today unfinished doesn't break the streak");

  // --- mută / șterge / adaugă
  nav("tab-plan");
  const target = items().find(i => i.date === "2026-10-09" && !i.done && i.demand.startsWith("s|"));
  click(q(`[data-action="plan-move"][data-id="${target.id}"]`));
  assert(!$("action-modal").hidden && qa('[data-action="plan-move-to"]').length === 7, "move: pick one of 7 days");
  click(q(`[data-action="plan-move-to"][data-date="2026-10-14"]`));
  const moved = items().find(i => i.id === target.id);
  assert(moved.date === "2026-10-14" && moved.manual, "moved + marked as edited");
  T.state.subjects.Chimie.grades.push({ val: 7, type: "Test", date: "2026-10-09" }); T.refresh(); // schimbă semnătura → refacere
  assert(items().find(i => i.id === target.id)?.date === "2026-10-14", "edited session survives a rebuild");
  const del = items().find(i => i.date >= "2026-10-09" && !i.done && !i.manual && i.demand.startsWith("x|")) || items().find(i => i.date >= "2026-10-09" && !i.done && !i.manual);
  click(q(`.plan-strip-day[data-date="${del.date}"]`));
  click(q(`[data-action="plan-delete"][data-id="${del.id}"]`));
  assert(!items().some(i => i.demand === del.demand) && T.state.plan.removed[del.demand], "deleted (remembered for the week)");
  T.state.subjects.Chimie.grades.push({ val: 6, type: "Test", date: "2026-10-09" }); T.refresh();
  assert(!items().some(i => i.demand === del.demand), "deleted session not recreated by the next rebuild");
  click(q('[data-action="plan-add"]'));
  $("plan-add-mat").value = "Fizica"; $("plan-add-day").value = "2026-10-11"; $("plan-add-kind").value = "learn"; $("plan-add-min").value = "45";
  click($("action-modal-confirm"));
  assert(items().some(i => i.mat === "Fizica" && i.date === "2026-10-11" && i.min === 45 && i.manual && i.reason === "adăugată de tine"), "manual session added");

  // --- timpul meu: zi liberă
  click(q('[data-action="plan-prefs"]'));
  $("planm-rest").value = "0"; $("planm-calendar").checked = false;
  click($("action-modal-confirm"));
  const sunday = items().filter(i => i.date === "2026-10-11" && !i.manual && !i.demand.startsWith("t|"));
  assert(T.state.plan.prefs.rest === 0 && sunday.length === 0, "rest day: no regular sessions on Sunday");
  assert(/refăcut/.test(toast()), "rebuild confirmed");

  // --- calendar
  nav("tab-calendar");
  assert(!q(".cal-plan"), "calendar overlay off when disabled");
  T.state.plan.prefs.calendar = true; T.refresh();
  assert(qa(".cal-plan-item").length > 0, "calendar shows plan sessions when enabled");

  T.state.settings.report.sections.plan = true; T.buildPrintReport();
  const pr = w.document.querySelector(".pr-plan");
  assert(pr && /Fizica/.test(pr.textContent) && /min/.test(pr.textContent), "printable report: optional 7-day plan section");
  // --- backup, garbage, raport
  const raw = JSON.parse(w.localStorage.getItem("pro_plan_db_v4"));
  assert(raw.prefs.setup && Array.isArray(raw.items), "plan persisted");
  const B = boot({ ...DATA, "pro_plan_db_v4": { prefs: { school: "abc", session: 99, rest: 9 }, items: [{ date: "x" }, null, { date: "2026-10-08", mat: "Fizica", kind: "weird", min: 9999 }], removed: { a: 5 } } });
  await new Promise(r => setTimeout(r, 30));
  const bp = B.T.state.plan;
  assert(bp.prefs.school === 45 && bp.prefs.session === 30 && bp.prefs.rest === -1 && !bp.prefs.setup && bp.items.length === 1 && bp.items[0].kind === "free" && bp.items[0].min === 240 && !Object.keys(bp.removed).length, "garbage plan data sanitized");
  // --- preferințele pe materii
  const C = boot({ ...DATA, "pro_calendar_db_v4": { ...DATA["pro_calendar_db_v4"], "2026-10-09": [{ id: "hr", title: "Temă Romana", type: "Temă", subject: "Romana" }, { id: "hm", title: "Temă mate", type: "Temă", subject: "Matematica" }], "2026-10-13": [{ id: "tm2", title: "Test mate", type: "Test", subject: "Matematica" }] } });
  await new Promise(r => setTimeout(r, 30));
  C.click(C.q('[data-action="nav"][data-tab="tab-plan"]'));
  const rows = C.qa("#plan-favs .plan-fav-row");
  assert(rows.length === 5 && /Ce materii îți plac/.test(C.$("plan-favs").textContent) && rows.every(r => r.querySelector('input[value="normal"]').checked), "setup asks which subjects you like (all 'Normal' at first)");
  const pick = (mat, v) => { const r = rows.find(x => x.dataset.mat === mat); r.querySelector(`input[value="${v}"]`).checked = true; };
  pick("Matematica", "tests"); pick("Fizica", "fav"); pick("Chimie", "fav"); C.q('input[name="plan-school"][value="90"]').checked = true; C.q('input[name="plan-weekend"][value="120"]').checked = true;
  C.click(C.q('[data-action="plan-create"]'));
  const ci = C.T.state.plan.items;
  assert(C.T.state.plan.prefs.subjects.Matematica === "tests" && C.T.state.plan.prefs.subjects.Fizica === "fav" && !("Romana" in C.T.state.plan.prefs.subjects), "preferences saved (normal not stored)");
  const mi = ci.filter(i => i.mat === "Matematica");
  assert(mi.length > 0 && mi.every(i => i.demand.startsWith("t|")), "'Doar la teste': only test-prep sessions, even though it's at risk (" + mi.map(i => i.kind).join(",") + ")");
  assert(!ci.some(i => i.demand.startsWith("h|") && i.mat === "Matematica") && ci.some(i => i.demand.startsWith("h|") && i.mat === "Romana"), "no homework sessions for tests-only subjects (others keep theirs)");
  assert(ci.some(i => i.mat === "Fizica" && i.reason === "pentru că îți place"), "favourite at target still gets a session ('pentru că îți place')");
  assert(ci.filter(i => i.mat === "Chimie" && i.demand.startsWith("s|")).length === 2, "favourite below target gets 2 sessions");
  assert(/Planific doar înaintea testelor/.test(C.$("plan-body").textContent), "goals note the tests-only choice");
  C.click(C.q('[data-action="plan-prefs"]'));
  const mrow = C.qa("#planm-favs .plan-fav-row").find(r => r.dataset.mat === "Matematica");
  assert(mrow.querySelector('input[value="tests"]').checked, "preferences modal shows saved choices");
  mrow.querySelector('input[value="normal"]').checked = true;
  C.click(C.$("action-modal-confirm"));
  assert(!C.T.state.plan.prefs.subjects.Matematica && C.T.state.plan.items.some(i => i.mat === "Matematica" && i.demand.startsWith("s|")), "back to Normal → risk sessions return");
  console.log(process.exitCode ? "SOME FAILED" : "ALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
