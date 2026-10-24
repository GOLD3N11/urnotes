/* urNotes · Meniul lateral ca un arbore de pagini (ca în Notion): Azi, Calendar, Note → fiecare materie, Mai mult → Plan, Progres…
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const SIDE_OPEN_KEY = "urn_side_open_v1";
const sideOpen = (() => { try { return { grades: true, more: false, ...JSON.parse(localStorage.getItem(SIDE_OPEN_KEY) || "{}") }; } catch (_) { return { grades: true, more: false }; } })();
const SIDE_MORE = ["tab-plan", "tab-statistici", "tab-simulator", "tab-examene"];

function renderSideTree() {
    const subs = $("side-subjects"), more = $("side-more");
    if (!subs || !more) return;
    const openMat = ui.activeTab === "tab-catalog" && ui.catalog.showDetail ? ui.catalog.selected : "";
    const names = Object.keys(state.subjects).sort((a, b) => a.localeCompare(b, "ro"));
    const wsName = (state.settings.profile?.name || "").trim();
    const key = JSON.stringify([names, openMat, ui.activeTab, sideOpen, names.map(m => metrics.subjects[m]?.statusClass), names.map(m => state.subjects[m]?.icon), wsName]);
    if (renderSideTree.key === key) return;
    renderSideTree.key = key;

    const twist = (k, label) => `<button type="button" class="side-twist ${sideOpen[k] ? "is-open" : ""}" data-action="side-toggle" data-key="${k}" aria-expanded="${sideOpen[k]}" aria-label="${escapeHTML(`${sideOpen[k] ? "Strânge" : "Arată"} ${label}`)}">${icon("chevron")}</button>`;
    document.querySelector('.side-nav [data-tab="tab-catalog"]')?.closest(".side-row")?.querySelector(".side-twist")?.remove();
    const noteRow = document.querySelector('.side-nav .side-row-grades');
    noteRow?.querySelector(".side-row-add")?.remove();
    if (noteRow) noteRow.insertAdjacentHTML("beforeend", `<button type="button" class="side-row-add" data-action="side-add-subject" aria-label="Materie nouă" title="Materie nouă">${icon("plus")}</button>${twist("grades", "materiile")}`);
    // antetul „spațiului de lucru”, ca în Notion (se vede doar în stilul Notion)
    const brand = document.querySelector(".sidebar .side-brand");
    if (brand) {
        brand.querySelector(".side-ws")?.remove();
        brand.insertAdjacentHTML("beforeend", `<span class="side-ws"><span class="side-ws-av" aria-hidden="true">${escapeHTML((wsName || "u").slice(0, 1).toUpperCase())}</span><span class="side-ws-name">${escapeHTML(wsName ? `urNotes-ul lui ${wsName}` : "urNotes")}</span></span>`);
    }
    subs.hidden = !sideOpen.grades;
    subs.innerHTML = names.map(m => `
        <button type="button" class="side-sub ${m === openMat ? "is-active" : ""}" data-action="side-subject" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}" ${m === openMat ? 'aria-current="page"' : ""}>
            <span class="side-sub-dot" aria-hidden="true"></span><span class="side-sub-emoji" aria-hidden="true">${subjectEmoji(m)}</span><span class="side-sub-name">${escapeHTML(m)}</span>${metrics.subjects[m]?.statusClass === "badge-danger" ? `<span class="side-sub-risk" title="la risc">!</span>` : ""}
        </button>`).join("") || `<p class="side-empty">Nicio materie încă</p>`;
    more.innerHTML = `
        <div class="side-row">
            <button type="button" class="side-group-head" data-action="side-toggle" data-key="more" aria-expanded="${sideOpen.more}">${icon("chevron", `side-chev ${sideOpen.more ? "is-open" : ""}`)}<span>Mai mult</span></button>
        </div>
        <div class="side-children" ${sideOpen.more ? "" : "hidden"}>
            ${SIDE_MORE.map(t => `<button type="button" class="side-sub side-page ${ui.activeTab === t ? "is-active" : ""}" data-action="nav" data-tab="${t}" ${ui.activeTab === t ? 'aria-current="page"' : ""}>${icon(TABS[t]?.icon || "note")}<span class="side-sub-emoji" aria-hidden="true">${PAGE_EMOJI[t] || ""}</span><span class="side-sub-name">${escapeHTML(TABS[t]?.title || t)}</span></button>`).join("")}
        </div>`;
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
