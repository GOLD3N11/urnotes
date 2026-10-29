/* urNotes · Intrarea fiecărei pagini: o scurtă animație (sub o secundă) peste conținut.
   Un post-it „se lipește” în mijloc cu desenul animat al paginii (soarele pentru Azi, foaia de calendar care se rupe,
   caietul care își întoarce pagina, cronometrul, graficul care crește, ținta, toca aruncată în aer, rotițele),
   apoi pleacă și cardurile paginii noi intră pe rând. Nu oprește nimic: poți apăsa oricând în timpul ei.
   Se oprește din Setări (Profil › Aspect) și dispare cu „reducere mișcare”.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const PAGEFX_KEY = "urn_page_fx_v1";
const PAGEFX_MS = 900;
const pfx = { t: 0, bootAt: Date.now() };

function pageFxOn() {
    try { return localStorage.getItem(PAGEFX_KEY) !== "0"; } catch (_) { return true; }
}
function setPageFx(on) {
    try { localStorage.setItem(PAGEFX_KEY, on ? "1" : "0"); } catch (_) { /* fără stocare */ }
}

const PF_INK = "#1E2B58", PF_Y = "#FFC93C", PF_PINK = "#FF7AA8";
const pfL = (d, cls = "", w = 4.5) => `<path class="${cls}" d="${d}" stroke="${PF_INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/* Desenele, câte unul pe pagină (viewBox 0 0 120 120; clasele pf-* sunt animate din ui.css). */
const PAGE_FX_ART = {
    // Azi: soarele răsare, razele se rotesc
    "tab-dashboard": `
        <g class="pf-rise"><g class="pf-rays">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M60 22 V12" transform="rotate(${a} 60 50)" stroke="${PF_INK}" stroke-width="4.5" stroke-linecap="round"/>`).join("")}</g>
        <circle cx="60" cy="50" r="17" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5"/></g>
        ${pfL("M18 88 H102", "pf-draw")}${pfL("M32 100 H88", "pf-draw pf-late")}`,
    // Calendar: foaia de sus se rupe și zboară, dedesubt apare ziua de azi
    "tab-calendar": `
        <rect x="24" y="26" width="72" height="70" rx="8" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5"/>
        <text x="60" y="80" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="34" fill="${PF_INK}" class="pf-pop">${new Date().getDate()}</text>
        <g class="pf-tear"><rect x="24" y="26" width="72" height="70" rx="8" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5"/>
        <text x="60" y="80" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="34" fill="${PF_INK}">${new Date(Date.now() - 864e5).getDate()}</text></g>
        <rect x="24" y="26" width="72" height="16" rx="6" fill="${PF_PINK}" stroke="${PF_INK}" stroke-width="4.5"/>
        ${pfL("M42 20 V32M78 20 V32")}`,
    // Note: caietul își întoarce pagina
    "tab-catalog": `
        <path d="M60 30 C48 24 32 24 22 28 V94 C32 90 48 90 60 96 Z" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M60 30 C72 24 88 24 98 28 V94 C88 90 72 90 60 96 Z" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5" stroke-linejoin="round"/>
        ${pfL("M32 44 H50M32 56 H50M32 68 H46", "pf-draw", 3.5)}${pfL("M70 44 H88M70 56 H88", "pf-draw pf-late", 3.5)}
        <g class="pf-page"><path d="M60 30 C72 24 88 24 98 28 V94 C88 90 72 90 60 96 Z" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5" stroke-linejoin="round"/></g>`,
    // Plan: cronometrul își desenează inelul, acul se rotește
    "tab-plan": `
        ${pfL("M52 18 H68M60 18 V28", "", 4.5)}
        <circle cx="60" cy="66" r="34" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5"/>
        <circle class="pf-ring" cx="60" cy="66" r="26" fill="none" stroke="${PF_Y}" stroke-width="9" stroke-linecap="round" transform="rotate(-90 60 66)" pathLength="100"/>
        <g class="pf-hand">${pfL("M60 66 V44")}</g><circle cx="60" cy="66" r="4" fill="${PF_INK}"/>`,
    // Progres: barele cresc pe rând, linia de tendință se desenează
    "tab-statistici": `
        ${pfL("M20 98 H102")}
        <rect class="pf-bar" x="28" y="62" width="16" height="36" rx="4" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5"/>
        <rect class="pf-bar pf-late" x="52" y="46" width="16" height="52" rx="4" fill="${PF_PINK}" stroke="${PF_INK}" stroke-width="4.5"/>
        <rect class="pf-bar pf-later" x="76" y="28" width="16" height="70" rx="4" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5"/>
        ${pfL("M24 52 L48 38 L66 44 L98 16", "pf-draw pf-later", 4)}`,
    // Ce-ar fi dacă: inelele țintei se deschid, săgeata zboară în centru
    "tab-simulator": `
        <circle class="pf-ring-in" cx="58" cy="62" r="36" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5"/>
        <circle class="pf-ring-in pf-late" cx="58" cy="62" r="24" fill="${PF_PINK}" stroke="${PF_INK}" stroke-width="4.5"/>
        <circle class="pf-ring-in pf-later" cx="58" cy="62" r="11" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5"/>
        <g class="pf-dart">${pfL("M60 60 L100 20")}${pfL("M92 18 L100 20 L102 28")}</g>`,
    // Examene: toca e aruncată în aer, ciucurele se leagănă
    "tab-examene": `
        <g class="pf-toss"><path d="M14 46 L60 26 L106 46 L60 66 Z" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M34 56 V76 C46 86 74 86 86 76 V56" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5" stroke-linejoin="round"/>
        <g class="pf-tassel">${pfL("M96 50 V72", "", 3.5)}<circle cx="96" cy="76" r="4" fill="${PF_PINK}" stroke="${PF_INK}" stroke-width="2.5"/></g></g>`,
    // Setări: două rotițe se învârt una în alta
    "tab-setari": `
        <g class="pf-gear"><path d="${pfGear(48, 58, 26, 18, 9)}" fill="${PF_Y}" stroke="${PF_INK}" stroke-width="4.5" stroke-linejoin="round"/><circle cx="48" cy="58" r="8" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4.5"/></g>
        <g class="pf-gear2"><path d="${pfGear(84, 82, 17, 11.5, 7)}" fill="${PF_PINK}" stroke="${PF_INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="84" cy="82" r="5" fill="#FFFFFF" stroke="${PF_INK}" stroke-width="4"/></g>`
};

/** Conturul unei rotițe cu `n` dinți (rază exterioară `ro`, interioară `ri`). */
function pfGear(cx, cy, ro, ri, n) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? ri : ro;
        const half = Math.PI / (n * 2) * 0.55;
        pts.push([cx + r * Math.cos(a - half), cy + r * Math.sin(a - half)], [cx + r * Math.cos(a + half), cy + r * Math.sin(a + half)]);
    }
    return `M${pts.map(p => p.map(v => v.toFixed(1)).join(" ")).join(" L")} Z`;
}

/** Se poate arăta animația acum? (nu la pornire, nu cu „reducere mișcare”, nu în testele automate) */
const PFX_REAL = !/jsdom/i.test((typeof navigator !== "undefined" && navigator.userAgent) || "");
function pageFxReady(tabId) {
    return PFX_REAL && Boolean(PAGE_FX_ART[tabId]) && pageFxOn() && !reduceMotion() && Date.now() - pfx.bootAt > 1200;
}

/**
 * Animația de intrare a paginii `tabId`. Totul se mișcă doar prin transform/opacity (merge pe placa video),
 * deci rămâne lin chiar și cât timp aplicația desenează pagina nouă dedesubt.
 * `instant`: foaia acoperă deja tot (pagina s-a schimbat pe loc, de ex. din căutare).
 */
function pageFx(tabId, { instant = false } = {}) {
    if (!pageFxReady(tabId)) return false;
    const main = document.querySelector(".content-body");
    if (!main) return false;
    document.querySelector(".pagefx")?.remove();
    clearTimeout(pfx.t);
    const r = main.getBoundingClientRect();
    const left = Math.max(0, r.left), width = Math.min(innerWidth, r.width) || innerWidth;
    const recent = typeof fluid !== "undefined" && Date.now() - fluid.pAt < 800;
    const ox = recent ? fluid.px - left : width / 2, oy = recent ? fluid.py : innerHeight / 2;
    // raza până la colțul cel mai îndepărtat: cercul de hârtie acoperă tot fără să se vadă marginea
    const radius = Math.ceil(Math.hypot(Math.max(ox, width - ox), Math.max(oy, innerHeight - oy))) + 4;
    const box = document.createElement("div");
    box.className = `pagefx${instant ? " is-instant" : ""}`;
    box.setAttribute("aria-hidden", "true");
    box.style.left = `${left}px`;
    box.style.width = `${width}px`;
    const title = TABS[tabId]?.title || "";
    box.innerHTML = `
        <span class="pagefx-sheet" style="left:${ox}px;top:${oy}px;width:${radius * 2}px;height:${radius * 2}px"></span>
        <div class="pagefx-note"><svg viewBox="0 0 120 120" class="pagefx-art">${PAGE_FX_ART[tabId]}</svg></div>
        <b class="pagefx-title">${escapeHTML(title)}</b>`;
    document.body.appendChild(box);
    document.body.classList.add("pfx-on");
    pfx.t = setTimeout(() => { box.remove(); document.body.classList.remove("pfx-on"); }, PAGEFX_MS);
    return true;
}

/**
 * Navigarea apăsată de elev: întâi pornește animația (foaia acoperă pagina veche), iar pagina nouă se desenează
 * abia când e acoperită, ca desenatul să nu „înghețe” animația. Fără animație, schimbarea e imediată.
 */
const PFX_SWAP_MS = 170;
function navigateWithFx(tabId) {
    clearTimeout(pfx.swap);
    if (!$(tabId) || ui.activeTab === tabId || !pageFxReady(tabId)) { switchTab(tabId); return; }
    pfx.pending = tabId;
    pageFx(tabId);
    pfx.swap = setTimeout(() => {
        pfx.pending = null;
        pfx.fromFx = true;
        switchTab(tabId);
        pfx.fromFx = false;
    }, PFX_SWAP_MS);
}

/* Comutatorul din Setări › Aspect */
document.addEventListener("change", event => {
    if (event.target.id === "set-pagefx") setPageFx(event.target.checked);
});
function syncPageFxSetting() {
    const box = $("set-pagefx");
    if (box) box.checked = pageFxOn();
}
syncPageFxSetting();
