/* urNotes · Ferestrele (formularele, confirmările, notificările) pe ecrane mari:
   le poți trage oriunde (fereastră liberă) sau le poți lipi de o margine — stânga, dreapta, jos — ori la mijloc.
   Fiecare fel de fereastră își ține minte locul. Pe telefon rămân foi care urcă de jos.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const WIN_KEY = "urn_windows_v1";
const WIN_MODES = ["left", "right", "bottom", "float", "center"];
const WIN_DEFS = {
    form: { root: "action-modal", card: ".modal-card", handle: "#action-modal-title", def: { mode: "right", w: 480, h: 560 } },
    dialog: { root: "action-modal", card: ".modal-card", handle: "#action-modal-title", def: { mode: "center", w: 520, h: 360 } },
    notif: { root: "notif-panel", card: ".drawer-card", handle: ".drawer-head", def: { mode: "right", w: 420, h: 420 } }
};
const WIN_LABEL = { left: "Lipește în stânga", bottom: "Lipește jos", right: "Lipește în dreapta", float: "Fereastră liberă", center: "La mijloc" };
const WIN_SNAP = 56; // cât de aproape de margine trebuie lăsată ca să se lipească

const winPrefs = (() => {
    try {
        const raw = JSON.parse(localStorage.getItem(WIN_KEY) || "{}");
        return isPlainObject(raw) ? raw : {};
    } catch (_) { return {}; }
})();
const winSave = () => { try { localStorage.setItem(WIN_KEY, JSON.stringify(winPrefs)); } catch (_) { /* fără stocare */ } };

/** Doar pe ecrane mari cu mouse; pe telefon și tabletă ferestrele rămân foi. */
const winEnabled = () => typeof matchMedia === "function" && matchMedia("(min-width: 901px) and (pointer: fine)").matches;

function winKindOf(root) {
    if (root.id === "notif-panel") return "notif";
    return root.classList.contains("is-panel") ? "form" : "dialog";
}

function winPref(kind) {
    const def = WIN_DEFS[kind].def;
    const p = isPlainObject(winPrefs[kind]) ? winPrefs[kind] : {};
    const num = (v, lo, hi, d) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    return {
        mode: WIN_MODES.includes(p.mode) ? p.mode : def.mode,
        w: num(p.w, 300, 1400, def.w),
        h: num(p.h, 200, 1200, def.h),
        x: num(p.x, -2000, 6000, NaN),
        y: num(p.y, -2000, 6000, NaN),
        bw: num(p.bw, 160, 900, 320) // înălțimea când e lipită jos
    };
}

/** Marginea din stânga a zonei de conținut (după meniul lateral). */
function winLeftEdge() {
    const side = document.querySelector(".sidebar");
    const r = side && getComputedStyle(side).display !== "none" ? side.getBoundingClientRect() : null;
    return r && r.width ? Math.round(r.right) : 0;
}

/* ---------- butoanele de pe bara ferestrei ---------- */
const WIN_ICONS = {
    left: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><rect x="2.5" y="3.5" width="5.5" height="13" rx="1.5" class="f"/></svg>`,
    bottom: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><rect x="2.5" y="10.5" width="15" height="6" rx="1.5" class="f"/></svg>`,
    right: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><rect x="12" y="3.5" width="5.5" height="13" rx="1.5" class="f"/></svg>`,
    float: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><rect x="6" y="6.5" width="8" height="6" rx="1.2" class="f"/></svg>`,
    center: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2" class="f2"/><rect x="6.5" y="7" width="7" height="6" rx="1.2" class="f"/></svg>`
};
function winBarHTML(kind) {
    const modes = kind === "dialog" ? ["float", "center"] : ["left", "bottom", "right", "float", "center"];
    return `<span class="win-grip" aria-hidden="true" title="Trage ca s-o muți">⠿</span>
        <span class="win-modes" role="group" aria-label="Unde stă fereastra">${modes.map(m => `
            <button type="button" class="win-btn" data-action="win-mode" data-mode="${m}" aria-label="${WIN_LABEL[m]}" title="${WIN_LABEL[m]}">${WIN_ICONS[m]}</button>`).join("")}
        </span>`;
}

function winEnsureChrome(root, kind) {
    const card = root.querySelector(WIN_DEFS[kind].card);
    if (!card) return null;
    let bar = card.querySelector(":scope > .win-bar") || card.querySelector(".drawer-head .win-bar");
    if (!bar || bar.dataset.kind !== kind) {
        bar?.remove();
        bar = document.createElement("div");
        bar.className = "win-bar";
        bar.dataset.kind = kind;
        bar.innerHTML = winBarHTML(kind);
        if (kind === "notif") card.querySelector(".drawer-head h2")?.after(bar);
        else card.prepend(bar);
    }
    if (!card.querySelector(":scope > .win-edge")) {
        const edge = document.createElement("div");
        edge.className = "win-edge";
        edge.setAttribute("aria-hidden", "true");
        card.append(edge);
    }
    return card;
}

/* ---------- așezarea ---------- */
function winClear(root) {
    root.classList.remove("is-win", "is-modeless", ...WIN_MODES.map(m => `win-${m}`));
    const card = root.querySelector(".modal-card, .drawer-card");
    if (card) {
        ["left", "top", "width", "height", "--win-w", "--win-h", "--win-x0"].forEach(p => card.style.removeProperty(p));
        if (root.id === "action-modal") card.setAttribute("aria-modal", "true");
        else card.setAttribute("aria-modal", "true");
    }
}

function applyWindow(root, { mode: forced } = {}) {
    if (!root) return;
    if (root.hidden || !winEnabled()) { winClear(root); winReserve(); return; }
    const kind = winKindOf(root);
    const card = winEnsureChrome(root, kind);
    if (!card) return;
    const p = winPref(kind);
    const mode = forced || p.mode;
    winClear(root);
    root.classList.add("is-win", `win-${mode}`);
    root.dataset.winKind = kind;
    root.querySelectorAll(".win-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));

    const x0 = winLeftEdge();
    card.style.setProperty("--win-x0", `${x0}px`);
    if (mode === "left" || mode === "right") card.style.setProperty("--win-w", `${Math.min(p.w, Math.max(300, window.innerWidth - x0 - 320))}px`);
    if (mode === "bottom") card.style.setProperty("--win-h", `${Math.min(p.bw, Math.round(window.innerHeight * 0.8))}px`);
    if (mode === "float") {
        const w = Math.min(p.w, window.innerWidth - 24), h = Math.min(p.h, window.innerHeight - 24);
        const x = Number.isFinite(p.x) ? p.x : Math.round((window.innerWidth - w) / 2 + 80);
        const y = Number.isFinite(p.y) ? p.y : Math.round((window.innerHeight - h) / 3);
        card.style.left = `${Math.round(Math.min(Math.max(8, x), window.innerWidth - 120))}px`;
        card.style.top = `${Math.round(Math.min(Math.max(8, y), window.innerHeight - 60))}px`;
        card.style.width = `${w}px`;
        card.style.height = `${h}px`;
    }

    // la mijloc rămâne o fereastră care așteaptă un răspuns; lipită sau liberă, pagina de dedesubt rămâne folosibilă
    const modeless = mode !== "center";
    root.classList.toggle("is-modeless", modeless);
    card.setAttribute("aria-modal", String(!modeless));
    if (modeless) {
        const otherModal = [...document.querySelectorAll("#action-modal:not([hidden]), #notif-panel:not([hidden])")].some(r => r !== root && !r.classList.contains("is-modeless"));
        if (!otherModal && $("setup")?.hidden !== false && $("auth")?.hidden !== false) document.body.classList.remove("modal-open");
    } else {
        document.body.classList.add("modal-open");
    }
    winReserve();
}

/** Ferestrele lipite fac loc paginii (ca un panou în Notion), ca să nu acopere conținutul. */
let winBase = null;
function winReserve() {
    const body = document.body;
    const docks = { left: 0, right: 0, bottom: 0 };
    document.querySelectorAll("#action-modal.is-win:not([hidden]), #notif-panel.is-win:not([hidden])").forEach(root => {
        const mode = WIN_MODES.find(m => root.classList.contains(`win-${m}`));
        if (!(mode in docks)) return;
        const r = root.querySelector(".modal-card, .drawer-card")?.getBoundingClientRect();
        if (!r) return;
        docks[mode] = Math.max(docks[mode], Math.round(mode === "bottom" ? r.height : r.width));
    });
    const any = docks.left || docks.right || docks.bottom;
    if (!any) {
        if (winBase) { body.style.paddingLeft = body.style.paddingRight = body.style.paddingBottom = ""; winBase = null; }
        body.classList.remove("has-dock");
        return;
    }
    if (!winBase) {
        body.style.paddingLeft = body.style.paddingRight = body.style.paddingBottom = "";
        const cs = getComputedStyle(body);
        winBase = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0 };
    }
    body.classList.add("has-dock");
    body.style.paddingLeft = docks.left ? `${winBase.l + docks.left}px` : "";
    body.style.paddingRight = docks.right ? `${winBase.r + docks.right}px` : "";
    body.style.paddingBottom = docks.bottom ? `${winBase.b + docks.bottom}px` : "";
}

function setWindowMode(root, mode) {
    if (!root || !WIN_MODES.includes(mode)) return;
    const kind = winKindOf(root);
    winPrefs[kind] = { ...winPref(kind), mode };
    winSave();
    applyWindow(root);
    root.querySelector(`.win-btn[data-mode="${mode}"]`)?.focus({ preventScroll: true });
}

/* ---------- tragerea ---------- */
const winDrag = { on: false };

function winZoneFor(x, y) {
    const x0 = winLeftEdge();
    if (x <= x0 + WIN_SNAP) return "left";
    if (x >= window.innerWidth - WIN_SNAP) return "right";
    if (y >= window.innerHeight - WIN_SNAP * 0.7) return "bottom";
    return "float";
}

function winShowZone(zone, kind) {
    let el = $("win-zone");
    if (!el) {
        el = document.createElement("div");
        el.id = "win-zone";
        el.className = "win-zone";
        el.setAttribute("aria-hidden", "true");
        document.body.append(el);
    }
    if (!zone || zone === "float") { el.hidden = true; return; }
    const p = winPref(kind), x0 = winLeftEdge();
    const box = zone === "left" ? { left: x0, top: 0, width: Math.min(p.w, 520), height: window.innerHeight }
        : zone === "right" ? { left: window.innerWidth - Math.min(p.w, 520), top: 0, width: Math.min(p.w, 520), height: window.innerHeight }
        : { left: x0, top: window.innerHeight - Math.min(p.bw, 420), width: window.innerWidth - x0, height: Math.min(p.bw, 420) };
    Object.entries(box).forEach(([k, v]) => { el.style[k] = `${v}px`; });
    el.dataset.zone = zone;
    el.hidden = false;
}

document.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !winEnabled()) return;
    const root = event.target.closest?.("#action-modal.is-win, #notif-panel.is-win");
    if (!root) return;
    const kind = winKindOf(root);
    const card = root.querySelector(WIN_DEFS[kind].card);

    // marginea interioară: schimbă lățimea (stânga/dreapta) sau înălțimea (jos)
    if (event.target.closest(".win-edge")) {
        const mode = WIN_MODES.find(m => root.classList.contains(`win-${m}`));
        if (!["left", "right", "bottom"].includes(mode)) return;
        event.preventDefault();
        Object.assign(winDrag, { on: true, resize: mode, root, kind, card, id: event.pointerId });
        root.classList.add("is-resizing");
        return;
    }

    const handle = event.target.closest(`${WIN_DEFS[kind].handle}, .win-grip, .win-bar`);
    if (!handle || event.target.closest("button, input, select, textarea, a, [contenteditable]")) return;
    event.preventDefault();
    const r = card.getBoundingClientRect();
    const mode = WIN_MODES.find(m => root.classList.contains(`win-${m}`));
    const p = winPref(kind);
    // dintr-o fereastră lipită, ieși cu mărimea ei de fereastră liberă, cu mouse-ul pe aceeași parte a barei
    const w = mode === "float" ? r.width : Math.min(p.w, window.innerWidth - 40);
    const h = mode === "float" ? r.height : Math.min(p.h, window.innerHeight - 40);
    const fx = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
    const dx = mode === "float" ? event.clientX - r.left : Math.round(fx * w);
    const dy = mode === "float" ? event.clientY - r.top : Math.min(24, event.clientY - r.top);
    Object.assign(winDrag, { on: true, resize: null, root, kind, card, id: event.pointerId, dx, dy, w, h, sx: event.clientX, sy: event.clientY, moved: false, from: mode });
}, true);

document.addEventListener("pointermove", event => {
    if (!winDrag.on || event.pointerId !== winDrag.id) return;
    const { root, card, kind } = winDrag;
    if (winDrag.resize) {
        const x0 = winLeftEdge();
        const p = winPref(kind);
        if (winDrag.resize === "right") p.w = Math.round(Math.min(window.innerWidth - x0 - 320, Math.max(320, window.innerWidth - event.clientX)));
        if (winDrag.resize === "left") p.w = Math.round(Math.min(window.innerWidth - x0 - 320, Math.max(320, event.clientX - x0)));
        if (winDrag.resize === "bottom") p.bw = Math.round(Math.min(window.innerHeight * 0.8, Math.max(180, window.innerHeight - event.clientY)));
        winPrefs[kind] = p;
        applyWindow(root);
        return;
    }
    if (!winDrag.moved && Math.hypot(event.clientX - winDrag.sx, event.clientY - winDrag.sy) < 4) return;
    if (!winDrag.moved) {
        winDrag.moved = true;
        root.classList.add("is-dragging");
        applyWindow(root, { mode: "float" });
        card.style.width = `${winDrag.w}px`;
        card.style.height = `${winDrag.h}px`;
    }
    const x = Math.min(window.innerWidth - 80, Math.max(-winDrag.w + 120, event.clientX - winDrag.dx));
    const y = Math.min(window.innerHeight - 48, Math.max(0, event.clientY - winDrag.dy));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    winDrag.zone = winZoneFor(event.clientX, event.clientY);
    winShowZone(winDrag.zone, kind);
});

function winEndDrag(event) {
    if (!winDrag.on || (event && event.pointerId !== winDrag.id)) return;
    const { root, card, kind } = winDrag;
    winDrag.on = false;
    root.classList.remove("is-dragging", "is-resizing");
    winShowZone(null);
    if (winDrag.resize) { winSave(); winDrag.resize = null; return; }
    if (!winDrag.moved) return;
    const r = card.getBoundingClientRect();
    const zone = winDrag.zone || "float";
    winPrefs[kind] = { ...winPref(kind), mode: zone, ...(zone === "float" ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : {}) };
    winSave();
    applyWindow(root);
}
document.addEventListener("pointerup", winEndDrag);
document.addEventListener("pointercancel", winEndDrag);

/* dublu clic pe bară: liberă ↔ locul obișnuit */
document.addEventListener("dblclick", event => {
    if (!winEnabled()) return;
    const root = event.target.closest?.("#action-modal.is-win, #notif-panel.is-win");
    if (!root || event.target.closest("button, input, select, textarea, a, [contenteditable]")) return;
    const kind = winKindOf(root);
    if (!event.target.closest(`${WIN_DEFS[kind].handle}, .win-bar`)) return;
    const cur = winPref(kind).mode;
    setWindowMode(root, cur === "float" ? WIN_DEFS[kind].def.mode : "float");
});

/* fereastra liberă se poate redimensiona din colț; ținem minte mărimea */
if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(entries => {
        for (const e of entries) {
            const root = e.target.closest("#action-modal, #notif-panel");
            if (!root || root.hidden || !root.classList.contains("win-float") || winDrag.on) continue;
            const kind = winKindOf(root);
            const r = e.target.getBoundingClientRect();
            if (r.width < 50) continue;
            clearTimeout(ro.t);
            ro.t = setTimeout(() => { winPrefs[kind] = { ...winPref(kind), w: Math.round(r.width), h: Math.round(r.height) }; winSave(); }, 300);
        }
    });
    document.querySelectorAll("#action-modal .modal-card, #notif-panel .drawer-card").forEach(c => ro.observe(c));
}

/* se reașază când se deschid, se închid sau își schimbă felul (formular ↔ confirmare) */
["action-modal", "notif-panel"].forEach(id => {
    const root = $(id);
    if (!root) return;
    let last = "";
    new MutationObserver(() => {
        const key = `${root.hidden}|${root.classList.contains("is-panel")}`;
        if (key === last) return;
        last = key;
        applyWindow(root);
    }).observe(root, { attributes: true, attributeFilter: ["hidden", "class"] });
});
window.addEventListener("resize", () => {
    clearTimeout(winReserve.t);
    winReserve.t = setTimeout(() => ["action-modal", "notif-panel"].forEach(id => applyWindow($(id))), 120);
});

Object.assign(ACTIONS, {
    "win-mode": el => setWindowMode(el.closest("#action-modal, #notif-panel"), el.dataset.mode)
});
GUEST_OK.add("win-mode");
