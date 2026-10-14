/* urNotes · Vizitator (fără cont).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== VIZITATOR (fără cont: doar te uiți) ==================== */
/* Fără cont se poate răsfoi tot, dar nu se poate adăuga sau schimba nimic: orice încercare deschide
   autentificarea. Cine n-are date pe acest dispozitiv vede un caiet de exemplu, ținut doar în memorie.
   Nimic din modul vizitator nu se salvează. */
const guest = { on: false, demo: false, base: null, fp: "", restoring: false };
const GUEST_SESSION_KEY = "pro_guest_browse_v4"; // a ales „doar mă uit” în această sesiune: nu-i mai arătăm autentificarea la pornire

/** Acțiunile care doar arată ceva (navigare, filtre, vederi). Restul cer cont. */
const GUEST_OK = new Set([
    "nav", "show-date", "cal-nav", "cal-today", "cal-view", "cal-goto",
    "cat-select", "cat-step", "cat-group", "cat-back", "cat-filter", "cat-clear-filters", "open-subject", "cat-menu-glance",
    "home-day", "home-risk", "plan-day", "help", "install-hide", "bgame-start", "bgame-hit", "stats-print", "stats-insights-more", "stats-period", "stats-jump", "alert-open",
    "sim-scenario", "sim-toggle-all", "sim-pick-subject", "sim-chip-subject",
    "cmdk", "cmdk-close", "quick-add-close", "notif-open", "notif-close", "more-open", "more-close", "more-run",
    "modal-cancel", "none", "tour-start", "tour-next", "tour-back", "tour-skip", "buddy-poke",
    "account-open", "auth-open", "auth-close", "auth-mode", "auth-google", "auth-eye", "auth-local", "guest-signin"
]);
const GUEST_OK_MORE = new Set(["sim", "settings", "account", "tour", "plan"]);

/** Poate modifica? Fără conturi configurate (ex. teste locale) aplicația merge ca înainte. */
const canEdit = () => !cloud.configured || Boolean(cloud.user);

/** Când cineva fără cont încearcă să schimbe ceva: îi explicăm și îi deschidem autentificarea. */
function requireAccount() {
    if (canEdit()) return true;
    if (!cloud.seenUser && cloud.api !== null) {
        showToast("O clipă, verific dacă ești în cont…");
        return false;
    }
    if (!cloud.api) {
        showToast("⚠️ Fără internet nu poți intra în cont acum. Ca vizitator poți doar să te uiți.", { duration: 5000 });
        return false;
    }
    authUI.reason = "Ca vizitator poți doar să te uiți. Intră în cont ca să adaugi note, teste și planuri.";
    openAuth("signin");
    return false;
}

/** Ce contează ca „modificare făcută de om” (fără ce calculează aplicația singură: istoric, realizări, alerte, sesiuni generate). */
function guestFingerprint() {
    const { report, ...settings } = state.settings;
    return JSON.stringify([
        state.subjects, state.calendar, state.timetable, state.purtare.grades, state.purtare.excludeFromGPA, settings,
        state.plan.prefs, state.plan.items.filter(it => it.manual || it.done).map(it => [it.id, it.done, it.date]),
        sim.scenarios
    ]);
}

const guestSnapshot = () => JSON.parse(JSON.stringify(buildBackup().data));
function guestRestore(snap) {
    applyLoadedData(readStoredData(name => clone(snap[name] ?? null)));
}

/** Un caiet de exemplu, ca vizitatorul să vadă cum arată aplicația folosită. Datele sunt relative la azi. */
function demoData() {
    const today = getLocalDateKey();
    const k = n => addDays(today, n);
    const g = (val, type, n) => ({ val, type, date: k(n) });
    const subjects = {
        "Limba și literatura română": { ore: 4, target: 10, priority: true, grades: [g(9, "Teză", -27), g(10, "Ascultare", -15), g(9, "Test", -4)] },
        "Matematică": { ore: 4, target: 10, priority: true, grades: [g(7, "Test", -25), g(4, "Test", -9), g(6, "Ascultare", -3)] },
        "Limba engleză": { ore: 2, target: 10, grades: [g(10, "Test", -20), g(9, "Proiect", -6)] },
        "Fizică": { ore: 2, target: 9, grades: [g(8, "Test", -18), g(9, "Ascultare", -2)] },
        "Chimie": { ore: 2, target: 9, grades: [g(5, "Test", -16), g(6, "Ascultare", -5)] },
        "Biologie": { ore: 1, target: 9, grades: [g(10, "Proiect", -12)] },
        "Istorie": { ore: 2, target: 9, grades: [g(8, "Ascultare", -11), g(9, "Test", -1)] },
        "Geografie": { ore: 1, target: 9, grades: [] },
        "Informatică": { ore: 2, target: 10, grades: [g(10, "Proiect", -8)] },
        "Educație fizică și sport": { ore: 2, target: 10, grades: [g(10, "Altele", -14)] }
    };
    const ev = (id, title, type, subject, extra = {}) => ({ id, title, type, subject, ...extra });
    const calendar = {
        [k(-3)]: [ev("demo-t1", "Test chimie", "Test", "Chimie")],
        [k(1)]: [ev("demo-t2", "Test fizică – mișcarea", "Test", "Fizică", { time: "08:00" })],
        [k(2)]: [ev("demo-h1", "Eseu despre „Moara cu noroc”", "Temă", "Limba și literatura română")],
        [k(4)]: [ev("demo-e1", "Teză la matematică", "Examen", "Matematică", { time: "10:00" })],
        [k(6)]: [ev("demo-p1", "Prezentare la engleză", "Prezentare", "Limba engleză")],
        [k(9)]: [ev("demo-t3", "Test istorie", "Test", "Istorie")]
    };
    const timetable = {
        1: ["Matematică", "Fizică", "Limba și literatura română", "Limba engleză", "Istorie"],
        2: ["Chimie", "Biologie", "Matematică", "Informatică", "Educație fizică și sport"],
        3: ["Limba și literatura română", "Geografie", "Fizică", "Informatică", "Matematică"],
        4: ["Matematică", "Limba engleză", "Istorie", "Chimie", "Educație fizică și sport"],
        5: ["Limba și literatura română", "Limba engleză", "Matematică", "Biologie"]
    };
    return { subjects, calendar, timetable, plan: { prefs: { setup: true, school: 60, weekend: 90, session: 30 } } };
}

function enterGuest() {
    if (!cloud.configured || guest.on) return;
    guest.on = true;
    document.body.classList.add("is-guest");
    if (!hasLocalData()) {
        const demo = demoData();
        applyLoadedData(readStoredData(name => clone(demo[name] ?? null)));
        guest.demo = true;
    }
    guest.base = guestSnapshot();
    guest.fp = guestFingerprint();
    refresh();
    renderGuestBar();
}

/** La intrarea în cont: caietul de exemplu dispare (nu ajunge niciodată în cont), datele reale revin. */
function leaveGuest() {
    if (!guest.on) return;
    const wasDemo = guest.demo;
    Object.assign(guest, { on: false, demo: false, base: null, fp: "" });
    document.body.classList.remove("is-guest");
    if (wasDemo) loadState();
    try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch (_) { /* fără stocare */ }
    refresh();
    renderGuestBar();
    if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
}

/** Plasa de siguranță, la fiecare redesenare: o schimbare ajunsă cumva în date se anulează. */
function guestGuard() {
    if (!guest.on || guest.restoring || !guest.base) return false;
    const fp = guestFingerprint();
    if (fp === guest.fp) return false;
    guest.restoring = true;
    guestRestore(guest.base);
    guest.restoring = false;
    requireAccount();
    return true;
}

function renderGuestBar() {
    const bar = $("guest-bar");
    if (!bar) return;
    bar.hidden = !guest.on;
    if (!guest.on) {
        document.querySelectorAll("#tab-setari [data-guest-locked]").forEach(el => { el.disabled = false; el.removeAttribute("data-guest-locked"); });
        return;
    }
    bar.innerHTML = `
        <span class="guest-bar-text">${icon("eye")}<span><b>Ești vizitator.</b> ${guest.demo ? "Te uiți la un caiet de exemplu." : "Te uiți la notele de pe acest dispozitiv."} Ca să adaugi sau să schimbi ceva, intră în cont.</span></span>
        <button type="button" class="btn btn-primary btn-sm" data-action="guest-signin">Intră în cont</button>`;
    // Setările se văd, dar nu se pot schimba
    document.querySelectorAll("#tab-setari input, #tab-setari select, #tab-setari textarea").forEach(el => {
        if (!el.disabled) { el.disabled = true; el.setAttribute("data-guest-locked", ""); }
    });
}
