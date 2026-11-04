/* urNotes · Școala: contul primit de la școală (catalogul, /v2 pe server).
   Intrarea e cu nume de utilizator și parolă (fără email); conturile le face cineva de pe un nivel mai sus.
   Pagina stă în aplicație ca oricare alta („Școala” în meniu). Jetonul de acces e în memorie, cel de
   reîmprospătare pe dispozitiv. Totul e într-o funcție închisă, ca numele să nu se amestece cu restul aplicației.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const schoolAccount = (() => {
    const REFRESH_KEY = "urn_cat_refresh";
    const ROLE_LABEL = { ceo: "CEO", schools_admin: "Administrator de școli", school_admin: "Administrator de școală", teacher: "Profesor", student: "Elev", parent: "Părinte" };
    const ROLE_WORDS = { profesor: "teacher", profesoara: "teacher", "profesoară": "teacher", teacher: "teacher", elev: "student", eleva: "student", "elevă": "student", student: "student", parinte: "parent", "părinte": "parent", parent: "parent", mama: "parent", "mamă": "parent", tata: "parent", "tată": "parent" };
    const CREATES = {
        ceo: ["schools_admin", "school_admin", "teacher", "student", "parent"],
        schools_admin: ["school_admin", "teacher", "student", "parent"],
        school_admin: ["teacher", "student", "parent"]
    };
    const ACTION_LABEL = {
        "setup.ceo": "a creat contul de CEO", "school.create": "a adăugat o școală", "account.create": "a creat un cont",
        "account.reset_password": "a făcut o parolă nouă", "account.disable": "a dezactivat un cont", "account.enable": "a activat un cont",
        "parent.link": "a legat un părinte de un elev", "parent.unlink": "a dezlegat un părinte", "totp.enabled": "a pornit codul din telefon",
        "class.create": "a făcut o clasă", "class.update": "a schimbat o clasă", "class.add_students": "a pus elevi într-o clasă", "class.remove_student": "a scos un elev din clasă",
        "assignment.create": "a dat o materie unui profesor", "assignment.change_teacher": "a schimbat profesorul unei materii", "assignment.remove": "a scos o materie",
        "grade.add": "a pus o notă", "grade.delete": "a șters o notă"
    };

    const S = { access: null, me: null, tab: null, schools: [], accounts: [], filter: { school: "", role: "" }, view: "boot", step: null, started: false };
    const el = id => document.getElementById(id);
    // unde se desenează: pagina Școala sau, la intrare, fereastra de autentificare (mount)
    const inModal = () => Boolean(S.target && S.target.isConnected && !S.target.closest("[hidden]"));
    const body = () => (inModal() ? S.target : el("school-body"));
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const apiBase = () => String(window.URNOTES_API || "").replace(/\/+$/, "");
    const store = {
        get() { try { return localStorage.getItem(REFRESH_KEY); } catch (_) { return null; } },
        set(v) { try { v ? localStorage.setItem(REFRESH_KEY, v) : localStorage.removeItem(REFRESH_KEY); } catch (_) { /* fără stocare */ } }
    };
    const toast = msg => (typeof showToast === "function" ? showToast(msg) : console.log(msg));

    /* ==================== serverul ==================== */
    class SchoolError extends Error { constructor(status, data) { super(data?.message || `Eroare ${status}`); this.status = status; this.code = data?.error; } }

    async function raw(method, path, payload, token) {
        let res;
        try {
            res = await fetch(apiBase() + path, {
                method,
                headers: { ...(payload ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
                body: payload ? JSON.stringify(payload) : undefined
            });
        } catch (_) { throw new SchoolError(0, { message: "Nu am legătură cu serverul. Verifică internetul." }); }
        const data = res.status === 204 ? null : await res.json().catch(() => null);
        if (!res.ok) throw new SchoolError(res.status, data);
        return data;
    }

    /* Sesiunea: jetonul de reîmprospătare se schimbă la fiecare folosire. Două file (sau două cereri) care îl folosesc
       deodată l-ar strica una alteia, așa că: o singură reîmprospătare odată, împărțită între file (Web Locks), și
       înainte de fiecare citim jetonul din nou (poate l-a schimbat deja altă filă). Lipsa internetului sau o eroare a
       serverului nu scot pe nimeni din cont: doar „sesiune expirată” (401) o face. */
    let inflight = null;
    const withLock = fn => (navigator.locks?.request ? navigator.locks.request("urn_cat_refresh", fn) : fn());
    async function refreshOnce() {
        return withLock(async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
                const rt = store.get();
                if (!rt) return "out";
                try {
                    const r = await raw("POST", "/v2/auth/refresh", { refreshToken: rt });
                    store.set(r.refreshToken);
                    S.access = r.accessToken;
                    return "ok";
                } catch (e) {
                    if (e.status !== 401) return "offline";
                    if (store.get() !== rt) continue; // altă filă a pus între timp un jeton nou: încercăm cu el
                    store.set(null);
                    return "out";
                }
            }
            return "out";
        });
    }
    /** "ok" | "out" (sesiunea chiar s-a încheiat) | "offline" (n-am putut verifica acum) */
    function refreshSession() {
        if (!inflight) inflight = refreshOnce().finally(() => { inflight = null; });
        return inflight;
    }
    // când altă filă iese din cont, ieșim și aici
    window.addEventListener("storage", e => {
        if (e.key === REFRESH_KEY && !e.newValue && S.me) { Object.assign(S, { access: null, me: null, tab: null, view: "login" }); draw(); announce(); }
    });

    async function api(method, path, payload) {
        try { return await raw(method, path, payload, S.access); }
        catch (e) {
            if (e.status !== 401) throw e;
            const r = await refreshSession();
            if (r === "ok") return raw(method, path, payload, S.access);
            if (r === "out") { Object.assign(S, { access: null, me: null, view: "login" }); S.loginMsg = "Sesiunea s-a încheiat. Intră din nou."; draw(); announce(); }
            throw e;
        }
    }

    /** O acțiune dintr-un formular: butonul așteaptă, eroarea apare lângă formular. */
    async function run(btn, errBox, fn) {
        if (btn) btn.disabled = true;
        if (errBox) errBox.innerHTML = "";
        try { await fn(); }
        catch (e) { if (errBox && errBox.isConnected) errBox.innerHTML = `<p class="sch-error" role="alert">${esc(e.message)}</p>`; else toast(`⚠️ ${e.message}`); }
        finally { if (btn && btn.isConnected) btn.disabled = false; }
    }

    /* ==================== desenarea ==================== */
    function draw() {
        if (S.target && !inModal()) { S.target.innerHTML = ""; S.target = null; S.onDone = null; } // fereastra s-a închis: formularul rămâne doar pe pagină
        const root = body();
        if (!root) return;
        const views = { boot: drawBoot, offline: drawOffline, login: drawLogin, first: drawFirst, totpSetup: drawTotpSetup, totp: drawTotp, app: drawApp };
        (views[S.view] || drawBoot)(root);
        updateChip();
    }

    function drawBoot(root) { root.innerHTML = `<p class="muted-small">Se încarcă…</p>`; }

    const card = (inner, cls = "") => inModal() ? `<div class="sch-auth sch-in-modal ${cls}">${inner}</div>` : `<div class="glass-card sch-auth ${cls}">${inner}</div>`;

    function drawLogin(root) {
        const msg = S.loginMsg; S.loginMsg = "";
        root.innerHTML = card(`
            <form id="sch-login" novalidate>
                <h3>${icon("graduation")} Intră cu contul de la școală</h3>
                <p class="muted-small">Numele de utilizator și parola le primești de la administratorul școlii. Nu ai nevoie de email.</p>
                <div class="form-group"><label for="sch-user">Nume de utilizator</label>
                    <input id="sch-user" class="glass-input" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="prenume.nume"></div>
                <div class="form-group"><label for="sch-pass">Parolă</label>
                    <input id="sch-pass" class="glass-input" type="password" autocomplete="current-password" required></div>
                ${msg ? `<p class="sch-error">${esc(msg)}</p>` : ""}
                <div id="sch-login-err"></div>
                <button type="submit" class="btn btn-primary sch-full">Intră</button>
                <details class="sch-help"><summary>Am uitat parola</summary>
                    <p>Parola o resetează cine ți-a făcut contul: pentru elevi, părinți și profesori, administratorul școlii; pentru administratori, cel de deasupra lor.</p>
                </details>
            </form>`);
        el("sch-login").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-login-err"), async () => handleStep(await raw("POST", "/v2/auth/login", { username: el("sch-user").value, password: el("sch-pass").value })));
        });
    }

    async function handleStep(step) {
        S.step = step;
        if (step.next === "done") {
            S.access = step.accessToken;
            store.set(step.refreshToken);
            return enterApp();
        }
        S.view = { change_password: "first", totp_setup: "totpSetup", totp: "totp" }[step.next] || "login";
        draw();
        body()?.querySelector("input")?.focus();
    }

    function drawFirst(root) {
        root.innerHTML = card(`
            <form id="sch-first" novalidate>
                <h3>Alege-ți parola</h3>
                <p class="muted-small">Parola primită era doar pentru prima intrare. Alege una pe care o știi doar tu: cel puțin 8 caractere.</p>
                <div class="form-group"><label for="sch-new">Parola nouă</label><input id="sch-new" class="glass-input" type="password" autocomplete="new-password" required minlength="8"></div>
                <div class="form-group"><label for="sch-again">Scrie-o încă o dată</label><input id="sch-again" class="glass-input" type="password" autocomplete="new-password" required></div>
                <div id="sch-first-err"></div>
                <button type="submit" class="btn btn-primary sch-full">Salvează și continuă</button>
            </form>`);
        el("sch-first").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-first-err"), async () => {
                if (el("sch-new").value !== el("sch-again").value) throw new Error("Cele două parole nu sunt la fel.");
                handleStep(await raw("POST", "/v2/auth/first-password", { ticket: S.step.ticket, newPassword: el("sch-new").value }));
            });
        });
    }

    function qrSvg(text) {
        if (typeof window.qrcode !== "function") return "";
        const q = window.qrcode(0, "M");
        q.addData(text);
        q.make();
        return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }

    function drawTotpSetup(root) {
        const step = S.step;
        root.innerHTML = card(`
            <form id="sch-totp-setup" novalidate>
                <h3>${icon("shield")} Al doilea pas de siguranță</h3>
                <p class="muted-small">Contul tău are multă putere, așa că la fiecare intrare îți cerem și un cod din telefon.</p>
                <ol class="sch-steps">
                    <li>Instalează o aplicație de autentificare (Google Authenticator, Microsoft Authenticator sau alta).</li>
                    <li>Scanează codul de mai jos din aplicație.</li>
                    <li>Scrie aici cele 6 cifre pe care le arată.</li>
                </ol>
                <div class="sch-qr" id="sch-qr">${qrSvg(step.otpauthUrl) || `<span class="muted-small">Codul QR nu s-a încărcat. Scrie cheia de mai jos în aplicație.</span>`}</div>
                <p class="muted-small">Nu poți scana? Adaugă manual cheia:</p>
                <p class="sch-secret">${esc(step.secret.replace(/(.{4})/g, "$1 ").trim())}</p>
                <div class="form-group"><label for="sch-code">Codul din aplicație</label>
                    <input id="sch-code" class="glass-input sch-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
                <div id="sch-totp-err"></div>
                <button type="submit" class="btn btn-primary sch-full">Verifică și intră</button>
            </form>`);
        el("sch-totp-setup").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-totp-err"), async () => handleStep(await raw("POST", "/v2/auth/totp-setup", { ticket: step.ticket, code: el("sch-code").value })));
        });
    }

    function drawTotp(root) {
        root.innerHTML = card(`
            <form id="sch-totp" novalidate>
                <h3>${icon("shield")} Codul din telefon</h3>
                <p class="muted-small">Deschide aplicația de autentificare și scrie cele 6 cifre pentru urNotes.</p>
                <div class="form-group"><label for="sch-code2">Cod</label>
                    <input id="sch-code2" class="glass-input sch-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
                <div id="sch-totp2-err"></div>
                <button type="submit" class="btn btn-primary sch-full">Intră</button>
            </form>`);
        el("sch-totp").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-totp2-err"), async () => handleStep(await raw("POST", "/v2/auth/totp", { ticket: S.step.ticket, code: el("sch-code2").value })));
        });
    }

    /* ==================== după intrare ==================== */
    const role = () => S.me?.account.role;
    const isAdmin = () => ["ceo", "schools_admin", "school_admin"].includes(role());
    function tabsFor(r) {
        if (r === "ceo" || r === "schools_admin") return [["accounts", "Conturi", "user"], ["classes", "Clase", "layers"], ["schools", "Școli", "graduation"], ["audit", "Jurnal", "note"], ["me", "Contul meu", "settings"]];
        if (r === "school_admin") return [["accounts", "Conturi", "user"], ["classes", "Clase", "layers"], ["audit", "Jurnal", "note"], ["me", "Contul meu", "settings"]];
        if (r === "teacher") return [["teach", "Catalog", "notebook"], ["me", "Contul meu", "settings"]];
        return [["home", "Acasă", "home"], ["me", "Contul meu", "settings"]];
    }

    async function enterApp() {
        try { S.me = await api("GET", "/v2/me"); }
        catch (e) { if (e.status !== 401) { S.view = "offline"; draw(); } return; }
        if (S.target) { // intrat din fereastra de la început: pagina Școala preia mai departe
            const done = S.onDone;
            S.target = null; S.onDone = null;
            done?.();
        }
        const tabs = tabsFor(role());
        if (!S.tab || !tabs.some(t => t[0] === S.tab)) S.tab = tabs[0][0];
        if (isAdmin()) { try { S.schools = (await api("GET", "/v2/schools")).schools; } catch (_) { S.schools = []; } }
        S.view = "app";
        draw();
        announce();
    }

    /** Cine e în cont s-a schimbat: restul aplicației (catalogmode.js) se pune după el. */
    function announce() { window.dispatchEvent(new CustomEvent("urn-school-account", { detail: { me: S.me } })); }

    function drawApp(root) {
        const a = S.me.account;
        root.innerHTML = `
            <div class="sch-who glass-card">
                <span class="sch-avatar" aria-hidden="true">${esc(a.displayName.slice(0, 1).toUpperCase())}</span>
                <span><b>${esc(a.displayName)}</b><small>${esc(ROLE_LABEL[a.role])} · <span class="sch-mono">${esc(a.username)}</span>${S.me.school ? ` · ${esc(S.me.school.name)}` : ""}</small></span>
            </div>
            <div class="sch-tabs" role="group" aria-label="Secțiuni">
                ${tabsFor(a.role).map(([id, label, ico]) => `<button type="button" class="chip${S.tab === id ? " is-on" : ""}" data-sch-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ""}>${icon(ico)} ${label}</button>`).join("")}
            </div>
            <div id="sch-page"></div>`;
        root.querySelectorAll("[data-sch-tab]").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.schTab; draw(); }));
        ({ accounts: pageAccounts, classes: pageClasses, teach: pageTeach, schools: pageSchools, audit: pageAudit, me: pageMe, home: pageHome })[S.tab]();
    }

    function pageHome() {
        const a = S.me.account;
        const kids = S.me.children || [];
        el("sch-page").innerHTML = `
            <div class="glass-card">
                <h3>Bună, ${esc(a.displayName.split(" ")[0])}!</h3>
                <p class="muted-small">${esc(ROLE_LABEL[a.role])}${S.me.school ? ` la ${esc(S.me.school.name)}` : ""}.</p>
                ${a.role === "parent" ? `<h4>Copiii tăi</h4>${kids.length ? `<ul class="links-list">${kids.map(k => `<li><span><b>${esc(k.displayName)}</b></span></li>`).join("")}</ul>` : `<p class="muted-small">Administratorul școlii nu te-a legat încă de copilul tău.</p>`}` : ""}
                <p class="sch-note">${a.role === "parent" ? "Notele copilului le vezi la <b>Note</b> și la <b>Progres</b>. Le pun doar profesorii." : "Notele tale le vezi la <b>Note</b> și la <b>Progres</b>. Le pun doar profesorii."}</p>
                <button type="button" class="btn btn-primary" id="sch-go-notes">${icon("notebook")} Vezi notele</button>
            </div>`;
        el("sch-go-notes").addEventListener("click", () => typeof switchTab === "function" && switchTab("tab-catalog"));
    }

    /* ---------- clase (administratorul școlii) ---------- */
    const KINDS = ["Oral", "Test", "Lucrare", "Teză", "Temă", "Proiect", "Altele"];
    const C = { list: [], open: null, detail: null, school: "" };
    async function pageClasses() {
        const page = el("sch-page");
        const multi = role() !== "school_admin";
        if (multi && !C.school) C.school = defaultSchool();
        if (multi && !C.school) { page.innerHTML = `<div class="glass-card"><p class="muted-small">Fă întâi o școală.</p></div>`; return; }
        page.innerHTML = `<p class="muted-small">Se încarcă…</p>`;
        let teachers = [], students = [];
        try {
            C.list = (await api("GET", `/v2/classes${multi ? `?school=${encodeURIComponent(C.school)}` : ""}`)).classes;
            if (C.open && !C.list.some(c => c.id === C.open)) C.open = null;
            if (C.open) {
                const sq = multi ? `&school=${encodeURIComponent(C.school)}` : "";
                const [d, t, st] = await Promise.all([
                    api("GET", `/v2/classes/${C.open}`), api("GET", `/v2/accounts?role=teacher${sq}`), api("GET", `/v2/accounts?role=student${sq}`)]);
                C.detail = d.class;
                teachers = t.accounts.filter(x => !x.disabled);
                students = st.accounts.filter(x => !x.disabled);
            }
        } catch (e) { page.innerHTML = `<p class="sch-error">${esc(e.message)}</p>`; return; }
        if (!page.isConnected) return;
        const schoolPick = multi ? `<label class="sr-only" for="sch-c-school">Școala</label><select id="sch-c-school" class="glass-select">${S.schools.map(s => `<option value="${esc(s.id)}" ${s.id === C.school ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : "";
        if (!C.open) {
            page.innerHTML = `
                <div class="glass-card">
                    <div class="sch-head"><h3>Clase <span class="muted-small">(${C.list.length})</span></h3><div class="sch-filters">${schoolPick}</div></div>
                    ${C.list.length ? `<div class="sch-table-wrap"><table class="sch-table"><thead><tr><th>Clasa</th><th>Diriginte</th><th>Elevi</th><th>Materii</th><th><span class="sr-only">Deschide</span></th></tr></thead><tbody>
                        ${C.list.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.headTeacher || "—")}</td><td>${c.students}</td><td>${c.subjects}</td>
                            <td><button type="button" class="btn btn-glass btn-sm" data-sch-class="${esc(c.id)}">Deschide</button></td></tr>`).join("")}</tbody></table></div>`
                        : `<p class="muted-small">Încă nu e nicio clasă.</p>`}
                </div>
                <form class="glass-card" id="sch-c-new" novalidate>
                    <h3>${icon("plus")} Clasă nouă</h3>
                    <div class="form-group"><label for="sch-c-name">Numele clasei</label><input id="sch-c-name" class="glass-input" required maxlength="40" placeholder="a IX-a B"></div>
                    <div id="sch-c-err"></div>
                    <button class="btn btn-primary" type="submit">Fă clasa</button>
                </form>`;
            el("sch-c-school")?.addEventListener("change", e => { C.school = e.target.value; pageClasses(); });
            page.querySelectorAll("[data-sch-class]").forEach(b => b.addEventListener("click", () => { C.open = b.dataset.schClass; pageClasses(); }));
            el("sch-c-new").addEventListener("submit", e => {
                e.preventDefault();
                run(e.submitter, el("sch-c-err"), async () => {
                    const c = (await api("POST", "/v2/classes", { name: el("sch-c-name").value, ...(multi ? { schoolId: C.school } : {}) })).class;
                    C.open = c.id;
                    toast(`✓ Clasa ${c.name} e gata. Pune elevii și profesorii.`);
                    pageClasses();
                });
            });
            return;
        }
        const d = C.detail;
        const inClass = new Set(d.students.map(x => x.id));
        const free = students.filter(x => !inClass.has(x.id));
        const opt = (list, selId) => list.map(x => `<option value="${esc(x.id)}" ${x.id === selId ? "selected" : ""}>${esc(x.displayName)} (${esc(x.username)})</option>`).join("");
        page.innerHTML = `
            <div class="glass-card">
                <div class="sch-head">
                    <h3><button type="button" class="btn btn-text btn-sm" id="sch-c-back">${icon("undo")} Clase</button> ${esc(d.name)}</h3>
                    <div class="sch-filters"><label for="sch-c-head" class="muted-small">Diriginte</label>
                        <select id="sch-c-head" class="glass-select"><option value="">— nimeni —</option>${opt(teachers, d.headTeacherId)}</select></div>
                </div>
            </div>
            <div class="sch-grid">
                <div class="glass-card">
                    <h3>Elevii <span class="muted-small">(${d.students.length})</span></h3>
                    ${d.students.length ? `<ul class="links-list">${d.students.map(x => `<li><span><b>${esc(x.displayName)}</b> <span class="sch-mono muted-small">${esc(x.username)}</span></span>
                        <button type="button" class="btn btn-text btn-sm text-danger" data-sch-unstudent="${esc(x.id)}">Scoate</button></li>`).join("")}</ul>` : `<p class="muted-small">Niciun elev încă.</p>`}
                    ${free.length ? `<form id="sch-c-add" novalidate>
                        <div class="form-group"><label for="sch-c-students">Adaugă elevi <span class="label-hint">(poți alege mai mulți)</span></label>
                            <select id="sch-c-students" class="glass-select" multiple size="${Math.min(8, Math.max(3, free.length))}">${opt(free)}</select></div>
                        <div id="sch-c-add-err"></div>
                        <button class="btn btn-primary btn-sm" type="submit">Adaugă în clasă</button>
                    </form>` : `<p class="muted-small">${students.length ? "Toți elevii școlii sunt în clasa asta." : "Fă întâi conturile elevilor (la Conturi)."}</p>`}
                </div>
                <div class="glass-card">
                    <h3>Materii și profesori <span class="muted-small">(${d.subjects.length})</span></h3>
                    ${d.subjects.length ? `<ul class="links-list">${d.subjects.map(x => `<li><span><b>${esc(x.subject)}</b> · ${esc(x.teacher)}</span>
                        <button type="button" class="btn btn-text btn-sm text-danger" data-sch-unsubject="${esc(x.id)}">Scoate</button></li>`).join("")}</ul>` : `<p class="muted-small">Nicio materie încă.</p>`}
                    ${teachers.length ? `<form id="sch-c-subj" novalidate>
                        <div class="form-row">
                            <div class="form-group"><label for="sch-c-subject">Materia</label><input id="sch-c-subject" class="glass-input" required maxlength="80" placeholder="Matematică" list="sch-c-subjects"></div>
                            <div class="form-group"><label for="sch-c-teacher">Profesorul</label><select id="sch-c-teacher" class="glass-select">${opt(teachers)}</select></div>
                        </div>
                        <datalist id="sch-c-subjects">${["Limba română", "Matematică", "Fizică", "Chimie", "Biologie", "Istorie", "Geografie", "Limba engleză", "Limba franceză", "Informatică", "Educație fizică", "Religie", "Desen", "Muzică", "Logică", "Psihologie", "Economie", "Filosofie"].map(x => `<option value="${x}">`).join("")}</datalist>
                        <p class="muted-small">O materie care există deja primește profesorul ales.</p>
                        <div id="sch-c-subj-err"></div>
                        <button class="btn btn-primary btn-sm" type="submit">Salvează</button>
                    </form>` : `<p class="muted-small">Fă întâi conturile profesorilor (la Conturi).</p>`}
                </div>
            </div>`;
        el("sch-c-back").addEventListener("click", () => { C.open = null; pageClasses(); });
        el("sch-c-head").addEventListener("change", e => run(null, null, async () => { await api("PATCH", `/v2/classes/${d.id}`, { headTeacherId: e.target.value || null }); toast("✓ Dirigintele a fost salvat."); }));
        el("sch-c-add")?.addEventListener("submit", e => {
            e.preventDefault();
            const ids = [...el("sch-c-students").selectedOptions].map(o => o.value);
            run(e.submitter, el("sch-c-add-err"), async () => {
                if (!ids.length) throw new Error("Alege cel puțin un elev.");
                await api("POST", `/v2/classes/${d.id}/students`, { studentIds: ids });
                pageClasses();
            });
        });
        el("sch-c-subj")?.addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-c-subj-err"), async () => {
                await api("POST", `/v2/classes/${d.id}/subjects`, { subject: el("sch-c-subject").value, teacherId: el("sch-c-teacher").value });
                pageClasses();
            });
        });
        page.querySelectorAll("[data-sch-unstudent]").forEach(b => b.addEventListener("click", () => run(b, null, async () => { await api("DELETE", `/v2/classes/${d.id}/students/${b.dataset.schUnstudent}`); pageClasses(); })));
        page.querySelectorAll("[data-sch-unsubject]").forEach(b => b.addEventListener("click", () => run(b, null, async () => { await api("DELETE", `/v2/assignments/${b.dataset.schUnsubject}`); pageClasses(); })));
    }

    /* ---------- catalogul profesorului ---------- */
    const T = { list: null, headOf: [], open: null, book: null };
    const avg = gs => (gs.length ? (gs.reduce((a, g) => a + g.value, 0) / gs.length) : null);
    const fmtDate = d => { const [y, m, dd] = d.split("-"); return `${dd}.${m}`; };
    const todayKeyRO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
    async function pageTeach() {
        const page = el("sch-page");
        page.innerHTML = `<p class="muted-small">Se încarcă…</p>`;
        try {
            const t = await api("GET", "/v2/teaching");
            T.list = t.assignments; T.headOf = t.headOf;
            if (!T.open && T.list.length === 1) T.open = T.list[0].id;
            if (T.open && !T.list.some(a => a.id === T.open)) T.open = null;
            T.book = T.open ? await api("GET", `/v2/assignments/${T.open}/gradebook`) : null;
        } catch (e) { page.innerHTML = `<p class="sch-error">${esc(e.message)}</p>`; return; }
        if (!page.isConnected) return;
        const picker = T.list.length ? `<div class="sch-tabs sch-subtabs" role="group" aria-label="Clasele și materiile mele">${T.list.map(a => `
            <button type="button" class="chip${a.id === T.open ? " is-on" : ""}" data-sch-assign="${esc(a.id)}">${esc(a.className)} · ${esc(a.subject)}</button>`).join("")}</div>` : "";
        if (!T.list.length) {
            page.innerHTML = `<div class="glass-card"><h3>Catalogul meu</h3><p class="muted-small">Administratorul școlii nu ți-a dat încă nicio materie la vreo clasă.</p></div>`;
            return;
        }
        if (!T.book) {
            page.innerHTML = `<div class="glass-card"><h3>Catalogul meu</h3><p class="muted-small">Alege clasa și materia.</p>${picker}</div>`;
            page.querySelectorAll("[data-sch-assign]").forEach(b => b.addEventListener("click", () => { T.open = b.dataset.schAssign; pageTeach(); }));
            return;
        }
        const B = T.book;
        page.innerHTML = `
            <div class="glass-card">
                <div class="sch-head"><h3>${esc(B.assignment.className)} · ${esc(B.assignment.subject)}</h3></div>
                ${picker}
                ${B.students.length ? `<div class="sch-table-wrap"><table class="sch-table sch-book"><thead><tr><th>Elev</th><th>Note</th><th>Media</th><th><span class="sr-only">Notă nouă</span></th></tr></thead><tbody>
                    ${B.students.map(st => { const m = avg(st.grades); return `<tr>
                        <td><b>${esc(st.displayName)}</b></td>
                        <td><span class="sch-grades">${st.grades.map(g => `<span class="sch-grade${g.value < 5 ? " is-low" : ""}" title="${esc(`${g.kind} · ${fmtDate(g.date)}${g.note ? ` · ${g.note}` : ""}`)}">${g.value}<small>${fmtDate(g.date)}</small>${B.assignment.canGrade ? `<button type="button" class="sch-grade-x" data-sch-del="${esc(g.id)}" aria-label="Șterge nota ${g.value} din ${fmtDate(g.date)}">×</button>` : ""}</span>`).join("") || `<span class="muted-small">—</span>`}</span></td>
                        <td>${m === null ? "—" : `<b>${m.toFixed(2)}</b>`}</td>
                        <td>${B.assignment.canGrade ? `<button type="button" class="btn btn-glass btn-sm" data-sch-grade="${esc(st.id)}">${icon("plus")} Notă</button>` : ""}</td></tr>`; }).join("")}
                    </tbody></table></div>` : `<p class="muted-small">Clasa nu are încă elevi.</p>`}
            </div>
            <dialog class="sch-dialog" id="sch-g-dialog">
                <form method="dialog" id="sch-g-form" novalidate>
                    <h3 id="sch-g-title">Notă nouă</h3>
                    <div class="form-row">
                        <div class="form-group"><label for="sch-g-value">Nota</label><select id="sch-g-value" class="glass-select">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(v => `<option>${v}</option>`).join("")}</select></div>
                        <div class="form-group"><label for="sch-g-kind">Tipul</label><select id="sch-g-kind" class="glass-select">${KINDS.map(k => `<option>${k}</option>`).join("")}</select></div>
                        <div class="form-group"><label for="sch-g-date">Data</label><input id="sch-g-date" class="glass-input" type="date"></div>
                    </div>
                    <div class="form-group"><label for="sch-g-note">Observație <span class="label-hint">(opțional)</span></label><input id="sch-g-note" class="glass-input" maxlength="200"></div>
                    <div id="sch-g-err"></div>
                    <div class="sch-actions"><button type="button" class="btn btn-glass" id="sch-g-cancel">Renunță</button><button type="submit" class="btn btn-primary" id="sch-g-save">Pune nota</button></div>
                </form>
            </dialog>`;
        page.querySelectorAll("[data-sch-assign]").forEach(b => b.addEventListener("click", () => { T.open = b.dataset.schAssign; pageTeach(); }));
        const dlg = el("sch-g-dialog");
        let who = "";
        page.querySelectorAll("[data-sch-grade]").forEach(b => b.addEventListener("click", () => {
            who = b.dataset.schGrade;
            const st = B.students.find(x => x.id === who);
            el("sch-g-title").textContent = `Notă pentru ${st.displayName}`;
            el("sch-g-date").value = todayKeyRO(); el("sch-g-date").max = todayKeyRO();
            el("sch-g-note").value = ""; el("sch-g-err").innerHTML = "";
            dlg.showModal?.() ?? dlg.setAttribute("open", "");
            el("sch-g-value").focus();
        }));
        el("sch-g-cancel").addEventListener("click", () => dlg.close?.());
        el("sch-g-form").addEventListener("submit", e => {
            e.preventDefault();
            run(el("sch-g-save"), el("sch-g-err"), async () => {
                await api("POST", `/v2/assignments/${B.assignment.id}/grades`, {
                    studentId: who, value: Number(el("sch-g-value").value), kind: el("sch-g-kind").value, date: el("sch-g-date").value || undefined, note: el("sch-g-note").value
                });
                dlg.close?.();
                toast("✓ Nota a fost pusă.");
                pageTeach();
            });
        });
        page.querySelectorAll("[data-sch-del]").forEach(b => b.addEventListener("click", () => {
            if (!confirmDelete()) return;
            run(b, null, async () => { await api("DELETE", `/v2/grades/${b.dataset.schDel}`); toast("Nota a fost ștearsă."); pageTeach(); });
        }));
    }
    // ștergerea unei note: o a doua apăsare în 4 secunde (fără ferestre de confirmare ale browserului)
    let armed = 0;
    function confirmDelete() {
        if (Date.now() - armed < 4000) { armed = 0; return true; }
        armed = Date.now();
        toast("Apasă încă o dată × ca să ștergi nota.");
        return false;
    }

    /* ---------- școli ---------- */
    function pageSchools() {
        el("sch-page").innerHTML = `
            <div class="sch-grid">
                <div class="glass-card">
                    <h3>Școli</h3>
                    ${S.schools.length ? `<div class="sch-table-wrap"><table class="sch-table"><thead><tr><th>Școala</th><th>Localitate</th><th>Județ</th></tr></thead><tbody>
                        ${S.schools.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.town)}</td><td>${esc(s.county)}</td></tr>`).join("")}</tbody></table></div>`
                        : `<p class="muted-small">Încă nu e nicio școală.</p>`}
                </div>
                <form class="glass-card" id="sch-school" novalidate>
                    <h3>${icon("plus")} Școală nouă</h3>
                    <div class="form-group"><label for="sch-s-name">Numele școlii</label><input id="sch-s-name" class="glass-input" required maxlength="120" placeholder="Colegiul Național …"></div>
                    <div class="form-row">
                        <div class="form-group"><label for="sch-s-town">Localitatea</label><input id="sch-s-town" class="glass-input" maxlength="80"></div>
                        <div class="form-group"><label for="sch-s-county">Județul</label><input id="sch-s-county" class="glass-input" maxlength="40"></div>
                    </div>
                    <div id="sch-s-err"></div>
                    <button class="btn btn-primary sch-full" type="submit">Adaugă școala</button>
                </form>
            </div>`;
        el("sch-school").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-s-err"), async () => {
                await api("POST", "/v2/schools", { name: el("sch-s-name").value, town: el("sch-s-town").value, county: el("sch-s-county").value });
                S.schools = (await api("GET", "/v2/schools")).schools;
                toast("✓ Școala a fost adăugată.");
                draw();
            });
        });
    }

    /* ---------- conturi ---------- */
    const schoolName = id => S.schools.find(s => s.id === id)?.name || "";
    const defaultSchool = () => S.me.account.schoolId || S.filter.school || S.schools[0]?.id || "";
    function statusPill(x) {
        if (x.disabled) return `<span class="sch-pill is-off">dezactivat</span>`;
        if (x.mustChangePassword) return `<span class="sch-pill is-new">n-a intrat încă</span>`;
        return `<span class="sch-pill is-ok">activ</span>`;
    }

    async function pageAccounts() {
        const r = role();
        const roles = CREATES[r] || [];
        const multi = r !== "school_admin";
        const page = el("sch-page");
        page.innerHTML = `<p class="muted-small">Se încarcă…</p>`;
        try {
            const q = new URLSearchParams();
            if (S.filter.school) q.set("school", S.filter.school);
            if (S.filter.role) q.set("role", S.filter.role);
            S.accounts = (await api("GET", `/v2/accounts${q.toString() ? `?${q}` : ""}`)).accounts.filter(x => x.id !== S.me.account.id);
        } catch (e) { page.innerHTML = `<p class="sch-error">${esc(e.message)}</p>`; return; }
        if (!page.isConnected) return;
        const schoolOpts = sel => S.schools.map(s => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("");
        const parents = S.accounts.filter(x => x.role === "parent" && !x.disabled);
        const students = S.accounts.filter(x => x.role === "student" && !x.disabled);
        page.innerHTML = `
            <div class="glass-card">
                <div class="sch-head">
                    <h3>Conturi <span class="muted-small">(${S.accounts.length})</span></h3>
                    <div class="sch-filters">
                        ${multi ? `<label class="sr-only" for="sch-f-school">Școala</label><select id="sch-f-school" class="glass-select"><option value="">Toate școlile</option>${schoolOpts(S.filter.school)}</select>` : ""}
                        <label class="sr-only" for="sch-f-role">Rol</label>
                        <select id="sch-f-role" class="glass-select"><option value="">Toate rolurile</option>${Object.entries(ROLE_LABEL).filter(([k]) => k !== "ceo").map(([k, l]) => `<option value="${k}" ${S.filter.role === k ? "selected" : ""}>${l}</option>`).join("")}</select>
                    </div>
                </div>
                ${S.accounts.length ? `<div class="sch-table-wrap"><table class="sch-table"><thead><tr><th>Nume</th><th>Utilizator</th><th>Rol</th>${multi ? "<th>Școala</th>" : ""}<th>Stare</th><th><span class="sr-only">Acțiuni</span></th></tr></thead><tbody>
                    ${S.accounts.map(x => `<tr>
                        <td><b>${esc(x.displayName)}</b></td><td class="sch-mono">${esc(x.username)}</td><td>${esc(ROLE_LABEL[x.role])}</td>
                        ${multi ? `<td>${esc(schoolName(x.schoolId) || (x.allSchools ? "toate școlile" : "—"))}</td>` : ""}
                        <td>${statusPill(x)}</td>
                        <td><span class="sch-actions">
                            <button type="button" class="btn btn-glass btn-sm" data-sch-reset="${esc(x.id)}">Parolă nouă</button>
                            <button type="button" class="btn btn-sm ${x.disabled ? "btn-glass" : "btn-text text-danger"}" data-sch-toggle="${esc(x.id)}" data-off="${x.disabled ? "1" : ""}">${x.disabled ? "Activează" : "Dezactivează"}</button>
                        </span></td></tr>`).join("")}
                    </tbody></table></div>` : `<p class="muted-small">Niciun cont aici încă. Fă primul mai jos.</p>`}
            </div>
            <div class="sch-grid">
                <form class="glass-card" id="sch-one" novalidate>
                    <h3>${icon("plus")} Cont nou</h3>
                    <div class="form-group"><label for="sch-a-name">Numele întreg</label><input id="sch-a-name" class="glass-input" required maxlength="120" placeholder="Ana Popescu"></div>
                    <div class="form-group"><label for="sch-a-role">Rol</label><select id="sch-a-role" class="glass-select">${roles.map(k => `<option value="${k}">${ROLE_LABEL[k]}</option>`).join("")}</select></div>
                    <div id="sch-a-school-wrap">${multi ? `<div class="form-group"><label for="sch-a-school">Școala</label><select id="sch-a-school" class="glass-select">${schoolOpts(defaultSchool())}</select></div>` : ""}</div>
                    <div id="sch-a-scope-wrap" hidden>
                        <label class="sch-check"><input type="checkbox" id="sch-a-all"> Toate școlile</label>
                        <div class="form-group"><label for="sch-a-scope">Sau doar aceste școli</label><select id="sch-a-scope" class="glass-select" multiple size="4">${schoolOpts("")}</select></div>
                    </div>
                    <div class="form-group"><label for="sch-a-user">Nume de utilizator <span class="label-hint">(opțional; altfel: prenume.nume)</span></label>
                        <input id="sch-a-user" class="glass-input" maxlength="40" autocapitalize="none" spellcheck="false"></div>
                    <div id="sch-a-err"></div>
                    <button class="btn btn-primary sch-full" type="submit">Creează contul</button>
                </form>
                <form class="glass-card" id="sch-bulk" novalidate>
                    <h3>${icon("layers")} O clasă întreagă</h3>
                    <p class="muted-small">Câte o persoană pe rând: <span class="sch-mono">Nume Prenume, rol</span>. Rolul: elev, profesor sau părinte. Primești parolele o singură dată, gata de tipărit.</p>
                    ${multi ? `<div class="form-group"><label for="sch-b-school">Școala</label><select id="sch-b-school" class="glass-select">${schoolOpts(defaultSchool())}</select></div>` : ""}
                    <div class="form-group"><label for="sch-b-rows">Lista</label>
                        <textarea id="sch-b-rows" class="glass-input sch-rows" rows="6" placeholder="Ana Popescu, elev&#10;Mihai Ionescu, elev&#10;Elena Rusu, profesor&#10;Dan Popescu, părinte"></textarea></div>
                    <div id="sch-b-err"></div>
                    <button class="btn btn-primary sch-full" type="submit">Creează toate conturile</button>
                </form>
            </div>
            ${parents.length && students.length ? `<form class="glass-card" id="sch-link" novalidate>
                <h3>Leagă un părinte de copilul lui</h3>
                <div class="form-row">
                    <div class="form-group"><label for="sch-k-parent">Părinte</label><select id="sch-k-parent" class="glass-select">${parents.map(p => `<option value="${esc(p.id)}">${esc(p.displayName)} (${esc(p.username)})</option>`).join("")}</select></div>
                    <div class="form-group"><label for="sch-k-student">Elev</label><select id="sch-k-student" class="glass-select">${students.map(p => `<option value="${esc(p.id)}">${esc(p.displayName)} (${esc(p.username)})</option>`).join("")}</select></div>
                </div>
                <div id="sch-k-err"></div>
                <button class="btn btn-primary" type="submit">Leagă</button>
            </form>` : ""}`;

        el("sch-f-school")?.addEventListener("change", e => { S.filter.school = e.target.value; pageAccounts(); });
        el("sch-f-role").addEventListener("change", e => { S.filter.role = e.target.value; pageAccounts(); });
        const syncRole = () => {
            const k = el("sch-a-role").value;
            el("sch-a-scope-wrap").hidden = k !== "schools_admin";
            el("sch-a-school-wrap").hidden = k === "schools_admin";
        };
        el("sch-a-role").addEventListener("change", syncRole);
        syncRole();
        page.querySelectorAll("[data-sch-reset]").forEach(b => b.addEventListener("click", () => resetPassword(b.dataset.schReset)));
        page.querySelectorAll("[data-sch-toggle]").forEach(b => b.addEventListener("click", () => toggleAccount(b, b.dataset.schToggle, !b.dataset.off)));

        el("sch-one").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-a-err"), async () => {
                const k = el("sch-a-role").value;
                const payload = { displayName: el("sch-a-name").value, role: k };
                if (el("sch-a-user").value.trim()) payload.username = el("sch-a-user").value.trim().toLowerCase();
                if (k === "schools_admin") { payload.allSchools = el("sch-a-all").checked; payload.schoolIds = [...el("sch-a-scope").selectedOptions].map(o => o.value); }
                else payload.schoolId = multi ? el("sch-a-school").value : S.me.account.schoolId;
                const out = await api("POST", "/v2/accounts", payload);
                showPasswords([out], "Contul e gata");
                pageAccounts();
            });
        });
        el("sch-bulk").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-b-err"), async () => {
                const rows = el("sch-b-rows").value.split(/\n+/).map(l => l.trim()).filter(Boolean).map((l, i) => {
                    const m = l.split(/[,;\t]/).map(x => x.trim());
                    const k = ROLE_WORDS[(m[1] || "elev").toLowerCase()];
                    if (!m[0] || !k) throw new Error(`Rândul ${i + 1} nu se înțelege: „${l}”. Scrie „Nume Prenume, elev” (sau profesor, părinte).`);
                    return { displayName: m[0], role: k };
                });
                if (!rows.length) throw new Error("Lista e goală.");
                const out = await api("POST", "/v2/accounts/bulk", { schoolId: multi ? el("sch-b-school").value : S.me.account.schoolId, rows });
                el("sch-b-rows").value = "";
                showPasswords(out.created, `${out.created.length} conturi create`);
                pageAccounts();
            });
        });
        el("sch-link")?.addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-k-err"), async () => {
                await api("POST", "/v2/parent-links", { parentId: el("sch-k-parent").value, studentId: el("sch-k-student").value });
                toast("✓ Părintele vede acum copilul în contul lui.");
            });
        });
    }

    async function resetPassword(id) {
        const x = S.accounts.find(a => a.id === id);
        if (!x || !window.confirm(`Faci o parolă nouă pentru ${x.displayName}? Parola veche nu mai merge și contul iese de pe toate dispozitivele.`)) return;
        try {
            const out = await api("POST", `/v2/accounts/${id}/reset-password`);
            showPasswords([out], "Parolă nouă");
            pageAccounts();
        } catch (e) { toast(`⚠️ ${e.message}`); }
    }

    async function toggleAccount(btn, id, disable) {
        const x = S.accounts.find(a => a.id === id);
        if (disable && !window.confirm(`Dezactivezi contul lui ${x?.displayName}? Nu mai poate intra până îl activezi din nou.`)) return;
        await run(btn, null, async () => {
            await api("POST", `/v2/accounts/${id}/${disable ? "disable" : "enable"}`);
            toast(disable ? "Cont dezactivat." : "✓ Cont activat.");
            pageAccounts();
        });
    }

    /** Parolele noi: se văd o singură dată; de aici se tipăresc cartonașele de intrare. */
    function showPasswords(items, title) {
        const d = document.createElement("dialog");
        d.className = "sch-dialog";
        d.innerHTML = `
            <h3>${esc(title)}</h3>
            <p class="muted-small">Parolele se arată <b>doar acum</b>. Dă-le persoanelor sau tipărește cartonașele. La prima intrare, fiecare își alege parola lui.</p>
            <div class="sch-table-wrap"><table class="sch-table"><thead><tr><th>Nume</th><th>Utilizator</th><th>Parolă</th></tr></thead><tbody>
                ${items.map(i => `<tr><td>${esc(i.account.displayName)}<br><small class="muted-small">${esc(ROLE_LABEL[i.account.role])}</small></td><td class="sch-mono">${esc(i.account.username)}</td><td><span class="sch-pw">${esc(i.password)}</span></td></tr>`).join("")}
            </tbody></table></div>
            <div class="sch-dialog-actions">
                <button type="button" class="btn btn-glass" data-sch-print>${icon("printer")} Tipărește cartonașele</button>
                <button type="button" class="btn btn-primary" data-sch-close>Gata, le-am notat</button>
            </div>`;
        document.body.appendChild(d);
        const close = () => { d.close(); d.remove(); const p = el("sch-print"); if (p) p.innerHTML = ""; };
        d.querySelector("[data-sch-close]").addEventListener("click", close);
        d.addEventListener("cancel", e => { e.preventDefault(); close(); });
        d.querySelector("[data-sch-print]").addEventListener("click", () => printCards(items));
        d.showModal();
    }

    function printCards(items) {
        let area = el("sch-print");
        if (!area) { area = document.createElement("section"); area.id = "sch-print"; area.setAttribute("aria-hidden", "true"); document.body.appendChild(area); }
        const site = `${location.origin}${location.pathname}`;
        area.innerHTML = items.map(i => `
            <div class="sch-login-card">
                <small>urNotes · ${esc(schoolName(i.account.schoolId) || S.me.school?.name || "Școala")}</small><br>
                <b>${esc(i.account.displayName)}</b> · ${esc(ROLE_LABEL[i.account.role])}<br>
                Adresa: <span class="sch-mono">${esc(site)}</span> → Școala<br>
                Utilizator: <span class="sch-mono">${esc(i.account.username)}</span><br>
                Parolă (prima intrare): <span class="sch-mono">${esc(i.password)}</span><br>
                <small>La prima intrare îți alegi parola ta. Parola de pe cartonaș expiră în 14 zile.</small>
            </div>`).join("");
        document.body.classList.add("sch-printing");
        const done = () => { document.body.classList.remove("sch-printing"); window.removeEventListener("afterprint", done); };
        window.addEventListener("afterprint", done);
        window.print();
        setTimeout(done, 1500); // unele browsere nu trimit afterprint
    }

    /* ---------- jurnal ---------- */
    async function pageAudit() {
        const page = el("sch-page");
        page.innerHTML = `<p class="muted-small">Se încarcă…</p>`;
        try {
            const { entries } = await api("GET", "/v2/audit");
            if (!page.isConnected) return;
            page.innerHTML = `<div class="glass-card"><h3>Jurnal</h3><p class="muted-small">Tot ce fac administratorii. Nu se poate modifica sau șterge.</p>
                ${entries.length ? `<div class="sch-table-wrap"><table class="sch-table"><thead><tr><th>Când</th><th>Cine</th><th>Ce</th><th>Detalii</th></tr></thead><tbody>
                ${entries.map(e => `<tr><td class="muted-small">${esc(new Date(e.at).toLocaleString("ro-RO"))}</td><td>${esc(e.actor)}</td><td>${esc(ACTION_LABEL[e.action] || e.action)}</td>
                    <td class="muted-small sch-mono">${esc([e.details?.username, e.details?.role && ROLE_LABEL[e.details.role], e.details?.name].filter(Boolean).join(" · "))}</td></tr>`).join("")}
                </tbody></table></div>` : `<p class="muted-small">Nimic încă.</p>`}</div>`;
        } catch (e) { page.innerHTML = `<p class="sch-error">${esc(e.message)}</p>`; }
    }

    /* ---------- contul meu ---------- */
    function pageMe() {
        const a = S.me.account;
        el("sch-page").innerHTML = `
            <div class="sch-grid">
                <div class="glass-card">
                    <h3>Contul de la școală</h3>
                    <p><b>${esc(a.displayName)}</b><br><span class="sch-mono">${esc(a.username)}</span><br><span class="muted-small">${esc(ROLE_LABEL[a.role])}${S.me.school ? ` · ${esc(S.me.school.name)}` : ""}</span></p>
                    <p class="muted-small">${a.totpEnabled ? "Intri cu parola și cu un cod din telefon." : "Intri cu nume de utilizator și parolă."}</p>
                    <button type="button" class="btn btn-glass text-danger" id="sch-out">${icon("undo")} Ieși din contul de la școală</button>
                </div>
                <form class="glass-card" id="sch-pass-form" novalidate>
                    <h3>Schimbă parola</h3>
                    <div class="form-group"><label for="sch-m-cur">Parola de acum</label><input id="sch-m-cur" class="glass-input" type="password" autocomplete="current-password" required></div>
                    <div class="form-group"><label for="sch-m-new">Parola nouă</label><input id="sch-m-new" class="glass-input" type="password" autocomplete="new-password" required minlength="8"></div>
                    <div class="form-group"><label for="sch-m-again">Încă o dată</label><input id="sch-m-again" class="glass-input" type="password" autocomplete="new-password" required></div>
                    <div id="sch-m-err"></div>
                    <button class="btn btn-primary sch-full" type="submit">Schimbă parola</button>
                    <p class="muted-small">Celelalte dispozitive ies din cont.</p>
                </form>
            </div>`;
        el("sch-out").addEventListener("click", logout);
        el("sch-pass-form").addEventListener("submit", e => {
            e.preventDefault();
            run(e.submitter, el("sch-m-err"), async () => {
                if (el("sch-m-new").value !== el("sch-m-again").value) throw new Error("Cele două parole nu sunt la fel.");
                await api("POST", "/v2/me/password", { current: el("sch-m-cur").value, newPassword: el("sch-m-new").value });
                e.target.reset();
                toast("✓ Parola a fost schimbată.");
            });
        });
    }

    async function logout() {
        try { await api("POST", "/v2/auth/logout"); } catch (_) { /* ieșim oricum */ }
        store.set(null);
        Object.assign(S, { access: null, me: null, tab: null, accounts: [], filter: { school: "", role: "" }, view: "login", step: null });
        draw();
        announce();
    }

    /** Eticheta din meniu: numele contului de la școală, dacă e cineva înăuntru. */
    function updateChip() {
        document.querySelectorAll("[data-school-who]").forEach(n => { n.textContent = S.me ? S.me.account.displayName.split(" ")[0] : ""; n.hidden = !S.me; });
        document.body.classList.toggle("school-in", Boolean(S.me));
    }

    /* ==================== pornire ==================== */
    async function start() {
        if (S.started) return;
        S.started = true;
        if (!apiBase()) { S.view = "login"; S.loginMsg = "Serverul nu e configurat (api-config.js)."; draw(); return; }
        const r = await refreshSession();
        if (r === "ok") return enterApp();
        S.view = r === "offline" ? "offline" : "login";
        draw();
    }

    function drawOffline(root) {
        root.innerHTML = card(`
            <h3>${icon("alert")} Nu am legătură cu serverul</h3>
            <p class="muted-small">Ești în continuare în cont. Verifică internetul și încearcă din nou.</p>
            <button type="button" class="btn btn-primary sch-full" id="sch-retry">Încearcă din nou</button>`);
        el("sch-retry").addEventListener("click", async e => {
            e.target.disabled = true;
            const r = await refreshSession();
            if (r === "ok") return enterApp();
            S.view = r === "offline" ? "offline" : "login";
            draw();
        });
    }

    /** Desenarea paginii (o cheamă aplicația la fiecare schimbare): doar prima dată și când pagina e goală. */
    function render() {
        markTab();
        if (!S.started) { start(); return; }
        const root = body();
        if (root && !root.firstElementChild) draw();
    }

    /** Intrarea din fereastra de la deschiderea site-ului. `onDone` = ce se face după ce a intrat. */
    function mount(target, onDone) {
        S.target = target; S.onDone = onDone;
        const page = el("school-body");
        if (page) page.innerHTML = ""; // un singur formular cu aceleași câmpuri; pagina se redesenează când fereastra se închide
        if (S.view === "app" || S.view === "boot") S.view = "login";
        S.started = true;
        draw();
        target.querySelector("input")?.focus({ preventScroll: true });
    }

    /** Pagina Școala e deschisă? (banda de vizitator se ascunde) */
    function markTab() { document.body.classList.toggle("on-school-tab", typeof ui !== "undefined" && ui.activeTab === "tab-scoala"); }
    document.addEventListener("DOMContentLoaded", () => {
        const sec = el("tab-scoala");
        if (sec && typeof MutationObserver === "function") new MutationObserver(markTab).observe(sec, { attributes: true, attributeFilter: ["class", "hidden"] });
    });

    /** Fereastra conturilor vechi (Google / email) nu se deschide singură pentru cine vine la Școala. */
    const skipAuth = () => Boolean(store.get());

    return { render, start, skipAuth, mount, request: (m, p, b) => api(m, p, b), get me() { return S.me; }, open: () => (typeof switchTab === "function" ? switchTab("tab-scoala") : null), get signedIn() { return Boolean(S.me); } };
})();

registerTab("tab-scoala", { render: schoolAccount.render, title: "Școala", icon: "graduation", group: "school" });

// Adresa veche a catalogului (și orice link cu #scoala) deschide direct pagina Școala.
window.addEventListener("load", () => {
    if (/^#(scoala|catalog)$/.test(location.hash)) {
        history.replaceState(null, "", location.pathname + location.search);
        schoolAccount.open();
    }
});
