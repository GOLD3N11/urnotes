// Examene: EN și Bac
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

function boot(ls = {}, now = [2026, 9, 16, 10, 0]) {
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
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,examKind,examSubjects,examAverage,examNeed,examEstimate,examYear,buildBackup,parseBackup,sanitizeExams,get metrics(){return metrics}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const toast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "";
  return { w, T, $, q, qa, click, toast };
}




const DATA = {
  "pro_setup_done_v4": "1", "pro_tour_done_v4": "1",
  "pro_catalog_db_v4": { "Matematică": { ore: 4, target: 10, grades: [{ val: 7, type: "Test", date: "2026-10-01" }] }, "Limba și literatura română": { ore: 3, target: 10, grades: [{ val: 9, type: "Test" }] }, "Fizică": { ore: 3, target: 9, grades: [] } },
  "pro_settings_db_v4": { school: { profile: "mate-info", cls: 12, variant: "intensiv", lm2: "Limba franceză", county: "Iași" }, calc: { rev: 2 } }
};
(async () => {
  const { w, T, $, q, qa, click, toast } = boot(DATA); await new Promise(r => setTimeout(r, 30));
  const change = (el, v) => { if (typeof v === "boolean") el.checked = v; else el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  assert(T.examKind() === "bac" && T.examYear() === 2026, "XII mate-info → Bac 2027");
  const subs = T.examSubjects();
  assert(subs.map(s => s.key).join() === "ea,ec,ed" && subs[1].name === "Matematică" && subs[2].name === "Fizică", "Bac subjects for real profile");
  assert(T.examEstimate(subs[0]).from === "catalog" && T.examEstimate(subs[0]).val === 9, "estimate falls back to the catalog");
  click(q('[data-action="nav"][data-tab="tab-examene"]'));
  assert(/^241$/.test(q(".exam-days").textContent.trim()) && /E\.a\) Limba/.test($("exam-root").textContent), "countdown: 241 days to E.a (14 June 2027)");
  assert(q('.side-link.active').dataset.tab === "tab-statistici" && q("#tab-examene .page-back")?.dataset.tab === "tab-statistici" && /Bacalaureatul/.test($("h-examene").textContent), "exams is a sub-page of Progres");
  assert(q("#tab-examene .page-pal").hidden && q("#h-examene .page-ico"), "page header: line icon, no mascot");
  // reguli
  const A = v => T.examAverage("bac", v);
  assert(A({ ea: 7, ec: 8, ed: 9 }).avg === 8 && A({ ea: 7, ec: 8, ed: 9 }).passed, "Bac: 7/8/9 → 8.00, passed");
  assert(!A({ ea: 8, ec: 4.9, ed: 9 }).passed && A({ ea: 8, ec: 4.9, ed: 9 }).low[0].key === "ec", "Bac: under 5 at one test fails");
  assert(A({ ea: 6, ec: 6, ed: 5.99 }).avg === 5.99 && !A({ ea: 6, ec: 6, ed: 5.99 }).passed, "Bac: average truncated, under 6 fails");
  assert(T.examNeed("bac", { ea: 9, ec: 9, ed: 8 }, 9).need === 9 && T.examNeed("bac", { ea: 8, ec: 8, ed: 8 }, 9).possible === false, "need at the weakest test");
  // rezultat nou
  click(q('#tab-examene .intro-actions [data-action="exam-practice"]'));
  click(q('.ep-chip[data-subj="ec"]')); $("ep-int").value = "9"; $("ep-dec").value = "50"; click($("action-modal-confirm"));
  assert(T.state.exams.practice.length === 1 && T.state.exams.practice[0].val === 9.5 && T.state.exams.practice[0].subj === "ec", "practice result saved (9.50 at E.c)");
  assert(/9\.50/.test($("exam-root").textContent), "estimate uses the practice result");
  // alegeri
  change($("exam-ed"), "Informatică");
  assert(T.state.exams.ed === "Informatică" && T.examSubjects()[2].name === "Informatică", "E.d choice saved");
  change($("exam-maternal"), true);
  assert(T.examSubjects().length === 4, "maternal test adds E.b");
  change($("exam-maternal"), false);
  // simulator
  const before = q(".exam-result b").textContent;
  click(q('[data-action="exam-step"][data-subj="ed"][data-d="0.25"]'));
  assert(q(".exam-result b").textContent !== before && T.state.exams.practice.length === 1, "stepper changes the simulated average, not the data");
  change($("exam-target"), "9");
  assert(T.state.exams.target === 9 && q(".exam-need"), "target shows what you need");
  // calendar
  click(q('[data-action="exam-to-calendar"]'));
  assert((T.state.calendar["2027-06-14"] || []).some(e => e.type === "Examen" && /Bac/.test(e.title)) && (T.state.calendar["2027-06-15"] || []).some(e => e.subject === "Matematică"), "exam dates added to the calendar");
  assert(q('[data-action="exam-to-calendar"]').hidden, "button hides once added");
  // EN
  T.state.settings.school = { ...T.state.settings.school, profile: "gimnaziu", cls: 8 }; T.ui.examSim = {}; T.refresh();
  assert(T.examKind() === "en" && T.examAverage("en", { ro: 9.35, mate: 8.2 }).avg === 8.77, "EN: (9.35+8.20)/2 → 8.77, no rounding");
  assert(/22 iunie|Lu 22 iun|22 iun/.test($("exam-root").textContent) || /Limba și literatura română/.test($("exam-root").textContent), "EN timeline shows");
  // date
  const back = T.parseBackup(JSON.stringify(T.buildBackup())).loaded.data;
  assert(back.exams.practice.length === 1 && back.exams.ed === "Informatică", "backup keeps exams");
  assert(T.sanitizeExams({ practice: [{ subj: "x", val: 5 }, { subj: "ro", val: 11 }, { subj: "ro", val: 8.456 }] }).practice.length === 2, "sanitizeExams drops unknown tests");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED"); process.exit(process.exitCode || 0);
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; process.exit(1); });
