/* urNotes · Randare: tabul activ, insigna de notificări.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== RANDARE ==================== */
/* Registrul paginilor: fiecare fișier își înregistrează pagina (tabul) cu registerTab, așa că o pagină nouă
   înseamnă un fișier nou + o secțiune în index.html, fără să umbli prin restul codului. */
const TABS = {};
const TAB_RENDERERS = {};
function registerTab(id, def) {
    TABS[id] = { id, ...def };
    TAB_RENDERERS[id] = def.render;
}

/** Colegul din meniu: fața lui pe butonul „Eu” (telefon) și cartonașul cu nivelul (meniul lateral). */
function renderPalChrome() {
    const look = palLook();
    const p = palProgress();
    const key = `${look.color}|${look.acc}|${p.level}|${Math.round(p.pct * 20)}|${buddyName()}`;
    if (renderPalChrome.key === key) return;
    renderPalChrome.key = key;
    const navIcon = document.querySelector("#more-btn > span:first-child");
    if (navIcon) navIcon.innerHTML = buddySVG("happy", "nav-pal");
    const card = $("side-pal");
    if (card) card.innerHTML = `
        <button type="button" class="side-pal-btn" data-action="wardrobe-open" aria-label="${escapeHTML(`${buddyName()}, nivelul ${p.level}: garderoba`)}">
            ${buddySVG("happy", "side-pal-buddy")}
            <span class="side-pal-text"><b>${escapeHTML(buddyName())}</b><small>nivelul ${p.level}</small></span>
            <span class="side-pal-bar" aria-hidden="true"><i style="width:${(p.pct * 100).toFixed(0)}%"></i></span>
        </button>`;
}

function renderActiveTab({ keepSettingsForm = false } = {}) {
    renderPalChrome();
    renderPagePal(ui.activeTab); // colegul din antet (pe fiecare pagină)
    // Formularul de setări nu e redesenat la fiecare calcul, ca să nu pierdem ce scrie utilizatorul.
    if (keepSettingsForm && ui.activeTab === "tab-setari") return;

    const render = TAB_RENDERERS[ui.activeTab];
    if (!render) return;

    try {
        render();
    } catch (err) {
        console.error(`Eroare la afișarea ${ui.activeTab}.`, err);
    }
}

function emptyNote(text) {
    return `<p class="empty-note"><span class="empty-pal" aria-hidden="true">${buddySVG("focused", "empty-buddy")}</span><span>${escapeHTML(text)}</span></p>`;
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function renderNotificationBadge() {
    const badge = $("notif-badge");
    if (!badge) return;
    const unread = alerts.filter(a => a.unread).length;
    badge.textContent = unread;
    badge.hidden = unread === 0;
    $("notif-btn")?.setAttribute("aria-label", unread > 0 ? `Notificări (${unread} necitite)` : "Notificări");
    // Pe ecranul principal (iPhone, Android), iconița aplicației arată același număr ca clopoțelul.
    if ("setAppBadge" in navigator && !guest.on) {
        (unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge?.())?.catch?.(() => {});
    }
}
