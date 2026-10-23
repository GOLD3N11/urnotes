/* urNotes · Pornirea aplicației.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== PORNIRE ==================== */
function init() {
    loadState();
    applyAppearanceSettings();
    bindEvents();
    initAppBar();
    bindStatsNav();
    initCustomSelects();
    bindHoverTips();

    if (!localStorage.getItem(KEYS.firstRun)) {
        try {
            localStorage.setItem(KEYS.firstRun, "true");
        } catch (_) { /* ignorăm */ }
    }

    refresh();
    bindSetupEvents();
    bindAuthEvents();
    bindCatMenu();
    bindCatalogNav();
    bindPhoneHelpers();
    bindSheetDrag();
    initBuddyLook();
    initCloud();
    initReminders();
    hideSplash();
    // Cu conturi, configurarea vine după alegerea de pe ecranul de autentificare.
    if (!cloud.configured && shouldOfferSetup()) openSetup(0);
}

/** Ecranul de pornire pleacă după ce aplicația e gata (cel puțin o clipă, ca să se vadă post-it-ul). */
function hideSplash() {
    const el = $("splash");
    if (!el) return;
    try { sessionStorage.setItem("urn_splash_seen", "1"); } catch (_) { /* fără stocare */ }
    const quick = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
        el.classList.add("is-out");
        setTimeout(() => el.remove(), 450);
    }, quick ? 150 : 650);
}
