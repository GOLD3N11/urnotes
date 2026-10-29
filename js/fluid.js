/* urNotes · Fluid: aplicația se mișcă moale și Tiți e viu.
   - Tiți reacționează la ce faci (notă, temă bifată, realizare) și, când stă degeaba, clipește, se uită în jur, sare, se întinde.
   - Nota nouă „zboară” spre Note; pastila din meniul lateral alunecă; cardurile apar pe rând; atingerile fac un val.
   - Ziua din orar, săptămâna din calendar, secțiunea din Setări și materia vecină alunecă din partea în care mergi.
   Totul e scurt și dispare complet cu „reducere mișcare” din sistem.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const fluid = { px: 0, py: 0, pAt: 0, moved: 0 };
const isShown = el => Boolean(el && el.getClientRects().length && el.getBoundingClientRect().width > 0);

document.addEventListener("pointerdown", e => { fluid.px = e.clientX; fluid.py = e.clientY; fluid.pAt = Date.now(); }, { passive: true, capture: true });
document.addEventListener("pointermove", () => { fluid.moved = Date.now(); }, { passive: true });

/* ---------- Tiți reacționează ---------- */
const PAL_LIVE = "#azi-buddy .buddy-poke .buddy, #side-pal .buddy";

/** Schimbă fața lui Tiți (pe Azi și în meniu) pentru câteva clipe, cu o săritură, apoi revine la fața zilei. */
function palReact(mood, ms = 2400) {
    if (typeof buddySVG !== "function") return;
    clearTimeout(palReact.t);
    document.querySelectorAll(PAL_LIVE).forEach(svg => {
        const cls = [...svg.classList].filter(c => c !== "buddy" && !c.startsWith("is-")).join(" ");
        const wrap = document.createElement("div");
        wrap.innerHTML = buddySVG(mood, cls);
        const next = wrap.firstElementChild;
        if (!reduceMotion()) next.classList.add("is-react");
        svg.replaceWith(next);
    });
    palReact.t = setTimeout(() => {
        const box = $("azi-buddy");
        if (box && typeof buddyPoke !== "undefined" && buddyPoke.rest && !buddyPoke.n) paintBuddy(box, buddyPoke.rest);
        if (typeof renderPalChrome === "function") { renderPalChrome.key = null; renderPalChrome(); }
    }, ms);
}

/** Ce simte Tiți la o notă nouă. */
function palMoodForGrade(val) {
    const v = Number(val);
    if (v === 10) return "starry";
    if (v >= 8) return "happy";
    if (v >= 6) return "thinking";
    return "sad";
}

/* ---------- Tiți când stă degeaba: gesturi mici, la întâmplare ---------- */
const PAL_IDLE_SEL = "#azi-buddy .buddy, #side-pal .buddy, .setup-done-pal .buddy, .tour-buddy .buddy, .setup-me-buddy .buddy";
const IDLE_MOODS = new Set(["happy", "focused", "thinking", "proud", "wink", "starry", "love", "sleepy", "shy"]);
function palIdleTick() {
    clearTimeout(palIdleTick.t);
    palIdleTick.t = setTimeout(palIdleTick, 3500 + Math.random() * 5000);
    if (document.hidden || reduceMotion()) return;
    document.querySelectorAll(PAL_IDLE_SEL).forEach(svg => {
        if (!isShown(svg) || svg.classList.contains("is-react") || Math.random() < 0.35) return;
        const mood = svg.dataset.mood || "happy";
        if (!IDLE_MOODS.has(mood)) return;
        const pick = Math.random();
        let cls = "is-blink", ms = 260;
        if (mood === "sleepy") { cls = pick < 0.5 ? "is-stretch" : "is-blink"; ms = cls === "is-stretch" ? 950 : 260; }
        else if (pick < 0.38) { cls = "is-blink"; ms = 260; }
        else if (pick < 0.6 && Date.now() - fluid.moved > 2500) { palGlance(svg); return; }
        else if (pick < 0.75) { cls = "is-hop"; ms = 600; }
        else if (pick < 0.88) { cls = "is-stretch"; ms = 950; }
        else { cls = "is-wiggle"; ms = 750; }
        svg.classList.add(cls);
        setTimeout(() => svg.classList.remove(cls), ms);
    });
}
/** Se uită într-o parte, apoi înapoi (când nu e cursorul prin preajmă). */
function palGlance(svg) {
    const pupils = svg.querySelector(".buddy-pupils");
    if (!pupils) return;
    const x = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 1.6), y = (Math.random() - 0.5) * 3;
    svg.classList.add("is-glance");
    pupils.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    setTimeout(() => { pupils.style.transform = ""; setTimeout(() => svg.classList.remove("is-glance"), 300); }, 1100);
}

/* ---------- nota zboară spre „Note” ---------- */
function gradeFly(val) {
    if (reduceMotion() || typeof document.body.animate !== "function") return;
    const target = [document.querySelector('.side-nav .side-link[data-tab="tab-catalog"]'), document.querySelector('.mobile-nav-btn[data-group="grades"]')].find(isShown);
    const recent = Date.now() - fluid.pAt < 2000;
    const sx = recent ? fluid.px : innerWidth / 2, sy = recent ? fluid.py : innerHeight / 2;
    const chip = document.createElement("span");
    chip.className = `grade-fly tone-${typeof gradeTone === "function" ? gradeTone(Number(val)) : "good"}`;
    chip.setAttribute("aria-hidden", "true");
    chip.textContent = String(val);
    chip.style.left = `${sx}px`;
    chip.style.top = `${sy}px`;
    document.body.appendChild(chip);
    const t = target?.getBoundingClientRect();
    const dx = t ? t.left + Math.min(28, t.width / 2) - sx : 0, dy = t ? t.top + t.height / 2 - sy : -60;
    const anim = chip.animate([
        { transform: "translate(-50%, -50%) scale(.3)", opacity: 0 },
        { transform: "translate(-50%, -50%) translateY(-34px) scale(1.25)", opacity: 1, offset: 0.28 },
        { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.35 - 50}px)) scale(1)`, opacity: 1, offset: 0.62 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.35)`, opacity: t ? 0.9 : 0 }
    ], { duration: 950, easing: "cubic-bezier(.45, 0, .25, 1)" });
    anim.onfinish = () => {
        chip.remove();
        if (!target) return;
        target.classList.remove("is-catch"); void target.offsetWidth; target.classList.add("is-catch");
        setTimeout(() => target.classList.remove("is-catch"), 650);
    };
}

/* ---------- pastila din meniul lateral alunecă sub pagina activă ---------- */
function moveSidePill() {
    const nav = document.querySelector(".side-nav");
    if (!nav || !isShown(nav)) return;
    let pill = $("side-pill");
    if (!pill) {
        pill = document.createElement("span");
        pill.id = "side-pill";
        pill.className = "side-pill";
        pill.setAttribute("aria-hidden", "true");
        nav.prepend(pill);
        nav.classList.add("has-pill");
    }
    const link = nav.querySelector(".tab-btn.side-link.active");
    if (!link || !isShown(link)) { pill.style.opacity = "0"; return; }
    const n = nav.getBoundingClientRect(), r = link.getBoundingClientRect();
    pill.style.opacity = "1";
    pill.style.width = `${r.width}px`;
    pill.style.height = `${r.height}px`;
    pill.style.transform = `translate(${r.left - n.left + nav.scrollLeft}px, ${r.top - n.top + nav.scrollTop}px)`;
}
let sidePillFrame = 0;
const queueSidePill = () => { if (!sidePillFrame) sidePillFrame = requestAnimationFrame(() => { sidePillFrame = 0; moveSidePill(); }); };

/* ---------- cardurile paginii apar pe rând (doar ce se vede pe ecran) ---------- */
const STAGGER_SEL = ".page-intro, .azi-head, .home-tile, .azi-next-wrap, .glass-card, .note-link, .cat-row, .set-sec, .stats-nav, .tt-col";
function staggerIn(root) {
    if (!root || reduceMotion()) return;
    const marked = [];
    let i = 0;
    for (const el of root.querySelectorAll(STAGGER_SEL)) {
        if (i >= 14) break;
        if (el.closest("[hidden]") || !isShown(el) || el.parentElement.closest(".stg")) continue;
        if (el.getBoundingClientRect().top > innerHeight + 40) continue;
        el.style.setProperty("--stg", i++);
        el.classList.add("stg");
        marked.push(el);
    }
    setTimeout(() => marked.forEach(el => { el.classList.remove("stg"); el.style.removeProperty("--stg"); }), 1100);
}

/* ---------- valul de la atingere ---------- */
const RIPPLE_SEL = ".btn, .setup-choice, .cat-row, .tt-tap, .tt-cell, .tt-slot, .cc-chip, .tab-btn.side-link, .mobile-nav-btn, .home-tile, .note-link, .set-sec, .setup-qchip, .setup-qval, .palette-item, .side-sub";
document.addEventListener("pointerdown", event => {
    if (event.button !== 0 || reduceMotion()) return;
    const el = event.target.closest?.(RIPPLE_SEL);
    if (!el || el.disabled) return;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const r = el.getBoundingClientRect();
    const host = document.createElement("span");
    host.className = "ripple-host";
    host.setAttribute("aria-hidden", "true");
    const size = Math.max(r.width, r.height) * 2.2;
    host.innerHTML = `<i style="width:${size}px;height:${size}px;left:${event.clientX - r.left - size / 2}px;top:${event.clientY - r.top - size / 2}px"></i>`;
    el.appendChild(host);
    setTimeout(() => host.remove(), 650);
}, { passive: true });

/* ---------- alunecă din partea în care mergi ---------- */
function slideIn(el, dir) {
    if (!el || reduceMotion()) return;
    el.classList.remove("slide-from-l", "slide-from-r", "slide-up");
    void el.offsetWidth;
    el.classList.add(dir < 0 ? "slide-from-l" : dir > 0 ? "slide-from-r" : "slide-up");
    clearTimeout(el._slideT);
    el._slideT = setTimeout(() => el.classList.remove("slide-from-l", "slide-from-r", "slide-up"), 450);
}
document.addEventListener("click", event => {
    const el = event.target.closest?.("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    // după ce acțiunea a redesenat
    requestAnimationFrame(() => {
        if (a === "cal-nav") slideIn($("cal-body"), Number(el.dataset.offset));
        else if (a === "cal-view") slideIn($("cal-body"), 0);
        else if (a === "cat-step") slideIn(document.querySelector("#cat-detail .cat-detail-card"), Number(el.dataset.dir));
        else if (a === "set-sec") slideIn($("settings-grid"), 0);
        else if (a === "stats-section" || a === "plan-day") slideIn(el.closest(".tab-content")?.querySelector("#stats-body, #plan-body"), 0);
        if (a === "event-done" || (a === "plan-toggle" && el.checked)) palReact("wink", 1800);
    });
});

/* ---------- pornire ---------- */
(() => {
    const nav = document.querySelector(".side-nav");
    if (nav && typeof MutationObserver === "function") {
        new MutationObserver(queueSidePill).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
        nav.addEventListener("scroll", queueSidePill, { passive: true });
    }
    window.addEventListener("resize", queueSidePill, { passive: true });
    queueSidePill();
    // bucla de gesturi pornește doar într-un browser adevărat (nu în testele automate, unde ar ține procesul deschis)
    if (!/jsdom/i.test(navigator.userAgent || "")) palIdleTick();
})();
