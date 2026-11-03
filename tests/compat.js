// Date salvate de versiunile vechi (cu widgeturi de dashboard, dashLayout, alerte vechi) se încarcă fără erori.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const vc = new VirtualConsole(); let errs = []; vc.on("jsdomError", e => errs.push(e.message)); vc.on("error", (...e) => errs.push(String(e[0])));
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script src="https:[^>]+><\/script>/, "").replace(/<script src="(script|js\/[^"]+)\.js" defer><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window; w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q }); w.CSS = { escape: s => s }; w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
w.localStorage.setItem("pro_settings_db_v4", JSON.stringify({ appearance: { theme: "dark", accent: "violet", density: "compact", dashLayout: "col-3" }, dashboard: { order: ["w_trend", "w_kpi"], visibility: { w_kpi: false } }, goals: { primary: "tens" } }));
w.localStorage.setItem("pro_catalog_db_v4", JSON.stringify({ "Matematică": { ore: 4, target: 10, grades: [{ val: 8, type: "Test", date: "2026-09-20" }], status: "OK", exactAvg: 8 } }));
w.localStorage.setItem("pro_alert_meta_db_v4", JSON.stringify({ dismissed: { "nonote-Fizică": true }, read: {} }));
w.localStorage.setItem("pro_has_run_v4", "true");
w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh};");
const T = w.__t;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
setTimeout(() => {
  ok(errs.length === 0, "old data loads without errors " + errs.join(" | "));
  ok(!("dashboard" in T.state.settings) && !("dashLayout" in T.state.settings.appearance), "obsolete widget settings dropped");
  ok(T.state.settings.appearance.accent === "yellow" && T.state.settings.goals.primary === "tens", "the rest of the settings kept");
  ok(w.document.getElementById("setup").hidden, "no setup wizard for an existing user");
  ok(w.document.querySelectorAll("#azi-tiles .home-tile").length === 4, "Azi shows the four tiles");
  console.log(process.exitCode ? "\nSOME FAILED" : "\nALL PASSED");
}, 50);
