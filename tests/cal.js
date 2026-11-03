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
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
// Ceas fix (joi, 8 oct 2026, Modulul 1): testul nu mai depinde de ziua în care rulează.
const BASE = new Date(2026, 9, 8, 10, 0).getTime();
w.eval(`(() => { const Real = Date; class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(${BASE}); else super(...a); } static now() { return ${BASE}; } } window.Date = FakeDate; })()`);
const plus = n => { const d = new Date(BASE); d.setDate(d.getDate()+n); return key(d); };
const today = plus(0), wd = new Date(BASE).getDay();
const tomorrowWd = (wd + 1) % 7;
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Matematică": { ore: 4, target: 10, grades: [{ val: 9, type: "Test", date: plus(-20) }] },
  "Fizică": { ore: 2, target: 9, grades: [{ val: 7, type: "Test", date: plus(-15) }] },
  "Română": { ore: 3, target: 9, grades: [] }
}));
w.localStorage.setItem("pro_timetable_db_v4", JSON.stringify({ [wd]: ["Română", "Matematică"], [tomorrowWd]: ["Fizică"], 1: ["Matematică", "Fizică"], 9: ["x"] }));
w.localStorage.setItem("pro_calendar_db_v4", JSON.stringify({
  [plus(-3)]: [{ id: "past", title: "Test Fizică", type: "Test", subject: "Fizică" }],
  [plus(-14)]: [{ id: "hw", title: "Temă Română", type: "Temă", subject: "Română", repeat: { every: 1, until: "" } }],
  [plus(2)]: [{ id: "ex", title: "Teză Mate", type: "Examen", subject: "Matematică", time: "09:00" }],
  [plus(5)]: [{ title: "Fără id", type: "Personal" }]
}));
w.eval(require("./app_src")(dir) + "\n;window.__t={openEventModal,isHolidayDate,parseEventText,state,ui,get sim(){return sim},get alerts(){return alerts},occurrencesBetween,seriesDates,moveOccurrence,parseBackup,buildBackup,upcomingExamIndex,nextLessonDate,renameSubject,refresh,addDays};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const change = el => el.dispatchEvent(new w.Event("change", { bubbles: true }));
const toasts = () => qa(".toast .toast-text").map(t => t.textContent);
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const col = d => q(`.cal-col[data-date="${d}"]`);
const set = (id, v) => { $(id).value = v; };

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  assert(JSON.stringify(T.state.timetable[9]) === undefined && T.state.timetable[wd].length === 2, "timetable normalized (bad day dropped)");
  assert(T.state.calendar[plus(5)][0].id, "legacy event got id");

  T.ui.cal.view = "week"; // agenda e acum implicită; aici verificăm săptămâna
  click(q('[data-action="nav"][data-tab="tab-calendar"]'));
  assert(qa(".cal-col").length === 7 && col(today).classList.contains("is-today"), "week: 7 days, today marked");
  assert($("cal-caption").textContent === "Săptămâna aceasta", "caption this week");
  assert(qa(`.cal-col[data-date="${today}"] .cal-lesson`).map(b => b.querySelector(".cal-lesson-n").textContent + " " + b.querySelector(".cal-lesson-name").textContent).join("|") === "1 Română|2 Matematică", "today's lessons from timetable");
  assert(qa(`.cal-col[data-date="${today}"] .cal-ev`).some(e => /Temă Română/.test(e.textContent) && /↻/.test(e.textContent)), "weekly homework shows today with ↻");

  // overview
  const ov = $("cal-overview").textContent.replace(/\s+/g, " ");
  assert(/Teză Mate/.test(q(".cal-upnext .cal-chip").title) && /în 2 zile/.test(q(".cal-upnext .cal-chip").textContent) && q(".cal-upnext .cal-chip").classList.contains("is-near"), "Urmează: next exam as a chip, in 2 days");
  assert(/așteaptă/.test(ov) && /Test Fizică/.test(ov), "attention lists ungraded past test");
  assert(/Temă Română/.test(ov), "attention lists unchecked past homework");
  assert(T.alerts.some(a => a.id === "ungraded:past"), "alert for ungraded test");
  assert(/Teză Mate/.test(q("#azi-todo").textContent), "Azi: next exam (from occurrences) listed in De făcut");

  // grade from attention
  const gradeBtn = qa('#cal-overview [data-action="event-grade"]').find(b => b.dataset.id === "past");
  click(gradeBtn);
  assert($("modal-grade-date").value === plus(-3) && $("modal-grade-type").value === "Test" && /Nota la „Test Fizică”/.test($("action-modal-title").textContent), "grade modal prefilled from event");
  set("modal-grade-val", "9"); click($("action-modal-confirm"));
  const g = T.state.subjects["Fizică"].grades.at(-1);
  assert(g.val === 9 && g.eventId === "past" && g.eventDate === plus(-3) && g.date === plus(-3), "grade linked to event");
  assert(!/Test Fizică/.test($("cal-overview").textContent) && !T.alerts.some(a => a.id === "ungraded:past"), "attention + alert cleared after grading");
  // event card shows grade when visible (go to that week)
  T.ui.cal.date = plus(-3); w.eval; click(q('[data-action="cal-today"]')); // back to today
  T.ui.cal.date = plus(-3); T.refresh();
  const pastCard = q(`.cal-ev[data-id="past"]`);
  assert(pastCard && /Nota 9/.test(pastCard.textContent) && pastCard.classList.contains("is-done") && q(`.cal-ev[data-id="past"] .cal-ev-check`).disabled, "event card shows linked grade, done, check disabled");
  // delete grade in catalog → event reverts
  const idx = T.state.subjects["Fizică"].grades.length - 1;
  T.state.subjects["Fizică"].grades.splice(idx, 1); T.refresh();
  assert(/Test Fizică/.test($("cal-overview").textContent), "deleting grade reverts event to attention");
  click(q('[data-action="cal-today"]'));

  // done toggle on homework today
  const hwCheck = q(`.cal-col[data-date="${today}"] .cal-ev[data-id="hw"] .cal-ev-check`);
  click(hwCheck);
  assert(T.state.calendar[plus(-14)][0].doneDates?.[today] === true, "toggle done on repeat occurrence");
  assert(q(`.cal-col[data-date="${today}"] .cal-ev[data-id="hw"]`).classList.contains("is-done"), "done style");
  click(q(`.cal-col[data-date="${today}"] .cal-ev[data-id="hw"] .cal-ev-check`));
  assert(!T.state.calendar[plus(-14)][0].doneDates, "toggle back removes doneDates");

  // quick add from lesson chip
  click(qa(`.cal-col[data-date="${today}"] .cal-lesson`).find(b => /Matematică/.test(b.textContent)));
  // acum: ora din orar pregătește bara de adăugat (fără fereastră), cu materia și ziua alese
  assert(q(".cc-subj.is-on")?.dataset.mat === "Matematică" && q(".cc-day.is-on")?.dataset.date === today && q(".cc-type.is-on")?.dataset.type === "Test" && !$("cal-compose").querySelector(".cc-body").hidden, "lesson chip presets subject/date/type in the add bar");
  assert(/Test Matematică/.test($("cc-preview").textContent), "preview shows the auto title");
  assert(w.document.activeElement === $("cc-text"), "focus in the add bar");
  click(q(".cc-add"));
  const added = T.state.calendar[today].find(e => e.title === "Test Matematică");
  assert(added && added.subject === "Matematică", "event added with auto title");

  // pagina „Eveniment nou”: scrii un rând, proprietățile se completează singure
  T.openEventModal();
  assert(w.document.activeElement === $("ev-title") && q("#action-modal .np"), "new event opens as a page, cursor in the title");
  const typeIn = v => { $("ev-title").value = v; $("ev-title").dispatchEvent(new w.Event("input", { bubbles: true })); };
  typeIn("tema la fizica poimaine la 10");
  assert($("ev-subject").value === "Fizică" && $("ev-date").value === plus(2) && $("ev-time").value === "10:00" && q("input[name='ev-type']:checked").value === "Temă", "typed line → type, subject, date, time");
  assert(/Fizică/.test($("np-val-subject").textContent) && /10:00/.test($("np-val-time").textContent), "properties show what was understood");
  // alegerea de mână câștigă în fața textului
  click($("np-val-subject")); assert(!$("np-pop").hidden && q("#np-search"), "subject property opens a searchable menu");
  $("np-search").value = "mate"; $("np-search").dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(qa("#np-subject-opts .np-opt:not([hidden])").length === 1, "search filters subjects");
  click(q('#np-subject-opts .np-opt[data-value="Matematică"]'));
  assert($("ev-subject").value === "Matematică" && $("np-pop").hidden, "picking a subject sets it and closes the menu");
  typeIn("tema la fizica poimaine la 10 ");
  assert($("ev-subject").value === "Matematică", "typing no longer overrides a subject picked by hand");
  click($("action-modal-cancel"));

  // următoarea oră a materiei, ca opțiune de dată
  T.openEventModal();
  set("ev-subject", "Fizică"); change($("ev-subject"));
  click($("np-val-date"));
  const hint = q('#np-pop .np-opt[data-prop="date"]');
  assert(hint && hint.dataset.value === T.nextLessonDate("Fizică") && hint.dataset.value === plus(1) && /Ora de Fizică/.test(hint.textContent), "date menu starts with the next lesson (tomorrow)");
  click(hint); assert($("ev-date").value === plus(1), "picking it sets the date");
  // switch type to Temă via radio
  const temaRadio = q("input[name='ev-type'][value='Temă']"); temaRadio.checked = true; change(temaRadio);
  assert($("ev-title").placeholder === "Temă Fizică", "placeholder follows type");
  // repeat weekly until +4 weeks
  set("ev-repeat", "1"); change($("ev-repeat"));
  assert(!$("ev-until").disabled, "until enabled on repeat");
  set("ev-until", plus(-10)); click($("action-modal-confirm"));
  assert(/după data de început/.test(toasts().at(-1)), "until before start rejected");
  set("ev-until", plus(1 + 21)); click($("action-modal-confirm"));
  const rep = T.state.calendar[plus(1)].find(e => e.title === "Temă Fizică");
  assert(rep?.repeat?.every === 1 && T.seriesDates(rep, plus(1), plus(0), plus(100)).length === [1,8,15,22].filter(n => n === 1 || !T.isHolidayDate(plus(n))).length, "weekly series with until → 4 occurrences (minus vacation weeks)");

  // edit: rename + move single exam
  T.ui.cal.date = today; T.refresh();
  click(q(`.cal-ev[data-id="ex"] .cal-ev-main`));
  assert($("ev-title").value === "Teză Mate" && $("ev-date").value === plus(2) && $("ev-time").value === "09:00", "edit modal prefilled");
  set("ev-title", "Teză Matematică"); set("ev-date", plus(5)); click($("action-modal-confirm"));
  assert(!T.state.calendar[plus(2)] && T.state.calendar[plus(5)].find(e => e.id === "ex")?.title === "Teză Matematică", "edit moved exam to new date (a school day)");

  // move occurrence of repeating series → skip + single copy
  const hwStart = plus(-14);
  T.moveOccurrence("hw", today, plus(1));
  const hw = T.state.calendar[hwStart][0];
  assert(hw.skipDates.includes(today) && T.state.calendar[plus(1)].some(e => e.title === "Temă Română" && !e.repeat), "drag-move of one occurrence: skip + copy");
  // moving graded is blocked
  click(qa('#cal-overview [data-action="event-grade"]').find(b => b.dataset.id === "past")); set("modal-grade-val", "8"); click($("action-modal-confirm"));
  T.moveOccurrence("past", plus(-3), plus(-2));
  assert(T.state.calendar[plus(-3)]?.some(e => e.id === "past") && /are deja o notă/.test(toasts().at(-1)), "graded event not moved");

  // delete one occurrence / whole series
  T.ui.cal.date = today; T.refresh();
  click(q(`.cal-ev[data-id="${rep.id}"] .cal-ev-main`));
  click(q('[data-action="event-delete"]'));
  assert(qa("#action-modal-body .reset-option-card").length === 2, "repeat delete offers 2 choices");
  click(q('[data-action="event-delete-one"]'));
  assert(rep.skipDates?.includes(plus(1)), "delete one occurrence");
  T.ui.cal.date = plus(8); T.refresh();
  click(q(`.cal-ev[data-id="${rep.id}"] .cal-ev-main`)); click(q('[data-action="event-delete"]')); click(q('[data-action="event-delete-all"]'));
  assert(!T.state.calendar[plus(1)]?.some(e => e.id === rep.id), "delete whole series");

  // navigation
  T.ui.cal.date = today; T.refresh();
  click(q('[data-action="cal-nav"][data-offset="1"]')); assert($("cal-caption").textContent === "Săptămâna viitoare", "next week");
  click(q('[data-action="cal-today"]')); assert($("cal-caption").textContent === "Săptămâna aceasta", "Azi returns");
  click(q('[data-action="cal-view"][data-view="month"]'));
  assert(qa(".cal-mcell").length % 7 === 0 && q(".cal-mcell.is-today") && q('[data-view="month"]').getAttribute("aria-pressed") === "true", "month view");
  click(q(`.cal-mcell[data-date="${plus(3)}"]`));
  assert(T.ui.cal.view === "agenda" && q(`.ag-day[data-date="${plus(3)}"]`), "month cell → agenda around that day");

  // orarul: săptămâna colorată (js/timetable.js)
  const ttOpen = () => !$("tt-overlay").hidden;
  const ttNames = day => qa(`.tt-col[data-day="${day}"] .tt-cell .tt-name`).map(n => n.textContent);
  const tkey = (k) => w.document.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  click(q('#tab-calendar [data-action="timetable"]'));
  assert(ttOpen() && qa(".tt-col").length === 5 && qa(".tt-tap").length === Object.keys(T.state.subjects).length, "timetable opens: 5 day columns + one coloured chip per subject");
  assert(q(".tt-cell")?.getAttribute("style").includes("--subj"), "lessons carry the subject colour");
  click(q('.tt-col-pick[data-day="5"]'));
  assert(q('.tt-col[data-day="5"]').classList.contains("is-active") && q('.tt-daytab[data-day="5"]').getAttribute("aria-pressed") === "true", "picking Friday makes it the active day");
  click(q('.tt-tap[data-mat="Română"]'));
  assert(ttNames(5).at(-1) === "Română", "tapping a subject adds the next lesson to the active day");
  click(q('.tt-cell[data-day="1"][data-i="0"]'));
  assert(q('.tt-row.is-sel') && /ora 1/.test(q(".tt-pal-hint").textContent), "tapping a lesson selects it");
  click(q('.tt-row.is-sel [data-action="tt-remove"]'));
  click(q('[data-action="tt-done"]'));
  assert(!ttOpen() && T.state.timetable[5].at(-1) === "Română" && T.state.timetable[1].join() === "Fizică", "Gata saves the timetable");
  assert(/Am salvat orarul/.test(qa(".toast .toast-text").map(t => t.textContent).join("|")), "saved message (with undo)");

  click(q('#tab-calendar [data-action="timetable"]'));
  click(q('.tt-slot[data-day="2"]'));
  click(q('.tt-tap[data-mat="Matematică"]')); click(q('.tt-tap[data-mat="Română"]'));
  assert(ttNames(2).join() === "Matematică,Română", "tt: taps append in order");
  click(q('.tt-cell[data-day="2"][data-i="1"]')); click(q('.tt-row.is-sel [data-action="tt-move"][data-by="-1"]'));
  assert(ttNames(2).join() === "Română,Matematică" && q('.tt-row.is-sel .tt-cell').dataset.i === "0", "tt: move up keeps the lesson selected");
  click(q('.tt-tap[data-mat="Fizică"]'));
  assert(ttNames(2).join() === "Fizică,Matematică" && !q(".tt-row.is-sel"), "tt: with a lesson selected, a chip replaces it");
  click(q('[data-action="tt-copy"][data-day="2"]'));
  assert(ttNames(2).join() === ttNames(1).join(), "tt: copy the previous day");
  click(q('[data-action="tt-clear"][data-day="2"]'));
  assert(ttNames(2).length === 0, "tt: clear a day");
  click(q('.tt-cell[data-day="1"][data-i="0"]')); tkey("Escape");
  assert(ttOpen() && !q(".tt-row.is-sel"), "Escape first drops the selection");
  tkey("Escape");
  assert(!ttOpen() && !T.state.timetable[2] && T.state.timetable[1].join() === "Fizică", "Escape closes; nothing changed, nothing saved");

  // titluri: fără dată/oră, cu diacritice și numele materiei; Enter salvează
  T.openEventModal();
  typeIn("teza mate pe " + Number(plus(11).slice(8)) + " la 8:30");
  assert($("ev-date").value === plus(11) && $("ev-time").value === "08:30" && q("input[name='ev-type']:checked").value === "Examen", "'pe 30' and '8:30' understood");
  const press = (k, el = w.document.activeElement || w.document.body) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  press("Enter", $("ev-title"));
  const tz = (T.state.calendar[plus(11)] || []).find(e => e.type === "Examen" && e.subject === "Matematică");
  assert(tz && tz.title === "Teză Matematică" && tz.time === "08:30" && $("action-modal").hidden, "Enter saves; title tidied to 'Teză Matematică'");
  T.openEventModal();
  typeIn("eseu moara cu noroc vineri");
  click($("np-val-repeat")); click(q('#np-pop .np-opt[data-value="1"]'));
  assert($("ev-repeat").value === "1" && q("#np-until-input"), "repeat menu shows 'Până pe' once repeating");
  press("Escape");
  assert($("np-pop").hidden && !$("action-modal").hidden, "Escape closes the small menu first, not the page");
  click($("action-modal-confirm"));
  assert(/materia/.test(qa(".toast .toast-text").map(t => t.textContent).at(-1) || "") && !$("action-modal").hidden, "realism: a test without a subject is refused, the form stays open");
  set("ev-subject", "Română"); click($("action-modal-confirm"));
  const es = Object.values(T.state.calendar).flat().find(e => e.title === "Eseu moara cu noroc");
  assert(es && es.repeat?.every === 1, "free title kept (minus the day), weekly repeat saved");

  // înțelegerea textului (azi = ${today})
  const P = t => T.parseEventText(t, today);
  const nextWd = n => { for (let k = 1; k <= 7; k++) { const d = plus(k); if (new Date(d + "T12:00").getDay() === n) return d; } };
  [["Test mate vineri", { type: "Test", subject: "Matematică", date: nextWd(5), time: null, rest: "Test Matematică" }],
   ["lucrare la fizica mâine ora 12", { type: "Test", subject: "Fizică", date: plus(1), time: "12:00", rest: "lucrare la Fizică" }],
   ["proiect bio luni", { type: "Proiect", date: nextWd(1) }],
   ["temă română azi", { type: "Temă", subject: "Română", date: today, rest: "Temă Română" }],
   ["prezentare 14:15", { type: "Prezentare", time: "14:15", date: null }],
   ["ziua lui Andrei saptamana viitoare", { type: null, subject: null, date: plus(7), rest: "ziua lui Andrei" }],
   ["meditatii la 5", { time: null }]
  ].forEach(([text, exp]) => {
    const r = P(text);
    const okAll = Object.entries(exp).every(([k, v]) => r[k] === v);
    assert(okAll, `parse "${text}" → ${JSON.stringify(r)}`);
  });

  // rename propagates to timetable
  T.renameSubject("Fizică", "Fizica"); T.refresh();
  assert(T.state.timetable[1].join() === "Fizica" && T.state.calendar[plus(-3)][0].subject === "Fizica", "rename → timetable + events");

  // simulator slots from repeating exam
  T.state.calendar[plus(1)] = [...(T.state.calendar[plus(1)] || []), { id: "wk", title: "Test săptămânal", type: "Test", subject: "Matematică", repeat: { every: 1, until: "" } }];
  T.refresh();
  const keys = [...T.upcomingExamIndex().keys()].filter(k => k.startsWith("wk@"));
  assert(keys.length >= 10 && keys[0] === `wk@${plus(1)}`, "simulator gets per-occurrence slots for repeating tests");

  // backup round trip keeps timetable, repeat, links
  const back = T.parseBackup(JSON.stringify(T.buildBackup())).loaded.data;
  assert(back.timetable[5].at(-1) === "Română" && back.calendar[plus(1)].find(e => e.id === "wk").repeat.every === 1, "backup keeps timetable + repeat");
  assert(back.subjects["Fizica"].grades.some(g => g.eventId === "past"), "backup keeps grade↔event link");
  assert(back.calendar[hwStart][0].skipDates.includes(today), "backup keeps skipDates");

  // dashboard today widget
  click(q('[data-action="nav"][data-tab="tab-dashboard"]'));
  const todayBtn = q('#azi-day [data-action="home-day"][data-day="today"]'); if (todayBtn) click(todayBtn);
  const mateRow = qa("#azi-day .azi-lesson").find(li => /Matematică/.test(li.textContent));
  assert((mateRow && mateRow.classList.contains("has-exam") && mateRow.querySelector(".azi-tag.ev-test")) || /Test Matematică/.test($("azi-day").textContent), "Azi: today's test (from occurrences) shows in the day card");
  // catalog upcoming
  w.eval; 
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
