/* urNotes · Meniul lateral ca un arbore de pagini (ca în Notion): Azi, Calendar, Note → fiecare materie, Mai mult → Plan, Progres…
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const SIDE_OPEN_KEY = "urn_side_open_v1";
const sideOpen = (() => { try { return { grades: true, more: false, ...JSON.parse(localStorage.getItem(SIDE_OPEN_KEY) || "{}") }; } catch (_) { return { grades: true, more: false }; } })();

const SIDE_SHORT_MAX = 5;
function renderSideTree() {
    const subs = $("side-subjects");
    if (!subs) return;
    const openMat = ui.activeTab === "tab-catalog" && ui.catalog.showDetail ? ui.catalog.selected : "";
    const names = Object.keys(state.subjects).sort((a, b) => a.localeCompare(b, "ro"));
    const key = JSON.stringify([names, openMat, ui.activeTab, sideOpen, names.map(m => metrics.subjects[m]?.statusClass), names.map(m => state.subjects[m]?.icon), names.map(m => state.subjects[m]?.priority)]);
    if (renderSideTree.key === key) return;
    renderSideTree.key = key;

    const twist = (k, label) => `<button type="button" class="side-twist ${sideOpen[k] ? "is-open" : ""}" data-action="side-toggle" data-key="${k}" aria-expanded="${sideOpen[k]}" aria-label="${escapeHTML(`${sideOpen[k] ? "Strânge" : "Arată"} ${label}`)}">${icon("chevron")}</button>`;
    document.querySelector('.side-nav [data-tab="tab-catalog"]')?.closest(".side-row")?.querySelector(".side-twist")?.remove();
    const noteRow = document.querySelector('.side-nav .side-row-grades');
    noteRow?.querySelector(".side-row-add")?.remove();
    if (noteRow) noteRow.insertAdjacentHTML("beforeend", `<button type="button" class="side-row-add" data-action="side-add-subject" aria-label="Materie nouă" title="Materie nouă">${icon("plus")}</button>${twist("grades", "materiile")}`);
    subs.hidden = !sideOpen.grades;
    // Sub „Note”: doar materiile prioritare (★) și cele la risc; restul la „Toate materiile”, ca meniul să rămână scurt.
    const risk = m => metrics.subjects[m]?.statusClass === "badge-danger";
    let featured = names.filter(m => state.subjects[m].priority || risk(m) || m === openMat);
    // Nimic prioritar sau la risc: arătăm orele de azi (sau primele materii), nu toată lista
    if (!featured.length && names.length > SIDE_SHORT_MAX) {
        const todays = new Set(state.timetable[new Date().getDay()] || []);
        featured = names.filter(m => todays.has(m)).slice(0, SIDE_SHORT_MAX);
        if (!featured.length) featured = names.slice(0, 3);
    }
    const shortList = featured.length > 0 && featured.length < names.length;
    const shown = shortList && !sideOpen.all ? featured : names;
    const row = m => `
        <button type="button" class="side-sub ${m === openMat ? "is-active" : ""}" data-action="side-subject" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}" ${m === openMat ? 'aria-current="page"' : ""}>
            <span class="side-sub-dot" aria-hidden="true"></span><span class="side-sub-emoji" aria-hidden="true">${subjectEmoji(m)}</span><span class="side-sub-name">${escapeHTML(m)}</span>${state.subjects[m].priority ? `<span class="side-sub-star" title="prioritară" aria-label="prioritară">★</span>` : ""}${risk(m) ? `<span class="side-sub-risk" title="la risc">!</span>` : ""}
        </button>`;
    subs.innerHTML = names.length
        ? shown.map(row).join("") + (shortList ? `<button type="button" class="side-sub side-all" data-action="side-toggle" data-key="all" aria-expanded="${Boolean(sideOpen.all)}">${sideOpen.all ? "Doar prioritare și la risc" : `Toate materiile (${names.length})`}</button>` : "")
        : `<p class="side-empty">Nicio materie încă</p>`;
}

Object.assign(ACTIONS, {
    "side-toggle": el => {
        const k = el.dataset.key;
        sideOpen[k] = !sideOpen[k];
        try { localStorage.setItem(SIDE_OPEN_KEY, JSON.stringify(sideOpen)); } catch (_) { /* fără stocare */ }
        renderSideTree();
    },
    "side-subject": el => openSubjectInCatalog(el.dataset.mat),
    // „Note”: duce la pagină și deschide lista materiilor; apăsat din nou pe pagina Note, o strânge sau o deschide
    "side-note": () => {
        const here = ui.activeTab === "tab-catalog" && !ui.catalog.showDetail;
        sideOpen.grades = here ? !sideOpen.grades : true;
        try { localStorage.setItem(SIDE_OPEN_KEY, JSON.stringify(sideOpen)); } catch (_) { /* fără stocare */ }
        if (ui.activeTab === "tab-catalog" && ui.catalog.showDetail) ui.catalog = { ...ui.catalog, showDetail: false };
        switchTab("tab-catalog");
        renderSideTree();
    },
    // logo-ul urNotes: înapoi la Azi, sus de tot
    "brand-home": () => {
        switchTab("tab-dashboard");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
});
["side-toggle", "side-subject", "side-note", "brand-home", "db-past", "cal-jump"].forEach(a => GUEST_OK.add(a));
