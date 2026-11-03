// Colegul care crește: XP, niveluri, garderobă, insigne
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
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,palXP,palProgress,xpForLevel,buddySVG,sanitizePal,get metrics(){return metrics}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const toast = () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "";
  return { w, T, $, q, qa, click, toast };
}




const grades = n => Array.from({ length: n }, (_, i) => ({ val: 8, type: "Test", date: "2026-10-0" + (1 + i % 9) }));
const DATA = {
  "pro_setup_done_v4": "1", "pro_tour_done_v4": "1",
  "pro_catalog_db_v4": { "Matematică": { ore: 4, target: 10, grades: grades(12) } },
  "pro_plan_db_v4": { prefs: { setup: true, school: 60, weekend: 90, session: 30 }, items: [{ id: "p1", date: "2026-10-16", mat: "Matematică", kind: "review", min: 30, reason: "", done: false, manual: true }] },
  "pro_settings_db_v4": { calc: { rev: 2 }, profile: { buddy: "Bubu" } }
};
(async () => {
  const { w, T, $, q, qa, click, toast } = boot(DATA); await new Promise(r => setTimeout(r, 30));
  const xp0 = T.palXP();
  const nb = Object.values(T.state.achievements).filter(Boolean).length;
  assert(xp0 === 12 * 10 + nb * 50, "XP: 12 grades × 10 + 50 per badge");
  const L0 = T.palProgress().level;
  assert(L0 >= 2 && T.state.pal.seenLevel === L0 && !/nivelul/.test(toast()), "level set silently for existing data");
  assert(T.xpForLevel(2) === 100 && T.xpForLevel(3) === 250 && T.xpForLevel(4) === 450, "level curve 100/250/450");
  assert(q("#azi-buddy .pal-level") && q("#azi-buddy .pal-level").textContent.includes(String(L0)), "level ring next to the pal on Azi");
  // plan bifat → XP
  click(q('[data-action="nav"][data-tab="tab-plan"]'));
  click(q('[data-action="plan-toggle"][data-id="p1"]'));
  assert(T.state.pal.plan === 1 && T.palXP() === xp0 + 15, "plan session ticked: +15 XP");
  click(q('[data-action="plan-toggle"][data-id="p1"]'));
  assert(T.state.pal.plan === 0, "unticking takes it back");
  // nivel nou cu sărbătoare
  const need = Math.ceil((T.xpForLevel(L0 + 1) - T.palXP()) / 10) + 1;
  T.state.subjects["Matematică"].grades.push(...grades(need)); T.refresh();
  const L1 = T.palProgress().level;
  assert(L1 === L0 + 1 && T.state.pal.seenLevel === L1 && new RegExp(`nivelul ${L1}`).test(toast()), "level up toast");
  // garderoba
  click(q("#azi-buddy .pal-level") || q('[data-action="wardrobe-open"]'));
  assert(/Garderoba lui Bubu/.test($("action-modal-title").textContent), "wardrobe opens");
  assert(!q('[data-action="wardrobe-acc"][data-id="glasses"]').disabled && q('[data-action="wardrobe-acc"][data-id="crown"]').disabled, "glasses unlocked, crown locked");
  click(q('[data-action="wardrobe-acc"][data-id="glasses"]'));
  click(q('[data-action="nav"][data-tab="tab-dashboard"]'));
  assert(T.state.pal.look.acc === "glasses" && q("#azi-buddy .b-acc"), "pal wears glasses on Azi");
  click(q("#azi-buddy .pal-level"));
  click(q('[data-action="wardrobe-color"][data-id="pink"]'));
  assert(T.state.pal.look.color === "pink" && q("#azi-buddy svg").innerHTML.includes("#FF9EC0"), "pink paper (level 3)");
  click(q('[data-action="wardrobe-color"][data-id="orange"]'));
  assert(T.state.pal.look.color === "pink", "locked colour can't be picked");
  assert(qa(".wr-badges li").length >= 11, "badges listed");
  click($("action-modal-cancel"));
  // ștergerea notelor nu ia înapoi ce ai deblocat
  T.state.subjects["Matematică"].grades = []; T.refresh();
  assert(T.state.pal.look.color === "pink" && T.state.pal.seenLevel === L1, "unlocks stay after deleting grades");
  assert(T.sanitizePal({ look: { color: "gold", acc: "laser" }, plan: -3 }).look.color === "yellow" && T.sanitizePal({ plan: -3 }).plan === 0, "sanitizePal");
  assert(JSON.parse(w.localStorage.getItem("pro_pal_db_v4")).look.acc === "glasses", "look saved");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED"); process.exit(process.exitCode || 0);
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; process.exit(1); });
