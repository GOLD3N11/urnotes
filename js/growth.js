/* urNotes · Colegul care crește: experiență (XP) din ce faci cu adevărat, niveluri, culori și accesorii pentru mascotă,
   plus colecția de insigne. XP-ul se calculează din date (note, inclusiv din anii arhivați, insigne, rezultate la examene)
   și din două contoare (sesiuni din plan și teme/teste bifate), așa că e la fel pe orice dispozitiv.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const PAL_COLORS = {
    yellow: { label: "Galben", fill: "#FFC93C", fold: "#E0A21C", level: 1 },
    pink: { label: "Roz", fill: "#FF9EC0", fold: "#E0749A", level: 3 },
    mint: { label: "Mentă", fill: "#8FE3C0", fold: "#55B993", level: 5 },
    sky: { label: "Cer", fill: "#9CCBFF", fold: "#6A9EE0", level: 7 },
    lilac: { label: "Liliac", fill: "#CDB4FF", fold: "#9F85E6", level: 9 },
    orange: { label: "Portocaliu", fill: "#FFB27A", fold: "#E08848", level: 11 }
};
const PAL_ACCESSORIES = [
    { id: "glasses", label: "Ochelari", level: 2 },
    { id: "bow", label: "Fundiță", level: 4 },
    { id: "cap", label: "Șapcă", level: 6, hat: true },
    { id: "flowers", label: "Coroniță de flori", level: 8, hat: true },
    { id: "headphones", label: "Căști", level: 10, hat: true },
    { id: "gradcap", label: "Toc de absolvent", level: 12, hat: true },
    { id: "crown", label: "Coroană", level: 15, hat: true }
];
const PAL_MAX_LEVEL = 30;
/* Cât XP aduce fiecare lucru (apare și în garderobă, la „Cum crește”) */
const XP = { grade: 10, ten: 5, plan: 15, event: 4, badge: 50, practice: 8 };

function defaultPal() {
    // seenLevel 0 = încă nu știm nivelul (date vechi): îl aflăm la primul calcul, fără sărbătoare
    return { look: { color: "yellow", acc: "" }, plan: 0, events: 0, seenLevel: 0 };
}

function sanitizePal(raw) {
    const p = defaultPal();
    if (!isPlainObject(raw)) return p;
    const look = isPlainObject(raw.look) ? raw.look : {};
    p.look.color = PAL_COLORS[look.color] ? look.color : "yellow";
    p.look.acc = PAL_ACCESSORIES.some(a => a.id === look.acc) ? look.acc : "";
    p.plan = clampInteger(raw.plan, 0, 1e6, 0);
    p.events = clampInteger(raw.events, 0, 1e6, 0);
    p.seenLevel = clampInteger(raw.seenLevel, 0, PAL_MAX_LEVEL, 0);
    return p;
}

/** Tot XP-ul, din datele de acum și din arhivă. */
function palXP() {
    let grades = 0, tens = 0;
    const count = list => list.forEach(g => { grades++; if (g.val === 10) tens++; });
    Object.values(state.subjects).forEach(s => count(s.grades));
    state.archive.forEach(y => Object.values(y.subjects).forEach(s => count(s.grades)));
    const badges = Object.values(state.achievements).filter(Boolean).length;
    return grades * XP.grade + tens * XP.ten + state.pal.plan * XP.plan + state.pal.events * XP.event
        + badges * XP.badge + state.exams.practice.length * XP.practice;
}

/** XP-ul necesar ca să ajungi la nivelul `level` (nivelul 1 = 0). Pașii cresc încet: 100, 150, 200… */
const xpForLevel = level => 100 * (level - 1) + 25 * (level - 1) * (level - 2);

function palProgress(xp = palXP()) {
    let level = 1;
    while (level < PAL_MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
    const from = xpForLevel(level), to = level < PAL_MAX_LEVEL ? xpForLevel(level + 1) : from;
    return { xp, level, from, to, pct: to > from ? (xp - from) / (to - from) : 1, left: Math.max(0, to - xp), max: level >= PAL_MAX_LEVEL };
}

/** Nivelul cel mai mare atins vreodată: de el depind lucrurile deblocate (nu le pierzi dacă ștergi o notă). */
const palUnlockedLevel = () => Math.max(state.pal.seenLevel, palProgress().level);
const palLook = () => (typeof state !== "undefined" && state.pal?.look) || { color: "yellow", acc: "" };

/** Accesoriul, desenat peste post-it (în aceleași coordonate ca fața). */
function palAccessorySVG(id) {
    const ink = INK;
    switch (id) {
        case "glasses": return `<g class="b-acc"><circle cx="44" cy="55" r="12.5" fill="rgba(255,255,255,0.18)" stroke="${ink}" stroke-width="3"/><circle cx="76" cy="55" r="12.5" fill="rgba(255,255,255,0.18)" stroke="${ink}" stroke-width="3"/><path d="M56.5 54 Q60 50 63.5 54M31.5 52 L18 47M88.5 52 L102 47" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
        case "bow": return `<g class="b-acc" transform="translate(94 22) rotate(18)"><path d="M0 0 L-14 -9 L-14 9 Z M0 0 L14 -9 L14 9 Z" fill="#FF5C8A" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><circle r="4" fill="#FF5C8A" stroke="${ink}" stroke-width="2"/></g>`;
        case "cap": return `<g class="b-acc"><path d="M26 22 Q30 2 60 2 Q90 2 94 22 Z" fill="#3B5BDB" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><path d="M84 20 Q104 18 116 24 Q104 28 86 25 Z" fill="#2F4AC0" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="3" r="3" fill="#FFE58A" stroke="${ink}" stroke-width="1.5"/></g>`;
        case "flowers": return `<g class="b-acc">${[[24, "#FF5C8A"], [42, "#FFE58A"], [60, "#FFFFFF"], [78, "#8FD3FF"], [96, "#FF9EC0"]].map(([x, c], i) => `<g transform="translate(${x} ${16 - (i % 2) * 4})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="4" ry="6.5" transform="rotate(${a}) translate(0 -5)" fill="${c}" stroke="${ink}" stroke-width="1.2"/>`).join("")}<circle r="3" fill="#E0A21C"/></g>`).join("")}<path d="M16 22 Q60 8 104 22" stroke="#2F9E44" stroke-width="2.5" fill="none"/></g>`;
        case "headphones": return `<g class="b-acc"><path d="M14 56 Q14 6 60 6 Q106 6 106 56" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="4" y="46" width="16" height="26" rx="7" fill="#FF5C8A" stroke="${ink}" stroke-width="2.5"/><rect x="100" y="46" width="16" height="26" rx="7" fill="#FF5C8A" stroke="${ink}" stroke-width="2.5"/></g>`;
        case "gradcap": return `<g class="b-acc"><path d="M38 14 L82 14 L80 26 L40 26 Z" fill="#241B44"/><path d="M60 -2 L104 10 L60 22 L16 10 Z" fill="#2A1B5C" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><path d="M60 10 L96 16 L96 32" stroke="#FFC93C" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="96" cy="34" r="3.5" fill="#FFC93C"/></g>`;
        case "crown": return `<g class="b-acc"><path d="M30 24 L32 2 L46 14 L60 -2 L74 14 L88 2 L90 24 Z" fill="#FFD43B" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="16" r="3.5" fill="#FF5C8A"/><circle cx="44" cy="19" r="2.5" fill="#8FD3FF"/><circle cx="76" cy="19" r="2.5" fill="#8FD3FF"/></g>`;
        default: return "";
    }
}

/** Verificată la fiecare calcul: un nivel nou aduce o mică sărbătoare (și, uneori, ceva nou de purtat). */
function checkPalLevel() {
    if (guest.on) return;
    const { level } = palProgress();
    if (!state.pal.seenLevel) { state.pal.seenLevel = level; return; } // prima dată (date vechi): fără sărbători în lanț
    if (level <= state.pal.seenLevel) return;
    const from = state.pal.seenLevel;
    state.pal.seenLevel = level;
    const gifts = [
        ...PAL_ACCESSORIES.filter(a => a.level > from && a.level <= level).map(a => a.label.toLowerCase()),
        ...Object.values(PAL_COLORS).filter(c => c.level > from && c.level <= level).map(c => `culoarea ${c.label.toLowerCase()}`)
    ];
    showToast(`🎉 ${buddyName()} a ajuns la nivelul ${level}!${gifts.length ? ` A primit: ${gifts.join(", ")}.` : ""}`, {
        duration: 7000, action: "Garderoba", actionIcon: "sparkles", onAction: () => openWardrobe()
    });
}

/** Cercul de nivel de lângă mascotă (pe Azi). */
function palLevelChipHTML() {
    const p = palProgress();
    const r = 15, c = 2 * Math.PI * r;
    return `<button type="button" class="pal-level" data-action="wardrobe-open" aria-label="${escapeHTML(`${buddyName()}: nivelul ${p.level}. Deschide garderoba`)}" title="${p.max ? "Nivel maxim" : `${p.left} XP până la nivelul ${p.level + 1}`}">
        <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="pal-ring-bg"/><circle cx="18" cy="18" r="${r}" class="pal-ring" stroke-dasharray="${(p.pct * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
        <b>${p.level}</b>
    </button>`;
}

/** Garderoba: nivel, XP, culori, accesorii și insignele. */
function openWardrobe() {
    const p = palProgress();
    const unlocked = palUnlockedLevel();
    const look = palLook();
    const swatch = (id, c) => {
        const open = unlocked >= c.level;
        return `<button type="button" class="wr-item ${look.color === id ? "is-on" : ""}" data-action="wardrobe-color" data-id="${id}" ${open ? "" : "disabled"} aria-pressed="${look.color === id}" aria-label="${escapeHTML(open ? `Culoarea ${c.label}` : `${c.label}: se deblochează la nivelul ${c.level}`)}">
            <i class="wr-swatch" style="background:${c.fill}"></i><span>${open ? escapeHTML(c.label) : `${icon("lock")} Nv. ${c.level}`}</span></button>`;
    };
    const acc = a => {
        const open = unlocked >= a.level;
        return `<button type="button" class="wr-item ${look.acc === a.id ? "is-on" : ""}" data-action="wardrobe-acc" data-id="${a.id}" ${open ? "" : "disabled"} aria-pressed="${look.acc === a.id}" aria-label="${escapeHTML(open ? a.label : `${a.label}: se deblochează la nivelul ${a.level}`)}">
            ${buddySVG("happy", "wr-buddy", { color: look.color, acc: a.id })}<span>${open ? escapeHTML(a.label) : `${icon("lock")} Nv. ${a.level}`}</span></button>`;
    };
    const badges = ACHIEVEMENTS.map(a => ({ ...a, on: Boolean(state.achievements[a.key]) }));
    openModal({
        layout: "panel",
        title: `Garderoba lui ${buddyName()}`,
        confirmText: "",
        cancelText: "Gata",
        guestOk: true,
        body: `
            <div class="wr-head">
                <div class="wr-preview">${buddySVG("love", "wr-big")}</div>
                <div class="wr-level">
                    <b>Nivelul ${p.level}</b>
                    <div class="azi-meter" role="progressbar" aria-label="XP până la nivelul următor" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.pct * 100)}"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>
                    <small>${p.max ? "Nivel maxim. Ești o legendă!" : `${p.xp} XP · încă ${p.left} până la nivelul ${p.level + 1}`}</small>
                </div>
            </div>
            <details class="ev-more wr-how">
                <summary>Cum crește ${escapeHTML(buddyName())}</summary>
                <ul class="exam-rules">
                    <li>+${XP.grade} XP pentru fiecare notă (+${XP.ten} în plus pentru un 10)</li>
                    <li>+${XP.plan} XP pentru fiecare sesiune din plan bifată</li>
                    <li>+${XP.event} XP pentru fiecare temă sau test bifat în calendar</li>
                    <li>+${XP.practice} XP pentru fiecare rezultat de la o variantă de examen</li>
                    <li>+${XP.badge} XP pentru fiecare insignă</li>
                </ul>
            </details>
            <h4 class="wr-title">Culoare</h4>
            <div class="wr-grid wr-colors">${Object.entries(PAL_COLORS).map(([id, c]) => swatch(id, c)).join("")}</div>
            <h4 class="wr-title">Accesorii</h4>
            <div class="wr-grid">
                <button type="button" class="wr-item ${!look.acc ? "is-on" : ""}" data-action="wardrobe-acc" data-id="" aria-pressed="${!look.acc}">${buddySVG("happy", "wr-buddy", { color: look.color, acc: "" })}<span>Nimic</span></button>
                ${PAL_ACCESSORIES.map(acc).join("")}
            </div>
            <h4 class="wr-title">Insigne <small>${badges.filter(b => b.on).length} din ${badges.length}</small></h4>
            <ul class="wr-badges">
                ${badges.map(b => `<li class="${b.on ? "is-on" : ""}">${icon(b.on ? b.icon : "lock")}<span>${escapeHTML(b.label)}</span></li>`).join("")}
            </ul>`
    });
}

function setPalLook(patch) {
    if (!requireAccount()) return;
    Object.assign(state.pal.look, patch);
    refresh();
    const body = $("action-modal-body");
    const scroll = body?.scrollTop || 0;
    openWardrobe();
    if (body) body.scrollTop = scroll;
}

/** Cardul din Setări → Tu și colegul tău. */
function renderPalLevelSetting() {
    const box = $("pal-level-setting");
    if (!box) return;
    const p = palProgress();
    box.innerHTML = `
        <div class="pal-set">
            ${palLevelChipHTML()}
            <div><b>${escapeHTML(buddyName())} e la nivelul ${p.level}</b><small>${p.max ? "nivel maxim" : `încă ${p.left} XP până la nivelul următor`}</small></div>
            <button type="button" class="btn btn-glass btn-sm" data-action="wardrobe-open">${icon("sparkles")} Garderoba</button>
        </div>`;
}

Object.assign(ACTIONS, {
    "wardrobe-open": () => openWardrobe(),
    "wardrobe-color": el => { const c = PAL_COLORS[el.dataset.id]; if (c && palUnlockedLevel() >= c.level) setPalLook({ color: el.dataset.id }); },
    "wardrobe-acc": el => { const a = PAL_ACCESSORIES.find(x => x.id === el.dataset.id); if (!el.dataset.id || (a && palUnlockedLevel() >= a.level)) setPalLook({ acc: el.dataset.id || "" }); }
});
GUEST_OK.add("wardrobe-open");
