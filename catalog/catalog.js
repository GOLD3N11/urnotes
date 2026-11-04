/* urNotes · Catalog (faza 1): intrarea cu nume de utilizator și parolă, conturile create de sus în jos.
   Vorbește doar cu serverul (/v2). Jetonul de acces stă în memorie; cel de reîmprospătare pe dispozitiv. */
"use strict";

const API = (window.URNOTES_API || "").replace(/\/+$/, "");
const REFRESH_KEY = "urn_cat_refresh";
const ROLE_LABEL = { ceo: "CEO", schools_admin: "Administrator de școli", school_admin: "Administrator de școală", teacher: "Profesor", student: "Elev", parent: "Părinte" };
const ROLE_WORDS = { profesor: "teacher", profesoara: "teacher", profesoară: "teacher", teacher: "teacher", elev: "student", eleva: "student", elevă: "student", student: "student", parinte: "parent", părinte: "parent", parent: "parent", mama: "parent", mamă: "parent", tata: "parent", tată: "parent" };
const CREATES = {
    ceo: ["schools_admin", "school_admin", "teacher", "student", "parent"],
    schools_admin: ["school_admin", "teacher", "student", "parent"],
    school_admin: ["teacher", "student", "parent"]
};

const S = { access: null, me: null, tab: null, schools: [], accounts: [], filter: { school: "", role: "" }, step: null };
const $ = id => document.getElementById(id);
const app = () => $("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get() { try { return localStorage.getItem(REFRESH_KEY); } catch (_) { return null; } }, set(v) { try { v ? localStorage.setItem(REFRESH_KEY, v) : localStorage.removeItem(REFRESH_KEY); } catch (_) {} } };

function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ==================== API ==================== */
class ApiError extends Error { constructor(status, body) { super(body?.message || `Eroare ${status}`); this.status = status; this.code = body?.error; } }

async function raw(method, path, body, token) {
    let res;
    try {
        res = await fetch(API + path, {
            method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (_) { throw new ApiError(0, { message: "Nu am legătură cu serverul. Verifică internetul." }); }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}

async function refreshSession() {
    const rt = store.get();
    if (!rt) return false;
    try {
        const r = await raw("POST", "/v2/auth/refresh", { refreshToken: rt });
        S.access = r.accessToken; store.set(r.refreshToken);
        return true;
    } catch (e) {
        if (e.status === 401) store.set(null);
        return false;
    }
}

/** Cerere cu jetonul de acces; dacă a expirat, îl reîmprospătează o dată. */
async function api(method, path, body) {
    try { return await raw(method, path, body, S.access); }
    catch (e) {
        if (e.status !== 401 || !(await refreshSession())) { if (e.status === 401) showLogin("Sesiunea s-a încheiat. Intră din nou."); throw e; }
        return raw(method, path, body, S.access);
    }
}

/* ==================== intrarea ==================== */
const brand = (sub = "Catalog") => `<div class="brand"><div class="brand-mark">ur</div><div><b>urNotes</b><small>${esc(sub)}</small></div></div>`;

function showLogin(message = "") {
    S.access = null; S.me = null; S.step = null; S.tab = null; S.accounts = []; S.filter = { school: "", role: "" };
    app().innerHTML = `
        <div class="auth"><form class="auth-card" id="f-login" novalidate>
            ${brand()}
            <h1>Intră în cont</h1>
            <p class="muted small">Numele de utilizator și parola le primești de la administratorul școlii.</p>
            <label for="l-user">Nume de utilizator</label>
            <input id="l-user" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="prenume.nume">
            <label for="l-pass">Parolă</label>
            <input id="l-pass" type="password" autocomplete="current-password" required>
            ${message ? `<div class="error">${esc(message)}</div>` : ""}
            <div id="l-err"></div>
            <button class="primary full" type="submit">Intră</button>
            <details class="small muted" style="margin-top:1rem"><summary>Am uitat parola</summary>
                <p>Parola o resetează cine ți-a făcut contul: pentru elevi, părinți și profesori, administratorul școlii; pentru administratori, cel de deasupra lor. Nu e nevoie de email.</p>
            </details>
        </form></div>`;
    $("l-user").focus();
    $("f-login").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("l-err"), async () => handleStep(await raw("POST", "/v2/auth/login", { username: $("l-user").value, password: $("l-pass").value })));
    });
}

/** Rulează o acțiune: dezactivează butonul, arată eroarea lângă formular. */
async function run(btn, errBox, fn) {
    if (btn) btn.disabled = true;
    if (errBox) errBox.innerHTML = "";
    try { await fn(); }
    catch (e) { if (errBox) errBox.innerHTML = `<div class="error">${esc(e.message)}</div>`; else toast(e.message); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
}

async function handleStep(step) {
    S.step = step;
    if (step.next === "done") {
        S.access = step.accessToken; store.set(step.refreshToken);
        return enterApp();
    }
    if (step.next === "change_password") return showFirstPassword(step);
    if (step.next === "totp_setup") return showTotpSetup(step);
    if (step.next === "totp") return showTotp(step);
}

function showFirstPassword(step) {
    app().innerHTML = `
        <div class="auth"><form class="auth-card" id="f-first" novalidate>
            ${brand()}
            <h1>Alege-ți parola</h1>
            <p class="muted small">Parola primită era doar pentru prima intrare. Alege una pe care o știi doar tu: cel puțin 8 caractere.</p>
            <label for="p-new">Parola nouă</label>
            <input id="p-new" type="password" autocomplete="new-password" required minlength="8">
            <label for="p-again">Scrie-o încă o dată</label>
            <input id="p-again" type="password" autocomplete="new-password" required>
            <div id="p-err"></div>
            <button class="primary full" type="submit">Salvează și continuă</button>
        </form></div>`;
    $("p-new").focus();
    $("f-first").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("p-err"), async () => {
            if ($("p-new").value !== $("p-again").value) throw new Error("Cele două parole nu sunt la fel.");
            handleStep(await raw("POST", "/v2/auth/first-password", { ticket: step.ticket, newPassword: $("p-new").value }));
        });
    });
}

function qrSvg(text) {
    if (typeof window.qrcode !== "function") return "";
    const q = window.qrcode(0, "M"); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function showTotpSetup(step) {
    app().innerHTML = `
        <div class="auth"><form class="auth-card" id="f-totp-setup" novalidate>
            ${brand()}
            <h1>Al doilea pas de siguranță</h1>
            <p class="muted small">Contul tău are multă putere, așa că la fiecare intrare îți cerem și un cod din telefon.</p>
            <ol class="small">
                <li>Instalează o aplicație de autentificare (Google Authenticator, Microsoft Authenticator sau alta).</li>
                <li>Scanează codul de mai jos din aplicație.</li>
                <li>Scrie aici cele 6 cifre pe care le arată.</li>
            </ol>
            <div class="qr" id="qr">${qrSvg(step.otpauthUrl) || `<span class="small muted">Codul QR nu s-a încărcat. Scrie cheia de mai jos în aplicație.</span>`}</div>
            <p class="small muted">Nu poți scana? Adaugă manual cheia:</p>
            <div class="secret">${esc(step.secret.replace(/(.{4})/g, "$1 ").trim())}</div>
            <label for="t-code">Codul din aplicație</label>
            <input id="t-code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
            <div id="t-err"></div>
            <button class="primary full" type="submit">Verifică și intră</button>
        </form></div>`;
    if (!$("qr").querySelector("svg")) setTimeout(() => { const s = qrSvg(step.otpauthUrl); if (s) $("qr").innerHTML = s; }, 800);
    $("t-code").focus();
    $("f-totp-setup").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("t-err"), async () => handleStep(await raw("POST", "/v2/auth/totp-setup", { ticket: step.ticket, code: $("t-code").value })));
    });
}

function showTotp(step) {
    app().innerHTML = `
        <div class="auth"><form class="auth-card" id="f-totp" novalidate>
            ${brand()}
            <h1>Codul din telefon</h1>
            <p class="muted small">Deschide aplicația de autentificare și scrie cele 6 cifre pentru urNotes.</p>
            <label for="c-code">Cod</label>
            <input id="c-code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
            <div id="c-err"></div>
            <button class="primary full" type="submit">Intră</button>
        </form></div>`;
    $("c-code").focus();
    $("f-totp").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("c-err"), async () => handleStep(await raw("POST", "/v2/auth/totp", { ticket: step.ticket, code: $("c-code").value })));
    });
}

/* ==================== aplicația ==================== */
const isAdmin = () => ["ceo", "schools_admin", "school_admin"].includes(S.me?.account.role);

function tabsFor(role) {
    if (role === "ceo" || role === "schools_admin") return [["accounts", "Conturi"], ["schools", "Școli"], ["audit", "Jurnal"], ["me", "Contul meu"]];
    if (role === "school_admin") return [["accounts", "Conturi"], ["audit", "Jurnal"], ["me", "Contul meu"]];
    return [["home", "Acasă"], ["me", "Contul meu"]];
}

async function enterApp() {
    try { S.me = await api("GET", "/v2/me"); } catch (_) { return; }
    const tabs = tabsFor(S.me.account.role);
    if (!S.tab || !tabs.some(t => t[0] === S.tab)) S.tab = tabs[0][0];
    if (isAdmin()) { try { S.schools = (await api("GET", "/v2/schools")).schools; } catch (_) { S.schools = []; } }
    renderShell();
}

function renderShell() {
    const a = S.me.account;
    const tabs = tabsFor(a.role);
    app().innerHTML = `
        <header class="top">
            ${brand(S.me.school ? S.me.school.name : "Catalog")}
            <div class="who"><b>${esc(a.displayName)}</b><small>${esc(ROLE_LABEL[a.role])} · ${esc(a.username)}</small></div>
        </header>
        <nav class="tabs" aria-label="Secțiuni">${tabs.map(([id, label]) => `<button type="button" class="tab${S.tab === id ? " on" : ""}" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>
        <div class="page" id="page"></div>`;
    app().querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderShell(); }));
    ({ accounts: pageAccounts, schools: pageSchools, audit: pageAudit, me: pageMe, home: pageHome })[S.tab]();
}

/* ---------- acasă (profesori, elevi, părinți) ---------- */
function pageHome() {
    const a = S.me.account;
    const kids = S.me.children || [];
    $("page").innerHTML = `
        <div class="card">
            <h1>Bună, ${esc(a.displayName.split(" ")[0])}!</h1>
            <p class="muted">${esc(ROLE_LABEL[a.role])}${S.me.school ? ` la ${esc(S.me.school.name)}` : ""}.</p>
            ${a.role === "parent" ? `<h3>Copiii tăi</h3>${kids.length ? `<ul>${kids.map(k => `<li>${esc(k.displayName)}</li>`).join("")}</ul>` : `<p class="muted">Administratorul școlii nu te-a legat încă de copilul tău.</p>`}` : ""}
            <div class="note">Notele, absențele și orarul apar aici în curând. Contul tău e gata.</div>
        </div>`;
}

/* ---------- școli ---------- */
function pageSchools() {
    $("page").innerHTML = `
        <div class="grid2">
            <div class="card">
                <h2>Școli</h2>
                ${S.schools.length ? `<div class="table-wrap"><table><thead><tr><th>Școala</th><th>Localitate</th><th>Județ</th></tr></thead><tbody>
                    ${S.schools.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.town)}</td><td>${esc(s.county)}</td></tr>`).join("")}</tbody></table></div>`
                    : `<p class="empty">Încă nu e nicio școală.</p>`}
            </div>
            <form class="card" id="f-school" novalidate>
                <h2>Școală nouă</h2>
                <label for="s-name">Numele școlii</label><input id="s-name" required maxlength="120" placeholder="Colegiul Național …">
                <div class="row">
                    <div><label for="s-town">Localitatea</label><input id="s-town" maxlength="80"></div>
                    <div><label for="s-county">Județul</label><input id="s-county" maxlength="40"></div>
                </div>
                <div id="s-err"></div>
                <button class="primary full" type="submit">Adaugă școala</button>
            </form>
        </div>`;
    $("f-school").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("s-err"), async () => {
            await api("POST", "/v2/schools", { name: $("s-name").value, town: $("s-town").value, county: $("s-county").value });
            S.schools = (await api("GET", "/v2/schools")).schools;
            toast("Școala a fost adăugată.");
            renderShell();
        });
    });
}

/* ---------- conturi ---------- */
const schoolName = id => S.schools.find(s => s.id === id)?.name || "";
const defaultSchool = () => S.me.account.schoolId || S.filter.school || S.schools[0]?.id || "";

async function loadAccounts() {
    const q = new URLSearchParams();
    if (S.filter.school) q.set("school", S.filter.school);
    if (S.filter.role) q.set("role", S.filter.role);
    S.accounts = (await api("GET", `/v2/accounts${q.toString() ? `?${q}` : ""}`)).accounts.filter(x => x.id !== S.me.account.id);
}

function statusPill(x) {
    if (x.disabled) return `<span class="pill off">dezactivat</span>`;
    if (x.mustChangePassword) return `<span class="pill new">n-a intrat încă</span>`;
    return `<span class="pill ok">activ</span>`;
}

async function pageAccounts() {
    const role = S.me.account.role;
    const roles = CREATES[role] || [];
    const multiSchool = role !== "school_admin";
    $("page").innerHTML = `<p class="muted">Se încarcă…</p>`;
    try { await loadAccounts(); } catch (e) { $("page").innerHTML = `<div class="error">${esc(e.message)}</div>`; return; }
    const schoolOpts = sel => S.schools.map(s => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const parents = S.accounts.filter(x => x.role === "parent" && !x.disabled);
    const students = S.accounts.filter(x => x.role === "student" && !x.disabled);
    $("page").innerHTML = `
        <div class="card">
            <div class="row" style="align-items:center">
                <h2 style="margin:0">Conturi</h2>
                ${multiSchool ? `<div><label for="f-school-sel" class="small">Școala</label><select id="f-school-sel"><option value="">Toate</option>${schoolOpts(S.filter.school)}</select></div>` : ""}
                <div><label for="f-role-sel" class="small">Rol</label><select id="f-role-sel"><option value="">Toate</option>${Object.entries(ROLE_LABEL).filter(([r]) => r !== "ceo").map(([r, l]) => `<option value="${r}" ${S.filter.role === r ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            </div>
            ${S.accounts.length ? `<div class="table-wrap"><table><thead><tr><th>Nume</th><th>Utilizator</th><th>Rol</th>${multiSchool ? "<th>Școala</th>" : ""}<th>Stare</th><th></th></tr></thead><tbody>
                ${S.accounts.map(x => `<tr>
                    <td><b>${esc(x.displayName)}</b></td><td class="mono">${esc(x.username)}</td><td>${esc(ROLE_LABEL[x.role])}</td>
                    ${multiSchool ? `<td>${esc(schoolName(x.schoolId) || (x.allSchools ? "toate școlile" : "—"))}</td>` : ""}
                    <td>${statusPill(x)}</td>
                    <td><div class="actions">
                        <button type="button" data-reset="${esc(x.id)}">Parolă nouă</button>
                        <button type="button" class="${x.disabled ? "" : "danger"}" data-toggle="${esc(x.id)}" data-off="${x.disabled ? "1" : ""}">${x.disabled ? "Activează" : "Dezactivează"}</button>
                    </div></td></tr>`).join("")}
                </tbody></table></div>` : `<p class="empty">Niciun cont aici încă. Fă primul mai jos.</p>`}
        </div>

        <div class="grid2">
            <form class="card" id="f-one" novalidate>
                <h2>Cont nou</h2>
                <label for="a-name">Numele întreg</label><input id="a-name" required maxlength="120" placeholder="Ana Popescu">
                <label for="a-role">Rol</label>
                <select id="a-role">${roles.map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join("")}</select>
                <div id="a-school-wrap">${multiSchool ? `<label for="a-school">Școala</label><select id="a-school">${schoolOpts(defaultSchool())}</select>` : ""}</div>
                <div id="a-scope-wrap" hidden>
                    <label class="check"><input type="checkbox" id="a-all"> Toate școlile</label>
                    <label for="a-scope">Sau doar aceste școli</label>
                    <select id="a-scope" multiple size="4">${schoolOpts("")}</select>
                </div>
                <label for="a-user">Nume de utilizator <span class="muted small">(opțional; altfel îl fac eu: prenume.nume)</span></label>
                <input id="a-user" maxlength="40" autocapitalize="none" spellcheck="false">
                <div id="a-err"></div>
                <button class="primary full" type="submit">Creează contul</button>
            </form>

            <form class="card" id="f-bulk" novalidate>
                <h2>O clasă întreagă</h2>
                <p class="small muted">Câte o persoană pe rând: <span class="mono">Nume Prenume, rol</span>. Rolul: elev, profesor sau părinte. Primești parolele o singură dată, gata de tipărit.</p>
                ${multiSchool ? `<label for="b-school">Școala</label><select id="b-school">${schoolOpts(defaultSchool())}</select>` : ""}
                <label for="b-rows">Lista</label>
                <textarea id="b-rows" placeholder="Ana Popescu, elev&#10;Mihai Ionescu, elev&#10;Elena Rusu, profesor&#10;Dan Popescu, părinte"></textarea>
                <div id="b-err"></div>
                <button class="primary full" type="submit">Creează toate conturile</button>
            </form>
        </div>

        ${parents.length && students.length ? `<form class="card" id="f-link" novalidate>
            <h2>Leagă un părinte de copilul lui</h2>
            <div class="row">
                <div><label for="k-parent">Părinte</label><select id="k-parent">${parents.map(p => `<option value="${esc(p.id)}">${esc(p.displayName)} (${esc(p.username)})</option>`).join("")}</select></div>
                <div><label for="k-student">Elev</label><select id="k-student">${students.map(p => `<option value="${esc(p.id)}">${esc(p.displayName)} (${esc(p.username)})</option>`).join("")}</select></div>
                <button class="primary" type="submit">Leagă</button>
            </div>
            <div id="k-err"></div>
        </form>` : ""}`;

    $("f-school-sel")?.addEventListener("change", e => { S.filter.school = e.target.value; pageAccounts(); });
    $("f-role-sel").addEventListener("change", e => { S.filter.role = e.target.value; pageAccounts(); });
    const syncRole = () => {
        const r = $("a-role").value;
        $("a-scope-wrap").hidden = r !== "schools_admin";
        $("a-school-wrap").hidden = r === "schools_admin";
    };
    $("a-role").addEventListener("change", syncRole); syncRole();
    $("page").querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => resetPassword(b.dataset.reset)));
    $("page").querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => toggleAccount(b, b.dataset.toggle, !b.dataset.off)));

    $("f-one").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("a-err"), async () => {
            const r = $("a-role").value;
            const body = { displayName: $("a-name").value, role: r };
            if ($("a-user").value.trim()) body.username = $("a-user").value.trim().toLowerCase();
            if (r === "schools_admin") { body.allSchools = $("a-all").checked; body.schoolIds = [...$("a-scope").selectedOptions].map(o => o.value); }
            else body.schoolId = multiSchool ? $("a-school").value : S.me.account.schoolId;
            const out = await api("POST", "/v2/accounts", body);
            showPasswords([out], "Contul e gata");
            pageAccounts();
        });
    });
    $("f-bulk").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("b-err"), async () => {
            const rows = $("b-rows").value.split(/\n+/).map(l => l.trim()).filter(Boolean).map((l, i) => {
                const m = l.split(/[,;\t]/).map(x => x.trim());
                const role = ROLE_WORDS[(m[1] || "elev").toLowerCase()];
                if (!m[0] || !role) throw new Error(`Rândul ${i + 1} nu se înțelege: „${l}”. Scrie „Nume Prenume, elev” (sau profesor, părinte).`);
                return { displayName: m[0], role };
            });
            if (!rows.length) throw new Error("Lista e goală.");
            const out = await api("POST", "/v2/accounts/bulk", { schoolId: multiSchool ? $("b-school").value : S.me.account.schoolId, rows });
            $("b-rows").value = "";
            showPasswords(out.created, `${out.created.length} conturi create`);
            pageAccounts();
        });
    });
    $("f-link")?.addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("k-err"), async () => {
            await api("POST", "/v2/parent-links", { parentId: $("k-parent").value, studentId: $("k-student").value });
            toast("Părintele vede acum copilul în contul lui.");
        });
    });
}

async function resetPassword(id) {
    const x = S.accounts.find(a => a.id === id);
    if (!x || !confirmDialog(`Faci o parolă nouă pentru ${x.displayName}? Parola veche nu mai merge și contul iese de pe toate dispozitivele.`)) return;
    try { const out = await api("POST", `/v2/accounts/${id}/reset-password`); showPasswords([out], "Parolă nouă"); pageAccounts(); }
    catch (e) { toast(e.message); }
}

async function toggleAccount(btn, id, disable) {
    const x = S.accounts.find(a => a.id === id);
    if (disable && !confirmDialog(`Dezactivezi contul lui ${x?.displayName}? Nu mai poate intra până îl activezi din nou.`)) return;
    await run(btn, null, async () => { await api("POST", `/v2/accounts/${id}/${disable ? "disable" : "enable"}`); toast(disable ? "Cont dezactivat." : "Cont activat."); pageAccounts(); });
}

const confirmDialog = msg => window.confirm(msg);

/** Parolele noi: se văd o singură dată; de aici se tipăresc cartonașele. */
function showPasswords(items, title) {
    const d = document.createElement("dialog");
    d.innerHTML = `
        <h2>${esc(title)}</h2>
        <p class="small muted">Parolele se arată <b>doar acum</b>. Dă-le persoanelor sau tipărește cartonașele. La prima intrare, fiecare își alege parola lui.</p>
        <div class="table-wrap"><table><thead><tr><th>Nume</th><th>Utilizator</th><th>Parolă</th></tr></thead><tbody>
            ${items.map(i => `<tr><td>${esc(i.account.displayName)}<br><span class="small muted">${esc(ROLE_LABEL[i.account.role])}</span></td><td class="mono">${esc(i.account.username)}</td><td><span class="pw-big">${esc(i.password)}</span></td></tr>`).join("")}
        </tbody></table></div>
        <div class="row" style="margin-top:1rem;justify-content:flex-end">
            <button type="button" id="d-print">Tipărește cartonașele</button>
            <button type="button" class="primary" id="d-close">Gata, le-am notat</button>
        </div>`;
    document.body.appendChild(d);
    d.querySelector("#d-close").addEventListener("click", () => { d.close(); d.remove(); $("print-area").innerHTML = ""; });
    d.querySelector("#d-print").addEventListener("click", () => {
        const site = location.origin + location.pathname;
        $("print-area").innerHTML = items.map(i => `
            <div class="login-card">
                <small>urNotes · ${esc(schoolName(i.account.schoolId) || "Catalog")}</small><br>
                <b>${esc(i.account.displayName)}</b> · ${esc(ROLE_LABEL[i.account.role])}<br>
                Adresa: <span class="mono">${esc(site)}</span><br>
                Utilizator: <span class="mono">${esc(i.account.username)}</span><br>
                Parolă (prima intrare): <span class="mono">${esc(i.password)}</span><br>
                <small>La prima intrare îți alegi parola ta. Parola de pe cartonaș expiră în 14 zile.</small>
            </div>`).join("");
        window.print();
    });
    d.showModal();
}

/* ---------- jurnal ---------- */
const ACTION_LABEL = {
    "setup.ceo": "a creat contul de CEO", "school.create": "a adăugat o școală", "account.create": "a creat un cont",
    "account.reset_password": "a făcut o parolă nouă", "account.disable": "a dezactivat un cont", "account.enable": "a activat un cont",
    "parent.link": "a legat un părinte de un elev", "parent.unlink": "a dezlegat un părinte", "totp.enabled": "a pornit codul din telefon"
};
async function pageAudit() {
    $("page").innerHTML = `<p class="muted">Se încarcă…</p>`;
    try {
        const { entries } = await api("GET", "/v2/audit");
        $("page").innerHTML = `<div class="card"><h2>Jurnal</h2><p class="small muted">Tot ce fac administratorii. Nu se poate modifica sau șterge.</p>
            ${entries.length ? `<div class="table-wrap"><table><thead><tr><th>Când</th><th>Cine</th><th>Ce</th><th>Detalii</th></tr></thead><tbody>
            ${entries.map(e => `<tr><td class="small">${esc(new Date(e.at).toLocaleString("ro-RO"))}</td><td>${esc(e.actor)}</td><td>${esc(ACTION_LABEL[e.action] || e.action)}</td>
                <td class="small muted mono">${esc([e.details?.username, e.details?.role && ROLE_LABEL[e.details.role], e.details?.name].filter(Boolean).join(" · "))}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="empty">Nimic încă.</p>`}</div>`;
    } catch (e) { $("page").innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

/* ---------- contul meu ---------- */
function pageMe() {
    const a = S.me.account;
    $("page").innerHTML = `
        <div class="grid2">
            <div class="card">
                <h2>Contul meu</h2>
                <p><b>${esc(a.displayName)}</b><br><span class="mono">${esc(a.username)}</span><br><span class="muted">${esc(ROLE_LABEL[a.role])}${S.me.school ? ` · ${esc(S.me.school.name)}` : ""}</span></p>
                <p class="small muted">${a.totpEnabled ? "Intri cu parola și cu un cod din telefon." : "Intri cu nume de utilizator și parolă."}</p>
                <button type="button" class="danger" id="m-out">Ieși din cont</button>
            </div>
            <form class="card" id="f-pass" novalidate>
                <h2>Schimbă parola</h2>
                <label for="m-cur">Parola de acum</label><input id="m-cur" type="password" autocomplete="current-password" required>
                <label for="m-new">Parola nouă</label><input id="m-new" type="password" autocomplete="new-password" required minlength="8">
                <label for="m-again">Încă o dată</label><input id="m-again" type="password" autocomplete="new-password" required>
                <div id="m-err"></div>
                <button class="primary full" type="submit">Schimbă parola</button>
                <p class="small muted">Celelalte dispozitive ies din cont.</p>
            </form>
        </div>`;
    $("m-out").addEventListener("click", logout);
    $("f-pass").addEventListener("submit", e => {
        e.preventDefault();
        run(e.submitter, $("m-err"), async () => {
            if ($("m-new").value !== $("m-again").value) throw new Error("Cele două parole nu sunt la fel.");
            await api("POST", "/v2/me/password", { current: $("m-cur").value, newPassword: $("m-new").value });
            e.target.reset();
            toast("Parola a fost schimbată.");
        });
    });
}

async function logout() {
    try { await api("POST", "/v2/auth/logout"); } catch (_) { /* ieșim oricum */ }
    store.set(null);
    showLogin();
}

/* ==================== pornire ==================== */
(async () => {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) document.body.classList.add("dark-mode");
    if (!API) { app().innerHTML = `<div class="auth"><div class="auth-card">${brand()}<div class="error">Serverul nu e configurat (api-config.js).</div></div></div>`; return; }
    if (await refreshSession()) return enterApp();
    showLogin();
})();
