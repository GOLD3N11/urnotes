/* urNotes · Resetare, setări, backup, aspect.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== RESETARE ==================== */
const RESET_OPTIONS = {
    1: {
        icon: "note", label: "Resetează toate notele", hint: "Păstrează materiile; purtarea revine la 10",
        title: "Confirmare resetare note",
        body: "<p>Ești sigur că vrei să ștergi toate notele? Materiile vor fi păstrate, iar purtarea revine la 10 pe toate modulele.</p>",
        danger: false,
        run() {
            Object.values(state.subjects).forEach(sub => { sub.grades = []; });
            state.purtare.grades = {};
            pruneSubjectAlertMeta();
            addActivity("Au fost resetate toate notele (inclusiv purtarea).");
            return "Toate notele au fost resetate.";
        }
    },
    2: {
        icon: "notebook", label: "Resetează materiile și toate notele", hint: "Elimină toate materiile și notele asociate",
        title: "Confirmare resetare materii",
        body: `<p>Ești sigur că vrei să ștergi toate materiile și toate notele?</p><p class="danger-note">Această acțiune nu poate fi anulată.</p>`,
        danger: true,
        run() {
            state.subjects = {};
            state.purtare.grades = {};
            ui.catalog.selected = "";
            pruneSubjectAlertMeta();
            addActivity("Au fost șterse toate materiile și notele.");
            return "Toate materiile și notele au fost eliminate.";
        }
    },
    3: {
        icon: "calendar", label: "Resetează calendarul", hint: "Șterge toate evenimentele",
        title: "Confirmare resetare calendar",
        body: "<p>Ești sigur că vrei să ștergi toate evenimentele din calendar?</p>",
        danger: false,
        run() {
            state.calendar = {};
            clearAllEventAlertMeta();
            addActivity("Calendarul a fost resetat.");
            return "Calendarul a fost resetat.";
        }
    },
    4: {
        icon: "alert", label: "Resetează tot", hint: "Șterge absolut toate datele", dangerCard: true,
        title: "Resetare completă",
        body: `
            <p class="danger-note">Toate materiile, notele, evenimentele, orarul, alertele, istoricul și realizările vor fi șterse definitiv.</p>
            <p class="mt-3">Setările aplicației vor fi păstrate.</p>`,
        confirmText: "Da, resetează tot",
        danger: true,
        run() {
            state.subjects = {};
            state.calendar = {};
            state.timetable = {};
            state.purtare = defaultPurtare();
            state.activity = [];
            state.history = [];
            state.alertMeta = { dismissed: {}, read: {} };
            state.achievements = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, false]));
            ui.catalog.selected = "";
            sim = defaultSim();
            destroyAllCharts();
            return "Aplicația a fost resetată complet.";
        }
    }
};

function openResetMenu() {
    openModal({
        title: "Resetare date",
        confirmText: "",
        cancelText: "Închide",
        body: `
            <p class="modal-hint">Alege ce date dorești să elimini.</p>
            ${Object.entries(RESET_OPTIONS).map(([id, o]) => `
                <button type="button" class="reset-option-card ${o.dangerCard ? "danger" : ""}" data-action="reset-option" data-option="${id}">
                    <span>
                        <span class="reset-option-title">${icon(o.icon)} ${o.label}</span>
                        <span class="reset-option-hint">${o.hint}</span>
                    </span>
                    <span class="reset-option-arrow" aria-hidden="true">→</span>
                </button>`).join("")}`
    });
}

function confirmResetOption(id) {
    const option = RESET_OPTIONS[id];
    if (!option) return;

    openModal({
        title: option.title,
        body: option.body,
        confirmText: option.confirmText || "Confirmă resetarea",
        danger: option.danger,
        onConfirm: () => {
            const message = option.run();
            closeActionModal();
            refresh();
            showToast(message);
        }
    });
}

/* ==================== ALERTE ==================== */
function dismissAlert(id) {
    if (!id) return;
    withUndo("Notificare ascunsă.", () => { state.alertMeta.dismissed[id] = true; });
}

function markAllAlertsRead() {
    alerts.forEach(alert => { state.alertMeta.read[alert.id] = true; });
    refresh();
    showToast("Toate notificările sunt marcate ca citite.");
}

/* ==================== SETĂRI ==================== */
function saveSettings({ quiet = false } = {}) {
    const s = state.settings;
    let moduleError = "";

    // Modulele se verifică primele: cu date greșite nu salvăm nimic, ca utilizatorul să le poată corecta.
    // La salvarea automată (în timp ce scrii) salvăm restul și doar arătăm discret ce nu e în regulă la module.
    if ($("set-modules")) {
        const modules = readModulesFromSettings();
        const error = validateModules(modules);
        if (error && !quiet) {
            showToast(`⚠️ ${error}`);
            return;
        }
        if (error) moduleError = error;
        else s.modules = modules;
    }

    s.goals.primary = ["gpa", "tens", "evals"].includes(field("set-primary-goal")) ? field("set-primary-goal") : "gpa";
    s.goals.targetGPA = clampNumber(field("set-target-gpa"), 5, 10, 10);
    s.goals.minGPA = clampNumber(field("set-min-gpa"), 5, 10, 5);
    s.targets.tens = clampInteger(field("set-target-tens"), 1, 1000, 20);
    s.targets.evals = clampInteger(field("set-target-evals"), 1, 10000, 30);
    s.calc.method = field("set-calc-method") === "arithmetic" ? "arithmetic" : "weighted";
    s.calc.rounding = field("set-rounding") === "0" ? "0" : "2";
    s.calc.riskThreshold = clampNumber(field("set-risk-gpa"), 1, 10, 8);
    s.calc.riskDrop = clampNumber(field("set-risk-drop"), 0.1, 5, 0.5);
    s.appearance.theme = field("set-theme") || "system";
    s.appearance.accent = ACCENTS[field("set-accent")] ? field("set-accent") : "violet";
    s.appearance.density = field("set-density") || "normal";
    s.appearance.cursor = CURSOR_MODES.includes(field("set-cursor")) ? field("set-cursor") : "off";
    s.profile.name = cleanName(field("set-name"), 40);
    s.school.county = COUNTY_WEEK[field("set-county")] ? field("set-county") : s.school.county;
    s.profile.buddy = cleanName(field("set-buddy"), 20) || DEFAULT_SETTINGS.profile.buddy;

    applyAppearanceSettings();
    refresh();
    if (quiet) {
        // arată valorile corectate (ex. 12 → 10) fără să redeseneze modulele pe care le editezi
        for (const [id, [group, key]] of Object.entries(SETTINGS_FIELDS)) {
            const el = $(id);
            if (el && el !== document.activeElement) el.value = state.settings[group][key];
        }
        renderBuddyPreview();
        flashSettingsStatus(moduleError ? `⚠ ${moduleError}` : "✓ Salvat", Boolean(moduleError));
        return;
    }
    loadSettingsIntoUI(); // arată valorile corectate (ex. 12 → 10)
    showToast("⚙️ Setările au fost salvate.");
}

/** Mesajul discret de lângă titlul Setărilor („✓ Salvat”), pentru salvarea automată. */
function flashSettingsStatus(text, warn = false) {
    const el = $("settings-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-warn", warn);
    el.classList.add("is-on");
    clearTimeout(flashSettingsStatus.timer);
    if (!warn) flashSettingsStatus.timer = setTimeout(() => el.classList.remove("is-on"), 1800);
}

function resetSettings() {
    openModal({
        title: "Restabilește implicite",
        body: "<p>Se vor reseta doar preferințele vizuale și de calcul. Materiile și notele rămân intacte.</p>",
        confirmText: "Restabilește",
        danger: true,
        onConfirm: () => {
            state.settings = { ...clone(DEFAULT_SETTINGS), profile: state.settings.profile }; // numele rămân
            applyAppearanceSettings();
            closeActionModal();
            refresh();
            loadSettingsIntoUI();
            showToast("Setările au revenit la valorile implicite.");
        }
    });
}

/* ==================== BACKUP: EXPORT / IMPORT ==================== */
/*
 * Fișierul de backup e un JSON cu un antet (aplicație + versiune) și toate datele salvate.
 * La import, conținutul trece prin readStoredData() — aceleași verificări ca la pornire —
 * iar datele curente sunt păstrate ca să poată fi restaurate („Anulează importul”).
 */
// „app” rămâne identificatorul vechi, ca backup-urile făcute înainte de redenumire să se importe în continuare.
const BACKUP = { app: "evidenta-scolara-pro", version: 1, maxBytes: 5 * 1024 * 1024 };

class BackupError extends Error {}

function buildBackup() {
    return {
        app: BACKUP.app,
        version: BACKUP.version,
        exportedAt: new Date().toISOString(),
        data: {
            settings: state.settings,
            subjects: state.subjects,
            calendar: state.calendar,
            timetable: state.timetable,
            purtare: state.purtare,
            activity: state.activity,
            achievements: state.achievements,
            history: state.history,
            alertMeta: state.alertMeta,
            simulator: sim,
            plan: state.plan
        }
    };
}

/** Transformă textul unui fișier într-un set de date validat. Aruncă BackupError cu un mesaj clar. */
function parseBackup(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    } catch (_) {
        throw new BackupError("Fișierul nu este un JSON valid.");
    }

    if (!isPlainObject(raw) || raw.app !== BACKUP.app || !isPlainObject(raw.data)) {
        throw new BackupError("Fișierul nu pare să fie un backup al acestei aplicații.");
    }
    const version = Number(raw.version);
    if (!Number.isInteger(version) || version < 1) {
        throw new BackupError("Backup-ul are o versiune necunoscută.");
    }
    if (version > BACKUP.version) {
        throw new BackupError("Backup-ul a fost creat cu o versiune mai nouă a aplicației.");
    }

    const exportedAt = new Date(raw.exportedAt);
    return {
        loaded: readStoredData(name => raw.data[name] ?? null),
        exportedAt: Number.isNaN(exportedAt.getTime()) ? null : exportedAt
    };
}

function summarizeData(data, simData) {
    const subjects = Object.values(data.subjects);
    return {
        subjects: subjects.length,
        grades: subjects.reduce((n, sub) => n + sub.grades.length, 0),
        events: Object.values(data.calendar).reduce((n, list) => n + list.length, 0),
        scenarios: simData.scenarios.length,
        hypo: simData.scenarios.reduce((n, sc) => n + hypoCount(sc), 0)
    };
}

/** „1 notă”, „5 note”, „20 de note” (regula „de” din română). */
function plural(n, one, many) {
    if (n === 1) return `1 ${one}`;
    const needsDe = n !== 0 && (n % 100 === 0 || n % 100 >= 20);
    return `${n} ${needsDe ? "de " : ""}${many}`;
}

function summaryText(c) {
    return [
        plural(c.subjects, "materie", "materii"),
        plural(c.grades, "notă", "note"),
        plural(c.events, "eveniment", "evenimente"),
        plural(c.scenarios, "scenariu", "scenarii")
    ].join(" · ");
}

function formatDateTime(date) {
    return date.toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function readLocal(key) {
    try {
        return localStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup({ silent = false } = {}) {
    try {
        downloadJSON(buildBackup(), `urnotes-backup-${getLocalDateKey()}.json`);
    } catch (err) {
        console.error("Exportul a eșuat.", err);
        showToast("⚠️ Exportul a eșuat.");
        return false;
    }

    try {
        localStorage.setItem(KEYS.lastExport, new Date().toISOString());
    } catch (_) { /* nu e critic */ }

    renderBackupStatus();
    if (!silent) showToast("💾 Backup descărcat.");
    return true;
}

/** Păstrează datele curente ca să poată fi restaurate. Întoarce false dacă nu a reușit. */
function saveUndoSnapshot() {
    try {
        localStorage.setItem(KEYS.backupUndo, JSON.stringify(buildBackup()));
        return true;
    } catch (err) {
        console.warn("Copia pentru anulare nu a putut fi salvată.", err);
        return false;
    }
}

function clearUndoSnapshot() {
    try {
        localStorage.removeItem(KEYS.backupUndo);
    } catch (_) { /* ignorăm */ }
}

function readUndoSnapshot() {
    const raw = readLocal(KEYS.backupUndo);
    if (!raw) return null;
    try {
        return parseBackup(raw);
    } catch (_) {
        return null;
    }
}

/** Înlocuiește toate datele aplicației și redesenează tot. */
function applyImportedData(loaded) {
    applyLoadedData(loaded);
    ui.catalog = { ...ui.catalog, selected: "", showDetail: false };
    applyAppearanceSettings();
    refresh();
    loadSettingsIntoUI();
}

async function importBackupFile(file) {
    if (!requireAccount()) return;
    if (!file) return;
    if (file.size > BACKUP.maxBytes) {
        showToast("⚠️ Fișierul e prea mare pentru un backup (max. 5 MB).");
        return;
    }

    let parsed;
    try {
        parsed = parseBackup(await file.text());
    } catch (err) {
        if (!(err instanceof BackupError)) console.error("Import eșuat.", err);
        showToast(`⚠️ ${err instanceof BackupError ? err.message : "Fișierul de backup nu a putut fi citit."}`);
        return;
    }

    const incoming = summarizeData(parsed.loaded.data, parsed.loaded.sim);
    const current = summarizeData(state, sim);
    const hasCurrentData = current.subjects > 0 || current.events > 0;

    openModal({
        title: "Importă backup",
        confirmText: "Importă și înlocuiește",
        danger: hasCurrentData,
        body: `
            <div class="backup-summary">
                <span class="kpi-title">Din fișier</span>
                <b class="backup-file-name">${escapeHTML(file.name)}</b>
                ${parsed.exportedAt ? `<small>Creat pe ${escapeHTML(formatDateTime(parsed.exportedAt))}</small>` : ""}
                <span class="backup-counts">${escapeHTML(summaryText(incoming))}</span>
            </div>
            ${hasCurrentData ? `
                <div class="backup-summary is-current">
                    <span class="kpi-title">Se înlocuiesc datele actuale</span>
                    <span class="backup-counts">${escapeHTML(summaryText(current))}</span>
                </div>
                <p class="modal-hint mt-3">Toate datele actuale, inclusiv setările, sunt înlocuite cu cele din fișier. Datele actuale se păstrează: poți reveni la ele din Setări → „Anulează importul”.</p>`
            : `<p class="modal-hint mt-3">Nu ai încă date în aplicație, așa că nimic nu se pierde.</p>`}`,
        onConfirm: () => {
            let note = "";
            if (hasCurrentData) {
                if (!saveUndoSnapshot()) {
                    // Nu avem loc pentru copia de anulare → descărcăm datele actuale ca plasă de siguranță.
                    clearUndoSnapshot();
                    exportBackup({ silent: true });
                    note = " O copie a datelor anterioare a fost descărcată.";
                } else {
                    note = " Îl poți anula din Setări.";
                }
            } else {
                clearUndoSnapshot();
            }

            applyImportedData(parsed.loaded);
            addActivity(`Ai importat un backup (${summaryText(incoming)}).`);
            saveState();
            closeActionModal();
            renderBackupStatus();
            showToast(`✅ Backup importat.${note}`);
        }
    });
}

function undoImport() {
    const snap = readUndoSnapshot();
    if (!snap) {
        clearUndoSnapshot();
        renderBackupStatus();
        showToast("⚠️ Nu există un import de anulat.");
        return;
    }

    openModal({
        title: "Anulează importul",
        confirmText: "Revino la datele anterioare",
        danger: true,
        body: `
            <p>Revii la datele de dinainte de import${snap.exportedAt ? ` (${escapeHTML(formatDateTime(snap.exportedAt))})` : ""}:</p>
            <div class="backup-summary mt-3"><span class="backup-counts">${escapeHTML(summaryText(summarizeData(snap.loaded.data, snap.loaded.sim)))}</span></div>
            <p class="danger-note">Datele importate vor fi înlocuite. Dacă le vrei înapoi, va trebui să imporți din nou fișierul.</p>`,
        onConfirm: () => {
            applyImportedData(snap.loaded);
            clearUndoSnapshot();
            closeActionModal();
            renderBackupStatus();
            showToast("↩️ Importul a fost anulat.");
        }
    });
}

function renderBackupStatus() {
    const status = $("backup-status");
    if (status) {
        const last = new Date(readLocal(KEYS.lastExport) || "");
        const never = Number.isNaN(last.getTime());
        status.textContent = never
            ? "Nu ai exportat încă niciun backup. Datele există doar în acest browser."
            : `Ultimul export: ${formatDateTime(last)}`;
        status.classList.toggle("is-warning", never);
    }

    const undo = $("backup-undo");
    if (undo) {
        const snap = readUndoSnapshot();
        undo.hidden = !snap;
        if (snap) {
            setText("backup-undo-text", `Datele de dinainte de ultimul import${snap.exportedAt ? ` (${formatDateTime(snap.exportedAt)})` : ""} sunt păstrate.`);
        }
    }
}

function bindBackupEvents() {
    const input = $("backup-file-input");
    input?.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = ""; // permite alegerea aceluiași fișier de două ori la rând
        importBackupFile(file);
    });

    // Fișierul poate fi și tras direct peste card.
    const card = $("backup-card");
    if (!card) return;
    const hasFiles = event => [...(event.dataTransfer?.types || [])].includes("Files");
    card.addEventListener("dragover", event => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", event => {
        if (!card.contains(event.relatedTarget)) card.classList.remove("drag-over");
    });
    card.addEventListener("drop", event => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        card.classList.remove("drag-over");
        importBackupFile(event.dataTransfer.files[0]);
    });
}

/* ==================== ASPECT ==================== */
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyAppearanceSettings() {
    const a = state.settings.appearance;
    const dark = a.theme === "dark" || (a.theme === "system" && darkQuery.matches);

    document.body.classList.toggle("dark-mode", dark);
    document.documentElement.classList.toggle("theme-dark", dark); // bare de derulare și controale native întunecate
    // bara Safari și bara de stare a telefonului iau culoarea foii, chiar dacă tema din aplicație diferă de cea a telefonului
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = dark ? "#17132A" : "#FBF8F2"; m.removeAttribute("media"); });
    document.documentElement.style.setProperty("--accent-color", (ACCENTS[a.accent] || ACCENTS.violet)[dark ? "dark" : "light"]);

    document.body.classList.remove("layout-compact", "layout-spacious");
    if (a.density === "compact" || a.density === "spacious") document.body.classList.add(`layout-${a.density}`);
    applyCursorSetting();
}
