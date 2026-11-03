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
  "2026-10-12": [{ id: "ex2", title: "Lucrare cap. 3", type: "Test", subject: "Romana" }],
  "2026-10-13": [{ id: "rep", title: "Temă Fizica", type: "Temă", subject: "Fizica", repeat: { every: 1, until: "" } }]
}));
w.localStorage.setItem("pro_simulator_db_v4", JSON.stringify({ active: "s1", selected: "Fizica", scenarios: [{ id: "s1", name: "Scenariul 1", hypo: { Fizica: [{ id: "h1", val: 9, type: "Test" }] } }, { id: "s2", name: "Plan B", hypo: {} }] }));
w.localStorage.setItem("pro_settings_db_v4", JSON.stringify({ appearance: { accent: "blue" } }));
w.localStorage.setItem("pro_purtare_db_v4", JSON.stringify({ grades: {}, lastModule: "2026-1" }));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,buddySVG,palReact,palMoodForGrade,switchTab,get buddyRest(){return buddyPoke.rest},get metrics(){return metrics},get sim(){return sim},get alerts(){return alerts}};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const txt = id => $(id).textContent.replace(/\s+/g, " ").trim();
const at = (...a) => { w.__setNow(...a); T.ui.home.day = null; T.refresh(); };

const toastBtn = () => [...w.document.querySelectorAll(".toast:not(.leaving) .toast-action")].at(-1);
const lastToast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1);
const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
const nav = tab => click(q(`[data-action="nav"][data-tab="${tab}"]`));
(async () => {
  await new Promise(r => setTimeout(r, 50));
  const buddy = () => q("#azi-buddy .buddy")?.dataset.mood, bubble = () => (q("#azi-buddy .buddy-bubble") ? "BUBBLE SHOULD BE GONE" : T.buddyRest.text);
  // implicit: fără nume, mascota „Tiți”; Matematica e la risc (media 4) → îngrijorată
  assert(txt("h-dashboard") === "Bună dimineața!", "greeting without a name");
  assert(buddy() === "starry" && /^Un 10 la Fizica! Bravo, ți-am/.test(bubble()), "fresh 10 wins: " + bubble());
  T.state.subjects.Fizica.grades = [{ val: 9, type: "Test", date: "2026-09-18" }]; T.refresh();
  assert(buddy() === "worried" && /Matematica e la 4\.00/.test(bubble()), "buddy worried about the risk subject: " + bubble());
  assert(T.state.settings.appearance.accent === "yellow", "old default blue or violet / missing accent → yellow (new brand)");
  // numele din Setări
  nav("tab-setari");
  assert(q("#set-buddy-preview .buddy") && /Tiți/.test($("set-buddy-preview").textContent), "settings preview shows the buddy");
  $("set-name").value = "  Tudor   Popescu "; $("set-buddy").value = "Bobiță";
  $("set-buddy").dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(/Bobiță/.test($("set-buddy-preview").textContent) && !/Salut/.test($("set-buddy-preview").textContent), "preview updates live while typing");
  $("set-name").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(/Salvat/.test($("settings-status").textContent), "saved automatically ('✓ Salvat')");
  assert(T.state.settings.profile.name === "Tudor Popescu" && T.state.settings.profile.buddy === "Bobiță", "names saved (trimmed)");
  assert(JSON.parse(w.localStorage.getItem("pro_settings_db_v4")).profile.buddy === "Bobiță", "names persisted");
  nav("tab-dashboard");
  assert(txt("h-dashboard") === "Bună dimineața, Tudor!", "greeting uses first name");
  assert(/Bobiță/.test(q("#azi-buddy .buddy-poke").getAttribute("aria-label")) && !q("#azi-buddy .buddy-bubble"), "pal on Azi: named face, no speech text");
  // mascota se bucură de un 10 recent (are prioritate)
  T.state.subjects.Chimie.grades.push({ val: 10, type: "Test", date: "2026-10-07" }); T.refresh();
  assert(buddy() === "starry" && /Un 10 la Chimie! Bravo, Tudor/.test(bubble()), "happy after a recent 10: " + bubble());
  // fără risc și fără 10: concentrată înaintea testului de azi
  T.state.subjects.Chimie.grades.pop(); T.state.subjects.Fizica.grades = [{ val: 9, type: "Test", date: "2026-09-18" }]; T.state.subjects.Matematica.grades = [{ val: 9, type: "Test", date: "2026-09-20" }]; T.refresh();
  assert(buddy() === "thinking" && /test la Fizica/i.test(bubble()), "focused before today's test: " + bubble());
  // numele gol la mascotă → revine la Tiți
  nav("tab-setari"); $("set-buddy").value = "   "; $("set-buddy").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.settings.profile.buddy === "Tiți" && $("set-buddy").value === "Tiți", "empty buddy name falls back to Tiți");
  // restabilirea setărilor păstrează numele
  click(q('[data-action="reset-settings"]')); click($("action-modal-confirm"));
  assert(T.state.settings.profile.name === "Tudor Popescu", "reset keeps the names");
  // configurarea: numele se salvează pe loc
  click(q('[data-action="setup-open"]'));
  assert($("setup-me-name").value === "Tudor Popescu" && q("#setup-buddy .buddy"), "setup shows the name fields with current values");
  $("setup-me-name").value = "Ana"; $("setup-me-name").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("setup-me-buddy").value = "Pufi"; $("setup-me-buddy").dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(/Pufi/.test($("setup-buddy").textContent) && !/Încântat/.test($("setup-buddy").textContent), "setup preview reacts");
  assert(JSON.parse(w.localStorage.getItem("pro_settings_db_v4")).profile.name === "Ana", "setup names saved immediately");
  click(q('[data-action="setup-skip"]'));
  assert(txt("h-dashboard") === "Bună dimineața, Ana!" || T.state.settings.profile.name === "Ana", "kept after skipping setup");
  // backup-ul poartă numele
  assert(JSON.parse(w.localStorage.getItem("pro_settings_db_v4")).profile.buddy === "Pufi", "profile travels in the backup / cloud copy");
  // fețele lui Tiți: toate stările se desenează, fiecare cu fața ei
  const moods = ["happy", "focused", "worried", "giggle", "surprised", "ouch", "dizzy", "angry", "love", "sleepy", "wink", "starry", "sad", "proud", "thinking", "shy", "party"];
  const faces = moods.map(m => T.buddySVG(m));
  assert(faces.every((f, i) => f.includes(`data-mood="${moods[i]}"`) && f.includes("buddy-breath")) && new Set(faces).size === moods.length, "17 distinct moods, all breathing");
  T.switchTab("tab-dashboard"); T.palReact(T.palMoodForGrade(10), 50);
  assert(q("#azi-buddy .buddy")?.dataset.mood === "starry" && q("#side-pal .buddy")?.dataset.mood === "starry", "palReact swaps the face on Azi and in the menu");
  await new Promise(r => setTimeout(r, 120));
  assert(q("#side-pal .buddy")?.dataset.mood === "happy", "…and goes back to the everyday face");
  assert(T.palMoodForGrade(3) === "sad" && T.palMoodForGrade(7) === "thinking" && T.palMoodForGrade(9) === "happy", "mood per grade");
  console.log(process.exitCode ? "SOME FAILED" : "ALL PASSED");
})();
