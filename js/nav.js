/* urNotes · Navigare, căutare, adaugă rapid, notificări, mesaje, anulare.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== NAVIGARE ==================== */
/** Bara de sus: umbră doar după derulare + înălțimea reală în --appbar-h (folosită de lista lipită din catalog). */
function initAppBar() {
    const bar = $("app-bar");
    if (!bar) return;
    const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const setHeight = () => document.documentElement.style.setProperty("--appbar-h", `${bar.offsetHeight}px`);
    setHeight();
    if (window.ResizeObserver) new ResizeObserver(setHeight).observe(bar);
}

function switchTab(tabId) {
    closeMoreMenu({ restoreFocus: false });
    if (!$(tabId)) return;
    hideChartTip();
    closeCustomSelect({ restoreFocus: false });
    const changed = ui.activeTab !== tabId;
    const from = ui.activeTab;
    ui.activeTab = tabId;
    // cifrele „numără” doar la prima deschidere; la următoarele intrări pagina apare direct, fără să pară reîncărcată
    if (changed && tabId === "tab-statistici" && !ui.statsSeen) { ui.statsAnimate = true; ui.statsSeen = true; }
    // O pagină nouă începe de sus, cu titlul ei vizibil sub bară (nu la jumătatea derulării paginii anterioare).
    if (changed && window.scrollY > 0) window.scrollTo({ top: 0 });

    document.querySelectorAll(".tab-content").forEach(el => el.classList.toggle("active", el.id === tabId));
    $("more-btn")?.classList.toggle("is-active", tabId === "tab-setari");
    $("more-btn")?.classList.toggle("active", tabId === "tab-setari"); // pastila din bara de jos stă pe „Eu”
    // Trei pagini principale (Azi, Note, Calendar); celelalte sunt sub-pagini ale lor și le aprind butonul
    const group = TABS[tabId]?.group;
    document.body.dataset.page = tabId;
    document.body.classList.toggle("is-subpage", Boolean(TABS[tabId]?.parent));
    document.querySelectorAll("[data-action='nav']").forEach(btn => {
        const active = btn.dataset.group ? btn.dataset.group === group : btn.dataset.tab === tabId;
        const isNav = btn.classList.contains("tab-btn") || btn.classList.contains("mobile-nav-btn") || btn.classList.contains("subnav-btn");
        btn.classList.toggle("active", active && isNav);
        if (isNav) {
            if (active) btn.setAttribute("aria-current", "page");
            else btn.removeAttribute("aria-current");
        }
    });

    closeQuickAdd({ restoreFocus: false });
    renderActiveTab();
    if (changed) animateTabEnter(tabId, from);
    moveNavPill();
    // după ce pagina nouă s-a așezat (fonturi, bara de derulare), o mai potrivim o dată
    requestAnimationFrame(() => moveNavPill(false));
    watchPageTitle();
}

/* ---------- mișcare: pagina intră din partea în care mergi, cardurile apar pe rând ---------- */
const TAB_ORDER = ["tab-dashboard", "tab-plan", "tab-calendar", "tab-catalog", "tab-statistici", "tab-simulator", "tab-examene", "tab-setari"];
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function animateTabEnter(tabId, from) {
    const el = $(tabId);
    if (!el || reduceMotion()) return;
    const dir = TAB_ORDER.indexOf(tabId) >= TAB_ORDER.indexOf(from) ? "fwd" : "back";
    el.classList.remove("enter-fwd", "enter-back", "is-entering");
    void el.offsetWidth; // repornește animația
    el.classList.add(`enter-${dir}`, "is-entering");
    clearTimeout(el._enterT);
    el._enterT = setTimeout(() => el.classList.remove("enter-fwd", "enter-back", "is-entering"), 800);
}

/** Pastila din bara de jos alunecă sub fila activă. */
function moveNavPill(pop = true) {
    const pill = $("nav-pill");
    const nav = pill?.parentElement;
    if (!pill || !nav || nav.offsetParent === null && getComputedStyle(nav).display === "none") return;
    const btn = nav.querySelector(".mobile-nav-btn.active");
    if (!btn) { pill.style.opacity = "0"; return; }
    // offsetLeft/offsetWidth ignoră efectul de apăsare (scale), deci pastila nu se oprește strâmb
    pill.style.opacity = "1";
    pill.style.width = `${btn.offsetWidth}px`;
    pill.style.transform = `translateX(${btn.offsetLeft}px)`;
    if (pop) { btn.classList.remove("is-pop"); void btn.offsetWidth; }
    if (pop && !reduceMotion()) btn.classList.add("is-pop");
}

/** Titlul mare al paginii „urcă” în bara de sus când derulezi (ca în aplicațiile de iPhone). */
let titleObserver = null;
function watchPageTitle() {
    const slot = $("topbar-title");
    if (!slot || !("IntersectionObserver" in window)) return;
    titleObserver?.disconnect();
    document.body.classList.remove("title-docked");
    const h = $(ui.activeTab)?.querySelector("h2");
    if (!h) return;
    slot.textContent = [...h.childNodes].filter(n => n.nodeType === 3 || !n.matches?.(".help-dot")).map(n => n.textContent).join("").trim();
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h")) || 60;
    titleObserver = new IntersectionObserver(([e]) => {
        document.body.classList.toggle("title-docked", !e.isIntersecting && e.boundingClientRect.top < bar);
    }, { rootMargin: `-${Math.round(bar)}px 0px 0px 0px`, threshold: 0 });
    titleObserver.observe(h);
}

/** Cifrele mari „numără” până la valoarea nouă. */
const countedFrom = {};
function countUp(el, key, to, decimals = 2) {
    if (!el || !Number.isFinite(to)) return;
    const from = countedFrom[key];
    countedFrom[key] = to;
    if (from === undefined || from === to || reduceMotion()) return;
    const start = performance.now(), dur = 650;
    const step = now => {
        const t = Math.min(1, (now - start) / dur);
        const k = 1 - Math.pow(1 - t, 3);
        el.textContent = (from + (to - from) * k).toFixed(decimals);
        if (t < 1 && document.contains(el)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/** Tema întunecată / luminoasă, dintr-o atingere (meniul „Eu”). */
function toggleTheme() {
    const dark = document.body.classList.contains("dark-mode");
    state.settings.appearance.theme = dark ? "light" : "dark";
    applyAppearanceSettings();
    refresh();
    if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
    showToast(dark ? "Tema: luminoasă." : "Tema: întunecată.");
}

/* ==================== ADAUGĂ RAPID (+) ==================== */
const QUICK_ADD = {
    grade: () => openAddGradeModal(),
    test: () => openEventModal({ type: "Test" }),
    homework: () => openEventModal({ type: "Temă" }),
    event: () => openEventModal({ type: "Proiect" }),
    subject: () => promptAddMaterie(),
    hypo: () => switchTab("tab-simulator")
};
const QUICK_ADD_KEYS = { n: "grade", t: "test", h: "homework", e: "event", m: "subject", s: "hypo" };
let quickAddReturn = null;

function openQuickAdd(anchor) {
    if (!requireAccount()) return;
    const box = $("quick-add");
    if (!box) return;
    if (!box.hidden) {
        closeQuickAdd();
        return;
    }
    quickAddReturn = anchor || document.activeElement;
    box.hidden = false;
    $("quick-add-btn")?.setAttribute("aria-expanded", "true");
    // Pe ecrane mari, meniul apare sub butonul „Adaugă”; pe telefon e o foaie care urcă de jos.
    const card = box.querySelector(".quick-add-card");
    const btn = $("quick-add-btn");
    if (btn && btn.offsetParent !== null && window.innerWidth > 900) {
        const r = btn.getBoundingClientRect();
        card.style.top = `${Math.round(r.bottom + 8)}px`;
        card.style.right = `${Math.round(window.innerWidth - r.right)}px`;
    } else {
        card.style.top = "";
        card.style.right = "";
    }
    box.querySelector(".qa-item")?.focus();
}

function closeQuickAdd({ restoreFocus = true } = {}) {
    const box = $("quick-add");
    if (!box || box.hidden) return;
    box.hidden = true;
    $("quick-add-btn")?.setAttribute("aria-expanded", "false");
    if (restoreFocus && quickAddReturn && document.contains(quickAddReturn)) quickAddReturn.focus();
}

function runQuickAdd(kind) {
    if (!QUICK_ADD[kind]) return;
    closeQuickAdd({ restoreFocus: false });
    QUICK_ADD[kind]();
}

/* ==================== MAI MULT (telefon) ==================== */
let moreReturn = null;
const MORE_ACTIONS = {
    sim: () => switchTab("tab-simulator"),
    settings: () => switchTab("tab-setari"),
    theme: () => toggleTheme(),
    setup: () => openSetup(0),
    backup: () => exportBackup(),
    account: () => openAccountPanel(),
    tour: () => startTour(),
    plan: () => switchTab("tab-plan"),
    stats: () => switchTab("tab-statistici"),
    exams: () => switchTab("tab-examene")
};

function openMoreMenu() {
    const box = $("more-menu");
    if (!box) return;
    if (!box.hidden) { closeMoreMenu(); return; }
    closeQuickAdd({ restoreFocus: false });
    // Safari nu pune focus pe butonul apăsat; revenim oricum la „…”.
    moreReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : $("more-btn");
    const dark = document.body.classList.contains("dark-mode");
    setText("more-theme-label", dark ? "Temă luminoasă" : "Temă întunecată");
    box.querySelector('[data-kind="theme"] use')?.setAttribute("href", dark ? "#i-sun" : "#i-moon");
    box.hidden = false;
    $("more-btn")?.setAttribute("aria-expanded", "true");
    box.querySelector(".qa-item")?.focus();
}

function closeMoreMenu({ restoreFocus = true } = {}) {
    const box = $("more-menu");
    if (!box || box.hidden) return;
    box.hidden = true;
    $("more-btn")?.setAttribute("aria-expanded", "false");
    if (restoreFocus && moreReturn && document.contains(moreReturn)) moreReturn.focus();
}

/* ==================== NOTIFICĂRI ==================== */
let notifReturn = null;

function openNotifPanel() {
    const panel = $("notif-panel");
    if (!panel) return;
    closeQuickAdd({ restoreFocus: false });
    notifReturn = document.activeElement;
    panel.hidden = false;
    document.body.classList.add("modal-open");
    renderAlerts();
    panel.querySelector(".drawer-card [data-action='notif-close']")?.focus();
}

function closeNotifPanel({ restoreFocus = true } = {}) {
    const panel = $("notif-panel");
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if ($("action-modal").hidden) document.body.classList.remove("modal-open");
    if (restoreFocus && notifReturn && document.contains(notifReturn)) notifReturn.focus();
}

/** Ține focusul (Tab) în interiorul unui panou deschis. */
function trapFocusIn(container, event) {
    if (event.key !== "Tab" || !container) return;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    if (!items.length) return;
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

const isTyping = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function bindShellEvents() {
    // Scurtături globale (capturate înaintea celorlalte, ca Escape să închidă întâi panoul de sus)
    document.addEventListener("keydown", event => {
        if (customSelect.open) return; // tastele aparțin listei derulante deschise
        const k = event.key;
        // Configurarea ocupă tot ecranul: fără scurtături, focusul rămâne în ea
        if (!$("setup").hidden) {
            if ($("action-modal").hidden) trapFocusIn($("setup"), event);
            return;
        }
        // Turul ghidat: tastele lui, nimic altceva
        if (tour.open) {
            handleTourKey(event);
            return;
        }
        // La fel ecranul de autentificare (Escape îl închide doar dacă elevul a ales deja cum folosește aplicația)
        if (!$("auth").hidden) {
            if (!$("action-modal").hidden) return;
            if (k === "Escape" && cloud.seenUser && lsGet(SYNC_KEYS.choice)) closeAuth();
            else trapFocusIn($("auth"), event);
            return;
        }
        const modalOpen = !$("action-modal").hidden;
        // Ctrl/⌘+Z: anulează ultima ștergere (doar cât timp mesajul cu „Anulează” e pe ecran și nu scrii într-un câmp)
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && k.toLowerCase() === "z" && pendingUndo && !isTyping(event.target)) {
            event.preventDefault();
            pendingUndo.run();
            return;
        }
        if (!$("more-menu").hidden) {
            if (k === "Escape") { event.preventDefault(); event.stopPropagation(); closeMoreMenu(); return; }
            if (k === "ArrowDown" || k === "ArrowUp") {
                event.preventDefault();
                const items = [...$("more-menu").querySelectorAll(".qa-item")];
                const i = items.indexOf(document.activeElement);
                items[(i + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }
            trapFocusIn($("more-menu"), event);
            return;
        }
        if (!$("quick-add").hidden) {
            if (k === "Escape") { event.preventDefault(); event.stopPropagation(); closeQuickAdd(); return; }
            const kind = QUICK_ADD_KEYS[k.toLowerCase()];
            if (kind && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); runQuickAdd(kind); return; }
            if (k === "ArrowDown" || k === "ArrowUp") {
                event.preventDefault();
                const items = [...$("quick-add").querySelectorAll(".qa-item")];
                const i = items.indexOf(document.activeElement);
                items[(i + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }
            trapFocusIn($("quick-add"), event);
            return;
        }
        if (!$("notif-panel").hidden && !modalOpen) {
            if (k === "Escape") { event.preventDefault(); event.stopPropagation(); closeNotifPanel(); }
            else trapFocusIn($("notif-panel"), event);
            return;
        }
        if (modalOpen || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
        if (k.toLowerCase() === "n") { event.preventDefault(); openQuickAdd($("quick-add-btn")); }
    }, true);

    // Închide meniul „Adaugă” la redimensionare (poziția lui depinde de buton).
    window.addEventListener("resize", () => closeQuickAdd({ restoreFocus: false }));
}

/* ==================== TOAST ==================== */
const TOAST_ICONS = { "🏆": "trophy", "🔥": "flame", "📈": "trend-up", "🎯": "target", "📚": "notebook", "💾": "save", "🗓": "calendar-days", "⚙": "settings", "↩": "undo", "🎖": "medal", "✅": "check-circle", "↻": "refresh", "☁": "check-circle", "🔔": "bell", "🎉": "sparkles", "🎓": "graduation" };

/**
 * Mesaj scurt jos pe ecran. Opțional cu un buton (ex. „Anulează”).
 * Cât timp mouse-ul e deasupra sau butonul are focus, mesajul nu dispare.
 */
function showToast(msg, { action = "", onAction = null, duration = 3000, actionIcon = "undo" } = {}) {
    const container = $("toast-container");
    if (!container) return null;

    // Un emoji la începutul mesajului alege iconița și tonul; textul afișat rămâne curat.
    const lead = /^\s*([\u2190-\u21FF\u2600-\u27BF\u{1F300}-\u{1FAFF}])\uFE0F?\s*/u.exec(msg);
    const warn = Boolean(lead) && lead[1] === "⚠";
    const text = lead ? msg.slice(lead[0].length) : msg;
    const toastIcon = warn ? "alert" : lead && TOAST_ICONS[lead[1]] ? TOAST_ICONS[lead[1]] : action ? "trash" : "check-circle";
    const toast = document.createElement("div");
    toast.className = `toast${warn ? " is-warn" : ""}${action ? " has-action" : ""}`;
    toast.innerHTML = `${icon(toastIcon, "toast-ico")}<span class="toast-text">${escapeHTML(text)}</span>${action
        ? `<button type="button" class="toast-action" title="${escapeHTML(actionIcon === "undo" ? `${action} (Ctrl+Z)` : action)}">${icon(actionIcon)} ${escapeHTML(action)}</button>` : ""}`;
    container.appendChild(toast);

    let timer = 0;
    const leave = () => {
        clearTimeout(timer);
        if (toast.classList.contains("leaving")) return;
        toast.classList.add("leaving");
        setTimeout(() => toast.remove(), 300);
        toast.dispatchEvent(new CustomEvent("toast-gone"));
    };
    const arm = ms => { clearTimeout(timer); timer = setTimeout(leave, ms); };
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", () => arm(2000));
    toast.addEventListener("focusin", () => clearTimeout(timer));
    toast.addEventListener("focusout", () => arm(2000));
    toast.querySelector(".toast-action")?.addEventListener("click", () => {
        onAction?.();
        leave();
    });
    toast.leave = leave;
    arm(duration);
    return toast;
}

/* ==================== ANULARE ==================== */
/*
 * Ștergerile simple nu mai cer confirmare: se fac imediat, iar mesajul de jos are „Anulează” (sau Ctrl+Z).
 * Înainte de ștergere se păstrează o copie a datelor; anularea o pune la loc doar dacă între timp
 * nu s-a mai salvat nimic altceva (altfel ar șterge și modificările făcute după).
 */
const UNDO_MS = 7000;
const UNDO_KEYS = ["subjects", "calendar", "timetable", "purtare", "activity", "history", "alertMeta", "achievements", "plan", "archive", "exams", "pal"];
let saveCounter = 0;
let pendingUndo = null;

function withUndo(message, mutate, { afterUndo = null } = {}) {
    const snap = clone(Object.fromEntries(UNDO_KEYS.map(k => [k, state[k]])));
    const simSnap = clone(sim);
    if (mutate() === false) return;
    refresh();

    const token = { at: saveCounter, toast: null };
    token.run = () => {
        if (pendingUndo !== token) return;
        pendingUndo = null;
        token.toast?.leave();
        if (saveCounter !== token.at) {
            showToast("⚠️ Nu mai pot anula: între timp s-au schimbat și alte date.");
            return;
        }
        closeActionModal(); // un formular deschis ar lucra pe obiectele de dinainte de anulare
        UNDO_KEYS.forEach(k => { state[k] = snap[k]; });
        sim = simSnap;
        afterUndo?.();
        refresh();
        showToast("↩ Am pus totul la loc.");
    };
    pendingUndo?.toast?.leave();
    pendingUndo = token;
    token.toast = showToast(message, { action: "Anulează", onAction: token.run, duration: UNDO_MS });
    token.toast?.addEventListener("toast-gone", () => { if (pendingUndo === token) pendingUndo = null; });
}
