/* urNotes · Ce a rămas din conturile vechi, după trecerea la catalogul școlii.
   Conturile cu Google și email, caietul personal sincronizat pe server și modul vechi părinte/profesor au fost scoase.
   Aici rămân doar numele pe care restul aplicației le mai folosește (ca să meargă la fel cu sau fără server),
   plus datele școlare publice (anii, vacanțele, examenele), luate de pe server când există.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- fără conturi vechi ---------- */
const SYNC_KEYS = { meta: "pro_sync_meta_v4", device: "pro_device_id_v4", choice: "pro_auth_choice_v4" };
const cloud = { configured: false, api: null, user: null, seenUser: true, status: "local", asking: false };
function lsGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function lsSet(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { /* fără stocare */ }
}
const hasLocalData = () => Object.keys(state.subjects).length > 0 || Object.keys(state.calendar).length > 0 || state.archive.length > 0;
const authUI = { reason: "", legacy: false };
const goSchool = () => (typeof switchTab === "function" ? switchTab("tab-scoala") : null);
function openAuth() { goSchool(); }
function closeAuth() { /* nu mai există fereastra conturilor vechi */ }
function openAccountPanel() { goSchool(); }
function bindAuthEvents() { /* nimic de legat */ }
function initCloud() { /* catalogul (js/catalogmode.js) se ocupă de intrare */ }
function onLocalDataChange() { /* nu se mai urcă nimic pe server */ }
function setSyncStatus() { /* nu mai există sincronizare */ }
function renderAccount() { /* contul e în pagina Școala */ }
const ACCOUNT_ACTIONS = {};

/* ---------- modul „doar citire”: îl folosește catalogul pentru elevi, părinți și personal ---------- */
const viewer = { user: null, students: [], current: "" };
function viewerBarHTML() { return ""; }
/** Ieșirea din modul doar-citire: notele din catalog dispar din memorie; pe dispozitiv nu rămâne nimic din ele. */
function leaveViewer() {
    if (!guest.viewer) return;
    Object.assign(guest, { on: false, demo: false, base: null, fp: "", viewer: false });
    document.body.classList.remove("is-guest", "is-viewer", "viewer-empty");
    loadState();
    refresh();
    renderGuestBar();
    if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
}

/* ---------- caietele vechi de pe dispozitiv: șterse o singură dată ---------- */
/* Înainte de catalog, fiecare elev își ținea notele în browser. Acum notele sunt doar ale școlii: la prima deschidere
   după schimbare, tot ce era scris de mână pe acest dispozitiv (note, calendar, orar, plan, arhivă) se șterge.
   Rămân setările de aspect. Rulează doar cu serverul configurat (pe site), nu în testele locale. */
const NOTEBOOK_WIPE_KEY = "urn_notebook_wiped_v1";
function wipeOldNotebook() {
    if (!window.URNOTES_API) return false;
    try {
        if (localStorage.getItem(NOTEBOOK_WIPE_KEY)) return false;
        // tot ce era caiet; rămân setările, colegul (aspectul lui) și ce ține de pornire
        const notebook = ["subjects", "calendar", "alerts", "activity", "achievements", "history", "alertMeta", "simulator",
            "backupUndo", "lastExport", "timetable", "purtare", "plan", "archive", "exams"].map(k => KEYS[k]).filter(Boolean);
        const drop = [...notebook, ...Object.values(SYNC_KEYS), "urn_viewer_pick_v1"].filter(k => localStorage.getItem(k) !== null);
        drop.forEach(k => localStorage.removeItem(k));
        localStorage.setItem(NOTEBOOK_WIPE_KEY, new Date().toISOString());
        return drop.length > 0;
    } catch (_) { return false; }
}
wipeOldNotebook(); // înainte ca aplicația să citească datele (storage.js le citește la pornire, în boot.js)

/* ---------- datele școlare publice ---------- */
const API_BASE = typeof window.URNOTES_API === "string" && /^https?:\/\/[^\s]+$/.test(window.URNOTES_API) ? window.URNOTES_API.replace(/\/+$/, "") : "";
/** Ia datele școlare de pe server; dacă s-au schimbat, le păstrează și le aplică imediat. */
async function refreshSchoolData() {
    if (!API_BASE) return false;
    let res;
    try {
        res = await fetch(`${API_BASE}/v1/school`, { cache: "no-cache", headers: schoolRemote?.version ? { "If-None-Match": `"${schoolRemote.version}"` } : {} });
    } catch (_) { return false; }
    if (res.status === 304 || !res.ok) return false;
    const data = await res.json().catch(() => null);
    if (!data?.years || data.version === schoolRemote?.version) return false;
    try { localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(data)); } catch (_) { /* fără stocare */ }
    applySchoolData(data);
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
if (API_BASE) {
    setTimeout(refreshSchoolData, 1500);
    setInterval(refreshSchoolData, 24 * 3600 * 1000);
}

/* ---------- o notificare venită cât aplicația e în față: o arătăm ca mesaj ---------- */
if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", event => {
        const d = event.data;
        if (d?.type !== "urn-push" || !d.title) return;
        if (typeof showToast === "function") showToast(`🔔 ${d.title}${d.body ? ` · ${d.body}` : ""}`, { duration: 6000 });
        if (typeof catalogMode !== "undefined") catalogMode.notices?.();
    });
}
