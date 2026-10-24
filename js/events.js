/* urNotes · Acțiunile (delegare de evenimente).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== EVENIMENTE (delegare) ==================== */
// Toate butoanele folosesc data-action în loc de onclick inline,
// așa că numele cu apostrof sau ghilimele nu mai pot strica nimic.
const ACTIONS = {
    "nav": el => switchTab(el.dataset.tab),
    "add-grade": el => openAddGradeModal(el.dataset.mat || null),
    "add-subject": () => promptAddMaterie(),
    "add-event": el => openEventModal({ date: el.dataset.date, subject: el.dataset.mat, type: el.dataset.type }),
    "quick-test": () => {
        switchTab("tab-calendar");
        openEventModal({ type: "Test" });
    },
    "show-date": el => showDateInCalendar(el.dataset.date),
    "cal-nav": el => calNavigate(Number(el.dataset.offset)),
    "cal-today": () => {
        ui.cal.date = getLocalDateKey();
        renderCalendar();
    },
    "cal-view": el => {
        ui.cal.view = ["month", "table", "board"].includes(el.dataset.view) ? el.dataset.view : "week";
        renderCalendar();
    },
    "cal-goto": el => calGoto(el.dataset.date),
    "occ-status": el => setOccStatus(el.dataset.id, el.dataset.date, el.dataset.status),
    "cal-jump": el => calJump(el.dataset.date),
    "db-past": el => { ui.cal.dbPast = el.checked; renderCalendar(); },
    "event-open": el => openEventModal({ id: el.dataset.id, date: el.dataset.date }),
    "event-done": el => toggleEventDone(el.dataset.id, el.dataset.date),
    "event-grade": el => openGradeForEvent(el.dataset.id, el.dataset.date),
    "event-quick-grade": el => quickGradeForEvent(el.dataset.id, el.dataset.date, el.dataset.val),
    "event-delete": el => promptDeleteEvent(el.dataset.id, el.dataset.date),
    "event-delete-one": el => deleteOccurrence(el.dataset.id, el.dataset.date),
    "event-delete-all": el => deleteSeries(el.dataset.id),
    "np-open": el => npOpen(el.dataset.prop),
    "np-set": el => npSet(el.dataset.prop, el.dataset.value),
    "grade-pick-subject": el => {
        if (!$("modal-grade-mat")) return;
        $("modal-grade-mat").value = el.dataset.mat;
        syncGradeSubjectChips();
    },
    "timetable": () => openTimetableModal(),
    "tt-tap": el => {
        if (!ui.ttDraft || !state.subjects[el.dataset.mat]) return;
        const day = TIMETABLE_DAYS.includes(Number(ui.ttDay)) ? Number(ui.ttDay) : 1;
        const list = (ui.ttDraft[day] ||= []);
        if (list.length >= TIMETABLE_MAX) return;
        list.push(el.dataset.mat);
        rerenderTimetableEditor(day, `.tt-tap[data-mat="${CSS.escape(el.dataset.mat)}"]`);
    },
    "tt-day": el => {
        ui.ttDay = Number(el.dataset.day);
        rerenderTimetableEditor(ui.ttDay, ".tt-tap:not([disabled])");
        $("tt-editor")?.querySelector(".tt-day.is-active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    "tt-copy": el => {
        const day = Number(el.dataset.day);
        const prev = TIMETABLE_DAYS[TIMETABLE_DAYS.indexOf(day) - 1];
        if (!ui.ttDraft || !prev) return;
        ui.ttDraft[day] = [...(ui.ttDraft[prev] || [])];
        rerenderTimetableEditor(day);
    },
    "tt-clear": el => {
        if (!ui.ttDraft) return;
        delete ui.ttDraft[el.dataset.day];
        ui.ttDay = Number(el.dataset.day);
        rerenderTimetableEditor(el.dataset.day);
    },
    "tt-remove": el => {
        const list = ui.ttDraft?.[el.dataset.day];
        if (!list) return;
        list.splice(Number(el.dataset.index), 1);
        rerenderTimetableEditor(el.dataset.day);
    },
    "cat-select": el => selectCatalogSubject(el.dataset.mat),
    "grade-pick": el => {
        const input = $("modal-grade-val");
        if (!input) return;
        input.value = el.dataset.val;
        document.querySelectorAll(".grade-pick-btn").forEach(b => b.setAttribute("aria-pressed", String(b === el)));
    },
    "grade-date": el => {
        const input = $("modal-grade-date");
        if (input) input.value = addDays(getLocalDateKey(), -Number(el.dataset.days || 0));
    },
    "cat-step": el => stepCatalog(Number(el.dataset.dir) === -1 ? -1 : 1),
    "cat-group": el => {
        const key = el.dataset.group;
        ui.catalog.collapsed[key] = el.getAttribute("aria-expanded") === "true";
        renderCatalogList();
        $("cat-list").querySelector(`[data-action="cat-group"][data-group="${key}"]`)?.focus();
    },
    "cat-back": () => {
        ui.catalog.showDetail = false;
        renderCatalog();
        document.querySelector("#cat-list .cat-row.selected")?.focus();
    },
    "cat-filter": el => {
        ui.catalog.filter = CATALOG_FILTERS[el.dataset.filter] ? el.dataset.filter : "all";
        renderCatalogFilters(catalogEntries());
        renderCatalogList();
    },
    "cat-clear-filters": () => {
        ui.catalog.filter = "all";
        ui.catalog.query = "";
        renderCatalog();
    },
    "open-subject": el => openSubjectInCatalog(el.dataset.mat),
    "home-day": el => {
        ui.home.day = el.dataset.day === "next" ? "next" : "today";
        renderDashboard();
        document.querySelector(`#azi-day [data-action="home-day"][data-day="${ui.home.day}"]`)?.focus();
    },
    "home-risk": () => {
        ui.catalog.filter = "risk";
        ui.catalog.query = "";
        ui.catalog.showDetail = false;
        switchTab("tab-catalog");
    },
    "stats-print": () => openReportPanel(),
    "stats-insights-more": () => {
        ui.statsAllInsights = !ui.statsAllInsights;
        renderStatsInsights(statsEntries());
        $("stats-insights").querySelector('[data-action="stats-insights-more"]')?.focus();
    },
    "stats-period": el => setStatsPeriod(el.dataset.period),
    "stats-jump": el => $(el.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    "open-in-sim": el => openSubjectInSimulator(el.dataset.mat),
    "edit-subject": el => openEditSubjectModal(el.dataset.mat),
    "purtare-edit": el => openPurtareModal(el.dataset.key),
    "purtare-reset": el => {
        const m = metrics.purtare.modules.find(x => x.key === el.dataset.key);
        if (m && m.val !== null) setPurtare(m, 10, "");
    },
    "purtare-toggle-gpa": () => {
        state.purtare.excludeFromGPA = !state.purtare.excludeFromGPA;
        addActivity(state.purtare.excludeFromGPA ? "Purtarea a fost exclusă din media generală." : "Purtarea a fost inclusă din nou în media generală.");
        refresh();
    },
    "purtare-settings": () => {
        switchTab("tab-setari");
        $("modules-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    "edit-grade": el => openEditGradeModal(el.dataset.mat, Number(el.dataset.index)),
    "toggle-priority": el => togglePriority(el.dataset.mat),
    "toggle-exclude": el => toggleExclude(el.dataset.mat),
    "delete-grade": el => deleteGrade(el.dataset.mat, Number(el.dataset.index)),
    "delete-subject": el => deleteSubject(el.dataset.mat),
    "reset-menu": () => openResetMenu(),
    "reset-option": el => confirmResetOption(el.dataset.option),
    ...SIM_ACTIONS,
    ...SETUP_ACTIONS,
    "dismiss-alert": el => dismissAlert(el.dataset.id),
    "mark-alerts-read": () => markAllAlertsRead(),
    "alert-open": el => openAlertTarget(el.dataset.id),
    "save-settings": () => saveSettings(),
    "backup-export": () => exportBackup(),
    "backup-import": () => $("backup-file-input")?.click(),
    "backup-undo": () => undoImport(),
    "reset-settings": () => resetSettings(),
    "quick-add": el => openQuickAdd(el),
    "quick-add-close": () => closeQuickAdd(),
    "qa": el => runQuickAdd(el.dataset.kind),
    "notif-open": () => openNotifPanel(),
    "more-open": () => openMoreMenu(),
    "more-close": () => closeMoreMenu(),
    "more-run": el => {
        closeMoreMenu({ restoreFocus: false });
        if (!canEdit() && !GUEST_OK_MORE.has(el.dataset.kind)) { requireAccount(); return; }
        MORE_ACTIONS[el.dataset.kind]?.();
    },
    "notif-close": () => closeNotifPanel(),
    "modal-cancel": () => closeActionModal(),
    "guest-signin": () => { authUI.reason = ""; openAuth("signin"); },
    "none": () => {},
    ...ACCOUNT_ACTIONS,
    ...TOUR_ACTIONS,
    ...PLAN_ACTIONS,
    ...CAT_MENU_ACTIONS
};

function bindEvents() {
    document.addEventListener("click", event => {
        const el = event.target.closest("[data-action]");
        if (!el) return;
        // Fără cont: doar acțiunile care arată ceva; restul deschid autentificarea (și bifele nu se bifează)
        if (!canEdit() && !GUEST_OK.has(el.dataset.action) && ACTIONS[el.dataset.action]) {
            event.preventDefault();
            requireAccount();
            return;
        }
        ACTIONS[el.dataset.action]?.(el, event);
    });
    document.addEventListener("input", event => {
        if (event.target.id === "set-name" || event.target.id === "set-buddy") renderBuddyPreview();
        if (event.target.id === "modal-grade-val") {
            document.querySelectorAll(".grade-pick-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === event.target.value.trim())));
        }
    });
    // Setările se salvează singure, imediat ce schimbi ceva (nu mai trebuie apăsat „Salvează”).
    document.addEventListener("change", event => {
        const el = event.target;
        if (!el.closest?.("#tab-setari") || !el.matches("input, select") || el.type === "file") return;
        if (el.id === "set-remind-on" || el.id === "set-remind-time" || el.id === "set-remind-ahead") {
            if (!canEdit()) { renderReminderSetting(); requireAccount(); return; }
            saveReminderSetting();
            return;
        }
        if (!(el.id in SETTINGS_FIELDS) && !el.closest("#set-modules") && el.id !== "set-module-preset" && el.id !== "set-county") return;
        if (!canEdit()) { loadSettingsIntoUI(); requireAccount(); return; }
        saveSettings({ quiet: true });
    });

    document.addEventListener("keydown", event => {
        const overlay = $("action-modal");

        if (event.key === "Escape") {
            if (!overlay.hidden) closeActionModal();
            return;
        }

        trapModalFocus(event);

        // Enter într-un câmp din dialog = confirmare.
        if (event.key === "Enter" && !overlay.hidden && event.target.matches("#action-modal-body input")) {
            event.preventDefault();
            const confirmBtn = $("action-modal-confirm");
            if (!confirmBtn.hidden) confirmBtn.click();
        }
    });

    // Click pe fundalul dialogului îl închide.
    $("action-modal").addEventListener("mousedown", event => {
        if (event.target.id === "action-modal") closeActionModal();
    });

    bindShellEvents();
    bindSimulatorEvents();
    bindBackupEvents();
    bindCatalogEvents();
    bindCalendarEvents();
    bindPurtareEvents();
    $("stats-sort")?.addEventListener("change", event => {
        ui.statsSort = STATS_SORTS[event.target.value] ? event.target.value : "attention";
        const range = periodRange();
        const subs = periodSubjects(range);
        renderStatsSubjects(statsEntries(subs, range ? calculateMetrics(subs) : metrics), { range });
    });
    // Ctrl+P / Print din browser: același raport curat, nu pagina aplicației.
    window.addEventListener("beforeprint", buildPrintReport);

    // Tema „Sistem” urmărește schimbările sistemului de operare.
    darkQuery.addEventListener?.("change", () => {
        if (state.settings.appearance.theme !== "system") return;
        applyAppearanceSettings();
        renderActiveTab({ keepSettingsForm: true });
    });

    // O nouă zi poate aduce alerte/teste noi; recalculăm când utilizatorul revine în tab.
    let lastDay = getLocalDateKey();
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && getLocalDateKey() !== lastDay) {
            lastDay = getLocalDateKey();
            refresh();
        }
    });
}
