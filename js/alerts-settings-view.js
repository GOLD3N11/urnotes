/* urNotes · Alerte și cardurile din Setări.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- ALERTE ---------- */
function renderAlerts() {
    const cont = $("alerte-container");
    if (!cont) return;

    cont.innerHTML = alerts.length
        ? alerts.map(al => `
            <div class="alert-card ${escapeHTML(al.type)} ${al.unread ? "unread" : ""}">
                <button type="button" class="alert-open" data-action="alert-open" data-id="${escapeHTML(al.id)}">
                    ${icon(al.icon || "info", "alert-ico")}<span>${escapeHTML(al.text)}</span>
                </button>
                <button type="button" class="btn btn-text" data-action="dismiss-alert" data-id="${escapeHTML(al.id)}"
                    title="Elimină alerta" aria-label="Elimină alerta">${icon("x")}</button>
            </div>`).join("")
        : `<div class="alert-card success"><span>${icon("check-circle")} Nu există nicio alertă activă. Felicitări!</span></div>`;
}

/** Deschide locul la care se referă o notificare (materia sau ziua din calendar). */
function openAlertTarget(id) {
    const al = alerts.find(a => a.id === id);
    if (!al) return;
    state.alertMeta.read[id] = true; // refresh() salvează
    closeNotifPanel({ restoreFocus: false });
    if (al.tab) switchTab(al.tab);
    else if (al.date) showDateInCalendar(al.date);
    else if (al.mat) openSubjectInCatalog(al.mat);
    else if (al.filter && CATALOG_FILTERS[al.filter]) {
        ui.catalog.filter = al.filter;
        ui.catalog.query = "";
        ui.catalog.showDetail = false;
        switchTab("tab-catalog");
    }
    refresh();
}

/* ---------- SETĂRI ---------- */
const SETTINGS_FIELDS = {
    "set-primary-goal": ["goals", "primary"],
    "set-target-gpa": ["goals", "targetGPA"],
    "set-min-gpa": ["goals", "minGPA"],
    "set-target-tens": ["targets", "tens"],
    "set-target-evals": ["targets", "evals"],
    "set-calc-method": ["calc", "method"],
    "set-rounding": ["calc", "rounding"],
    "set-risk-gpa": ["calc", "riskThreshold"],
    "set-risk-drop": ["calc", "riskDrop"],
    "set-theme": ["appearance", "theme"],
    "set-accent": ["appearance", "accent"],
    "set-style": ["appearance", "style"],
    "set-name": ["profile", "name"],
    "set-county": ["school", "county"],
    "set-buddy": ["profile", "buddy"]
};

function loadSettingsIntoUI() {
    if ($("set-county") && !$("set-county").options.length) $("set-county").innerHTML = countyOptions("");
    for (const [id, [group, key]] of Object.entries(SETTINGS_FIELDS)) {
        const el = $(id);
        if (!el) continue;
        const v = state.settings[group][key];
        // o valoare mai veche, care nu e în listă, rămâne vizibilă ca opțiune
        if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === String(v))) {
            const opt = document.createElement("option");
            opt.value = String(v);
            opt.textContent = String(v);
            el.append(opt);
        }
        el.value = v;
    }
    renderModulesSettings();
    renderBackupStatus();
    renderBuddyPreview();
    renderProgrammeSettings();
    renderBadgeSetting();
    renderReminderSetting();
    renderYearSetting();
    renderPalLevelSetting();
    if (guest.on) renderGuestBar(); // câmpurile rămân blocate pentru vizitatori
}

/** Numărul de pe iconița aplicației: pe iPhone apare doar după permisiunea pentru notificări. */
function renderBadgeSetting() {
    const box = $("badge-setting");
    if (!box) return;
    const can = "setAppBadge" in navigator && "Notification" in window && isStandalone();
    box.hidden = !can;
    if (!can) return;
    box.innerHTML = Notification.permission === "granted"
        ? `<p class="subtitle">${icon("check")} Iconița aplicației arată câte notificări necitite ai.</p>`
        : `<button type="button" class="btn btn-glass btn-sm" data-action="badge-allow">${icon("bell")} Arată numărul pe iconița aplicației</button>
           <p class="subtitle mt-2">Telefonul îți cere o dată voie (ca pentru notificări).</p>`;
}

/** „Programa ta” (Setări): profilul și clasa, de care depind materiile care se pot adăuga. */
function renderProgrammeSettings() {
    const box = $("programme-settings");
    if (!box) return;
    const outside = Object.keys(state.subjects).filter(m => !inProgramme(m));
    box.innerHTML = myProgramme() ? `
        <p class="programme-now"><b>${escapeHTML(programmeLabel())}</b><small>Limba modernă 2: ${escapeHTML(state.settings.school.lm2)}</small></p>
        <p class="subtitle">Poți adăuga doar materiile din programa asta, plus dirigenția și maximum un opțional.${outside.length ? ` ${plural(outside.length, "materie e", "materii sunt")} în afara programei: ${escapeHTML(outside.join(", "))}.` : ""}</p>
        <button type="button" class="btn btn-glass btn-sm mt-3" data-action="programme-change">${icon("graduation")} Schimbă clasa sau profilul</button>` : `
        <p class="subtitle">Nu ți-ai ales încă programa. Cu ea, materiile se completează singure din planul-cadru al clasei tale.</p>
        <button type="button" class="btn btn-primary btn-sm mt-3" data-action="programme-change">${icon("graduation")} Alege profilul și clasa</button>`;
}

/** Mascota de lângă câmpurile „Tu și colegul tău” (Setări), cu numele scris în câmp. */
function renderBuddyPreview() {
    const box = $("set-buddy-preview");
    if (!box) return;
    const name = cleanName($("set-buddy")?.value, 20) || DEFAULT_SETTINGS.profile.buddy;
    const who = cleanName($("set-name")?.value, 40).split(" ")[0];
    box.innerHTML = `${buddySVG("happy")}<b class="buddy-name pal-name-tag">${escapeHTML(name)}</b>`;
}

registerTab("tab-setari", { render: loadSettingsIntoUI, title: "Setări", icon: "settings", group: "app", parent: "tab-dashboard" });
