/* urNotes · Nota rapidă: „+” pe rândul unei materii → tipul și notele 1–10, o atingere și nota e pusă.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== NOTĂ RAPIDĂ ==================== */
/* Butonul „+” de pe rândul unei materii: o mică fereastră lipită de rând, cu tipul (ținut minte) și notele 1–10.
   O atingere pe notă o adaugă pe loc (azi), cu „Anulează” în mesaj. „Mai multe” deschide formularul întreg (data, legătura cu un test). */
const QUICK_TYPE_KEY = "urn_quick_grade_type_v1";
const quickGrade = { mat: "", anchor: null, type: "Test" };
try { const t = localStorage.getItem(QUICK_TYPE_KEY); if (GRADE_TYPES.includes(t)) quickGrade.type = t; } catch (_) { /* fără stocare */ }

function openQuickGrade(mat, anchor) {
    if (!state.subjects[mat]) return;
    if (!requireAccount()) return;
    closeQuickGrade();
    Object.assign(quickGrade, { mat, anchor });
    const pop = document.createElement("div");
    pop.id = "quick-grade";
    pop.className = "quick-grade";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", `Notă nouă la ${mat}`);
    pop.innerHTML = quickGradeHTML();
    document.body.append(pop);
    anchor?.classList.add("is-open");
    placeQuickGrade();
    pop.querySelector(".qg-val[data-val='10']")?.focus();
}

function quickGradeHTML() {
    const d = metrics.subjects[quickGrade.mat];
    return `
        <div class="qg-head"><b>${escapeHTML(quickGrade.mat)}</b><small>${d && state.subjects[quickGrade.mat].grades.length ? `media ${d.exactAvg.toFixed(2)} · ` : ""}azi</small></div>
        <div class="qg-types" role="radiogroup" aria-label="Tipul">
            ${GRADE_TYPES.map(t => `<button type="button" class="qg-type" data-action="quick-grade-type" data-type="${escapeHTML(t)}" role="radio" aria-checked="${t === quickGrade.type}">${escapeHTML(t)}</button>`).join("")}
        </div>
        <div class="qg-vals" role="group" aria-label="Nota">
            ${Array.from({ length: 10 }, (_, i) => 10 - i).map(n => `<button type="button" class="qg-val tone-${gradeTone(n)}" data-action="quick-grade-add" data-val="${n}">${n}</button>`).join("")}
        </div>
        <button type="button" class="qg-more" data-action="quick-grade-more">Mai multe (altă zi, alt test)…</button>`;
}

function placeQuickGrade() {
    const pop = $("quick-grade"), a = quickGrade.anchor;
    if (!pop || !a || !document.contains(a)) return closeQuickGrade();
    const r = a.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    const below = r.bottom + 6 + h <= window.innerHeight - 8;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(below ? r.bottom + 6 : Math.max(8, r.top - h - 6))}px`;
}

function closeQuickGrade({ focus = false } = {}) {
    const pop = $("quick-grade");
    if (!pop) return;
    pop.remove();
    quickGrade.anchor?.classList.remove("is-open");
    if (focus && quickGrade.anchor && document.contains(quickGrade.anchor)) quickGrade.anchor.focus();
}

Object.assign(ACTIONS, {
    "quick-grade": el => ($("quick-grade") && quickGrade.mat === el.dataset.mat ? closeQuickGrade() : openQuickGrade(el.dataset.mat, el)),
    "quick-grade-type": el => {
        quickGrade.type = el.dataset.type;
        try { localStorage.setItem(QUICK_TYPE_KEY, quickGrade.type); } catch (_) { /* fără stocare */ }
        document.querySelectorAll(".qg-type").forEach(b => b.setAttribute("aria-checked", String(b === el)));
    },
    "quick-grade-add": el => {
        const mat = quickGrade.mat, val = Number(el.dataset.val), type = quickGrade.type;
        if (!state.subjects[mat] || !(val >= 1 && val <= 10)) return closeQuickGrade();
        closeQuickGrade({ focus: true });
        withUndo(`✅ Ai pus ${val} (${type}) la ${mat}.`, () => {
            state.subjects[mat].grades.push({ id: uid(), val, type, date: getLocalDateKey() });
            addActivity(`Ai adăugat nota ${val} (${type}) la ${mat}.`);
        });
        celebrateGrade(val);
    },
    "quick-grade-more": () => {
        const mat = quickGrade.mat;
        closeQuickGrade();
        openAddGradeModal(mat);
    }
});

document.addEventListener("pointerdown", event => {
    if ($("quick-grade") && !event.target.closest("#quick-grade, .cat-quick")) closeQuickGrade();
}, true);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && $("quick-grade")) { event.stopPropagation(); closeQuickGrade({ focus: true }); return; }
    // o cifră cât e deschisă: 1–9, iar 0 = 10
    if ($("quick-grade") && /^[0-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        $("quick-grade").querySelector(`.qg-val[data-val='${event.key === "0" ? 10 : event.key}']`)?.click();
    }
}, true);
window.addEventListener("resize", () => closeQuickGrade());
document.addEventListener("scroll", () => placeQuickGrade(), true);
