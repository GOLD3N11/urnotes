/* urNotes · Cursoarele personalizate.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== CURSOR CUSTOM ==================== */
/*
 * Cercul se mișcă după un model fizic resort–masă–amortizor:
 * are viteză proprie, deci „zboară” spre cursor pe o traiectorie,
 * duce inerția prin curbe, depășește puțin ținta și revine.
 * Punctul central rămâne lipit de pointer, ca click-ul să fie precis.
 */
const CURSOR_PHYSICS = {
    stiffness: 210,      // cât de tare trage resortul spre pointer (mai mare = mai rapid)
    damping: 17,         // frânare (mai mic = mai multă oscilație; ~29 = fără depășire)
    mass: 1,             // „greutatea” cercului (mai mare = mai leneș, mai multă inerție)
    stretch: 0.00011,    // cât se alungește în direcția mișcării, per px/s
    maxStretch: 0.32     // alungire maximă (32%)
};

/*
 * Cursorul (Setări → Aspect), doar cu mouse:
 *   off   – cursorul sistemului
 *   pen   – „Pix”: cursoare SVG în culoarea cernelii, desenate de sistem ⇒ zero întârziere, zero JavaScript la mișcare
 *   on    – cercul animat (fizică de arc)
 *   chalk – „Jucăuș”: pixul + o urmă care se estompează și steluțe la clic (canvas; bucla se oprește când nu se mișcă nimic)
 * Cu „reduce motion”, modurile animate devin „Pix”.
 */
const CURSOR_MODES = ["off", "pen", "on", "chalk"];
let cursorReady = false;
let chalkReady = false;

function applyCursorSetting() {
    const fine = Boolean(window.matchMedia?.("(pointer: fine)").matches);
    const calm = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    let mode = fine ? state.settings.appearance.cursor : "off";
    if (calm && (mode === "on" || mode === "chalk")) mode = "pen";

    if (mode === "on" && !cursorReady) {
        cursorReady = true;
        initCustomCursor();
    }
    if (mode === "chalk" && !chalkReady) {
        chalkReady = true;
        initChalkCursor();
    }
    if (mode === "pen" || mode === "chalk") setPenCursors();
    document.body.classList.toggle("custom-cursor-active", mode === "on");
    document.body.classList.toggle("cursor-pen", mode === "pen" || mode === "chalk");
    document.body.classList.toggle("cursor-chalk", mode === "chalk");
    document.body.dataset.cursor = mode;
}

/** Cursoarele „Pix”, generate în culoarea cernelii curente (se refac la schimbarea temei sau a culorii). */
function setPenCursors() {
    const dark = document.body.classList.contains("dark-mode");
    const ink = (ACCENTS[state.settings.appearance.accent] || ACCENTS.violet)[dark ? "dark" : "light"];
    const edge = dark ? "#14201B" : "#FFFFFF";
    const svg = body => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>${body}</svg>`)}")`;
    // săgeată cu vârf ascuțit (contur contrastant, ca să se vadă pe orice fundal)
    const arrow = svg(`<path d='M4 3v18.5l4.9-4.6 3.3 7.2 3.2-1.4-3.2-7h6.9z' fill='${ink}' stroke='${edge}' stroke-width='1.6' stroke-linejoin='round'/>`);
    // peniță de stilou, vârful în colțul din stânga-sus (punctul activ)
    const nib = svg(`<path d='M3 3l10 3.2 9.2 9.2-6.8 6.8L6.2 13z' fill='${ink}' stroke='${edge}' stroke-width='1.6' stroke-linejoin='round'/>`
        + `<path d='M3 3l6.4 6.4' stroke='${edge}' stroke-width='1.4' stroke-linecap='round'/><circle cx='10.6' cy='10.6' r='1.7' fill='${edge}'/>`
        + `<path d='M18.8 18.8l2.6 2.6' stroke='${edge}' stroke-width='3.4' stroke-linecap='round'/>`);
    const root = document.documentElement.style;
    root.setProperty("--cur-default", `${arrow} 4 3, auto`);
    root.setProperty("--cur-pointer", `${nib} 3 3, pointer`);
}

/** „Jucăuș”: urmă de cretă/cerneală + o mică explozie de steluțe la fiecare clic. */
function initChalkCursor() {
    const canvas = $("cursor-canvas");
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;
    const TRAIL_MS = 320;
    const trail = [];
    const sparks = [];
    let frame = null;
    let last = 0;
    let dpr = 1;

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(innerWidth * dpr);
        canvas.height = Math.round(innerHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const active = () => document.body.classList.contains("cursor-chalk");
    const colors = () => {
        const dark = document.body.classList.contains("dark-mode");
        const css = getComputedStyle(document.body);
        const ink = getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim() || "#2347C5";
        return {
            dark,
            trail: dark ? "rgba(238, 241, 234, 0.85)" : ink,
            sparks: [ink, css.getPropertyValue("--ok").trim(), css.getPropertyValue("--warn").trim(), css.getPropertyValue("--risk").trim(), dark ? "#F6D365" : "#C58A12"]
        };
    };

    const star = (x, y, r, rot) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = rot + (i * Math.PI) / 4;
            const rr = i % 2 ? r * 0.42 : r;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
    };

    const draw = now => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        const c = colors();

        while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = c.trail;
        for (let i = 1; i < trail.length; i++) {
            const life = 1 - (now - trail[i].t) / TRAIL_MS;
            ctx.globalAlpha = Math.max(0, life) * (c.dark ? 0.7 : 0.6);
            ctx.lineWidth = 1.5 + life * 6;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.stroke();
            // praf de cretă pe tablă
            if (c.dark && trail[i].dust) {
                ctx.fillStyle = c.trail;
                ctx.fillRect(trail[i].x + trail[i].dust[0], trail[i].y + trail[i].dust[1], 1.4, 1.4);
            }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.life -= dt / p.ttl;
            if (p.life <= 0) { sparks.splice(i, 1); continue; }
            p.vy += 520 * dt;         // gravitație ușoară
            p.vx *= 1 - 1.8 * dt;     // frecare
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.spin * dt;
            ctx.globalAlpha = Math.min(1, p.life * 1.6);
            ctx.fillStyle = p.color;
            star(p.x, p.y, p.size * (0.6 + p.life * 0.4), p.rot);
        }
        ctx.globalAlpha = 1;

        frame = trail.length > 1 || sparks.length ? requestAnimationFrame(draw) : null;
        if (!frame) ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr); // la final, pânza rămâne curată
    };

    const wake = () => {
        if (frame !== null) return;
        last = performance.now();
        frame = requestAnimationFrame(draw);
    };

    document.addEventListener("mousemove", event => {
        if (!active()) return;
        const dark = document.body.classList.contains("dark-mode");
        trail.push({ x: event.clientX, y: event.clientY, t: performance.now(), dust: dark && Math.random() < 0.35 ? [(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7] : null });
        if (trail.length > 60) trail.shift();
        wake();
    }, { passive: true });

    document.addEventListener("mousedown", event => {
        if (!active() || event.button !== 0) return;
        const palette = colors().sparks.filter(Boolean);
        const n = 12;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
            const v = 140 + Math.random() * 170;
            sparks.push({
                x: event.clientX, y: event.clientY,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90,
                size: 5 + Math.random() * 4, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 10,
                life: 1, ttl: 0.55 + Math.random() * 0.3,
                color: palette[i % palette.length]
            });
        }
        if (sparks.length > 120) sparks.splice(0, sparks.length - 120);
        wake();
    });

    document.documentElement.addEventListener("mouseleave", () => { trail.length = 0; });
}

function initCustomCursor() {
    // Doar pentru mouse; dezactivat la „reduce motion” (efectul e pur decorativ).
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ring = $("custom-cursor");
    const dot = $("custom-cursor-dot");
    if (!ring || !dot) return;

    document.body.classList.add("custom-cursor-active");

    const INTERACTIVE = "button, a, select, label, [data-action], summary, .cs-opt, [data-tip-value], [data-tip-lines]";
    const TEXT_FIELDS = "input:not([type='checkbox']):not([type='range']):not([type='radio']), textarea";
    const { stiffness, damping, mass, stretch, maxStretch } = CURSOR_PHYSICS;
    const MAX_STEP = 1 / 120; // pași mici = simulare stabilă și la FPS scăzut

    const target = { x: -100, y: -100 };
    const pos = { x: -100, y: -100 };
    const vel = { x: 0, y: 0 };
    let angle = 0;
    let frame = null;
    let lastTime = 0;
    let started = false;

    const step = dt => {
        // F = -k·x - c·v ; a = F / m  (Euler semi-implicit)
        const ax = (stiffness * (target.x - pos.x) - damping * vel.x) / mass;
        const ay = (stiffness * (target.y - pos.y) - damping * vel.y) / mass;
        vel.x += ax * dt;
        vel.y += ay * dt;
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
    };

    const tick = now => {
        // dt real, plafonat (după un tab inactiv nu vrem un „salt” uriaș)
        let dt = Math.min((now - lastTime) / 1000, 1 / 20);
        lastTime = now;
        while (dt > 0) {
            const h = Math.min(dt, MAX_STEP);
            step(h);
            dt -= h;
        }

        const speed = Math.hypot(vel.x, vel.y);
        const s = Math.min(speed * stretch, maxStretch);
        // Unghiul se actualizează doar când există mișcare clară, ca să nu „tremure” la oprire.
        if (speed > 40) angle = Math.atan2(vel.y, vel.x);

        ring.style.transform =
            `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${angle}rad) scale(${1 + s}, ${1 - s * 0.55})`;

        const settled = speed < 2 && Math.abs(target.x - pos.x) < 0.15 && Math.abs(target.y - pos.y) < 0.15;
        if (settled) {
            pos.x = target.x;
            pos.y = target.y;
            vel.x = vel.y = 0;
            ring.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
            frame = null; // bucla se oprește complet când cercul s-a așezat
        } else {
            frame = requestAnimationFrame(tick);
        }
    };

    const wake = () => {
        if (frame !== null) return;
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
    };

    document.addEventListener("mousemove", event => {
        target.x = event.clientX;
        target.y = event.clientY;

        if (!started) {
            // prima apariție: cercul pornește direct de pe pointer, fără „zbor” din colț
            started = true;
            pos.x = target.x;
            pos.y = target.y;
        }

        // Punctul urmează instantaneu.
        dot.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
        document.body.classList.add("cursor-visible");
        wake();
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => document.body.classList.remove("cursor-visible"));
    document.addEventListener("mousedown", () => document.body.classList.add("cursor-click"));
    document.addEventListener("mouseup", () => document.body.classList.remove("cursor-click"));

    document.addEventListener("mouseover", event => {
        const onText = Boolean(event.target.closest(TEXT_FIELDS));
        document.body.classList.toggle("cursor-text", onText);
        document.body.classList.toggle("cursor-hover", !onText && Boolean(event.target.closest(INTERACTIVE)));
    }, { passive: true });
}
