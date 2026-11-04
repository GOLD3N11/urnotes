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
    const STAFF = ["ceo", "schools_admin", "school_admin", "teacher"];
    const M = { me: null, children: [], child: "", poll: 0, loading: false, fp: "", wanted: "" };
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
    function apply(cat) {
        const settings = clone(state.settings);
        settings.profile = { ...settings.profile, name: (cat?.student.displayName || M.me.account.displayName).split(" ")[0] };
        // purtarea nu e (încă) în catalogul școlii: nu intră în medie, ca media să fie doar din notele profesorilor
        const data = { meta: { schema: DATA_SCHEMA }, settings, subjects: toSubjects(cat), purtare: { grades: {}, excludeFromGPA: true } };
        guest.restoring = true;
        try {
            applyLoadedData(readStoredData(name => clone(data[name] ?? null)));
            ui.catalog = { ...ui.catalog, selected: "", showDetail: false };
            guest.base = guestSnapshot();
            guest.fp = guestFingerprint();
        } finally { guest.restoring = false; }
        refresh();
        guest.fp = guestFingerprint();
        guest.base = guestSnapshot();
        if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
    }

    async function load(force = false) {
        if (!active() || isStaff() || M.loading) return;
        M.loading = true;
        try {
            let cat = null;
            if (role() === "student") cat = await req("GET", "/v2/me/catalog");
            else if (role() === "parent") {
                M.children = (await req("GET", "/v2/me/children")).children;
                let saved = "";
                try { saved = localStorage.getItem(PICK_KEY) || ""; } catch (_) { /* fără stocare */ }
                const pick = M.children.find(c => c.id === M.child) || M.children.find(c => c.id === saved) || M.children[0];
                M.child = pick?.id || "";
                if (M.child) cat = await req("GET", `/v2/students/${M.child}/catalog`);
            }
            const fp = JSON.stringify(cat?.subjects || []) + M.child;
            if (force || fp !== M.fp) { M.fp = fp; apply(cat); }
            renderGuestBar();
        } catch (e) {
            if (force && e.status !== 401) showToast(`⚠️ ${e.message}`);
        } finally { M.loading = false; }
    }

    /* ---------- schimbarea contului ---------- */
    function onAccount(me) {
        if (!enabled()) return;
        const was = M.me?.account.id || "";
        M.me = me || null;
        clearInterval(M.poll);
        if (!M.me) {
            Object.assign(M, { children: [], child: "", fp: "" });
            if (guest.viewer) leaveViewer();
            lock();
            return;
        }
        if (was && was !== M.me.account.id) Object.assign(M, { children: [], child: "", fp: "" });
        const wasLocked = document.body.classList.contains("cat-locked");
        document.body.classList.remove("cat-locked");
        document.body.classList.toggle("cat-staff", isStaff());
        document.body.classList.toggle("cat-reader", !isStaff());
        if (!guest.viewer) {
            Object.assign(guest, { on: true, demo: false, viewer: true });
            document.body.classList.add("is-guest", "is-viewer");
        }
        if (isStaff()) apply(null); // profesorii și administratorii n-au caiet: lucrează la Școala
        else {
            load(true);
            M.poll = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL);
        }
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
            : `<b>Catalogul tău.</b> Notele le pun profesorii; aici le vezi pe toate, cu mediile.`;
        return `<span class="guest-bar-text">${icon("eye")}<span>${text}</span></span>${chips}`;
    }

    // banda de sus și mesajul la o încercare de schimbare: ale catalogului, nu ale vechiului mod părinte/profesor
    const oldBar = viewerBarHTML;
    viewerBarHTML = () => (active() ? barHTML() : oldBar());
    const oldRequire = requireAccount;
    requireAccount = () => {
        if (!active()) return oldRequire();
        showToast(isStaff() ? "Notele se pun din pagina Școala → Catalog." : "📘 Notele le pun profesorii. Aici le vezi, dar nu le poți schimba.", { duration: 4500 });
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

    ACTIONS["cat-child"] = btn => {
        M.child = btn.dataset.id;
        try { localStorage.setItem(PICK_KEY, M.child); } catch (_) { /* fără stocare */ }
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
    return { enabled, get active() { return active(); }, get role() { return role(); }, reload: () => load(true) };
})();
