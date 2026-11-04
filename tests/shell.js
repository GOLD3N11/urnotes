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
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({
  "Fizică": { ore: 2, target: 9, grades: [{ val: 5, type: "Test", date: "2026-10-01" }] },
  "Română": { ore: 4, target: 10, grades: [] }
}));
w.localStorage.setItem("pro_calendar_db_v4", JSON.stringify({ "2026-10-20": [{ id: "e", title: "Test fizică cinematică", type: "Test", subject: "Fizică" }] }));
w.localStorage.setItem("pro_purtare_db_v4", JSON.stringify({ grades: {}, lastModule: "2026-1" }));
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,switchTab,get alerts(){return alerts}};");
const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };

(async () => {
  if (w.document.readyState === "loading") await new Promise(r => w.document.addEventListener("DOMContentLoaded", r));
  // side menu
  assert(qa(".side-nav .side-link").length === 6 && q(".side-nav [data-tab='tab-scoala']") && q(".side-foot [data-tab='tab-setari']") && q(".side-nav .side-add") && q(".side-nav .side-search"), "side menu: Azi, Calendar, Note, Plan, Progres, Școala + Adaugă + Caută; Setări at the bottom");
  T.switchTab("tab-scoala");
  assert(T.ui.activeTab === "tab-scoala" && q(".side-link.active").dataset.tab === "tab-scoala" && $("school-body"), "Școala is a page in the app, lit in the menu");
  T.switchTab("tab-dashboard");
  click(q("[data-action='nav'][data-tab='tab-statistici']"));
  assert(T.ui.activeTab === "tab-statistici" && q(".side-link.active").dataset.tab === "tab-statistici" && !w.document.body.classList.contains("is-subpage"), "Progres is a main page with its own menu item");
  T.switchTab("tab-simulator");
  assert(T.ui.activeTab === "tab-simulator" && q(".side-link.active").dataset.tab === "tab-statistici" && q(".side-link.active").getAttribute("aria-current") === "page" && w.document.body.classList.contains("is-subpage"), "sub-page lights its parent (Progres) in the menu");
  assert(!$("topbar-back").hidden && $("topbar-back").dataset.tab === "tab-statistici" && /Progres/.test($("topbar-back").textContent) && /Progresul tău\s*[›\/]\s*\S*\s*Ce-ar fi dacă/.test($("topbar-crumb").textContent), "top bar: back to Progres + 'Progresul tău › Ce-ar fi dacă'");
  click(q('#topbar-crumb .crumb-link'));
  assert(T.ui.activeTab === "tab-statistici" && $("topbar-back").hidden && /Progresul tău$/u.test($("topbar-crumb").textContent.trim()), "crumb link returns to Progres; no back button on a main page");
  T.switchTab("tab-simulator");
  click(q('#tab-simulator .page-back'));
  assert(T.ui.activeTab === "tab-statistici", "back button returns to Progres");
  assert(!$("tab-alerte") && !q('[data-tab="tab-alerte"]'), "Alerte tab removed");
  // phone bar
  assert(qa(".mobile-bottom-nav .mobile-nav-btn").length === 4 && q(".mobile-bottom-nav .mobile-add") && q(".mobile-bottom-nav #more-btn"), "phone bar: Azi, Note, Calendar, Eu + raised +");

  // notifications panel
  const unread = T.alerts.filter(a => a.unread).length;
  assert(unread > 0 && $("notif-badge").textContent === String(unread) && !$("notif-badge").hidden, "bell badge shows unread count");
  click($("notif-btn"));
  assert(!$("notif-panel").hidden && qa("#alerte-container .alert-card").length === T.alerts.length, "bell opens panel with all alerts");
  click(q('#notif-panel [data-action="mark-alerts-read"]'));
  assert($("notif-badge").hidden, "mark read clears badge");
  const before = T.alerts.length;
  click(q('#alerte-container [data-action="dismiss-alert"]'));
  assert(T.alerts.length === before - 1 && qa("#alerte-container .alert-card").length === before - 1, "dismiss inside panel updates the list live");
  key("Escape");
  assert($("notif-panel").hidden, "Escape closes panel");
  T.state.alertMeta.dismissed = {}; T.refresh();
  click($("notif-btn"));
  const riskBtn = qa('#alerte-container [data-action="alert-open"]').find(b => /pragul de risc/.test(b.textContent));
  assert(riskBtn && riskBtn.querySelector("use").getAttribute("href") === "#i-alert", "risk notification shows alert icon");
  click(riskBtn);
  assert($("notif-panel").hidden && T.ui.activeTab === "tab-catalog" && T.ui.catalog.selected === "Fizică", "tapping a risk notification opens that subject in Catalog");
  click($("notif-btn"));
  const examBtn = qa('#alerte-container [data-action="alert-open"]').find(b => /„Test fizică cinematică”/.test(b.textContent));
  click(examBtn);
  assert(T.ui.activeTab === "tab-calendar", "tapping an exam notification opens Calendar");

  // adăugare rapidă: bara de compus peste orice pagină (în Calendar e chiar în pagină)
  click(q("[data-action='nav'][data-tab='tab-dashboard']"));
  click($("quick-add-btn"));
  assert(!$("cc-overlay").hidden && w.document.body.classList.contains("cc-overlay-open"), "+ opens the quick-add bar over the page");
  key("Escape");
  assert($("cc-overlay").hidden, "Escape closes the bar");
  key("t");
  assert(!$("cc-overlay").hidden && q("#cc-overlay-host .cc-type.is-on").dataset.type === "Test", "letter T opens the bar on 'Test'");
  key("Escape");
  key("n");
  assert(!$("cc-overlay").hidden && q("#cc-overlay-host .cc-type.is-on").dataset.type === "Notă" && q("#cc-overlay-host .cc-val"), "N opens the bar in grade mode");
  key("n");
  assert(!$("cc-overlay").hidden, "N ignored while the bar is open");
  key("Escape");
  const field = $("cat-search"); field.focus(); key("n", {}, field);
  assert($("cc-overlay").hidden, "typing N in a field does not open the bar");
  // căutarea
  key("k", { ctrlKey: true });
  assert(!$("palette").hidden && qa("#palette-list .palette-item").length > 4, "Ctrl+K opens search");
  $("palette-input").value = "fiz"; $("palette-input").dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(/Fizică/.test(q("#palette-list .palette-item.is-on")?.textContent) || console.log(qa("#palette-list li").map(l => l.textContent.trim().replace(/\s+/g, " "))), "typing finds the subject without diacritics");
  key("Escape");
  assert($("palette").hidden, "Escape closes search");
  // telefon: „Mai mult” (un clic real pune focusul pe buton)
  $("more-btn").focus(); click($("more-btn"));
  assert(!$("more-menu").hidden && $("more-btn").getAttribute("aria-expanded") === "true" && w.document.activeElement === q('#more-menu .qa-item'), "phone 'Eu' opens its menu with focus on the first item");
  key("Escape");
  assert($("more-menu").hidden && w.document.activeElement === $("more-btn"), "Escape closes it and returns focus");
  assert(!q('#more-menu [data-kind="sim"]') && !q('#more-menu [data-kind="stats"]'), "Eu menu holds only account/settings things (pages live inside Note)");
  click($("more-btn")); click(q('#more-menu [data-kind="settings"]'));
  assert(T.ui.activeTab === "tab-setari", "More → Setări");
  const dark = w.document.body.classList.contains("dark-mode");
  click($("more-btn")); click(q('#more-menu [data-kind="theme"]'));
  assert(w.document.body.classList.contains("dark-mode") !== dark, "More → theme toggles");
  click(q('[data-action="nav"][data-tab="tab-dashboard"]'));
  assert(!$("more-btn").classList.contains("is-active"), "button not highlighted elsewhere");
  // Setări pe secțiuni
  click(q("[data-action='nav'][data-tab='tab-setari']"));
  assert(qa("#set-sec-nav .set-sec").length === 5 && $("settings-grid").dataset.sec, "settings: section menu with 5 sections (no old account section)");
  click(q('#set-sec-nav [data-sec="date"]'));
  assert($("settings-grid").dataset.sec === "date" && q('#set-sec-nav [data-sec="date"]').getAttribute("aria-pressed") === "true" && w.localStorage.getItem("urn_settings_section_v1") === "date", "settings: picking 'Date' shows that section and remembers it");
  key("ArrowLeft", {}, q('#set-sec-nav [data-sec="date"]'));
  assert($("settings-grid").dataset.sec !== "date", "settings: arrow keys move between sections");
  // clopoțelul deschide și închide notificările; Esc le închide de oriunde
  click($("notif-btn"));
  assert(!$("notif-panel").hidden, "bell opens notifications");
  click($("notif-btn"));
  assert($("notif-panel").hidden, "a second click on the bell closes them");
  click($("notif-btn")); w.document.body.focus(); key("Escape");
  assert($("notif-panel").hidden, "Escape closes notifications even with focus on the page");
  const pf = $("set-pagefx");
  assert(pf && pf.checked, "settings: page animations on by default");
  pf.checked = false; pf.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.localStorage.getItem("urn_page_fx_v1") === "0", "settings: turning page animations off is remembered");
  T.switchTab("tab-dashboard");
  w.document.body.insertAdjacentHTML("beforeend", '<button id="t-purt" data-action="purtare-settings"></button>');
  click($("t-purt"));
  assert(T.ui.activeTab === "tab-setari" && $("settings-grid").dataset.sec === "scoala", "Purtare → Setări opens the 'Școală' section");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
})().catch(e => { console.error("CRASH", e); process.exitCode = 1; });
