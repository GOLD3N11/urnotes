// Conturi + sincronizare, cu un Firebase fals (server în memorie, partajat între „dispozitive” = instanțe JSDOM)
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2];
const assert = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = { docs: {}, watchers: new Set(), accounts: { "ana@ex.ro": { pass: "parola1", uid: "u-ana", name: "Ana Pop" }, "cora@ex.ro": { pass: "parola1", uid: "u-cora", name: "" } }, fail: new Set() };
const userOf = (uid, google) => ({ uid, email: uid === "u-ana" ? "ana@ex.ro" : uid + "@ex.ro", name: uid === "u-ana" ? "Ana Pop" : "", photo: "", providers: [google ? "google.com" : "password"] });

function fakeCloud(dev) {
  let user = null, cb = () => {};
  const set = u => { user = u; setTimeout(() => cb(u), 0); };
  const err = code => Object.assign(new Error(code), { code });
  return {
    onUser(f) { cb = f; setTimeout(() => f(user), 0); },
    async signInGoogle() { set(userOf(dev.googleUid || "u-ana", true)); },
    async signInEmail(email, pass) {
      const a = server.accounts[email];
      if (!a || a.pass !== pass) throw err("auth/invalid-credential");
      set(userOf(a.uid));
    },
    async signUpEmail(email, pass, name) {
      if (server.accounts[email]) throw err("auth/email-already-in-use");
      server.accounts[email] = { pass, uid: "u-" + email.split("@")[0], name };
      set(userOf("u-" + email.split("@")[0]));
    },
    async resetPassword() {},
    async signOut() { set(null); },
    async load() { if (server.loadFail) throw err("unavailable"); return server.docs[user.uid] ? { ...server.docs[user.uid] } : null; },
    async save(json, device, updatedAt) {
      if (server.fail.has(dev.name)) throw err("unavailable");
      const uid = user.uid;
      server.docs[uid] = { json, device, updatedAt };
      dev.saves++;
      const snap = { ...server.docs[uid] }; for (const w of server.watchers) if (w.uid === uid) setTimeout(() => w.cb(snap), 0);
    },
    watch(f) {
      const w = { uid: user.uid, cb: f };
      server.watchers.add(w);
      if (server.docs[user.uid]) { const snap = { ...server.docs[user.uid] }; setTimeout(() => f(snap), 0); }
      return () => server.watchers.delete(w);
    },
    async deleteAccount() { delete server.docs[user.uid]; set(null); }
  };
}

function boot(name, { ls = {}, ss = {}, configured = true, googleUid } = {}) {
  const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM ERR", name, e.message)); vc.on("error", (...e) => console.log("CONSOLE ERR", name, ...e.map(x => x && x.stack || x)));
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script[^>]*src=[^>]+><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = q => ({ matches: false, addEventListener(){}, media: q });
  w.CSS = { escape: s => s.replace(/"/g, '\\"') };
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const dev = { name, w, saves: 0, exports: 0, googleUid };
  w.URL.createObjectURL = () => { dev.exports++; return "blob:x"; }; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  for (const [k, v] of Object.entries(ss)) w.sessionStorage.setItem(k, v);
  for (const [k, v] of Object.entries(ls)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  if (configured) { w.URNOTES_FIREBASE = { apiKey: "x" }; w.UrNotesCloud = fakeCloud(dev); }
  w.eval(require("./app_src")(dir) + "\n;window.__t={state,ui,refresh,cloud,saveState};");
  const T = w.__t, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s);
  Object.assign(dev, {
    T, $, q,
    click: el => { if (!el) throw new Error(name + ": no element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); },
    key: (k, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })),
    toast: () => [...w.document.querySelectorAll(".toast .toast-text")].map(t => t.textContent).at(-1) || "",
    type: (id, v) => { $(id).value = v; },
    submit: () => q("[data-auth-form]").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })),
    addGrade: (mat, val) => { T.state.subjects[mat].grades.push({ val, type: "Test", date: "2026-10-08" }); T.refresh(); }
  });
  return dev;
}

const LOCAL = { "pro_catalog_db_v4": { "Matematica": { ore: 4, target: 10, grades: [{ val: 7, type: "Test", date: "2026-09-20" }] }, "Fizica": { ore: 2, target: 9, grades: [] } } };

(async () => {
  // 0. fără configurare: nimic nou pe ecran
  const plain = boot("plain", { ls: LOCAL, configured: false });
  await sleep(30);
  assert(!plain.w.document.body.classList.contains("has-cloud") && plain.$("auth").hidden, "no Firebase config: no account UI, no auth screen");

  // 1. dispozitivul A are deja note → ecranul de autentificare, nu configurarea
  const A = boot("A", { ls: LOCAL });
  await sleep(30);
  assert(!A.$("auth").hidden && A.$("setup").hidden, "A: auth screen shown at start (setup wizard waits)");
  assert(A.w.document.body.classList.contains("has-cloud") && /Intră în cont/.test(A.$("account-chip").textContent), "A: account chip says 'Intră în cont'");
  A.type("auth-email", "ana@"); A.submit();
  assert(/nu e validă/.test(A.q(".auth-msg").textContent), "invalid email caught before calling Firebase");
  A.type("auth-email", "ana@ex.ro"); A.type("auth-pass", "gresit1"); A.submit();
  await sleep(20);
  assert(/Email sau parolă greșite/.test(A.q(".auth-msg").textContent) && A.q(".auth-msg").getAttribute("role") === "alert", "wrong password → Romanian error, announced");
  assert(A.$("auth-email").value === "ana@ex.ro", "email kept after error");
  A.type("auth-pass", "parola1"); A.submit();
  await sleep(30);
  assert(A.$("auth").hidden, "signed in → auth screen closes");
  assert(!A.$("action-modal").hidden && /Ai deja date/.test(A.$("action-modal-title").textContent), "first login with local data asks what to do");
  assert(A.$("action-modal-cancel").hidden, "question has no empty cancel button");
  A.key("Escape"); A.click(A.$("action-modal"));
  assert(!A.$("action-modal").hidden, "question can't be dismissed by Escape / backdrop");
  A.click(A.q('[data-pick="upload"]'));
  await sleep(30);
  assert(A.$("action-modal").hidden && server.docs["u-ana"] && /Matematica/.test(server.docs["u-ana"].json), "upload → local notes are in the account");
  assert(A.T.state.settings.profile.name === "Ana Pop" && /, Ana!/.test(A.$("h-dashboard").textContent), "Google name becomes the student's name (greeting)");
  await sleep(1700);
  assert(A.T.cloud.status === "synced" && /Ana Pop/.test(A.$("account-chip").textContent) && /Sincronizat/.test(A.$("account-chip").textContent), "chip shows name + Sincronizat");
  assert(!A.$("account-settings").innerHTML.includes("Intră sau") && A.q('#account-settings [data-action="account-signout"]'), "settings card shows signed-in actions");

  // 2. o modificare urcă după o pauză scurtă
  A.addGrade("Matematica", 9);
  assert(A.T.cloud.status === "pending", "change → status pending");
  await sleep(1700);
  assert(/"val":9/.test(server.docs["u-ana"].json) && A.T.cloud.status === "synced", "debounced upload sends the change");

  // 3. dispozitivul B (gol) intră cu Google → primește notele, fără întrebări și fără configurare
  const B = boot("B");
  await sleep(300);
  assert(!B.$("auth").hidden, "B: auth screen");
  B.click(B.q('[data-action="auth-google"]'));
  await sleep(40);
  assert(B.$("action-modal").hidden && B.$("setup").hidden, "B: no question, no wizard");
  assert(B.T.state.subjects.Matematica?.grades.length === 2, "B: got the notes from the account");

  // 4. A schimbă → B vede singur
  A.addGrade("Fizica", 10);
  await sleep(1700);
  assert(B.T.state.subjects.Fizica.grades.length === 1 && /alt dispozitiv/.test(B.toast()), "B: remote change applied live with a toast");
  assert(A.saves >= 2 && B.saves === 0, "applying remote data doesn't bounce an upload back");

  // 5. conflict: B offline face o modificare, A face alta
  server.fail.add("B");
  B.addGrade("Fizica", 4);
  await sleep(1700);
  assert(B.T.cloud.status === "error" || B.T.cloud.status === "offline", "B: failed upload → error/offline status");
  assert(JSON.parse(B.w.localStorage.getItem("pro_sync_meta_v4")).dirty === true, "B: dirty flag persisted");
  A.addGrade("Matematica", 6);
  await sleep(1700);
  assert(!B.$("action-modal").hidden && /Datele diferă/.test(B.$("action-modal-title").textContent), "B: conflict question");
  B.click(B.q('[data-pick="remote"]'));
  await sleep(20);
  assert(B.T.state.subjects.Matematica.grades.length === 3 && B.T.state.subjects.Fizica.grades.length === 1, "B: chose account version");
  server.fail.delete("B");

  // 6. ieșire cu ștergere pe B
  B.click(B.q('#account-settings [data-action="account-signout"]'));
  B.$("signout-wipe").checked = true;
  B.click(B.$("action-modal-confirm"));
  await sleep(40);
  assert(JSON.stringify(JSON.parse(B.w.localStorage.getItem("pro_catalog_db_v4") || "{}")) === "{}" && /Datele.*șterse/.test(B.toast()), "B: sign out + wipe clears this device");
  assert(B.w.document.body.classList.contains("is-guest") && !B.$("guest-bar").hidden && /exemplu/.test(B.$("guest-bar").textContent), "B: after the wipe, a guest sees the sample notebook");
  assert(server.docs["u-ana"] && /Matematica/.test(server.docs["u-ana"].json), "account copy untouched by wipe");
  assert(!B.w.localStorage.getItem("pro_auth_choice_v4") && /Intră în cont/.test(B.$("account-chip").textContent), "B: back to signed-out state");

  // 7. fără cont
  const C = boot("C");
  await sleep(30);
  assert(/Doar mă uit/.test(C.q('[data-action="auth-local"]').textContent), "C: auth screen offers 'Doar mă uit, ca vizitator'");
  C.click(C.q('[data-action="auth-local"]'));
  assert(C.$("auth").hidden && C.$("setup").hidden, "C: browsing as guest → no setup wizard");
  assert(C.w.document.body.classList.contains("is-guest") && !C.$("guest-bar").hidden, "C: guest bar shown");
  assert(Object.keys(C.T.state.subjects).length >= 5 && /exemplu/.test(C.$("guest-bar").textContent), "C: guest with no data sees the sample notebook");
  assert(!/Matematică/.test(C.w.localStorage.getItem("pro_catalog_db_v4") || ""), "C: sample notebook is not saved");
  // nimic nu se poate schimba: fiecare încercare deschide autentificarea cu explicația
  C.click(C.q('.mobile-add') || C.q('#quick-add-btn'));
  assert(!C.$("auth").hidden && C.$("quick-add").hidden && /vizitator poți doar să te uiți/.test(C.$("auth-body").textContent), "C: '+' opens sign-in, not the add menu");
  C.click(C.q('[data-action="auth-local"]'));
  const gradesBefore = JSON.stringify(C.T.state.subjects);
  const ab = C.w.document.createElement("button"); ab.dataset.action = "add-grade"; C.w.document.body.append(ab); C.click(ab);
  assert(C.$("action-modal").hidden && !C.$("auth").hidden, "C: add grade → sign-in instead of the form");
  C.click(C.q('[data-action="auth-local"]'));
  C.T.state.subjects["Matematică"].grades.push({ val: 10, type: "Test" }); C.T.refresh();
  assert(JSON.stringify(C.T.state.subjects) === gradesBefore && !C.$("auth").hidden, "C: a change that slips through is undone (safety net)");
  C.click(C.q('[data-action="auth-local"]'));
  const nav = C.q('[data-action="nav"][data-tab="tab-catalog"]'); C.click(nav);
  assert(C.T.ui.activeTab === "tab-catalog" && C.$("auth").hidden, "C: browsing still works (navigation)");
  C.click(C.q('[data-action="nav"][data-tab="tab-setari"]') || C.q('[data-action="nav"][data-tab="tab-setari"]'));
  assert(C.$("set-name").disabled && C.$("set-theme").disabled, "C: settings visible but locked");
  // intră în cont: caietul de exemplu dispare, nu ajunge în cont
  C.w.UrNotesCloud.signInEmail("cora@ex.ro", "parola1");
  await sleep(60);
  assert(!C.w.document.body.classList.contains("is-guest") && C.$("guest-bar").hidden, "C: signed in → guest mode ends");
  assert(!/Matematică/.test(JSON.stringify(C.T.state.subjects)) && !(server.docs["u-cora"] && /Matematică/.test(server.docs["u-cora"].json)), "C: sample notebook never reaches the account");
  assert(!C.$("set-name").disabled, "C: settings unlocked after signing in");
  const C2 = boot("C2", { ss: { "pro_guest_browse_v4": "1" } });
  await sleep(30);
  assert(C2.$("auth").hidden && C2.w.document.body.classList.contains("is-guest"), "C2: chose 'doar mă uit' this session → no auth screen, still a guest");

  // 8. cont nou, alegerea „încep gol” → backup descărcat întâi
  const D = boot("D", { ls: LOCAL, googleUid: "u-dan" });
  await sleep(30);
  D.click(D.q('[data-action="auth-mode"][data-mode="signup"]'));
  assert(D.$("auth-name"), "signup tab shows the name field");
  D.type("auth-email", "ana@ex.ro"); D.type("auth-pass", "abcdef"); D.submit();
  await sleep(20);
  assert(/Există deja un cont/.test(D.q(".auth-msg").textContent), "signup with existing email → clear message");
  D.click(D.q('[data-action="auth-google"]'));
  await sleep(30);
  D.click(D.q('[data-pick="fresh"]'));
  await sleep(30);
  assert(D.exports === 1 && Object.keys(D.T.state.subjects).length === 0, "fresh: backup exported, then device emptied");
  assert(server.docs["u-dan"] && !/Matematica/.test(server.docs["u-dan"].json), "fresh: empty data in the new account");

  // 9. reîncărcare pe A: aceeași sesiune, fără întrebări
  const A2 = boot("A2", { ls: Object.fromEntries(Object.entries(A.w.localStorage).filter(([k]) => k.startsWith("pro_"))) });
  A2.w.UrNotesCloud.signInEmail("ana@ex.ro", "parola1");
  await sleep(40);
  assert(A2.$("action-modal").hidden && A2.T.state.subjects.Matematica.grades.length === 3 && A2.T.cloud.status === "synced", "reload of same account → silent sync");

  // 10. ștergerea contului
  A.click(A.q('#account-settings [data-action="account-delete"]'));
  A.click(A.$("action-modal-confirm"));
  await sleep(40);
  assert(!server.docs["u-ana"] && Object.keys(A.T.state.subjects).length === 2 && /Contul a fost șters/.test(A.toast()), "delete account: cloud copy gone, local notes stay");

  // 11. contul nu poate fi citit la pornire → nu urcăm nimic până nu comparăm
  server.docs["u-eva"] = { json: server.docs["u-dan"].json, device: "x", updatedAt: Date.now() };
  server.loadFail = true;
  const E = boot("E", { ls: { ...LOCAL, "pro_auth_choice_v4": "account" }, googleUid: "u-eva" });
  await sleep(30);
  E.click(E.q('[data-action="auth-google"]'));
  await sleep(40);
  assert(E.T.cloud.status === "error" && E.saves === 0, "E: account unreadable → error status, nothing uploaded");
  E.addGrade("Fizica", 5);
  await sleep(1700);
  assert(E.saves === 0, "E: local edits don't overwrite an account we couldn't read");
  server.loadFail = false;
  E.w.dispatchEvent(new E.w.Event("online"));
  await sleep(40);
  assert(!E.$("action-modal").hidden && /Datele diferă|Ai deja date/.test(E.$("action-modal-title").textContent), "E: back online → compares first and asks");
  // 12. cont nou pe un browser unde configurarea a fost închisă cândva → apare totuși
  const F = boot("F", { ls: { "pro_setup_done_v4": "1" }, googleUid: "u-nou" });
  await sleep(30);
  F.click(F.q('[data-action="auth-google"]'));
  await sleep(60);
  assert(!F.$("setup").hidden && F.$("setup-me-name"), "new account + empty notebook → setup wizard opens even after an old skip");
  console.log(process.exitCode ? "SOME FAILED" : "ALL PASSED");
  process.exit();
})();
