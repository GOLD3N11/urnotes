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
    $("more-btn")?.classList.toggle("is-active", tabId === "tab-simulator" || tabId === "tab-setari" || tabId === "tab-plan");
    document.querySelectorAll("[data-action='nav']").forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle("active", active && (btn.classList.contains("tab-btn") || btn.classList.contains("mobile-nav-btn")));
        if (btn.classList.contains("tab-btn") || btn.classList.contains("mobile-nav-btn")) {
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
const TAB_ORDER = ["tab-dashboard", "tab-catalog", "tab-calendar", "tab-statistici", "tab-plan", "tab-simulator", "tab-setari"];
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

/* ==================== CĂUTARE ȘI COMENZI (Ctrl/⌘ K) ==================== */
/*
 * O singură casetă pentru tot: găsește materii, note și evenimente și rulează acțiuni
 * („Adaugă notă”, „Deschide Statistici”, „Exportă backup”…). Înlocuiește căutarea din antet.
 */
const CMDK_ACTIONS = [
    { label: "Configurare rapidă", hint: "profil, materii, ținte", icon: "sparkles", words: "configurare asistent profil setup start inceput materii plan cadru", run: () => openSetup(0) },
    { label: "Adaugă notă", hint: "o notă primită", icon: "note", keys: "N", words: "nota noua adauga", run: () => openAddGradeModal() },
    { label: "Adaugă test sau lucrare", hint: "în calendar", icon: "calendar-check", keys: "T", words: "test lucrare examen teza evaluare", run: () => openEventModal({ type: "Test" }) },
    { label: "Adaugă temă", hint: "în calendar", icon: "book", keys: "H", words: "tema homework", run: () => openEventModal({ type: "Temă" }) },
    { label: "Adaugă eveniment", hint: "proiect, prezentare, personal", icon: "calendar", keys: "E", words: "eveniment proiect prezentare", run: () => openEventModal({ type: "Proiect" }) },
    { label: "Adaugă materie", hint: "în catalog", icon: "plus", keys: "M", words: "materie noua", run: () => promptAddMaterie() },
    { label: "Mergi la Azi", icon: "home", words: "acasa dashboard azi start ore", run: () => switchTab("tab-dashboard") },
    { label: "Mergi la Catalog", icon: "notebook", words: "catalog materii note", run: () => switchTab("tab-catalog") },
    { label: "Mergi la Calendar", icon: "calendar", words: "calendar saptamana orar", run: () => switchTab("tab-calendar") },
    { label: "Mergi la Statistici", icon: "chart", words: "statistici analiza grafice", run: () => switchTab("tab-statistici") },
    { label: "Deschide Simulatorul", icon: "target", words: "simulator ipotetic scenariu ce-ar fi daca", run: () => switchTab("tab-simulator") },
    { label: "Notificări", icon: "bell", words: "notificari alerte", run: () => openNotifPanel() },
    { label: "Orarul săptămânal", icon: "calendar-days", words: "orar ore program", run: () => openTimetableModal() },
    { label: "Raport pentru printare", icon: "printer", words: "raport print pdf", run: () => openReportPanel() },
    { label: "Exportă backup", icon: "download", words: "backup export salvare fisier", run: () => exportBackup() },
    { label: "Schimbă tema (luminoasă / întunecată)", icon: "moon", words: "tema intunecat luminos dark light", run: () => toggleTheme() },
    { label: "Setări", icon: "settings", words: "setari preferinte", run: () => switchTab("tab-setari") },
    { label: "Turul aplicației", icon: "sparkles", words: "tur ghid tutorial ajutor cum merge", run: () => startTour() },
    { label: "Planul meu", icon: "calendar-check", words: "plan studiu invatat program sesiuni", run: () => switchTab("tab-plan") },
    { label: "Adaugă o sesiune în plan", icon: "plus", words: "plan sesiune studiu adauga", run: () => { switchTab("tab-plan"); if (state.plan.prefs.setup) openPlanAdd(); } }
];

const cmdk = { items: [], active: 0, returnFocus: null };

/** Materii, note, evenimente și purtarea care se potrivesc cu textul căutat. */
function searchData(query) {
    const q = foldText(String(query || "").trim());
    if (!q) return [];
    const results = [];
    if ("purtare".includes(q)) {
        const p = metrics.purtare || purtareInfo();
        results.push({ kind: "Purtare", label: "Purtare", meta: p.current ? `Modulul ${p.current.n}: ${p.value}` : String(p.value), icon: "medal", mat: PURTARE_KEY });
    }
    for (const [mat, sub] of Object.entries(state.subjects)) {
        if (foldText(mat).includes(q)) {
            const avg = metrics.subjects[mat]?.exactAvg;
            results.push({ kind: "Materie", label: mat, meta: avg > 0 ? `media ${avg.toFixed(2)}` : "fără note", icon: "notebook", mat });
        }
        sub.grades.forEach(g => {
            if (foldText(`${mat} ${g.val} ${g.type}`).includes(q)) {
                results.push({ kind: "Notă", label: `${mat}: ${g.val}`, meta: `${g.type || "Altele"}${g.date ? `, ${shortDayLabel(g.date)}` : ""}`, icon: "note", mat });
            }
        });
    }
    const today = getLocalDateKey();
    for (const [date, events] of Object.entries(state.calendar)) {
        events.forEach(ev => {
            if (foldText(`${ev.title} ${ev.type} ${ev.subject || ""} ${ev.description || ""}`).includes(q)) {
                const when = ev.repeat ? (seriesDates(ev, date, today, addDays(today, 400))[0] || date) : date;
                results.push({ kind: "Calendar", label: ev.title, meta: `${ev.type}, ${weekdayLabel(when)}${ev.repeat ? " (se repetă)" : ""}`, icon: EVENT_TYPE_ICON[ev.type] || "calendar", date: when });
            }
        });
    }
    return results.slice(0, 12);
}

function openCmdk(initial = "") {
    const box = $("cmdk");
    if (!box) return;
    closeQuickAdd({ restoreFocus: false });
    if (box.hidden) cmdk.returnFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add("modal-open");
    const input = $("cmdk-input");
    input.value = initial;
    renderCmdk();
    input.focus();
}

function closeCmdk({ restoreFocus = true } = {}) {
    const box = $("cmdk");
    if (!box || box.hidden) return;
    box.hidden = true;
    if ($("action-modal").hidden && $("notif-panel").hidden) document.body.classList.remove("modal-open");
    if (restoreFocus && cmdk.returnFocus && document.contains(cmdk.returnFocus)) cmdk.returnFocus.focus();
}

function renderCmdk() {
    const raw = $("cmdk-input").value;
    const q = foldText(raw.trim());
    const actions = CMDK_ACTIONS
        .map(a => {
            const hay = foldText(`${a.label} ${a.words || ""}`);
            const score = !q ? 1 : foldText(a.label).startsWith(q) ? 3 : hay.split(/\s+/).some(w => w.startsWith(q)) ? 2 : hay.includes(q) ? 1 : 0;
            return { ...a, score };
        })
        .filter(a => a.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, q ? 6 : 8);
    const data = searchData(raw);

    cmdk.items = [
        ...data.map(r => ({ type: "data", r })),
        ...actions.map(a => ({ type: "action", a }))
    ];
    cmdk.active = 0;

    const row = (it, i) => {
        const id = `cmdk-opt-${i}`;
        if (it.type === "data") {
            const r = it.r;
            return `<div class="cmdk-item" role="option" id="${id}" data-index="${i}" aria-selected="false">
                ${icon(r.icon)}<span class="cmdk-main"><b>${escapeHTML(r.label)}</b><small>${escapeHTML(r.meta)}</small></span><span class="cmdk-kind">${escapeHTML(r.kind)}</span></div>`;
        }
        const a = it.a;
        return `<div class="cmdk-item is-action" role="option" id="${id}" data-index="${i}" aria-selected="false">
            ${icon(a.icon)}<span class="cmdk-main"><b>${escapeHTML(a.label)}</b>${a.hint ? `<small>${escapeHTML(a.hint)}</small>` : ""}</span>${a.keys ? `<kbd>${a.keys}</kbd>` : ""}</div>`;
    };

    const list = $("cmdk-list");
    if (cmdk.items.length === 0) {
        list.innerHTML = `<p class="cmdk-empty">Nimic pentru „${escapeHTML(raw.trim())}”. Încearcă numele unei materii sau o acțiune, de exemplu „notă”.</p>`;
        return;
    }
    const nData = data.length;
    list.innerHTML = [
        nData ? `<p class="cmdk-group">Rezultate</p>${cmdk.items.slice(0, nData).map((it, i) => row(it, i)).join("")}` : "",
        actions.length ? `<p class="cmdk-group">${q ? "Acțiuni" : "Ce vrei să faci?"}</p>${cmdk.items.slice(nData).map((it, i) => row(it, i + nData)).join("")}` : ""
    ].join("");
    setCmdkActive(0);
}

function setCmdkActive(i) {
    const list = $("cmdk-list");
    const rows = [...list.querySelectorAll(".cmdk-item")];
    if (!rows.length) return;
    cmdk.active = (i + rows.length) % rows.length;
    rows.forEach((el, k) => {
        el.classList.toggle("is-active", k === cmdk.active);
        el.setAttribute("aria-selected", String(k === cmdk.active));
    });
    $("cmdk-input").setAttribute("aria-activedescendant", rows[cmdk.active].id);
    rows[cmdk.active].scrollIntoView({ block: "nearest" });
}

function runCmdkItem(i) {
    const it = cmdk.items[i];
    if (!it) return;
    closeCmdk({ restoreFocus: false });
    if (it.type === "action") {
        it.a.run();
        return;
    }
    if (it.r.date) showDateInCalendar(it.r.date);
    else openSubjectInCatalog(it.r.mat);
}

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
    plan: () => switchTab("tab-plan")
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
    if ($("action-modal").hidden && $("cmdk").hidden) document.body.classList.remove("modal-open");
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
    const input = $("cmdk-input");
    input?.addEventListener("input", renderCmdk);
    input?.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setCmdkActive(cmdk.active + 1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setCmdkActive(cmdk.active - 1); }
        else if (event.key === "Enter") { event.preventDefault(); runCmdkItem(cmdk.active); }
    });
    const list = $("cmdk-list");
    list?.addEventListener("click", event => {
        const row = event.target.closest(".cmdk-item");
        if (row) runCmdkItem(Number(row.dataset.index));
    });
    list?.addEventListener("mousemove", event => {
        const row = event.target.closest(".cmdk-item");
        if (row && Number(row.dataset.index) !== cmdk.active) setCmdkActive(Number(row.dataset.index));
    });

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
        if ((event.ctrlKey || event.metaKey) && k.toLowerCase() === "k") {
            event.preventDefault();
            if (modalOpen) return; // un formular deschis are prioritate (ar putea avea date nesalvate)
            if ($("cmdk").hidden) openCmdk(); else closeCmdk();
            return;
        }
        // Ctrl/⌘+Z: anulează ultima ștergere (doar cât timp mesajul cu „Anulează” e pe ecran și nu scrii într-un câmp)
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && k.toLowerCase() === "z" && pendingUndo && !isTyping(event.target)) {
            event.preventDefault();
            pendingUndo.run();
            return;
        }
        if (!$("cmdk").hidden) {
            if (k === "Escape") { event.preventDefault(); event.stopPropagation(); closeCmdk(); }
            else trapFocusIn($("cmdk"), event);
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
        if (k === "/") { event.preventDefault(); openCmdk(); }
        else if (k.toLowerCase() === "n") { event.preventDefault(); openQuickAdd($("quick-add-btn")); }
    }, true);

    // Închide meniul „Adaugă” la redimensionare (poziția lui depinde de buton).
    window.addEventListener("resize", () => closeQuickAdd({ restoreFocus: false }));
}

/* ==================== TOAST ==================== */
const TOAST_ICONS = { "🏆": "trophy", "🔥": "flame", "📈": "trend-up", "🎯": "target", "📚": "notebook", "💾": "save", "🗓": "calendar-days", "⚙": "settings", "↩": "undo", "🎖": "medal", "✅": "check-circle", "↻": "refresh", "☁": "check-circle", "🔔": "bell" };

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
const UNDO_KEYS = ["subjects", "calendar", "timetable", "purtare", "activity", "history", "alertMeta", "achievements", "plan"];
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
