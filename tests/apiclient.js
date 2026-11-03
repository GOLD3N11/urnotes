// Stratul către serverul urNotes: date școlare, amintiri prin server, părinți/profesori
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const seed = require("./school-seed")(dir);

function boot(ls = {}, { apiUrl = "https://api.test", routes = {} } = {}) {
  const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", ...e.map(x => x && x.stack || x)));
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script[^>]*src=[^>]+><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
  w.CSS = { escape: s => s.replace(/"/g, '\\"') };
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  w.eval(`(() => { const Real = Date; const now = new Real(2026, 9, 14, 10, 0).getTime();
    class FakeDate extends Real { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
    window.Date = FakeDate; })()`);
  for (const [k, v] of Object.entries(ls)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  const calls = [];
  w.fetch = async (url, opts = {}) => {
    const u = new URL(url); const key = `${opts.method || "GET"} ${u.pathname}`;
    calls.push({ key, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined });
    const h = routes[key];
    const [status, data] = typeof h === "function" ? h(opts) : h || [404, { error: "not_found", message: "nu" }];
    return { status, ok: status >= 200 && status < 300, json: async () => data, headers: { get: () => null } };
  };
  w.URNOTES_API = apiUrl;
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,api,cloud,schoolYear,EXAM_CALENDAR,COUNTY_WEEK,SCHOOL_HOLIDAYS,refreshSchoolData,syncReminderCache,openAccountPanel,upcomingDigests,reminderDigest,saveState,get alerts(){return alerts}};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error("no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  return { w, T, $, q, qa, click, calls };
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const BASE = { pro_catalog_db_v4: { "Fizică": { ore: 2, target: 9, grades: [{ val: 8, type: "Test", date: "2026-10-01" }] } },
  pro_calendar_db_v4: { "2026-10-15": [{ id: "t1", title: "Test Fizică", type: "Test", subject: "Fizică" }] }, pro_setup_done_v4: "1", pro_tour_done_v4: "1" };

(async () => {
  // 1) fără server: nimic nu pleacă
  let A = boot(BASE, { apiUrl: null });
  await tick();
  assert(A.T.api.enabled === false && A.calls.length === 0, "without api-config: no calls at all");

  // 2) datele școlare noi de pe server: aplicate imediat și păstrate pentru data viitoare
  const y2027 = { ...seed.years["2026"], order: "OM nr. 1/2027", m1: ["2027-09-06", "2027-10-22"], m2: ["2027-11-01", "2027-12-21"], m3Start: "2028-01-10", m4End: "2028-04-21", m5Start: "2028-05-03", end: "2028-06-16",
    lastDay: { 12: "2028-06-02", 8: "2028-06-09" }, mobile: { feb15: "2028-02-14", feb22: "2028-02-21", mar01: "2028-02-28" }, holidays: { "2027-12-25": "Crăciunul", "2027-11-30": "Sf. Andrei" }, notes: {} };
  const bundle = { version: "abc123", years: { ...seed.years, 2027: y2027 }, counties: { 2026: { ...seed.counties["2026"], "Iași": "mar01" } }, exams: { ...seed.exams, 2027: { bac: { status: "oficial", source: "test", dates: [["2028-06-12", "E.a) Română", "ea"]] } } } };
  A = boot(BASE, { routes: { "GET /v1/school": [200, bundle] } });
  assert(A.T.schoolYear(2027).estimated === true, "before: 2027 is estimated");
  assert(await A.T.refreshSchoolData() === true, "refreshSchoolData pulls a new version");
  assert(A.T.schoolYear(2027).estimated === false && A.T.schoolYear(2027).order === "OM nr. 1/2027", "new school year applied live");
  assert(A.T.COUNTY_WEEK["Iași"] === "2026-mar01" && A.T.EXAM_CALENDAR[2027].bac.dates[0][0] === "2028-06-12", "counties and exams applied live");
  assert(A.calls.find(c => c.key === "GET /v1/school") && !A.calls.find(c => c.key === "GET /v1/school").headers.Authorization, "school data is fetched without a token");
  const cached = A.w.localStorage.getItem("urn_school_data_v1");
  // pornire nouă, fără rețea: datele din cache se aplică înainte de orice calcul
  const B = boot({ ...BASE, urn_school_data_v1: cached }, { routes: {} });
  assert(B.T.schoolYear(2027).estimated === false && B.T.COUNTY_WEEK["Iași"] === "2026-mar01" && B.T.EXAM_CALENDAR[2027], "cached school data is used at the next start, even offline");
  assert(await B.T.refreshSchoolData() === false, "offline: nothing breaks");
  const C = boot({ ...BASE, urn_school_data_v1: cached }, { routes: { "GET /v1/school": [304, null] } });
  await C.T.refreshSchoolData();
  assert(C.calls.at(-1).headers["If-None-Match"] === '"abc123"', "asks with If-None-Match (304 = nothing new)");

  // 3) amintiri prin server: setarea + textele zilelor, cu jetonul contului
  const me = { user: { id: "11111111-1111-1111-1111-111111111111", role: "student" }, registered: true };
  let registered = false;
  const routes = {
    "GET /v1/me": () => [200, registered ? me : { user: null, registered: false }],
    "POST /v1/me": () => { registered = true; return [201, { user: me.user }]; },
    "PUT /v1/notifications/settings": [200, { enabled: true }],
    "PUT /v1/notifications/digests": [200, { saved: 1 }],
    "POST /v1/notifications/shown": [204, null],
    "GET /v1/me/links": [200, { links: [{ studentId: me.user.id, viewerId: "22222222-2222-2222-2222-222222222222", relation: "parent", name: "Mama", email: "mama@x.ro" }] }],
    "POST /v1/me/invites": [201, { code: "ABCD2345", relation: "parent", expiresAt: new Date(new Date(2026, 9, 14, 10, 0).getTime() + 7 * 864e5).toISOString() }],
    "DELETE /v1/links/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222": [204, null]
  };
  const D = boot(BASE, { routes });
  await tick(60);
  D.T.cloud.user = { uid: "u1", email: "elev@x.ro", name: "Elev", providers: ["password"] };
  D.T.cloud.api = { idToken: async () => "TOKEN123", onUser() {}, watch() { return () => {}; } };
  D.T.state.settings.remind.on = true; D.T.state.settings.remind.time = "20:00";
  await D.T.syncReminderCache(); await tick(50);
  const post = D.calls.find(c => c.key === "POST /v1/me");
  assert(post && post.body.role === "student" && post.headers.Authorization === "Bearer TOKEN123", "first use registers the account as a student, with the Firebase token");
  const s = D.calls.find(c => c.key === "PUT /v1/notifications/settings");
  assert(s && s.body.enabled === true && s.body.time === "20:00" && s.body.timezone, "reminder setting sent to the server");
  const dg = D.calls.find(c => c.key === "PUT /v1/notifications/digests");
  assert(dg && dg.body.from === "2026-10-14" && /test la Fizică/i.test(dg.body.days["2026-10-14"]?.body || ""), "the next days' reminder texts are uploaded (tomorrow's test)");
  const n = D.calls.length;
  await D.T.syncReminderCache(); await tick(30);
  assert(D.calls.length === n, "nothing re-sent when nothing changed");

  // 4) părinți și profesori: panoul contului
  D.T.cloud.status = "synced";
  D.T.openAccountPanel(); await tick(60);
  assert(/Mama/.test(D.$("account-links").textContent) && /părinte/.test(D.$("account-links").textContent), "account panel lists who can see your data");
  D.click(D.q('[data-action="link-invite"][data-relation="parent"]')); await tick(40);
  assert(/ABCD-2345/.test(D.$("link-code").textContent) && /7 zile/.test(D.$("link-code").textContent), "a parent code is created and shown");
  D.click(D.q('[data-action="link-remove"]')); await tick(40);
  assert(D.calls.some(c => c.key.startsWith("DELETE /v1/links/")), "removing a link calls the server");

  // 5) fără cont: nu trimitem nimic care cere jeton
  const E = boot(BASE, { routes });
  await tick(60);
  E.T.state.settings.remind.on = true;
  await E.T.syncReminderCache(); await tick(30);
  assert(!E.calls.some(c => c.key.startsWith("PUT /v1/notifications")), "signed out: reminders stay local");
  console.log(process.exitCode ? "" : "ALL PASSED");
  process.exit();
})().catch(e => { console.log("CRASH", e.stack); process.exit(1); });
