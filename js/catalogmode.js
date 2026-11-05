/* urNotes · Catalogul online. Cu serverul configurat (api-config.js), aplicația se deschide cu contul de la școală:
   - fără cont: doar intrarea (pagina Școala), restul aplicației e închis;
   - elevul își vede notele puse de profesori (Note, Progres, Azi), dar nu poate adăuga sau schimba nimic;
   - părintele vede notele copiilor lui (cu alegerea copilului în bandă, dacă are mai mulți);
   - profesorii și administratorii lucrează în pagina Școala (catalogul profesorului, clasele, conturile).
   Notele vin doar de la server și stau doar în memorie: nimic din catalog nu se salvează pe dispozitiv.
   Fără server (ex. testele locale), fișierul nu face nimic.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const catalogMode = (() => {
    const enabled = () => Boolean(window.URNOTES_API) && typeof schoolAccount !== "undefined";
    const PICK_KEY = "urn_cat_child";
    const POLL = 60_000;
    const KIND_TO_TYPE = { Oral: "Ascultare", Test: "Test", Lucrare: "Test", "Teză": "Teză", "Temă": "Temă", Proiect: "Proiect", Altele: "Altele" };
    const STAFF = ["ceo", "data_operator", "schools_admin", "school_admin", "teacher"];
    const M = { me: null, children: [], child: "", poll: 0, loading: false, fp: "", wanted: "", notices: [], vapid: null };
    const role = () => M.me?.account.role || "";
    const isStaff = () => STAFF.includes(role());
    const active = () => Boolean(M.me);
    const req = (m, p) => schoolAccount.request(m, p);

    /* ---------- închis până la intrare ---------- */
    function lock() {
        document.body.classList.add("cat-mode", "cat-locked");
        document.body.classList.remove("cat-staff", "cat-reader");
        // pagina cerută prin adresă (…/urnotes/note) sau cea deschisă acum: acolo ajunge după intrare
        const fromPath = typeof appRoutes !== "undefined" ? appRoutes.ROUTES[appRoutes.slugFromPath()] : "";
        if (!M.wanted) M.wanted = fromPath || (typeof ui !== "undefined" ? ui.activeTab : "");
        if (typeof ui !== "undefined" && ui.activeTab !== "tab-scoala") switchTab("tab-scoala");
    }

    /* ---------- notele de la server → caietul aplicației (doar în memorie) ---------- */
    function toSubjects(cat) {
        const subjects = {};
        (cat?.subjects || []).forEach(s => {
            subjects[s.subject] = {
                ore: 2, target: 10, priority: false, excludeFromGPA: false,
                grades: s.grades.map(g => ({ id: g.id, val: g.value, type: KIND_TO_TYPE[g.kind] || "Altele", date: g.date }))
            };
        });
        return subjects;
    }
    /** Orarul clasei (de la administratorul școlii) → orarul aplicației: pentru fiecare zi, materiile în ordinea orelor. */
    function toTimetable(tt) {
        const out = {};
        (tt?.cells || []).slice().sort((a, b) => a.day - b.day || a.hour - b.hour).forEach(c => { (out[c.day] ||= []).push(c.subject); });
        return out;
    }
    /* Elevul și părintele au un caiet obișnuit, salvat pe dispozitiv: calendarul, planul, notițele, scenariile din
       „Ce-ar fi dacă”, examenele și setările sunt ale lor. Doar ce vine de la școală (materiile cu notele, orarul,
       purtarea) se ia de la server la fiecare verificare și nu se poate schimba aici. Preferințele lor pe materie
       (ținta, prioritatea, iconița, notițele, „nu intră în medie”) rămân. */
    const OWNER_KEY = "urn_cat_owner";
    const KEEP = ["target", "priority", "excludeFromGPA", "notes", "icon"];
    function mergeSubjects(cat, tt) {
        const prev = state.subjects || {};
        const hours = {};
        (tt?.cells || []).forEach(c => { hours[c.subject] = (hours[c.subject] || 0) + 1; });
        const out = toSubjects(cat);
        Object.entries(out).forEach(([mat, sub]) => {
            const old = prev[mat];
            if (old) KEEP.forEach(k => { if (old[k] !== undefined) sub[k] = old[k]; });
            if (hours[mat]) sub.ore = hours[mat]; // orele pe săptămână, din orarul clasei
        });
        return out;
    }
    function apply(cat, tt = null) {
        const data = clone(buildBackup().data);
        data.subjects = mergeSubjects(cat, tt);
        data.timetable = toTimetable(tt);
        data.purtare = { grades: {}, excludeFromGPA: true }; // purtarea nu e (încă) în catalogul școlii: nu intră în medie
        data.settings.profile = { ...data.settings.profile, name: data.settings.profile?.name || (cat?.student.displayName || M.me.account.displayName).split(" ")[0] };
        applyLoadedData(readStoredData(name => clone(data[name] ?? null)));
        M.quiet = Boolean(M.fresh);
        M.fresh = false;
        try { refresh(); } finally { M.quiet = false; } // salvează (saveState) și redesenează
        if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
    }
    /** Caietul de pe dispozitiv e al acestui cont? Dacă nu (alt elev pe același calculator), îl golim întâi. */
    function claimDevice(owner) {
        let was = "";
        try { was = localStorage.getItem(OWNER_KEY) || ""; } catch (_) { /* fără stocare */ }
        if (was === owner) return;
        M.fresh = true; // caiet nou pe acest dispozitiv: fără sărbători pentru notele de dinainte
        clearNotebookStorage();
        try { localStorage.setItem(OWNER_KEY, owner); } catch (_) { /* fără stocare */ }
        loadState();
        // pragul de risc implicit (8) e prea sus pentru catalog: la prima intrare îl punem la 5 (corigență); se schimbă din Setări
        if (state.settings.calc?.riskThreshold === 8) state.settings.calc.riskThreshold = 5;
    }
    function releaseDevice() {
        clearNotebookStorage();
        try { localStorage.removeItem(OWNER_KEY); } catch (_) { /* fără stocare */ }
        loadState();
        refresh();
    }

    async function load(force = false) {
        if (!active() || isStaff() || M.loading) return;
        M.loading = true;
        try {
            let cat = null, tt = null;
            if (role() === "student") [cat, tt] = await Promise.all([req("GET", "/v2/me/catalog"), req("GET", "/v2/me/timetable").catch(() => null)]);
            else if (role() === "parent") {
                M.children = (await req("GET", "/v2/me/children")).children;
                let saved = "";
                try { saved = localStorage.getItem(PICK_KEY) || ""; } catch (_) { /* fără stocare */ }
                const pick = M.children.find(c => c.id === M.child) || M.children.find(c => c.id === saved) || M.children[0];
                M.child = pick?.id || "";
                if (M.child) [cat, tt] = await Promise.all([req("GET", `/v2/students/${M.child}/catalog`), req("GET", `/v2/me/timetable?student=${M.child}`).catch(() => null)]);
            }
            const fp = JSON.stringify([cat?.subjects || [], tt?.cells || []]) + M.child;
            if (force || fp !== M.fp) { M.fp = fp; apply(cat, tt); }
            renderGuestBar();
        } catch (e) {
            if (force && e.status !== 401) showToast(`⚠️ ${e.message}`);
        } finally { M.loading = false; }
    }

    /* ---------- anunțurile (o notă schimbată sau ștearsă), în clopoțel ---------- */
    async function loadNotices() {
        if (!active()) return;
        try {
            const r = await req("GET", "/v2/me/notifications");
            M.notices = r.notifications || [];
            M.vapid = r.vapidPublicKey || null;
            renderAlerts();
            renderNotificationBadge();
        } catch (_) { /* încercăm la următoarea verificare */ }
    }
    const fmtWhen = iso => {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    const oldAlerts = renderAlerts;
    renderAlerts = function catalogAlerts() {
        oldAlerts();
        const cont = $("alerte-container");
        if (!cont || !active() || !M.notices.length) return;
        cont.insertAdjacentHTML("afterbegin", M.notices.slice(0, 30).map(n => `
            <div class="alert-card info cat-notice ${n.seen ? "" : "unread"}">
                <span class="alert-open">${icon("note", "alert-ico")}<span><b>${escapeHTML(n.title)}</b><small>${escapeHTML(n.body)} · ${fmtWhen(n.createdAt)}</small></span></span>
            </div>`).join(""));
    };
    const oldBadge = renderNotificationBadge;
    renderNotificationBadge = function catalogBadge() {
        oldBadge();
        const extra = active() ? M.notices.filter(n => !n.seen).length : 0;
        if (!extra) return;
        const badge = $("notif-badge");
        if (!badge) return;
        const n = (Number(badge.hidden ? 0 : badge.textContent) || 0) + extra;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.hidden = false;
    };
    const oldOpen = openNotifPanel;
    openNotifPanel = function catalogOpenNotif(...args) {
        const out = oldOpen.apply(this, args);
        if (active() && M.notices.some(n => !n.seen)) {
            schoolAccount.request("POST", "/v2/me/notifications/seen", {}).then(() => {
                M.notices = M.notices.map(n => ({ ...n, seen: true }));
                setTimeout(() => { renderNotificationBadge(); renderAlerts(); }, 1500);
            }).catch(() => {});
        }
        return out;
    };

    /* ---------- notificările pe telefon ---------- */
    const pushSupported = () => "serviceWorker" in navigator && typeof window.PushManager === "function" && typeof Notification !== "undefined";
    const b64 = s => { const pad = "=".repeat((4 - s.length % 4) % 4); const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
    async function pushState() {
        if (!pushSupported()) return "unsupported";
        if (Notification.permission === "denied") return "denied";
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        return sub && Notification.permission === "granted" ? "on" : "off";
    }
    async function enablePush() {
        if (!pushSupported()) throw new Error("Browserul acesta nu primește notificări. Pe iPhone, adaugă întâi aplicația pe ecranul principal.");
        if (!M.vapid) await loadNotices();
        if (!M.vapid) throw new Error("Serverul nu trimite încă notificări pe telefon.");
        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("Notificările nu au fost permise. Le poți porni din setările browserului.");
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(M.vapid) });
        await schoolAccount.request("POST", "/v2/me/push", sub.toJSON());
    }
    async function disablePush() {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (!sub) return;
        await schoolAccount.request("DELETE", `/v2/me/push?endpoint=${encodeURIComponent(sub.endpoint)}`).catch(() => {});
        await sub.unsubscribe();
    }

    /* ---------- schimbarea contului ---------- */
    function onAccount(me) {
        if (!enabled()) return;
        const was = M.me?.account.id || "";
        M.me = me || null;
        clearInterval(M.poll);
        if (!M.me) {
            const wasReader = was && !document.body.classList.contains("cat-staff");
            Object.assign(M, { children: [], child: "", fp: "", notices: [] });
            renderNotificationBadge();
            if (guest.viewer) leaveViewer();
            if (wasReader) releaseDevice(); // la ieșire, caietul elevului nu rămâne pe dispozitiv
            lock();
            return;
        }
        if (was && was !== M.me.account.id) Object.assign(M, { children: [], child: "", fp: "" });
        const wasLocked = document.body.classList.contains("cat-locked");
        document.body.classList.remove("cat-locked");
        document.body.classList.toggle("cat-staff", isStaff());
        document.body.classList.toggle("cat-reader", !isStaff());
        if (isStaff()) {
            // profesorii și administratorii n-au caiet: lucrează la Școala (modul doar-citire, gol, nesalvat)
            if (!guest.viewer) { Object.assign(guest, { on: true, demo: false, viewer: true }); document.body.classList.add("is-guest", "is-viewer"); }
            guest.restoring = true;
            try { applyLoadedData(readStoredData(name => (name === "settings" ? clone(state.settings) : null))); guest.base = guestSnapshot(); guest.fp = guestFingerprint(); }
            finally { guest.restoring = false; }
            refresh();
        } else {
            if (guest.viewer) leaveViewer();
            claimDevice(role() === "parent" ? `p:${M.me.account.id}` : `s:${M.me.account.id}`);
            load(true);
        }
        loadNotices();
        M.poll = setInterval(() => { if (document.visibilityState === "visible") { load(); loadNotices(); } }, POLL);
        renderGuestBar();
        // după intrare: elevul și părintele ajung la pagina cerută (sau Azi), profesorii și administratorii la Școala
        if (wasLocked) {
            const go = isStaff() ? "tab-scoala" : (M.wanted && M.wanted !== "tab-scoala" ? M.wanted : "tab-dashboard");
            M.wanted = "";
            if (ui.activeTab !== go) switchTab(go);
        }
    }

    function barHTML() {
        if (isStaff()) {
            return `<span class="guest-bar-text">${icon("graduation")}<span><b>${escapeHTML(M.me.account.displayName)}</b> · lucrezi în pagina Școala.</span></span>`;
        }
        const kid = M.children.find(c => c.id === M.child);
        const chips = M.children.length > 1 ? `<span class="viewer-chips">${M.children.map(c => `
            <button type="button" class="chip${c.id === M.child ? " is-on" : ""}" data-action="cat-child" data-id="${escapeHTML(c.id)}" aria-pressed="${c.id === M.child}">${escapeHTML(c.displayName.split(" ")[0])}</button>`).join("")}</span>` : "";
        const text = role() === "parent"
            ? (kid ? `<b>${escapeHTML(kid.displayName)}${kid.className ? ` · ${escapeHTML(kid.className)}` : ""}</b> · notele le pun doar profesorii.` : `<b>Încă nu ești legat de niciun elev.</b> Cere-i administratorului școlii să te lege de copilul tău.`)
            : `<b>Catalogul tău.</b> Notele și orarul vin de la școală; restul (calendarul, planul, notițele) e al tău.`;
        return `<span class="guest-bar-text">${icon("eye")}<span>${text}</span></span>${chips}`;
    }

    // banda de sus: a catalogului (elevul și părintele nu mai sunt în modul vizitator, așa că o desenăm noi)
    const oldBar = viewerBarHTML;
    viewerBarHTML = () => (active() ? barHTML() : oldBar());
    const oldGuestBar = renderGuestBar;
    renderGuestBar = function catalogGuestBar() {
        oldGuestBar();
        const bar = $("guest-bar");
        if (!bar || !active() || isStaff()) return;
        bar.hidden = false;
        bar.classList.add("is-viewer");
        bar.innerHTML = barHTML();
    };
    const oldRequire = requireAccount;
    requireAccount = () => {
        if (!active()) return oldRequire();
        if (!isStaff()) return true; // elevul și părintele își schimbă caietul lor; ce e al școlii e oprit separat (mai jos)
        showToast("Notele se pun din pagina Școala → Catalog.", { duration: 4500 });
        return false;
    };
    // fără configurarea de început (materiile vin de la școală)
    if (enabled()) {
        const oldOffer = shouldOfferSetup;
        shouldOfferSetup = () => false;
        void oldOffer;
    }
    // în catalog, paginile caietului sunt închise până la intrare; profesorii n-au pagini de caiet
    const STAFF_TABS = new Set(["tab-scoala", "tab-setari"]);
    if (enabled() && typeof switchTab === "function") {
        const original = switchTab;
        switchTab = function catalogSwitchTab(tab, ...rest) {
            if (document.body.classList.contains("cat-locked") && tab !== "tab-scoala") { M.wanted = tab; tab = "tab-scoala"; }
            else if (active() && isStaff() && !STAFF_TABS.has(tab)) tab = "tab-scoala";
            return original.call(this, tab, ...rest);
        };
    }

    /* Prima încărcare a catalogului pe un dispozitiv: realizările și nivelul colegului se socotesc în liniște
       (altfel „3 realizări noi” și „nivelul 3” ar apărea la fiecare intrare pe un telefon nou). */
    const oldAch = checkAchievements;
    checkAchievements = function catalogAchievements() {
        if (!M.quiet) return oldAch();
        if (metrics.totalGrades) ACHIEVEMENTS.forEach(a => { if (!state.achievements[a.key] && a.test(metrics)) state.achievements[a.key] = true; });
    };
    const oldPal = checkPalLevel;
    checkPalLevel = function catalogPal() {
        if (!M.quiet) return oldPal();
        state.pal.seenLevel = Math.max(state.pal.seenLevel || 0, palProgress().level);
    };
    // purtarea nu vine (încă) de la școală: nu o arătăm ca pe o notă
    const oldPurtare = purtareVisibleInList;
    purtareVisibleInList = () => (active() && !isStaff() ? false : oldPurtare());

    /* Ce ține de școală nu se schimbă din aplicația elevului sau a părintelui. */
    const SCHOOL_OWNED = ["add-grade", "edit-grade", "delete-grade", "quick-grade", "quick-grade-add", "quick-grade-more", "event-grade", "event-quick-grade",
        "cat-menu-grade", "cat-menu-edit", "add-subject", "edit-subject", "delete-subject", "side-add-subject", "cc-subject-new", "programme-change",
        "purtare-edit", "purtare-reset", "purtare-settings", "purtare-toggle-gpa", "timetable", "tt-cell", "tt-clear", "tt-copy", "tt-move", "tt-remove", "tt-slot", "tt-tap",
        "setup-open", "backup-import", "backup-undo", "reset-menu", "reset-option", "year-close", "year-delete"];
    const reader = () => active() && !isStaff();
    const readerToast = () => showToast(role() === "parent" ? "📘 Notele, materiile și orarul le pune școala. Aici le vezi." : "📘 Notele, materiile și orarul vin de la școală. Le vezi aici, dar le schimbă doar profesorii și administratorul.", { duration: 4500 });
    SCHOOL_OWNED.forEach(name => {
        const fn = ACTIONS[name];
        if (typeof fn !== "function") return;
        ACTIONS[name] = function schoolOwned(...args) { if (reader()) { readerToast(); return; } return fn.apply(this, args); };
    });
    // bara din Calendar poate pune și o notă („9 la mate azi”): pentru elev și părinte, doar evenimente
    if (typeof ccSubmitGrade === "function") {
        const oldGrade = ccSubmitGrade;
        ccSubmitGrade = function catalogCcGrade(...args) { if (reader()) { readerToast(); return; } return oldGrade.apply(this, args); };
    }
    if (typeof ccFromText === "function") {
        const oldFrom = ccFromText;
        ccFromText = function catalogCcFromText(...args) {
            const out = oldFrom.apply(this, args);
            if (reader() && cc.type === CC_GRADE) { cc.type = "Test"; renderCompose(); }
            return out;
        };
    }
    if (typeof ACTIONS.qa === "function") {
        const qa = ACTIONS.qa;
        ACTIONS.qa = function catalogQa(el, ...rest) {
            if (reader() && ["grade", "subject", "setup"].includes(el?.dataset?.kind)) { readerToast(); return; }
            return qa.call(this, el, ...rest);
        };
    }
    if (typeof ACTIONS["more-run"] === "function") {
        const mr = ACTIONS["more-run"];
        ACTIONS["more-run"] = function catalogMore(el, ...rest) {
            if (reader() && el?.dataset?.kind === "setup") { readerToast(); return; }
            return mr.call(this, el, ...rest);
        };
    }

    ACTIONS["cat-child"] = btn => {
        M.child = btn.dataset.id;
        try { localStorage.setItem(PICK_KEY, M.child); } catch (_) { /* fără stocare */ }
        M.fp = "";
        load(true);
    };
    GUEST_OK.add("cat-child");
    // conturile vechi (Google / email) nu mai există: butoanele de cont duc la contul de la școală
    if (enabled()) ["account-open", "auth-open", "guest-signin"].forEach(name => { ACTIONS[name] = () => switchTab("tab-scoala"); });

    if (enabled()) {
        document.body?.classList.add("cat-mode", "cat-locked");
        window.addEventListener("urn-school-account", e => onAccount(e.detail.me));
        window.addEventListener("DOMContentLoaded", () => { document.body.classList.add("cat-mode", "cat-locked"); });
        window.addEventListener("load", () => { if (!M.me) { lock(); schoolAccount.start(); } });
    }
    return { enabled, get active() { return active(); }, get role() { return role(); }, get child() { return M.child; }, reload: () => load(true), notices: loadNotices, pushState, enablePush, disablePush };
})();
