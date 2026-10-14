/* urNotes · Telefon: foile de jos, tastatura, blocarea derulării.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- foile de jos: trage în jos ca să închizi (ca pe iPhone) ---------- */
function bindSheetDrag() {
    const SHEETS = [
        { root: "action-modal", card: ".modal-card", scroller: "#action-modal-body", close: () => closeActionModal(), allowed: () => !cloud.asking,
          fade: (el, p) => { el.style.backgroundColor = p === null ? "" : `rgba(15, 23, 42, ${(0.3 * (1 - p)).toFixed(3)})`; } },
        { root: "quick-add", card: ".quick-add-card", close: () => closeQuickAdd(),
          fade: (el, p) => { const b = el.querySelector(".quick-add-backdrop"); if (b) b.style.opacity = p === null ? "" : String(1 - p); } },
        { root: "more-menu", card: ".quick-add-card", close: () => closeMoreMenu(),
          fade: (el, p) => { const b = el.querySelector(".quick-add-backdrop"); if (b) b.style.opacity = p === null ? "" : String(1 - p); } }
    ];
    let drag = null;
    const reset = d => {
        d.card.style.transition = "";
        d.card.style.transform = "";
        d.sheet.fade(d.root, null);
    };
    document.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        const t = event.touches[0];
        for (const sheet of SHEETS) {
            const root = $(sheet.root);
            const card = root && !root.hidden ? root.querySelector(sheet.card) : null;
            if (!card || !card.contains(event.target)) continue;
            const r = card.getBoundingClientRect();
            // doar când e foaie lipită de marginea de jos (pe ecrane mari e fereastră în mijloc)
            if (r.bottom < innerHeight - 4 || r.width < innerWidth - 4) return;
            // se poate trage de oriunde (și de pe un câmp: o atingere care alunecă nu-l deschide), mai puțin din ce se derulează singur
            if (event.target.closest("textarea, input[type='range'], [contenteditable='true'], .cal-lessons, .cat-strip")) return;
            const scroller = sheet.scroller ? root.querySelector(sheet.scroller) : null;
            const inScroller = scroller?.contains(event.target);
            drag = { sheet, root, card, scroller, inScroller, y: t.clientY, x: t.clientX, t: Date.now(), dy: 0, active: false, h: r.height };
            return;
        }
    }, { passive: true });
    document.addEventListener("touchmove", event => {
        if (!drag) return;
        const t = event.touches[0];
        const dy = t.clientY - drag.y;
        const dx = t.clientX - drag.x;
        if (!drag.active) {
            if (Math.abs(dx) > Math.abs(dy) || dy < -4) { drag = null; return; } // derulare sau gest lateral
            if (dy < 8) return;
            // din conținut se trage doar când e derulat complet sus; altfel e derulare obișnuită
            if (drag.inScroller && drag.scroller.scrollTop > 0) { drag = null; return; }
            drag.active = true;
            drag.y = t.clientY;
            drag.lastY = t.clientY;
            drag.lastT = Date.now();
            drag.v = 0;
            document.activeElement?.blur?.(); // tastatura coboară odată cu foaia
        }
        event.preventDefault();
        drag.dy = Math.max(0, t.clientY - drag.y);
        // viteza din ultimele mișcări: o „aruncare” scurtă și rapidă închide foaia
        const now = Date.now();
        const dt = Math.max(1, now - drag.lastT);
        drag.v = 0.6 * ((t.clientY - drag.lastY) / dt) + 0.4 * drag.v;
        drag.lastY = t.clientY;
        drag.lastT = now;
        drag.card.style.transition = "none";
        drag.card.style.transform = `translateY(${drag.dy}px)`;
        drag.sheet.fade(drag.root, Math.min(1, drag.dy / drag.h));
    }, { passive: false });
    const end = () => {
        const d = drag;
        drag = null;
        if (!d?.active) return;
        const speed = Date.now() - d.lastT < 120 ? d.v : 0; // dacă degetul s-a oprit înainte să-l ridici, nu e aruncare
        const allowed = d.sheet.allowed ? d.sheet.allowed() : true;
        if (allowed && (d.dy > Math.min(140, d.h * 0.3) || (speed > 0.55 && d.dy > 30))) {
            d.card.style.transition = "transform 0.2s cubic-bezier(.3, .6, .4, 1)";
            d.card.style.transform = `translateY(${d.h + 24}px)`;
            d.sheet.fade(d.root, 1);
            setTimeout(() => { d.sheet.close(); reset(d); }, 200);
        } else {
            d.card.style.transition = "transform 0.28s cubic-bezier(.2, 1.3, .4, 1)";
            d.card.style.transform = "";
            d.sheet.fade(d.root, null);
            setTimeout(() => { if (!drag) d.card.style.transition = ""; }, 300);
        }
    };
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
}

/* ---------- telefon (mai ales iPhone) ---------- */
/* ---------- cu o foaie sau un meniu deschis, pagina de dedesubt stă pe loc ---------- */
/* Pe iPhone, „overflow: hidden” nu ajunge: pagina tot se derulează și se întinde sub foaie. O fixăm acolo unde era
   și o punem la loc când se închide totul. */
const OVERLAY_IDS = ["action-modal", "quick-add", "more-menu", "notif-panel", "cmdk", "setup", "auth"];
const scrollLock = { on: false, y: 0 };
function syncScrollLock() {
    const open = OVERLAY_IDS.some(id => { const el = $(id); return el && !el.hidden; });
    if (open === scrollLock.on) return;
    scrollLock.on = open;
    const b = document.body;
    if (open) {
        scrollLock.y = window.scrollY;
        Object.assign(b.style, { position: "fixed", top: `-${scrollLock.y}px`, left: "0", right: "0", width: "100%" });
        document.documentElement.style.setProperty("--lock-y", `${scrollLock.y}px`); // bara de sus rămâne la locul ei
        b.classList.add("scroll-locked");
    } else {
        Object.assign(b.style, { position: "", top: "", left: "", right: "", width: "" });
        b.classList.remove("scroll-locked");
        window.scrollTo(0, scrollLock.y);
    }
}

function bindScrollLock() {
    const mo = new MutationObserver(syncScrollLock);
    OVERLAY_IDS.forEach(id => { const el = $(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] }); });
    // Atingerile pe fundal sau pe o parte care nu se derulează nu mai mișcă nimic (nici „elasticul” din Safari).
    document.addEventListener("touchmove", event => {
        if (!scrollLock.on || event.defaultPrevented) return;
        let el = event.target;
        while (el && el !== document.body) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return; // ceva care chiar se derulează
            if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) return;
            el = el.parentElement;
        }
        if (event.cancelable) event.preventDefault();
    }, { passive: false });
}

function bindPhoneHelpers() {
    bindScrollLock();
    const root = document.documentElement;
    addEventListener("resize", () => { moveNavPill(); watchPageTitle(); });
    requestAnimationFrame(() => { moveNavPill(); watchPageTitle(); });
    document.fonts?.ready?.then(moveNavPill);
    document.fonts?.addEventListener?.("loadingdone", moveNavPill);
    // Safari pe iPhone aplică stilurile „:active” (apăsat) doar dacă pagina ascultă atingerile.
    document.addEventListener("touchstart", () => {}, { passive: true });
    // Tastatura: pe iPhone nu micșorează pagina, ci doar „fereastra vizibilă”. O urmărim, ca foile de jos
    // (formularele) să stea deasupra tastaturii, iar bara de jos să se ascundă cât scrii.
    const vv = window.visualViewport;
    const typingEl = el => el?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button]), textarea, select, [contenteditable='true']");
    // Tastatura e deschisă când fereastra vizibilă e mult mai scundă decât cea mai înaltă văzută la lățimea asta
    // (merge și pe iPhone, unde pagina nu se micșorează, și pe Android, unde se micșorează).
    let tallest = 0;
    let tallestW = 0;
    const sync = () => {
        let kb = typingEl(document.activeElement) && matchMedia("(pointer: coarse)").matches;
        if (vv) {
            if (innerWidth !== tallestW) { tallestW = innerWidth; tallest = 0; }
            tallest = Math.max(tallest, vv.height);
            root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
            root.style.setProperty("--vvtop", `${Math.round(vv.offsetTop)}px`);
            kb = kb && vv.height < tallest - 120;
        }
        document.body.classList.toggle("kb-open", Boolean(kb));
    };
    if (vv) {
        vv.addEventListener("resize", sync);
        vv.addEventListener("scroll", sync);
    }
    sync();
    document.addEventListener("focusin", event => {
        if (!typingEl(event.target)) return;
        sync();
        // câmpul ales rămâne la vedere după ce urcă tastatura
        const el = event.target;
        setTimeout(() => {
            sync();
            if (document.activeElement === el && document.body.classList.contains("kb-open") && el.closest(".modal-card, .setup-card, .auth-card")) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 350);
    });
    document.addEventListener("focusout", () => setTimeout(sync, 60));
    // Deschisă de pe ecranul principal: aceeași aplicație, fără bara browserului
    const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    document.body.classList.toggle("is-standalone", standalone);
    // Merge și fără internet (după prima deschidere)
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
        const reg = () => navigator.serviceWorker.register("sw.js").catch(() => {});
        if (document.readyState === "complete") reg(); else addEventListener("load", reg);
    }
}

function bindCatMenu() {
    const list = $("cat-list");
    const menu = $("cat-menu");
    if (!list || !menu) return;
    const rowAt = event => {
        const row = event.target.closest?.(".cat-row") || document.elementFromPoint?.(event.clientX, event.clientY)?.closest(".cat-row");
        return row && list.contains(row) && state.subjects[row.dataset.mat] ? row : null;
    };
    const open = event => {
        const row = rowAt(event);
        if (!row) return;
        event.preventDefault();
        window.getSelection?.()?.removeAllRanges(); // dublu-clicul nu mai selectează textul
        openCatMenu(row.dataset.mat, event.clientX + 4, event.clientY + 4, row);
    };
    // Dublu-clicul e detectat de mână: primul clic redesenează lista (alege materia), deci browserul
    // nu mai vede „același element” de două ori și nu trimite mereu „dblclick”.
    list.addEventListener("click", event => {
        const row = rowAt(event);
        if (!row) return;
        const mat = row.dataset.mat;
        const now = performance.now();
        const last = catMenu.last;
        const second = event.detail === 2 || (last.mat === mat && now - last.t < 450 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 14);
        catMenu.last = second ? { mat: "", t: 0, x: 0, y: 0 } : { mat, t: now, x: event.clientX, y: event.clientY };
        if (!second) return;
        window.getSelection?.()?.removeAllRanges();
        const x = event.clientX + 4;
        const y = event.clientY + 4;
        // după ce clicul și-a terminat treaba (selectarea materiei), ca meniul să rămână deschis și cu focus
        setTimeout(() => openCatMenu(mat, x, y, list.querySelector(`.cat-row[data-mat="${CSS.escape(mat)}"]`)), 0);
    });
    list.addEventListener("dblclick", open);
    // Apăsare lungă pe ecrane tactile. Safari pe iPhone nu trimite „contextmenu”, așa că o măsurăm noi;
    // pe Android vine și „contextmenu” — îl ignorăm dacă meniul s-a deschis deja.
    let press = null;
    let pressedAt = 0;
    const cancelPress = () => { if (press) clearTimeout(press.timer); press = null; };
    list.addEventListener("touchstart", event => {
        cancelPress();
        const row = event.touches.length === 1 ? rowAt(event) : null;
        if (!row) return;
        const t = event.touches[0];
        press = { x: t.clientX, y: t.clientY, fired: false };
        press.timer = setTimeout(() => {
            if (!press) return;
            press.fired = true;
            pressedAt = Date.now();
            navigator.vibrate?.(12);
            openCatMenu(row.dataset.mat, press.x + 4, press.y + 4, row);
        }, 480);
    }, { passive: true });
    list.addEventListener("touchmove", event => {
        if (!press || press.fired) return;
        const t = event.touches[0];
        if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > 10) cancelPress();
    }, { passive: true });
    list.addEventListener("touchend", event => {
        // după o apăsare lungă nu mai vrem și „clicul” care ar alege materia (și ar închide meniul)
        if (press?.fired) event.preventDefault();
        cancelPress();
    });
    list.addEventListener("touchcancel", cancelPress);
    list.addEventListener("contextmenu", event => {
        if (Date.now() - pressedAt < 1000) { event.preventDefault(); return; }
        cancelPress();
        open(event);
    });
    list.addEventListener("keydown", event => {
        if (!((event.shiftKey && event.key === "F10") || event.key === "ContextMenu")) return;
        const row = event.target.closest(".cat-row");
        if (!row || !state.subjects[row.dataset.mat]) return;
        event.preventDefault();
        const r = row.getBoundingClientRect();
        openCatMenu(row.dataset.mat, r.left + 24, r.bottom - 4, row);
    });
    document.addEventListener("mousedown", event => {
        if (!menu.hidden && !menu.contains(event.target)) closeCatMenu({ restoreFocus: false });
    });
    let lastW = innerWidth;
    window.addEventListener("resize", () => { if (innerWidth !== lastW) { lastW = innerWidth; closeCatMenu({ restoreFocus: false }); } });
    window.addEventListener("scroll", () => { if (performance.now() - catMenu.openedAt > 400) closeCatMenu({ restoreFocus: false }); }, { passive: true });
    menu.addEventListener("keydown", event => {
        const items = [...menu.querySelectorAll("[role='menuitem']")];
        const i = items.indexOf(document.activeElement);
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCatMenu(); }
        else if (event.key === "ArrowDown") { event.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (event.key === "ArrowUp") { event.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (event.key === "Home") { event.preventDefault(); items[0].focus(); }
        else if (event.key === "End") { event.preventDefault(); items.at(-1).focus(); }
        else if (event.key === "Tab") closeCatMenu({ restoreFocus: false });
    });
}

const CAT_MENU_ACTIONS = {
    "cat-menu-edit": () => { const mat = catMenu.mat; closeCatMenu(); openEditSubjectModal(mat); },
    "cat-menu-grade": () => { const mat = catMenu.mat; closeCatMenu(); openAddGradeModal(mat); },
    "cat-menu-glance": () => { const mat = catMenu.mat; closeCatMenu(); openSubjectGlance(mat); }
};
