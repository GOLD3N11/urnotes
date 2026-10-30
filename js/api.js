/* urNotes · Stratul de date către serverul urNotes (backend/).
   Paginile nu vorbesc direct cu serverul: trec prin `api`. Cât timp api-config.js are `null`, nimic de aici nu rulează
   și aplicația merge ca înainte (datele în browser + copia din Firebase).

   Ce face serverul deocamdată (fazele 1–3 din planul de arhitectură):
   - datele școlare (anii, săptămâna de schi pe județe, examenele), publicate de administrator
   - amintirea de seară trimisă ca notificare push, chiar cu aplicația închisă
   - conturile de părinte și profesor, legate de elev printr-un cod (văd datele, nu le schimbă)
   Fazele 4–6: caietul se sincronizează notă cu notă (serversync.js), iar părinții și profesorii îl văd (viewer.js).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const API_BASE = typeof window.URNOTES_API === "string" && /^https?:\/\/[^\s]+$/.test(window.URNOTES_API) ? window.URNOTES_API.replace(/\/+$/, "") : "";
const API_TIMEOUT = 10_000;

class ApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const api = {
    enabled: Boolean(API_BASE),
    me: null, // { user, registered } de la /v1/me, după ce intri în cont

    /** O cerere către server, cu jetonul contului (dacă ești în cont). */
    async request(method, path, body, { auth = true, headers = {} } = {}) {
        if (!api.enabled) throw new ApiError(0, "off", "Serverul urNotes nu e configurat.");
        const h = { ...headers };
        if (body !== undefined) h["Content-Type"] = "application/json";
        if (auth) {
            const token = cloud.user && cloud.api?.idToken ? await cloud.api.idToken().catch(() => null) : null;
            if (!token) throw new ApiError(401, "signed_out", "Intră în cont ca să folosești serverul.");
            h.Authorization = `Bearer ${token}`;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
        let res;
        try {
            res = await fetch(`${API_BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, cache: "no-cache" });
        } catch (_) {
            throw new ApiError(0, "offline", "Serverul urNotes nu răspunde acum.");
        } finally {
            clearTimeout(timer);
        }
        if (res.status === 204 || res.status === 304) return { status: res.status, data: null, headers: res.headers };
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new ApiError(res.status, data?.error || "error", data?.message || "Serverul a refuzat cererea.");
        return { status: res.status, data, headers: res.headers };
    },

    /** Cine sunt pe server (o singură cerere; se uită la ieșirea din cont). */
    async loadMe() {
        if (api.me) return api.me;
        const { data } = await api.request("GET", "/v1/me");
        api.me = data;
        return data;
    },

    /** Are deja un caiet în copia din Firebase? (elevii de dinainte de server, pe un dispozitiv nou) */
    async hasFirebaseNotebook() {
        try {
            const remote = await cloud.api?.load?.();
            const subjects = remote && safeParseJSON(remote.json, null)?.data?.subjects;
            return isPlainObject(subjects) && Object.keys(subjects).length > 0;
        } catch (_) { return false; } // nu putem afla: întrebăm
    },

    /** Contul de pe server; la prima intrare îl creăm. Cine are deja note e elev; altfel întrebăm: elev, părinte sau profesor? */
    async ensureRole() {
        const me = await api.loadMe();
        if (me.registered) return me.user;
        const role = hasLocalData() || await api.hasFirebaseNotebook() ? "student" : await (api.rolePick ||= pickRole().finally(() => { api.rolePick = null; }));
        if (api.me?.registered) return api.me.user;
        const created = await api.request("POST", "/v1/me", { role, name: state.settings.profile.name || cloud.user?.name || "" });
        api.me = { user: created.data.user, registered: true };
        return api.me.user;
    },

    /** Pentru ce ține de caietul propriu (sincronizare, amintiri): doar un cont de elev. */
    async ensureStudent() {
        const user = await api.ensureRole();
        if (user.role !== "student") throw new ApiError(403, "not_student", "Contul acesta e de părinte sau profesor: nu are caiet propriu.");
        return user;
    }
};

/* ==================== DATELE ȘCOLARE ==================== */
/** Ia datele școlare de pe server; dacă s-au schimbat, le păstrează și le aplică imediat. */
async function refreshSchoolData() {
    if (!api.enabled) return false;
    let res;
    try {
        res = await api.request("GET", "/v1/school", undefined, { auth: false, headers: schoolRemote?.version ? { "If-None-Match": `"${schoolRemote.version}"` } : {} });
    } catch (_) { return false; } // fără server: rămân datele știute
    if (res.status === 304 || !res.data?.years) return false;
    if (res.data.version === schoolRemote?.version) return false;
    try { localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(res.data)); } catch (_) { /* fără stocare: doar în sesiunea asta */ }
    applySchoolData(res.data);
    return true;
}

/** Aplică datele noi fără reîncărcare: anii, sărbătorile, județele și examenele. */
function applySchoolData(data) {
    for (const [k, v] of Object.entries(data.years || {})) if (/^\d{4}$/.test(k) && isRemoteYear(v)) SCHOOL_YEAR_DATA[k] = v;
    for (const k of Object.keys(schoolYearCache)) delete schoolYearCache[k];
    for (const k of Object.keys(SCHOOL_HOLIDAYS)) delete SCHOOL_HOLIDAYS[k];
    for (const k of Object.keys(SCHOOL_NOTES)) delete SCHOOL_NOTES[k];
    for (let yr = FIRST_SCHOOL_YEAR; yr <= Math.max(currentSchoolYear(), FIRST_SCHOOL_YEAR) + 3; yr++) {
        Object.assign(SCHOOL_HOLIDAYS, schoolYear(yr).holidays);
        Object.assign(SCHOOL_NOTES, schoolYear(yr).notes);
    }
    applyRemoteCounties(data.counties);
    for (const [k, v] of Object.entries(data.exams || {})) if (/^\d{4}$/.test(k) && v && typeof v === "object") EXAM_CALENDAR[k] = v;
    if (typeof refresh === "function" && state?.settings) refresh();
}

/* ==================== AMINTIRI PRIN SERVER (WEB PUSH) ==================== */
const pushSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window.PushManager === "function";
const urlB64ToUint8 = s => {
    const pad = "=".repeat((4 - s.length % 4) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const apiRemind = { pushOn: false, lastSync: "", timer: 0 };

/** Abonează dispozitivul la notificările de la server (cere permisiunea doar dacă n-a fost dată). */
async function apiPushSubscribe() {
    if (!api.enabled || !cloud.user || !pushSupported() || typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    try {
        await api.ensureStudent();
        const { data } = await api.request("GET", "/v1/notifications/vapid-key", undefined, { auth: false });
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(data.publicKey) });
        await api.request("POST", "/v1/notifications/subscriptions", sub.toJSON());
        apiRemind.pushOn = true;
        return true;
    } catch (err) {
        console.warn("Notificările de la server nu au pornit:", err.message || err);
        return false;
    }
}

/** Trimite serverului setarea amintirii și textul amintirilor din următoarele 7 zile. */
async function apiSyncReminders(days) {
    if (!api.enabled || !cloud.user || !canEdit()) return;
    const r = state.settings.remind;
    const sig = JSON.stringify([r.on, r.time, r.ahead, days]);
    if (sig === apiRemind.lastSync) return;
    apiRemind.lastSync = sig; // și cât timp cererea e pe drum: nu trimitem de două ori același lucru
    try {
        await api.ensureStudent();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Bucharest";
        await api.request("PUT", "/v1/notifications/settings", { enabled: Boolean(r.on), time: r.time, timezone });
        if (r.on) await api.request("PUT", "/v1/notifications/digests", { from: getLocalDateKey(), days });
        if (r.on && !apiRemind.pushOn) apiPushSubscribe();
    } catch (err) {
        if (apiRemind.lastSync === sig) apiRemind.lastSync = ""; // reîncercăm la următoarea salvare
        if (err.code !== "offline") console.warn("Amintirile nu au ajuns pe server:", err.message || err);
    }
}
/** Amintirea zilei a fost arătată în aplicație: serverul n-o mai trimite și ca notificare. */
function apiReminderShown(day) {
    if (!api.enabled || !cloud.user) return;
    api.ensureStudent().then(() => api.request("POST", "/v1/notifications/shown", { day })).catch(() => {});
}

// notificarea a venit cât aplicația era în față: lucrătorul ne-o dă nouă, o arătăm ca mesaj
if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", event => {
        const d = event.data;
        if (d?.type !== "urn-push" || !d.title) return;
        markRemindShown(d.day || getLocalDateKey());
        deliverReminder({ title: d.title, body: d.body || "", until: addDays(getLocalDateKey(), 1) });
    });
}

/* ==================== ROLUL CONTULUI ==================== */
const ROLE_TEXT = { student: "elev", parent: "părinte", teacher: "profesor" };
/** Prima intrare cu un cont nou (și fără note pe dispozitiv): cine folosește aplicația? */
function pickRole() {
    cloud.asking = true; // întrebarea are nevoie de un răspuns
    return new Promise(resolve => {
        cloud.resolveRole = role => {
            cloud.asking = false;
            cloud.resolveRole = null;
            closeActionModal();
            resolve(role);
        };
        const card = (role, emoji, title, hint) => `
            <button type="button" class="reset-option-card" data-action="role-pick" data-role="${role}">
                <span><span class="reset-option-title">${emoji} ${title}</span><span class="reset-option-hint">${hint}</span></span>
                <span class="reset-option-arrow" aria-hidden="true">→</span>
            </button>`;
        openModal({
            title: "Cine folosește urNotes?",
            confirmText: "",
            cancelText: "",
            guestOk: true,
            body: `<p class="modal-hint">Alege o singură dată; contul rămâne așa.</p>
                ${card("student", "🎒", "Sunt elev", "îmi țin notele, testele și planul de învățat")}
                ${card("parent", "👪", "Sunt părinte", "văd notele copilului, cu un cod primit de la el (fără să le pot schimba)")}
                ${card("teacher", "🧑‍🏫", "Sunt profesor", "fac clase, pun teste în calendarul elevilor și le văd notele")}`
        });
    });
}

/* ==================== PĂRINȚI ȘI PROFESORI ==================== */
/** Secțiunea din panoul contului: codurile pentru părinți/profesori și cine îți vede datele. */
async function renderLinksBox() {
    const box = $("account-links");
    if (!box) return;
    try {
        const me = await api.ensureRole();
        const { data } = await api.request("GET", "/v1/me/links");
        const rel = { parent: "părinte", teacher: "profesor" };
        if (me.role !== "student") {
            box.innerHTML = `
                <h3 class="account-sub">${icon("user")} Elevii pe care îi urmărești</h3>
                <p class="subtitle">Cont de ${ROLE_TEXT[me.role]}: vezi notele și calendarul elevilor legați de tine, fără să le poți schimba.</p>
                ${data.links.length ? `<ul class="links-list">${data.links.map(l => `
                    <li><span><b>${escapeHTML(l.name || l.email)}</b><small>${l.email && l.name ? escapeHTML(l.email) : "elev"}</small></span>
                        <button type="button" class="btn btn-text btn-sm text-danger" data-action="link-remove" data-student="${escapeHTML(l.studentId)}" data-viewer="${escapeHTML(me.id)}">Nu mai urmări</button></li>`).join("")}</ul>`
                    : `<p class="muted-small">Încă nu urmărești niciun elev.</p>`}
                <div class="account-actions">
                    <button type="button" class="btn btn-glass btn-sm" data-action="viewer-code">${icon("plus")} Am un cod de la un elev</button>
                    ${me.role === "teacher" ? `<button type="button" class="btn btn-glass btn-sm" data-action="classes-open">${icon("user")} Clasele mele</button>` : ""}
                </div>`;
            return;
        }
        box.innerHTML = `
            <h3 class="account-sub">${icon("user")} Părinți și profesori</h3>
            <p class="subtitle">Cei legați de tine vor putea vedea notele și calendarul tău oricând, dar nu vor putea schimba nimic. Doar tu (și importul din Adservio, dacă îl pornești) modifici datele.</p>
            ${data.links.length ? `<ul class="links-list">${data.links.map(l => `
                <li><span><b>${escapeHTML(l.name || l.email)}</b><small>${rel[l.relation]}${l.email && l.name ? ` · ${escapeHTML(l.email)}` : ""}</small></span>
                    <button type="button" class="btn btn-text btn-sm text-danger" data-action="link-remove" data-student="${escapeHTML(me.id)}" data-viewer="${escapeHTML(l.viewerId)}">Scoate</button></li>`).join("")}</ul>`
                : `<p class="muted-small">Nimeni nu îți vede încă datele.</p>`}
            <div class="account-actions">
                <button type="button" class="btn btn-glass btn-sm" data-action="link-invite" data-relation="parent">${icon("plus")} Cod pentru un părinte</button>
                <button type="button" class="btn btn-glass btn-sm" data-action="link-invite" data-relation="teacher">${icon("plus")} Cod pentru un profesor</button>
            </div>
            <div id="link-code" aria-live="polite"></div>
            <div id="account-classes"></div>`;
        renderStudentClasses();
    } catch (err) {
        box.innerHTML = `<p class="muted-small">${escapeHTML(err.code === "offline" ? "Serverul urNotes nu răspunde acum; încearcă mai târziu." : err.message)}</p>`;
    }
}

Object.assign(ACTIONS, {
    "role-pick": el => cloud.resolveRole?.(ROLE_TEXT[el.dataset.role] ? el.dataset.role : "student"),
    "link-invite": async el => {
        const out = $("link-code");
        try {
            const { data } = await api.request("POST", "/v1/me/invites", { relation: el.dataset.relation });
            const code = `${data.code.slice(0, 4)}-${data.code.slice(4)}`;
            if (out) out.innerHTML = `<p class="link-code"><b>${escapeHTML(code)}</b><small>Dă-i codul ${el.dataset.relation === "parent" ? "părintelui" : "profesorului"}; îl folosește o singură dată, în ${escapeHTML(String(Math.round((Date.parse(data.expiresAt) - Date.now()) / 86_400_000)))} zile.</small></p>`;
        } catch (err) {
            showToast(`⚠️ ${err.message}`);
        }
    },
    "link-remove": async el => {
        try {
            await api.request("DELETE", `/v1/links/${encodeURIComponent(el.dataset.student)}/${encodeURIComponent(el.dataset.viewer)}`);
            const mine = api.me?.user?.role === "student";
            showToast(mine ? "✓ Nu-ți mai vede datele." : "✓ Nu mai urmărești acest elev.");
            renderLinksBox();
            if (!mine && typeof viewerReload === "function") viewerReload();
        } catch (err) {
            showToast(`⚠️ ${err.message}`);
        }
    }
});

/* ==================== PORNIREA ==================== */
if (api.enabled) {
    // datele școlare: la pornire și apoi o dată pe zi cât aplicația e deschisă
    setTimeout(refreshSchoolData, 1500);
    setInterval(refreshSchoolData, 24 * 3600 * 1000);
    // când intri în cont: contul de pe server și abonamentul push (dacă amintirile sunt pornite)
    window.addEventListener("urnotes-cloud", () => setTimeout(() => {
        if (cloud.user && state.settings.remind?.on && api.me?.user?.role === "student") apiPushSubscribe();
    }, 2000));
}
