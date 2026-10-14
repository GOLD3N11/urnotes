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

function renderActiveTab({ keepSettingsForm = false } = {}) {
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
    return `<p class="empty-note">${escapeHTML(text)}</p>`;
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
