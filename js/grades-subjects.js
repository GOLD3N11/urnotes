/* urNotes · Dialogul, notele și materiile.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== MODAL ==================== */
const FOCUSABLE = "button:not([disabled]):not([hidden]), [href], input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Deschide fereastra de dialog.
 * `body` este HTML generat de aplicație (valorile utilizatorului sunt escapate de apelant).
 */
function openModal({ title, body = "", onConfirm = null, confirmText = "Confirmă", danger = false, cancelText = "Anulează", layout = "dialog", guestOk = false }) {
    if (!guestOk && !canEdit()) { requireAccount(); return; } // formularele (adăugare, editare, ștergere) cer cont
    const overlay = $("action-modal");
    const confirmBtn = $("action-modal-confirm");
    const cancelBtn = $("action-modal-cancel");

    if (overlay.hidden) {
        ui.modalReturnFocus = document.activeElement;
    }

    // Formularele se deschid ca panou lateral (pe telefon: foaie de jos); confirmările rămân la mijloc.
    overlay.classList.toggle("is-panel", layout === "panel");
    overlay.classList.toggle("is-dialog", layout !== "panel");
    $("action-modal-title").textContent = title;
    $("action-modal-body").innerHTML = body;

    confirmBtn.hidden = !confirmText;
    confirmBtn.textContent = confirmText || "";
    confirmBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
    confirmBtn.onclick = typeof onConfirm === "function" ? onConfirm : null;
    cancelBtn.textContent = cancelText;
    cancelBtn.hidden = !cancelText;

    overlay.hidden = false;
    document.body.classList.add("modal-open");

    const firstField = overlay.querySelector("#action-modal-body input:not([readonly]), #action-modal-body select, #action-modal-body textarea, #action-modal-body button");
    (firstField || (confirmText ? confirmBtn : cancelBtn)).focus();
}

function closeActionModal() {
    const overlay = $("action-modal");
    if (!overlay || overlay.hidden) return;
    if (cloud.asking) return; // întrebarea despre date are nevoie de un răspuns (altfel s-ar putea pierde note)

    overlay.hidden = true;
    document.body.classList.remove("modal-open");
    if (focusRun.it) stopFocus(); // „Renunț” / Escape / fundal: cronometrul se oprește, sesiunea rămâne nebifată
    $("action-modal-confirm").onclick = null;
    $("action-modal-body").innerHTML = "";
    ui.ttDraft = null;

    const back = ui.modalReturnFocus;
    ui.modalReturnFocus = null;
    if (back && document.contains(back)) back.focus();
    if (ui.tourAfterModal) {
        ui.tourAfterModal = false;
        setTimeout(maybeStartTour, 300);
    }
}

function trapModalFocus(event) {
    const overlay = $("action-modal");
    if (overlay.hidden || event.key !== "Tab" || overlay.classList.contains("is-modeless")) return;

    const items = [...overlay.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function field(id) {
    return $(id)?.value ?? "";
}

function optionsHTML(values, selected) {
    return values.map(v => `<option value="${escapeHTML(v)}" ${v === selected ? "selected" : ""}>${escapeHTML(v)}</option>`).join("");
}

/* ==================== NOTE ==================== */
/** Formular comun pentru adăugarea și editarea unei note. */
function gradeFormHTML({ val = 10, type = "Test", date = getLocalDateKey() } = {}, subjectField = "") {
    const v = Number(val);
    return `
        ${subjectField}
        <span class="form-label" id="grade-pick-l">Nota</span>
        <div class="grade-pick" role="group" aria-labelledby="grade-pick-l">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" class="grade-pick-btn tone-${gradeTone(n)}" data-action="grade-pick" data-val="${n}" aria-pressed="${n === v}">${n}</button>`).join("")}
        </div>
        <div class="form-row">
            <input type="hidden" id="modal-grade-val" value="${escapeHTML(val)}">
            <div class="form-group">
                <label for="modal-grade-type">Tip evaluare</label>
                <select id="modal-grade-type" class="glass-select">${optionsHTML(GRADE_TYPES, GRADE_TYPES.includes(type) ? type : "Altele")}</select>
            </div>
        </div>
        <div class="form-group">
            <label for="modal-grade-date">Data</label>
            <div class="grade-date-row">
                <input type="date" id="modal-grade-date" class="glass-input" value="${escapeHTML(date || "")}" max="${getLocalDateKey()}">
                <button type="button" class="btn btn-glass btn-sm" data-action="grade-date" data-days="0">Azi</button>
                <button type="button" class="btn btn-glass btn-sm" data-action="grade-date" data-days="1">Ieri</button>
            </div>
        </div>`;
}

/** Citește formularul de notă; întoarce null (cu mesaj) dacă ceva nu e valid. */
function readGradeForm() {
    const val = parseStrictInteger(field("modal-grade-val"), 1, 10);
    if (val === null) {
        showToast("⚠️ Alege nota, de la 1 la 10.");
        document.querySelector(".grade-pick-btn")?.focus();
        return null;
    }

    const date = field("modal-grade-date");
    if (date && (!DATE_KEY_RE.test(date) || Number.isNaN(parseDateKey(date).getTime()))) {
        showToast("⚠️ Data nu este validă.");
        $("modal-grade-date")?.focus();
        return null;
    }
    if (date > getLocalDateKey()) {
        showToast("⚠️ Data notei nu poate fi în viitor.");
        $("modal-grade-date")?.focus();
        return null;
    }

    const type = GRADE_TYPES.includes(field("modal-grade-type")) ? field("modal-grade-type") : "Altele";
    return { val, type, date };
}

/**
 * `link` (opțional) leagă nota de un test din calendar: { eventId, eventDate, type, title }.
 */
function openAddGradeModal(presetMat = null, link = null) {
    const subjects = Object.keys(state.subjects);
    if (subjects.length === 0) {
        showToast("⚠️ Adaugă mai întâi o materie.");
        return;
    }
    if (presetMat && !state.subjects[presetMat]) {
        showToast("⚠️ Materia nu mai există.");
        return;
    }

    // Fără materie dată: întâi orele de azi (de acolo vin de obicei notele), apoi restul; propunem materia
    // deschisă în catalog, altfel prima oră de azi.
    const todayKey = getLocalDateKey();
    const todays = [...new Set(lessonsOn(todayKey))].filter(m => state.subjects[m]);
    const ordered = [...todays, ...subjects.filter(m => !todays.includes(m)).sort((a, b) => a.localeCompare(b, "ro"))];
    const suggested = ui.activeTab === "tab-catalog" && state.subjects[ui.catalog.selected] ? ui.catalog.selected : todays[0] || (state.subjects[ui.catalog.selected] ? ui.catalog.selected : subjects[0]);
    const subjectField = presetMat ? "" : `
        <div class="form-group">
            <label for="modal-grade-mat">Materia${todays.length ? ` <span class="label-hint">(primele sunt orele de azi)</span>` : ""}</label>
            <div class="ev-subj-strip" role="radiogroup" aria-label="Alege materia">
                ${ordered.map(m => `<button type="button" class="ev-subj-chip grade-subj-chip ${m === suggested ? "is-on" : ""}" data-action="grade-pick-subject" data-mat="${escapeHTML(m)}" role="radio" aria-checked="${m === suggested}">${escapeHTML(shortSubjectName(m))}</button>`).join("")}
            </div>
            <select id="modal-grade-mat" class="glass-select ev-subject-select">${optionsHTML(ordered, suggested)}</select>
        </div>`;

    openModal({
        layout: "panel",
        title: link ? `Nota la „${link.title}”` : presetMat ? `Notă nouă · ${presetMat}` : "Adaugă notă",
        confirmText: "Adaugă",
        body: (link ? `<p class="modal-hint">${escapeHTML(presetMat)} · ${escapeHTML(getDateLabel(link.eventDate))}. Nota apare în catalog și testul se bifează.</p>` : "")
            + gradeFormHTML(link ? { type: link.type, date: link.eventDate } : {}, subjectField),
        onConfirm: () => {
            const mat = presetMat || field("modal-grade-mat");
            if (!state.subjects[mat]) {
                showToast("⚠️ Materia selectată nu mai există.");
                return;
            }
            const values = readGradeForm();
            if (!values) return;

            const grade = { val: values.val, type: values.type };
            if (values.date) grade.date = values.date;
            if (link) {
                grade.eventId = link.eventId;
                grade.eventDate = link.eventDate;
            }
            state.subjects[mat].grades.push(grade);

            addActivity(`Ai adăugat nota ${values.val} (${values.type}) la ${mat}.`);
            ui.catalog.selected = mat;
            closeActionModal();
            refresh();
            showToast(`Ai adăugat nota ${values.val} la ${mat}.`);
        }
    });
    document.querySelector('.grade-pick-btn[aria-pressed="true"]')?.focus();
}

function syncGradeSubjectChips() {
    const mat = $("modal-grade-mat")?.value;
    document.querySelectorAll(".grade-subj-chip").forEach(b => {
        b.classList.toggle("is-on", b.dataset.mat === mat);
        b.setAttribute("aria-checked", String(b.dataset.mat === mat));
    });
}

function openEditGradeModal(mat, idx) {
    const grade = state.subjects[mat]?.grades[idx];
    if (!grade) return;

    openModal({
        layout: "panel",
        title: `Editează nota · ${mat}`,
        confirmText: "Salvează",
        body: gradeFormHTML({ val: grade.val, type: grade.type, date: grade.date || "" }),
        onConfirm: () => {
            const values = readGradeForm();
            if (!values) return;
            if (state.subjects[mat]?.grades[idx] !== grade) {
                closeActionModal();
                showToast("⚠️ Nota nu mai există.");
                return;
            }

            const before = grade.val;
            grade.val = values.val;
            grade.type = values.type;
            if (values.date) grade.date = values.date;
            else delete grade.date;

            addActivity(before === values.val
                ? `Ai modificat detaliile notei ${values.val} la ${mat}.`
                : `Ai modificat nota la ${mat}: ${before} → ${values.val}.`);
            closeActionModal();
            refresh();
            showToast("Notă actualizată.");
        }
    });
    document.querySelector('.grade-pick-btn[aria-pressed="true"]')?.focus();
}

function deleteGrade(mat, idx) {
    const grade = state.subjects[mat]?.grades[idx];
    if (!grade) return;
    closeActionModal();
    withUndo(`Ai șters nota ${grade.val} de la ${mat}.`, () => {
        state.subjects[mat].grades.splice(idx, 1);
        addActivity(`Ai șters nota ${grade.val} de la ${mat}.`);
    });
}

/* ==================== MATERII ==================== */
/** Verifică numele unei materii; întoarce numele curățat sau null (cu mesaj). */
function validateSubjectName(raw, currentName = null) {
    const name = String(raw).trim().replace(/\s+/g, " ");
    if (!name) {
        showToast("⚠️ Introdu numele materiei.");
        return null;
    }
    if (name === "__proto__" || name === PURTARE_KEY) {
        showToast("⚠️ Numele materiei nu este valid.");
        return null;
    }
    if (isLegacyPurtareName(name) && !(currentName && isLegacyPurtareName(currentName))) {
        showToast("⚠️ Purtarea este deja în catalog (preinstalată).");
        return null;
    }
    const duplicate = Object.keys(state.subjects).find(m =>
        m !== currentName && m.toLocaleLowerCase("ro") === name.toLocaleLowerCase("ro"));
    if (duplicate) {
        showToast(`⚠️ Materia ${duplicate} există deja.`);
        return null;
    }
    return name;
}

function subjectFormHTML({ name = "", ore = 2, target = 10, priority = false, excludeFromGPA = false } = {}, { withFlags = false, withName = true } = {}) {
    return `
        ${withName ? subjectNameFieldHTML(name) : ""}
        <div class="form-row">
            <div class="form-group">
                <span class="form-label">Ore pe săptămână</span>
                <p class="subj-fixed" id="subj-ore-text">${fmtNumber(ore)} ${Number(ore) === 1 ? "oră" : "ore"} <small>din planul-cadru</small></p>
                <input type="hidden" id="subj-ore" value="${escapeHTML(ore)}">
            </div>
            <div class="form-group">
                <label for="subj-target">Ținta (media finală)</label>
                <select id="subj-target" class="glass-select">${[...new Set([...TARGET_CHOICES, Number(target)])].sort((a, b) => a - b).map(v => `<option value="${v}" ${v === Number(target) ? "selected" : ""}>${fmtTarget(v)}</option>`).join("")}</select>
            </div>
        </div>
        ${withFlags ? `
            <label class="check-row"><input type="checkbox" id="subj-priority" ${priority ? "checked" : ""}> ${icon("star")} Materie prioritară <small class="label-hint">(primește mai mult timp în plan)</small></label>` : ""}`;
}

/**
 * Numele unei materii la editare: din programă = fix; opționalul = doar tema; o materie din afara programei
 * se poate înlocui cu una din programă (notele rămân).
 */
function subjectNameFieldHTML(name) {
    if (isOptionalName(name)) return `
        <div class="form-group">
            <label for="subj-opt">Ce opțional faci?</label>
            <input type="text" id="subj-opt" class="glass-input" maxlength="40" placeholder="ex: Educație financiară" autocomplete="off" value="${escapeHTML(optionalTopic(name))}">
        </div>`;
    if (inProgramme(name)) return `
        <div class="form-group">
            <span class="form-label">Materia</span>
            <p class="subj-fixed">${escapeHTML(name)} <small>${myProgramme() ? "din programa ta" : ""}</small></p>
        </div>`;
    const options = missingProgrammeRows().filter(r => r.kind !== "opt");
    return `
        <div class="form-group">
            <label for="subj-swap">Materia <span class="label-hint">(în afara programei)</span></label>
            <select id="subj-swap" class="glass-select">
                <option value="">Rămâne „${escapeHTML(name)}”</option>
                ${options.map(r => `<option value="${escapeHTML(r.name)}">Devine ${escapeHTML(r.name)} (notele rămân)</option>`).join("")}
            </select>
        </div>`;
}

function promptAddMaterie() {
    if (!myProgramme()) {
        openModal({
            layout: "panel",
            title: "Materie nouă",
            confirmText: "Alege programa",
            body: `
                <p class="modal-hint">Materiile vin din programa clasei tale (planul-cadru), plus dirigenția și un opțional. Alege-ți mai întâi profilul și clasa; materiile pe care le ai deja rămân neatinse.</p>`,
            onConfirm: () => { closeActionModal(); openSetup(1); }
        });
        return;
    }
    const missing = missingProgrammeRows();
    if (!missing.length) {
        openModal({
            layout: "panel",
            title: "Materie nouă",
            confirmText: "Schimbă programa",
            cancelText: "Închide",
            body: `
                <p class="modal-hint">Ai deja toate materiile din programa ta (${escapeHTML(programmeLabel())}), plus dirigenția și opționalul.</p>
                <p class="modal-hint">Ai trecut în altă clasă sau ai schimbat profilul? Schimbă programa și îți propun materiile noi.</p>`,
            onConfirm: () => { closeActionModal(); openSetup(1); }
        });
        return;
    }
    const first = missing[0];
    openModal({
        layout: "panel",
        title: "Materie nouă",
        confirmText: "Adaugă",
        body: `
            <p class="modal-hint">Din programa ta: ${escapeHTML(programmeLabel())}.</p>
            <div class="form-group">
                <label for="subj-pick">Materia</label>
                <select id="subj-pick" class="glass-select">
                    ${missing.map(r => `<option value="${escapeHTML(r.kind === "opt" ? "__opt" : r.name)}" data-ore="${r.ore}">${escapeHTML(r.kind === "opt" ? `${OPT} (maximum unul; scrii tu tema)` : r.name)}</option>`).join("")}
                </select>
            </div>
            <div class="form-group" id="subj-opt-group" ${first.kind === "opt" ? "" : "hidden"}>
                <label for="subj-opt">Ce opțional faci?</label>
                <input type="text" id="subj-opt" class="glass-input" maxlength="40" placeholder="ex: Educație financiară" autocomplete="off">
            </div>
            ${subjectFormHTML({ ore: first.ore }, { withName: false })}`,
        onConfirm: () => {
            const pick = field("subj-pick");
            const row = missing.find(r => (r.kind === "opt" ? "__opt" : r.name) === pick);
            if (!row) return;
            const name = row.kind === "opt" ? optionalName(field("subj-opt")) : row.name;
            if (row.kind === "opt" && firstOptional()) {
                showToast(`⚠️ Poți avea un singur opțional (${firstOptional()}).`);
                return;
            }
            if (findSubjectName(name)) {
                showToast(`⚠️ ${name} e deja în catalog.`);
                return;
            }

            state.subjects[name] = {
                ore: row.ore,
                target: clampNumber(field("subj-target"), 1, 10, 10),
                grades: [],
                priority: false,
                excludeFromGPA: row.kind === "dirig" && (myProgramme()?.cls || 9) >= 9
            };
            addActivity(`Ai adăugat materia ${name}.`);
            ui.catalog.selected = name;
            ui.catalog.showDetail = ui.activeTab === "tab-catalog";
            ui.catalog.autoPicked = false;
            closeActionModal();
            refresh();
            showToast(`Ai adăugat materia ${name}.`);
        }
    });
    // alegerea materiei completează orele din planul-cadru și arată câmpul pentru opțional
    $("subj-pick")?.addEventListener("change", event => {
        const opt = event.target.selectedOptions[0];
        if ($("subj-ore") && opt?.dataset.ore) {
            $("subj-ore").value = opt.dataset.ore;
            $("subj-ore-text").innerHTML = `${opt.dataset.ore} ${opt.dataset.ore === "1" ? "oră" : "ore"} <small>din planul-cadru</small>`;
        }
        const isOpt = event.target.value === "__opt";
        $("subj-opt-group").hidden = !isOpt;
        if (isOpt) $("subj-opt")?.focus();
    });
}

/**
 * Redenumește o materie și tot ce face referire la ea:
 * evenimentele din calendar, notele ipotetice din Simulator și starea alertelor.
 * Ordinea materiilor rămâne aceeași.
 */
function renameSubject(oldName, newName) {
    if (oldName === newName || !state.subjects[oldName]) return;

    state.subjects = Object.fromEntries(
        Object.entries(state.subjects).map(([k, v]) => [k === oldName ? newName : k, v])
    );

    Object.values(state.calendar).forEach(events => events.forEach(ev => {
        if (ev.subject === oldName) ev.subject = newName;
    }));

    sim.scenarios.forEach(sc => {
        if (sc.hypo[oldName]) {
            sc.hypo[newName] = sc.hypo[oldName];
            delete sc.hypo[oldName];
        }
    });
    if (sim.selected === oldName) sim.selected = newName;

    for (const day of Object.keys(state.timetable)) {
        state.timetable[day] = state.timetable[day].map(m => (m === oldName ? newName : m));
    }

    ["dismissed", "read"].forEach(bucket => ["nonote-", "risk-"].forEach(prefix => {
        if (state.alertMeta[bucket][prefix + oldName]) {
            state.alertMeta[bucket][prefix + newName] = true;
            delete state.alertMeta[bucket][prefix + oldName];
        }
    }));

    if (ui.catalog.selected === oldName) ui.catalog.selected = newName;
}

function openEditSubjectModal(mat) {
    const sub = state.subjects[mat];
    if (!sub) return;

    openModal({
        layout: "panel",
        title: `Editează · ${mat}`,
        confirmText: "Salvează",
        body: subjectFormHTML({ name: mat, ...sub }, { withFlags: true }),
        onConfirm: () => {
            if (!state.subjects[mat]) {
                closeActionModal();
                showToast("⚠️ Materia nu mai există.");
                return;
            }
            let name = mat;
            if (isOptionalName(mat)) name = optionalName(field("subj-opt"));
            else if (field("subj-swap")) name = field("subj-swap");
            if (name !== mat && findSubjectName(name) && findSubjectName(name) !== mat) {
                showToast(`⚠️ ${name} e deja în catalog.`);
                return;
            }

            const changes = [];
            const ore = sub.ore; // orele vin din planul-cadru
            const target = clampNumber(field("subj-target"), 1, 10, sub.target);
            const priority = $("subj-priority")?.checked ?? sub.priority;
            const excludeFromGPA = $("subj-exclude")?.checked ?? sub.excludeFromGPA;

            if (ore !== sub.ore) changes.push(`ore ${fmtNumber(sub.ore)} → ${fmtNumber(ore)}`);
            if (target !== sub.target) changes.push(`ținta ${fmtTarget(sub.target)} → ${fmtTarget(target)}`);
            if (priority !== sub.priority) changes.push(priority ? "prioritară" : "nu mai e prioritară");
            if (excludeFromGPA !== sub.excludeFromGPA) changes.push(excludeFromGPA ? "exclusă din medie" : "inclusă în medie");
            Object.assign(sub, { ore, target, priority, excludeFromGPA });

            if (name !== mat) {
                renameSubject(mat, name);
                changes.unshift(`redenumită în ${name}`);
            }

            if (changes.length) addActivity(`${mat}: ${changes.join(", ")}.`);
            closeActionModal();
            refresh();
            showToast(changes.length ? "Materie actualizată." : "Nicio modificare.");
        }
    });
}

function deleteSubject(mat) {
    const sub = state.subjects[mat];
    if (!sub) return;
    closeActionModal();
    const n = sub.grades.length;
    withUndo(`Ai șters materia ${mat}${n ? ` și ${plural(n, "notă", "note")}` : ""}.`, () => {
        delete state.subjects[mat];
        if (ui.catalog.selected === mat) {
            ui.catalog.selected = "";
            ui.catalog.showDetail = false;
        }
        pruneSubjectAlertMeta();
        addActivity(`Ai șters materia ${mat}.`);
    }, {
        afterUndo: () => {
            ui.catalog.selected = mat;
            ui.catalog.autoPicked = false;
        }
    });
}

function togglePriority(mat) {
    const sub = state.subjects[mat];
    if (!sub) return;
    sub.priority = !sub.priority;
    addActivity(sub.priority ? `Ai marcat materia ${mat} ca prioritară.` : `Ai eliminat ${mat} din materiile prioritare.`);
    refresh();
}

function toggleExclude(mat) {
    const sub = state.subjects[mat];
    if (!sub) return;
    sub.excludeFromGPA = !sub.excludeFromGPA;
    addActivity(sub.excludeFromGPA ? `${mat} a fost exclusă din media generală.` : `${mat} a fost inclusă din nou în media generală.`);
    refresh();
}
