/* urNotes · Setările pe secțiuni: Profil, Școală, Calcul, Amintiri, Cont, Date.
   Pe ecran e o singură secțiune; meniul de sus le schimbă, iar alegerea rămâne ținută minte.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const SET_SEC_KEY = "urn_settings_section_v1";
const SET_SECTIONS = ["profil", "scoala", "calcul", "amintiri", "cont", "date"];

/** Secțiunile care se pot arăta acum (Contul doar când există conturi). */
function availableSettingsSections() {
    return SET_SECTIONS.filter(sec => sec !== "cont" || document.body.classList.contains("has-cloud"));
}

function showSettingsSection(sec, { remember = true } = {}) {
    const grid = $("settings-grid");
    if (!grid) return;
    if (!availableSettingsSections().includes(sec)) sec = "profil";
    grid.dataset.sec = sec;
    document.querySelectorAll("#set-sec-nav .set-sec").forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.sec === sec)));
    if (remember) { try { localStorage.setItem(SET_SEC_KEY, sec); } catch (_) { /* fără stocare */ } }
}

/** Deschide Setările direct la cardul cerut (de ex. structura anului, din Purtare). */
function openSettingsAt(cardId) {
    const card = $(cardId);
    switchTab("tab-setari");
    if (card?.dataset.sec) showSettingsSection(card.dataset.sec);
    card?.scrollIntoView({ block: "start", behavior: "smooth" });
}

Object.assign(ACTIONS, {
    "set-sec": el => {
        showSettingsSection(el.dataset.sec);
        if (window.scrollY > 0) $("set-sec-nav")?.scrollIntoView({ block: "start" });
    },
    "purtare-settings": () => openSettingsAt("modules-card")
});
GUEST_OK.add("set-sec");

// Săgețile stânga/dreapta trec la secțiunea vecină, cu focusul pe ea
document.addEventListener("keydown", event => {
    const btn = event.target.closest?.("#set-sec-nav .set-sec");
    if (!btn || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
    const list = [...document.querySelectorAll("#set-sec-nav .set-sec")].filter(b => b.getClientRects().length || !b.classList.contains("cloud-only"));
    const next = list[(list.indexOf(btn) + (event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
    if (!next) return;
    event.preventDefault();
    next.focus();
    showSettingsSection(next.dataset.sec);
});

// La fiecare deschidere a Setărilor revine secțiunea ținută minte (Contul apare abia după ce știm că există conturi)
const renderSettingsBase = TAB_RENDERERS["tab-setari"];
TAB_RENDERERS["tab-setari"] = (...args) => {
    renderSettingsBase?.(...args);
    let saved = $("settings-grid")?.dataset.sec || "profil";
    try { saved = localStorage.getItem(SET_SEC_KEY) || saved; } catch (_) { /* fără stocare */ }
    showSettingsSection(saved, { remember: false });
};

(() => {
    let saved = "profil";
    try { saved = localStorage.getItem(SET_SEC_KEY) || "profil"; } catch (_) { /* fără stocare */ }
    showSettingsSection(saved, { remember: false });
})();
