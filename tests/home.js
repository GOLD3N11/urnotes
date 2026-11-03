const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
// Ceas fix: joi 8 oct 2026, 09:30 (Modulul 1)
w.eval(`(() => { const Real = Date; let now = new Real(2026, 9, 8, 9, 30).getTime();
  class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
  window.Date = FakeDate; window.__setNow = (...a) => { now = new Real(...a).getTime(); }; })()`);
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Matematica": { ore: 4, target: 10, grades: [{ val: 3, type: "Test", date: "2026-09-20" }, { val: 5, type: "Ascultare", date: "2026-10-02" }] },
  "Fizica": { ore: 2, target: 9, grades: [{ val: 9, type: "Test", date: "2026-09-18" }, { val: 10, type: "Proiect", date: "2026-10-06" }] },
  "Chimie": { ore: 2, target: 9, grades: [] },
  "Romana": { ore: 4, target: 10, priority: true, grades: [{ val: 8, type: "Teză", date: "2026-09-25" }] }
}));
w.localStorage.setItem("pro_timetable_db_v4", JSON.stringify({ 4: ["Matematica", "Fizica", "Romana"], 5: ["Chimie", "Fizica"], 1: ["Romana"] }));
w.localStorage.setItem("pro_calendar_db_v4", JSON.stringify({
  "2026-10-08": [{ id: "tf", title: "Test Fizica", type: "Test", subject: "Fizica", time: "08:00" }],
  "2026-10-09": [{ id: "hr", title: "Temă Romana", type: "Temă", subject: "Romana" }],
  "2026-10-10": [{ id: "ex", title: "Teză Matematica", type: "Examen", subject: "Matematica" }],
  "2026-10-05": [{ id: "tc", title: "Test Chimie", type: "Test", subject: "Chimie" }],
  "2026-10-06": [{ id: "hf", title: "Temă Fizica", type: "Temă", subject: "Fizica" }],
  "2026-10-12": [{ id: "ex2", title: "Lucrare cap. 3", type: "Test", subject: "Romana" }]
}));
w.localStorage.setItem("pro_purtare_db_v4", JSON.stringify({ grades: {}, lastModule: "2026-1" }));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,get metrics(){return metrics}};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const txt = id => $(id).textContent.replace(/\s+/g, " ").trim();
const at = (...a) => { w.__setNow(...a); T.ui.home.day = null; T.refresh(); };

(async () => {
  await new Promise(r => setTimeout(r, 50));
  // --- joi dimineața, zi de școală
  assert(T.ui.activeTab === "tab-dashboard" && /Azi/.test(q('[data-action="nav"][data-tab="tab-dashboard"]').textContent), "Azi is the start page (menu label 'Azi')");
  assert(txt("azi-date") === "Joi, 8 octombrie · Modulul 1, săptămâna 5", "date line: weekday, module, week (" + txt("azi-date") + ")");
  assert(txt("h-dashboard") === "Bună dimineața!", "morning greeting");
  const sum = txt("azi-summary");
  assert(/Azi ai 3 ore și test la Fizica\./.test(sum) && /Urmează „Teză Matematica”, sâmbătă\./.test(sum) && /Un test așteaptă nota\./.test(sum), "summary: lessons + test, next exam, ungraded (" + sum + ")");
  assert(/Orele de azi/.test(q("#azi-day h3").textContent), "morning shows today's classes");
  const rows = qa("#azi-day .azi-lesson");
  assert(rows.length === 3 && rows.map(r => r.querySelector(".azi-lesson-name").textContent).join() === "Matematica,Fizica,Romana", "3 lessons in timetable order");
  assert(rows[1].classList.contains("has-exam") && rows[1].querySelector(".azi-tag.ev-test") && /08:00/.test(rows[1].textContent), "today's test marked on Fizica with time");
  assert(/examen sâmbătă/.test(rows[0].textContent) && /la risc/.test(rows[0].textContent), "Matematica: upcoming exam hint + risk hint");
  assert(/prioritară/.test(rows[2].textContent), "Romana: priority hint");
  assert(rows[0].querySelector(".azi-lesson-avg").textContent === "4.00" && rows[0].querySelector(".azi-lesson-avg").classList.contains("tone-fail"), "lesson shows subject average with tone");
  click(rows[1].querySelector('[data-action="add-grade"]'));
  assert(!$("cc-overlay").hidden && /Fizica/.test(q("#cc-overlay-host .cc-subj.is-on")?.textContent || ""), "+ on a lesson opens the quick-add bar for that subject");
  click(q('[data-action="cc-overlay-close"]'));

  // de făcut
  const groups = qa("#azi-todo .azi-group").map(h => h.textContent);
  assert(groups[0] === "Au trecut — completează" && groups.includes("Azi") && groups.includes("Mâine") && groups.indexOf("Azi") < groups.indexOf("Mâine"), "todo grouped by day: late, today, tomorrow…");
  const missed = qa("#azi-todo .azi-item.is-missed").map(li => li.querySelector("b").textContent);
  assert(/Test Chimie/.test($("azi-next").textContent) && $("azi-next").querySelectorAll(".qg-btn").length === 7 && missed.includes("Temă Fizica") && !missed.includes("Test Chimie"), "next step asks for the missing grade; the rest stays in the list");
  assert(/5/.test(q("#azi-todo .cat-count").textContent) || Number(q("#azi-todo .cat-count").textContent) >= 5, "todo count badge");
  const hwCheck = q('#azi-todo .azi-check[data-id="hr"]');
  assert(hwCheck && /mâine/.test(hwCheck.closest(".azi-item").textContent), "homework due tomorrow with checkbox");
  click(hwCheck);
  assert(!q('#azi-todo .azi-check[data-id="hr"]') && T.state.calendar["2026-10-09"][0].doneDates?.["2026-10-09"], "checking homework marks it done and removes it");
  const tests = qa("#azi-todo .azi-count b").map(b => b.textContent);
  assert(tests[0] === "azi" && tests.includes("2"), "test countdowns (azi, 2 zile)");
  click(q('#azi-next [data-action="event-grade"][data-id="tc"]'));
  assert(!$("action-modal").hidden && /Chimie/.test($("action-modal").textContent), "'+ Notă' on a missed test opens the linked grade form");
  click($("action-modal-cancel"));

  // plăcile zilei: media, teste în 7 zile, planul de azi, risc
  const tiles = qa("#azi-tiles .home-tile");
  assert(tiles.length === 4 && tiles[0].classList.contains("is-hero") && tiles[0].querySelector(".home-tile-value").textContent === T.metrics.globalAvg.toFixed(2), "hero tile shows the general average");
  assert(/Teste în 7 zile/.test(tiles[1].textContent) && Number(tiles[1].querySelector(".home-tile-value").textContent) >= 1, "tests tile counts this week's tests");
  assert(/Materii la risc/.test(tiles[3].textContent) && tiles[3].querySelector(".home-tile-value").textContent === String(T.metrics.riskCount), "risk tile");
  click(tiles[1]);
  assert(T.ui.activeTab === "tab-calendar", "tests tile opens Calendar");
  click(q('[data-action="nav"][data-tab="tab-dashboard"]'));
  click(q('#azi-tiles .home-tile[data-tab="tab-plan"]'));
  assert(T.ui.activeTab === "tab-plan" && q("#tab-plan .page-back"), "plan tile opens Plan, a sub-page with a back button");
  click(q("#tab-plan .page-back"));
  assert(T.ui.activeTab === "tab-dashboard", "back to Azi");

  // alegerea zilei
  click(q('#azi-day [data-action="home-day"][data-day="next"]'));
  assert(/Orele de mâine/.test(q("#azi-day h3").textContent) && qa("#azi-day .azi-lesson-name").map(n => n.textContent).join() === "Chimie,Fizica", "switch to tomorrow: Friday lessons");
  assert(q('#azi-day [data-day="next"]').getAttribute("aria-pressed") === "true", "segmented control reflects choice");

  // --- după-amiaza: automat ziua următoare
  at(2026, 9, 8, 16, 30);
  assert(/Orele de mâine/.test(q("#azi-day h3").textContent) && txt("h-dashboard") === "Bună ziua!", "afternoon: tomorrow's classes by default");
  assert(/^Mâine ai 2 ore\. Urmează „Teză Matematica”, sâmbătă\./.test(txt("azi-summary")), "afternoon summary: tomorrow + next exam, not the morning test (" + txt("azi-summary") + ")");
  at(2026, 9, 8, 20, 0);
  assert(txt("h-dashboard") === "Bună seara!", "evening greeting");

  // --- sâmbătă: weekend + evenimentul zilei
  at(2026, 9, 10, 10, 0);
  assert(/Orele de azi/.test(q("#azi-day h3").textContent) && /Weekend — nu ai ore\./.test(txt("azi-day")) && /Teză Matematica/.test(txt("azi-day")), "Saturday: weekend note + the day's exam");
  assert(q('#azi-day [data-day="next"]').textContent === "Luni", "next school day button says 'Luni'");
  click(q('#azi-day [data-day="next"]'));
  assert(/Orele de luni/.test(q("#azi-day h3").textContent) && /Lucrare cap\. 3/.test(q("#azi-day .azi-lesson").textContent), "Monday view: custom test title shown as tag");

  // --- vacanță
  at(2026, 9, 28, 10, 0);
  assert(/Vacanță/.test(txt("azi-date")) && /Ești în vacanță; școala reîncepe luni\./.test(txt("azi-summary")), "vacation: date line + summary (" + txt("azi-summary") + ")");

  // --- fără orar
  at(2026, 9, 8, 9, 30);
  T.state.timetable = {}; T.refresh();
  assert(q('#azi-day [data-action="timetable"]') && /Completează orarul/.test(txt("azi-day")), "no timetable: invites to fill it");

  // --- fără materii
  T.state.subjects = {}; T.state.calendar = {}; T.refresh();
  assert(q('#azi-day [data-action="add-subject"]') && /Adaugă-ți materiile/.test(txt("azi-summary")), "no subjects: start state");
  assert(q('#azi-tiles .home-tile.is-hero .home-tile-value').textContent === '–' && /încă nu ai note/.test(q('#azi-tiles .home-tile.is-hero').textContent), "no grades: hero tile says so");
  assert(/Nimic de făcut/.test(txt("azi-todo")), "nothing to do message");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
