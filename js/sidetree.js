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
    const key = JSON.stringify([names, openMat, ui.activeTab, sideOpen, names.map(m => metrics.subjects[m]?.statusClass)]);
    if (renderSideTree.key === key) return;
    renderSideTree.key = key;

    const twist = (k, label) => `<button type="button" class="side-twist ${sideOpen[k] ? "is-open" : ""}" data-action="side-toggle" data-key="${k}" aria-expanded="${sideOpen[k]}" aria-label="${escapeHTML(`${sideOpen[k] ? "Strânge" : "Arată"} ${label}`)}">${icon("chevron")}</button>`;
    document.querySelector('.side-nav [data-tab="tab-catalog"]')?.closest(".side-row")?.querySelector(".side-twist")?.remove();
    const noteRow = document.querySelector('.side-nav .side-row-grades');
    if (noteRow) noteRow.insertAdjacentHTML("beforeend", twist("grades", "materiile"));
    subs.hidden = !sideOpen.grades;
    subs.innerHTML = names.map(m => `
        <button type="button" class="side-sub ${m === openMat ? "is-active" : ""}" data-action="side-subject" data-mat="${escapeHTML(m)}" style="${subjectStyle(m)}" ${m === openMat ? 'aria-current="page"' : ""}>
            <span class="side-sub-dot" aria-hidden="true"></span><span class="side-sub-name">${escapeHTML(m)}</span>${metrics.subjects[m]?.statusClass === "badge-danger" ? `<span class="side-sub-risk" title="la risc">!</span>` : ""}
        </button>`).join("") || `<p class="side-empty">Nicio materie încă</p>`;
    more.innerHTML = `
        <div class="side-row">
            <button type="button" class="side-group-head" data-action="side-toggle" data-key="more" aria-expanded="${sideOpen.more}">${icon("chevron", `side-chev ${sideOpen.more ? "is-open" : ""}`)}<span>Mai mult</span></button>
        </div>
        <div class="side-children" ${sideOpen.more ? "" : "hidden"}>
            ${SIDE_MORE.map(t => `<button type="button" class="side-sub side-page ${ui.activeTab === t ? "is-active" : ""}" data-action="nav" data-tab="${t}" ${ui.activeTab === t ? 'aria-current="page"' : ""}>${icon(TABS[t]?.icon || "note")}<span class="side-sub-name">${escapeHTML(TABS[t]?.title || t)}</span></button>`).join("")}
        </div>`;
}

Object.assign(ACTIONS, {
    "side-toggle": el => {
        const k = el.dataset.key;
        sideOpen[k] = !sideOpen[k];
        try { localStorage.setItem(SIDE_OPEN_KEY, JSON.stringify(sideOpen)); } catch (_) { /* fără stocare */ }
        renderSideTree();
    },
    "side-subject": el => openSubjectInCatalog(el.dataset.mat)
});
["side-toggle", "side-subject", "db-past"].forEach(a => GUEST_OK.add(a));
