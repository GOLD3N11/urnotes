/* urNotes · Cont și sincronizare.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== CONT ȘI SINCRONIZARE ==================== */
/*
 * Opțional: cu Firebase configurat (firebase-config.js), elevul își poate face cont (Google sau email + parolă),
 * iar datele îl urmează pe orice dispozitiv. Fără configurare, nimic din secțiunea asta nu apare.
 *
 * Datele rămân „local-first”: localStorage e copia de lucru (merge și offline); la fiecare salvare,
 * după o pauză scurtă, întregul backup (același format ca exportul) se urcă în cont.
 * Schimbările venite de pe alt dispozitiv se aplică singure, dacă aici nu există modificări nesincronizate;
 * altfel elevul alege ce păstrează. La prima conectare, datele deja existente pe dispozitiv nu se pierd niciodată fără întrebare.
 */
const SYNC_KEYS = { meta: "pro_sync_meta_v4", device: "pro_device_id_v4", choice: "pro_auth_choice_v4" };
const SYNC_DELAY = 1500;
const SYNC_RETRY = 30000;
const cloud = {
    configured: Boolean(window.URNOTES_FIREBASE?.apiKey),
    api: undefined,      // undefined = încă se încarcă; null = indisponibil
    user: null,
    seenUser: false,     // a venit primul răspuns „cine e conectat”
    status: "local",     // local | syncing | pending | synced | offline | error
    dirty: false,
    lastSyncAt: 0,
    timer: 0,
    busy: false,
    again: false,
    applying: false,
    unwatch: null,
    asking: false,
    needsReconcile: false,
    reconciling: false
};

function lsGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function lsSet(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch (_) { /* fără stocare: sincronizarea merge, doar nu se ține minte între sesiuni */ }
}
function deviceId() {
    let id = lsGet(SYNC_KEYS.device);
    if (!id) {
        id = uid();
        lsSet(SYNC_KEYS.device, id);
    }
    return id;
}
function syncMeta() {
    const m = safeParseJSON(lsGet(SYNC_KEYS.meta), null);
    return isPlainObject(m) ? m : {};
}
function setSyncMeta(patch) { lsSet(SYNC_KEYS.meta, JSON.stringify({ ...syncMeta(), ...patch })); }
const dataJSON = () => JSON.stringify(buildBackup());
/** Conținutul fără momentul exportului, ca două copii identice să fie recunoscute ca atare. */
function dataFingerprint(json) {
    const parsed = safeParseJSON(json, null);
    return parsed && parsed.data ? JSON.stringify(parsed.data) : "";
}
const hasLocalData = () => Object.keys(state.subjects).length > 0 || Object.keys(state.calendar).length > 0 || state.archive.length > 0;

function initCloud() {
    if (!cloud.configured) return; // aplicația rămâne exact ca înainte
    document.body.classList.add("has-cloud");
    const attach = api => {
        if (cloud.api) return;
        cloud.api = api || null;
        if (!cloud.api) {
            setSyncStatus("local");
            // Firebase nu a putut porni (ex. fără internet la prima deschidere): se poate doar răsfoi.
            cloud.seenUser = true;
            enterGuest();
            return;
        }
        cloud.api.onUser(user => { onCloudUser(user); });
    };
    if (window.UrNotesCloud !== undefined) attach(window.UrNotesCloud);
    window.addEventListener("urnotes-cloud", event => attach(event.detail));
    // Plasă de siguranță: dacă modulul de cont nu se încarcă deloc, aplicația pornește local după câteva secunde.
    setTimeout(() => { if (cloud.api === undefined) attach(null); }, 8000);
    window.addEventListener("online", () => {
        if (!cloud.user) return;
        if (cloud.needsReconcile) reconcileWithCloud();
        else if (cloud.dirty) scheduleUpload(0);
    });
    renderAccount();
}

async function onCloudUser(user) {
    const first = !cloud.seenUser;
    cloud.seenUser = true;
    cloud.unwatch?.();
    cloud.unwatch = null;
    cloud.user = user;

    if (!user) {
        cloud.dirty = false;
        setSyncStatus("local");
        enterGuest();
        renderAccount();
        // La fiecare deschidere arătăm autentificarea, mai puțin dacă a ales deja „doar mă uit” în sesiunea asta
        let browsing = false;
        try { browsing = sessionStorage.getItem(GUEST_SESSION_KEY) === "1"; } catch (_) { /* fără stocare */ }
        if (first && !browsing) openAuth();
        return;
    }

    lsSet(SYNC_KEYS.choice, "account");
    closeAuth();
    leaveGuest();
    renderAccount();
    await reconcileWithCloud();
    // Numele din contul Google devine numele elevului, dacă nu și-a scris deja altul.
    if (cloud.user?.uid === user.uid && !state.settings.profile.name && user.name) {
        state.settings.profile.name = cleanName(user.name, 40);
        refresh();
        loadSettingsIntoUI();
        // Configurarea deschisă deja: numele apare și acolo
        const input = $("setup-me-name");
        if (input && !input.value) {
            input.value = state.settings.profile.name;
            $("setup-buddy").innerHTML = setupBuddyHTML();
        }
    }
    if (cloud.user?.uid === user.uid) cloud.unwatch = cloud.api.watch(onRemoteChange);
}

/** La conectare: ce facem dacă și contul, și dispozitivul au date. */
async function reconcileWithCloud() {
    if (cloud.reconciling) return; // conexiunea revine și prin „online”, și prin watch: o singură comparație
    cloud.reconciling = true;
    try {
        await reconcileOnce();
    } finally {
        cloud.reconciling = false;
    }
}

async function reconcileOnce() {
    const user = cloud.user;
    setSyncStatus("syncing");
    let remote;
    try {
        remote = await cloud.api.load();
    } catch (err) {
        console.warn("Nu am putut citi datele din cont.", err);
        cloud.dirty = Boolean(syncMeta().dirty);
        cloud.needsReconcile = true; // la revenirea conexiunii comparăm din nou, înainte de orice urcare
        setSyncStatus(navigator.onLine === false ? "offline" : "error");
        clearTimeout(cloud.timer);
        cloud.timer = setTimeout(() => { if (cloud.needsReconcile && cloud.user) reconcileWithCloud(); }, SYNC_RETRY);
        return;
    }
    if (cloud.user?.uid !== user.uid) return;
    cloud.needsReconcile = false;
    const meta = syncMeta();
    const sameUser = meta.uid === user.uid;
    const localJSON = dataJSON();

    if (!remote) {
        // Cont nou (sau gol): datele de pe dispozitiv urcă în cont, dar doar cu acordul elevului.
        if (hasLocalData() && !sameUser) {
            const choice = await askSync("upload");
            if (choice === "fresh") {
                exportBackup(); // întâi o copie, ca nimic să nu se piardă
                applyRemoteData(null);
            }
        }
        await uploadNow();
        // Cont nou și caiet gol: configurarea apare mereu (chiar dacă pe acest browser a mai fost închisă cândva).
        if (!hasLocalData() && cloud.user?.uid === user.uid) openSetup(0);
        return;
    }
    if (dataFingerprint(remote.json) === dataFingerprint(localJSON)) {
        markSynced(remote.updatedAt);
        return;
    }
    if (sameUser && !meta.dirty) return applyRemoteData(remote);                       // dispozitivul e doar o copie a contului
    if (sameUser && remote.updatedAt <= (meta.lastSyncAt || 0)) return uploadNow();   // s-a schimbat doar aici (offline)
    if (!hasLocalData()) return applyRemoteData(remote);
    const choice = await askSync("conflict", remote);
    if (choice === "remote") applyRemoteData(remote);
    else await uploadNow();
}

/** Înlocuiește datele locale cu cele din cont (sau le golește, pentru `null`). */
function applyRemoteData(remote, { toast = "" } = {}) {
    let loaded;
    try {
        loaded = remote ? parseBackup(remote.json).loaded : readStoredData(() => null);
    } catch (err) {
        console.error("Datele din cont nu au putut fi citite.", err);
        setSyncStatus("error");
        showToast("⚠️ Datele din cont nu au putut fi citite. Cele de pe acest dispozitiv au rămas neschimbate.");
        return;
    }
    cloud.applying = true;
    try {
        applyImportedData(loaded);
    } finally {
        cloud.applying = false;
    }
    if (remote) markSynced(remote.updatedAt);
    if (toast) showToast(toast);
}

/** Apelată de saveState() când s-a schimbat ceva. */
function onLocalDataChange() {
    if (!cloud.user || cloud.applying) return;
    cloud.dirty = true;
    setSyncMeta({ uid: cloud.user.uid, dirty: true });
    setSyncStatus("pending");
    scheduleUpload();
}

function scheduleUpload(delay = SYNC_DELAY) {
    if (!cloud.user) return;
    clearTimeout(cloud.timer);
    cloud.timer = setTimeout(uploadNow, delay);
}

async function uploadNow() {
    if (!cloud.user || !cloud.api || cloud.needsReconcile) return; // fără să știm ce e în cont, nu suprascriem
    if (cloud.busy) {
        cloud.again = true;
        return;
    }
    clearTimeout(cloud.timer);
    cloud.busy = true;
    setSyncStatus("syncing");
    const uidAtStart = cloud.user.uid;
    const at = Date.now();
    try {
        await cloud.api.save(dataJSON(), deviceId(), at);
        if (cloud.user?.uid === uidAtStart) markSynced(at);
    } catch (err) {
        console.warn("Sincronizarea a eșuat; reîncerc.", err);
        cloud.dirty = true;
        setSyncMeta({ uid: uidAtStart, dirty: true });
        setSyncStatus(navigator.onLine === false ? "offline" : "error");
        cloud.timer = setTimeout(() => { if (cloud.dirty) uploadNow(); }, SYNC_RETRY);
    } finally {
        cloud.busy = false;
        if (cloud.again) {
            cloud.again = false;
            scheduleUpload(300);
        }
    }
}

function markSynced(at) {
    cloud.dirty = false;
    cloud.lastSyncAt = at;
    setSyncMeta({ uid: cloud.user.uid, lastSyncAt: at, dirty: false });
    setSyncStatus("synced");
}

/** O schimbare venită de pe alt dispozitiv. */
async function onRemoteChange(remote) {
    if (cloud.needsReconcile) return reconcileWithCloud(); // prima citire a eșuat: comparăm cu grijă, nu înlocuim orbește
    if (!remote?.json || !cloud.user || remote.device === deviceId() || remote.updatedAt <= cloud.lastSyncAt) return;
    if (dataFingerprint(remote.json) === dataFingerprint(dataJSON())) return markSynced(remote.updatedAt);
    if (!cloud.dirty) return applyRemoteData(remote, { toast: "↻ Am adus modificările făcute pe alt dispozitiv." });
    if (cloud.asking) return;
    const choice = await askSync("conflict", remote);
    if (choice === "remote") applyRemoteData(remote);
    else await uploadNow();
}

const SYNC_STATUS_TEXT = {
    local: "Doar pe acest dispozitiv",
    syncing: "Se sincronizează…",
    pending: "Modificări nesalvate în cont",
    synced: "Sincronizat",
    offline: "Offline · se urcă la revenire",
    error: "Sincronizare întreruptă · reîncerc"
};

function setSyncStatus(status) {
    cloud.status = status;
    document.querySelectorAll("[data-sync-status]").forEach(el => {
        el.dataset.syncStatus = status;
        const text = el.querySelector(".sync-text");
        if (text) text.textContent = SYNC_STATUS_TEXT[status];
    });
}

function userInitials(user) {
    const base = (user.name || user.email || "?").trim();
    const parts = base.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (user.name && parts[1] ? parts[1][0] : "")).toLocaleUpperCase("ro");
}

function avatarHTML(user, cls = "") {
    if (!user) return `<span class="avatar ${cls} is-guest" aria-hidden="true">${icon("user")}</span>`;
    return user.photo
        ? `<img class="avatar ${cls}" src="${escapeHTML(user.photo)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="avatar ${cls}" aria-hidden="true">${escapeHTML(userInitials(user))}</span>`;
}

/** Bucata „cont” din meniul lateral și din Setări. */
function renderAccount() {
    const u = cloud.user;
    const chip = $("account-chip");
    if (chip) {
        chip.innerHTML = `
            ${avatarHTML(u)}
            <span class="account-chip-text">
                <b>${escapeHTML(u ? (u.name || u.email) : "Intră în cont")}</b>
                <small class="sync-line" data-sync-status="${cloud.status}"><i class="sync-dot" aria-hidden="true"></i><span class="sync-text">${SYNC_STATUS_TEXT[cloud.status]}</span></small>
            </span>`;
        chip.setAttribute("aria-label", u ? `Contul tău: ${u.name || u.email}` : "Intră în cont");
    }
    const card = $("account-settings");
    if (card) {
        card.innerHTML = u ? `
            <div class="account-row">
                ${avatarHTML(u, "is-lg")}
                <div class="account-who"><b>${escapeHTML(u.name || u.email)}</b>${u.name ? `<small>${escapeHTML(u.email)}</small>` : ""}
                    <small class="sync-line" data-sync-status="${cloud.status}"><i class="sync-dot" aria-hidden="true"></i><span class="sync-text">${SYNC_STATUS_TEXT[cloud.status]}</span></small></div>
            </div>
            <div class="account-actions">
                <button type="button" class="btn btn-glass" data-action="sync-now">${icon("refresh")} Sincronizează acum</button>
                <button type="button" class="btn btn-glass" data-action="account-signout">${icon("undo")} Ieși din cont</button>
                <button type="button" class="btn btn-text text-danger" data-action="account-delete">${icon("trash")} Șterge contul</button>
            </div>` : `
            <p class="subtitle">Fără cont, datele stau doar în acest browser. Cu un cont (Google sau email), le ai pe orice telefon sau calculator, iar dacă browserul se golește nu pierzi nimic.</p>
            <div class="account-actions"><button type="button" class="btn btn-primary" data-action="auth-open">${icon("user")} Intră sau fă-ți cont</button></div>`;
    }
    setSyncStatus(cloud.status);
}

/* ---------- ecranul de autentificare ---------- */
const AUTH_ERRORS = {
    "auth/invalid-email": "Adresa de email nu e validă.",
    "auth/missing-email": "Scrie adresa de email.",
    "auth/missing-password": "Scrie parola.",
    "auth/user-not-found": "Email sau parolă greșite.",
    "auth/wrong-password": "Email sau parolă greșite.",
    "auth/invalid-credential": "Email sau parolă greșite.",
    "auth/invalid-login-credentials": "Email sau parolă greșite.",
    "auth/email-already-in-use": "Există deja un cont cu acest email. Intră în el sau folosește „Am uitat parola”.",
    "auth/weak-password": "Parola trebuie să aibă cel puțin 6 caractere.",
    "auth/too-many-requests": "Prea multe încercări. Așteaptă puțin și încearcă din nou.",
    "auth/network-request-failed": "Nu e conexiune la internet.",
    "auth/unauthorized-domain": "Acest site nu e încă autorizat în Firebase (Authentication → Settings → Authorized domains).",
    "auth/account-exists-with-different-credential": "Există deja un cont cu acest email, creat altfel (Google sau parolă). Intră cu metoda folosită prima dată.",
    "auth/user-disabled": "Acest cont a fost dezactivat.",
    "auth/requires-recent-login": "Din motive de siguranță, ieși din cont, intră din nou și reîncearcă."
};
const SILENT_AUTH = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
const authMessage = err => AUTH_ERRORS[err?.code] || "Nu a mers. Încearcă din nou peste câteva momente.";

const authUI = { mode: "signin", busy: false, error: "", info: "", email: "", returnFocus: null, reason: "" };

function openAuth(mode = "signin") {
    if (!cloud.api) return;
    if (!$("setup").hidden) closeSetup();
    closeActionModal();
    closeQuickAdd({ restoreFocus: false });
    closeMoreMenu({ restoreFocus: false });
    closeNotifPanel({ restoreFocus: false });
    Object.assign(authUI, { mode, busy: false, error: "", info: "", returnFocus: authUI.returnFocus || document.activeElement });
    $("auth").hidden = false;
    document.body.classList.add("modal-open");
    renderAuth();
}

function closeAuth() {
    const box = $("auth");
    if (!box || box.hidden) return;
    authUI.reason = "";
    box.hidden = true;
    if ($("action-modal").hidden && $("setup").hidden) document.body.classList.remove("modal-open");
    const back = authUI.returnFocus;
    authUI.returnFocus = null;
    if (back && document.contains(back) && back !== document.body) back.focus();
}

function renderAuth(focusId) {
    const { mode, busy, error, info, email } = authUI;
    const titles = { signin: "Intră în cont", signup: "Cont nou", reset: "Resetează parola" };
    $("auth-body").innerHTML = `
        <div class="auth-intro">
            <svg class="brand-logo auth-logo" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-logo"/></svg>
            <h2 id="auth-title" tabindex="-1">${titles[mode]}</h2>
            <p>${mode === "reset" ? "Îți trimitem pe email un link pentru o parolă nouă." : authUI.reason ? escapeHTML(authUI.reason) : "Notele tale, pe orice telefon sau calculator. Fără cont poți doar să te uiți."}</p>
        </div>
        ${mode !== "reset" ? `
            <button type="button" class="btn auth-google" data-action="auth-google" ${busy ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" aria-hidden="true" class="g-logo"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/></svg>
                Continuă cu Google
            </button>
            <div class="auth-or"><span>sau cu email</span></div>
            <div class="azi-seg auth-tabs" role="group" aria-label="Ai deja cont?">
                <button type="button" aria-pressed="${mode === "signin"}" data-action="auth-mode" data-mode="signin">Am cont</button>
                <button type="button" aria-pressed="${mode === "signup"}" data-action="auth-mode" data-mode="signup">Cont nou</button>
            </div>` : ""}
        <form class="auth-form" data-auth-form novalidate>
            ${mode === "signup" ? `
                <div class="form-group">
                    <label for="auth-name">Numele tău <span class="label-hint">(opțional)</span></label>
                    <input id="auth-name" class="glass-input" autocomplete="name" maxlength="60">
                </div>` : ""}
            <div class="form-group">
                <label for="auth-email">Email</label>
                <input id="auth-email" class="glass-input" type="email" autocomplete="email" inputmode="email" required value="${escapeHTML(email)}">
            </div>
            ${mode !== "reset" ? `
                <div class="form-group">
                    <label for="auth-pass">Parolă${mode === "signup" ? ` <span class="label-hint">(cel puțin 6 caractere)</span>` : ""}</label>
                    <div class="auth-pass">
                        <input id="auth-pass" class="glass-input" type="password" required minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}">
                        <button type="button" class="auth-eye" data-action="auth-eye" aria-label="Arată parola" aria-pressed="false">${icon("eye")}</button>
                    </div>
                </div>` : ""}
            <p class="auth-msg ${error ? "is-error" : info ? "is-info" : ""}" role="${error ? "alert" : "status"}" aria-live="polite">${escapeHTML(error || info)}</p>
            <button type="submit" class="btn btn-primary auth-submit" ${busy ? "disabled" : ""}>${busy ? "Așteaptă…" : mode === "signin" ? "Intră" : mode === "signup" ? "Creează contul" : "Trimite linkul"}</button>
        </form>
        <div class="auth-links">
            ${mode === "signin" ? `<button type="button" class="btn btn-text" data-action="auth-mode" data-mode="reset">Am uitat parola</button>` : ""}
            ${mode === "reset" ? `<button type="button" class="btn btn-text" data-action="auth-mode" data-mode="signin">${icon("undo")} Înapoi la autentificare</button>` : ""}
        </div>
        <div class="auth-foot">
            <button type="button" class="btn btn-text" data-action="auth-local">${icon("eye")} Doar mă uit, ca vizitator</button>
            <small>Ca vizitator poți răsfoi aplicația, dar nu poți adăuga sau schimba nimic.</small>
        </div>`;
    const target = focusId ? $(focusId) : (error ? ($("auth-pass") || $("auth-email")) : $("auth-email"));
    (target || $("auth-title"))?.focus({ preventScroll: true });
}

async function runAuth(task, { info = "" } = {}) {
    authUI.email = field("auth-email").trim() || authUI.email;
    authUI.busy = true;
    authUI.error = "";
    authUI.info = "";
    renderAuth();
    try {
        await task();
        authUI.busy = false;
        if (info) {
            authUI.info = info;
            renderAuth();
        }
    } catch (err) {
        authUI.busy = false;
        if (!SILENT_AUTH.has(err?.code)) authUI.error = authMessage(err);
        if (!$("auth").hidden) renderAuth();
    }
}

function submitAuth() {
    const email = field("auth-email").trim();
    const pass = field("auth-pass");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        authUI.error = AUTH_ERRORS["auth/invalid-email"];
        authUI.email = email;
        renderAuth("auth-email");
        return;
    }
    if (authUI.mode === "reset") {
        runAuth(() => cloud.api.resetPassword(email), { info: `Gata! Dacă există un cont pentru ${email}, ai primit un email cu linkul. Verifică și dosarul Spam.` });
        return;
    }
    if (pass.length < 6) {
        authUI.error = authUI.mode === "signup" ? AUTH_ERRORS["auth/weak-password"] : AUTH_ERRORS["auth/missing-password"];
        authUI.email = email;
        renderAuth("auth-pass");
        return;
    }
    if (authUI.mode === "signup") runAuth(() => cloud.api.signUpEmail(email, pass, field("auth-name").trim().slice(0, 60)));
    else runAuth(() => cloud.api.signInEmail(email, pass));
}

/* ---------- întrebări (prima conectare, conflicte) ---------- */
function syncSummaryHTML(title, data, simData, when) {
    const c = summarizeData(data, simData);
    return `
        <span class="sync-pick-title">${title}</span>
        <span class="sync-pick-meta">${escapeHTML(summaryText(c))}</span>
        ${when ? `<span class="sync-pick-meta">modificat ${escapeHTML(formatDateTime(new Date(when)))}</span>` : ""}`;
}

/** Întreabă ce date păstrăm. Întoarce o promisiune: „upload” / „fresh” sau „remote” / „local”. */
function askSync(kind, remote) {
    cloud.asking = true;
    return new Promise(resolve => {
        const done = choice => {
            cloud.asking = false;
            closeActionModal();
            resolve(choice);
        };
        cloud.resolveAsk = done;
        if (kind === "upload") {
            openModal({
                title: "Ai deja date pe acest dispozitiv",
                confirmText: "",
                cancelText: "",
                body: `
                    <p class="modal-hint">Contul tău e gol. Ce facem cu notele de aici?</p>
                    <button type="button" class="reset-option-card" data-action="sync-pick" data-pick="upload">
                        <span><span class="reset-option-title">${icon("upload")} Le urc în cont</span><span class="reset-option-hint">${escapeHTML(summaryText(summarizeData(state, sim)))} · apoi le ai pe orice dispozitiv</span></span>
                        <span class="reset-option-arrow" aria-hidden="true">→</span>
                    </button>
                    <button type="button" class="reset-option-card" data-action="sync-pick" data-pick="fresh">
                        <span><span class="reset-option-title">${icon("sparkles")} Încep cu un cont gol</span><span class="reset-option-hint">îți descarc întâi un backup cu datele de acum, ca să nu se piardă</span></span>
                        <span class="reset-option-arrow" aria-hidden="true">→</span>
                    </button>`
            });
            return;
        }
        let incoming = null;
        try { incoming = parseBackup(remote.json).loaded; } catch (_) { /* dacă nu se poate citi, rămâne varianta locală */ }
        if (!incoming) {
            done("local");
            return;
        }
        openModal({
            title: "Datele diferă",
            confirmText: "",
            cancelText: "",
            body: `
                <p class="modal-hint">Contul și acest dispozitiv au note diferite (de ex. ai lucrat offline sau pe alt telefon). Pe care le păstrezi? Celelalte vor fi înlocuite.</p>
                <button type="button" class="reset-option-card sync-pick" data-action="sync-pick" data-pick="remote">
                    <span>${syncSummaryHTML(`${icon("download")} Din cont`, incoming.data, incoming.sim, remote.updatedAt)}</span>
                    <span class="reset-option-arrow" aria-hidden="true">→</span>
                </button>
                <button type="button" class="reset-option-card sync-pick" data-action="sync-pick" data-pick="local">
                    <span>${syncSummaryHTML(`${icon("monitor")} De pe acest dispozitiv`, state, sim, null)}</span>
                    <span class="reset-option-arrow" aria-hidden="true">→</span>
                </button>
                <p class="subtitle mt-2">Nu ești sigur? Exportă întâi un backup din Setări; apoi poți alege liniștit.</p>`
        });
    });
}

/* ---------- ieșire, ștergere ---------- */
function confirmSignOut() {
    openModal({
        title: "Ieși din cont?",
        confirmText: "Ieși",
        body: `
            <p>Notele rămân în contul tău și le regăsești când intri din nou.</p>
            <label class="check-row mt-3"><input type="checkbox" id="signout-wipe"> Șterge și datele de pe acest dispozitiv</label>
            <p class="subtitle">Bifează pe un calculator sau telefon folosit și de alții.</p>`,
        onConfirm: async () => {
            const wipe = Boolean($("signout-wipe")?.checked);
            closeActionModal();
            if (cloud.dirty) await uploadNow(); // ultimele modificări ajung în cont înainte de ieșire
            try {
                await cloud.api.signOut();
            } catch (err) {
                showToast(`⚠️ ${authMessage(err)}`);
                return;
            }
            setSyncMeta({ uid: null, lastSyncAt: 0, dirty: false });
            lsSet(SYNC_KEYS.choice, null);
            if (wipe) {
                // vizitatorul nu poate schimba date, deci ștergerea se face înainte ca modul vizitator să le „înghețe”
                const wasGuest = guest.on;
                if (wasGuest) Object.assign(guest, { on: false, demo: false, base: null, fp: "" });
                applyRemoteData(null);
                if (wasGuest) enterGuest();
            }
            showToast(wipe ? "Ai ieșit din cont. Datele de pe acest dispozitiv au fost șterse." : "Ai ieșit din cont.");
        }
    });
}

function confirmDeleteAccount() {
    openModal({
        title: "Șterge contul",
        danger: true,
        confirmText: "Șterge definitiv",
        body: `
            <p>Se șterg contul <b>${escapeHTML(cloud.user?.email || "")}</b> și copia notelor din cloud. Nu se poate anula.</p>
            <p class="subtitle mt-2">Notele de pe acest dispozitiv rămân (poți exporta un backup din Setări).</p>`,
        onConfirm: async () => {
            closeActionModal();
            try {
                await cloud.api.deleteAccount();
                setSyncMeta({ uid: null, lastSyncAt: 0, dirty: false });
                lsSet(SYNC_KEYS.choice, null);
                showToast("Contul a fost șters. Notele au rămas pe acest dispozitiv.");
            } catch (err) {
                showToast(`⚠️ ${authMessage(err)}`, { duration: 6000 });
            }
        }
    });
}

function openAccountPanel() {
    if (!cloud.user) {
        openAuth();
        return;
    }
    const u = cloud.user;
    const method = u.providers.includes("google.com") ? "Google" : "email și parolă";
    openModal({
        layout: "panel",
        title: "Contul tău",
        confirmText: "",
        cancelText: "Închide",
        body: `
            <div class="account-row">
                ${avatarHTML(u, "is-lg")}
                <div class="account-who"><b>${escapeHTML(u.name || u.email)}</b>${u.name ? `<small>${escapeHTML(u.email)}</small>` : ""}<small>Intri cu ${method}</small></div>
            </div>
            <div class="account-sync-box">
                <span class="sync-line is-lg" data-sync-status="${cloud.status}"><i class="sync-dot" aria-hidden="true"></i><span class="sync-text">${SYNC_STATUS_TEXT[cloud.status]}</span></span>
                <small>${cloud.lastSyncAt ? `Ultima sincronizare: ${escapeHTML(formatDateTime(new Date(cloud.lastSyncAt)))}` : "Încă nesincronizat"}</small>
                <small>Notele se salvează în cont la câteva secunde după fiecare modificare și apar singure pe celelalte dispozitive.</small>
            </div>
            ${typeof api !== "undefined" && api.enabled ? `<div class="account-links" id="account-links"><p class="muted-small">Se încarcă…</p></div>` : ""}
            <div class="account-actions is-col">
                <button type="button" class="btn btn-glass" data-action="sync-now">${icon("refresh")} Sincronizează acum</button>
                <button type="button" class="btn btn-glass" data-action="account-signout">${icon("undo")} Ieși din cont</button>
                <button type="button" class="btn btn-text text-danger" data-action="account-delete">${icon("trash")} Șterge contul</button>
            </div>`
    });
    if (typeof api !== "undefined" && api.enabled) renderLinksBox();
}

const ACCOUNT_ACTIONS = {
    "account-open": () => openAccountPanel(),
    "auth-open": () => openAuth(),
    "auth-close": () => ACCOUNT_ACTIONS["auth-local"](), // închis fără să intre = răsfoiește ca vizitator
    "auth-mode": el => {
        authUI.email = field("auth-email").trim() || authUI.email;
        Object.assign(authUI, { mode: ["signin", "signup", "reset"].includes(el.dataset.mode) ? el.dataset.mode : "signin", error: "", info: "" });
        renderAuth();
    },
    "auth-google": () => runAuth(() => cloud.api.signInGoogle()),
    "auth-eye": el => {
        const input = $("auth-pass");
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        el.setAttribute("aria-pressed", String(show));
        el.setAttribute("aria-label", show ? "Ascunde parola" : "Arată parola");
    },
    "auth-local": () => {
        try { sessionStorage.setItem(GUEST_SESSION_KEY, "1"); } catch (_) { /* fără stocare */ }
        closeAuth();
    },
    "sync-now": async () => {
        await (cloud.needsReconcile ? reconcileWithCloud() : uploadNow());
        if (cloud.status === "synced") showToast("☁ Sincronizat.");
        if (!$("action-modal").hidden && $("action-modal-title").textContent === "Contul tău") openAccountPanel();
    },
    "sync-pick": el => cloud.resolveAsk?.(el.dataset.pick),
    "account-signout": () => confirmSignOut(),
    "account-delete": () => confirmDeleteAccount()
};

function bindAuthEvents() {
    $("auth")?.addEventListener("submit", event => {
        if (!event.target.matches("[data-auth-form]")) return;
        event.preventDefault();
        submitAuth();
    });
}
