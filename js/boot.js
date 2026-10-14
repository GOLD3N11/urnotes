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
    applyCursorSetting();
    bindSetupEvents();
    bindAuthEvents();
    bindCatMenu();
    bindCatalogNav();
    bindPhoneHelpers();
    bindSheetDrag();
    initBuddyLook();
    initCloud();
    initReminders();
    // Cu conturi, configurarea vine după alegerea de pe ecranul de autentificare.
    if (!cloud.configured && shouldOfferSetup()) openSetup(0);
}
