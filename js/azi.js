/* urNotes · Pagina Azi, mascota, ajutorul, primii pași.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ---------- DASHBOARD ---------- */
/* ==================== AZI (pagina de start) ==================== */
/*
 * Răspunde la „ce am azi?”: orele din orar (cu testele zilei marcate), ce e de făcut,
 * media pe scurt, ultimele note și materiile de urmărit.
 * După-amiaza (de la 15:00) arată automat ziua de școală următoare — ca să-ți faci ghiozdanul.
 */
const HOME_EVENING_HOUR = 15;

/** Modulul care conține data (cu numărul lui) sau null în vacanță. */
function moduleAt(dateKey) {
    const list = state.settings.modules;
    const i = list.findIndex(m => dateKey >= m.start && dateKey <= m.end);
    return i >= 0 ? { n: i + 1, ...list[i] } : null;
}

function isSchoolDay(dateKey) {
    const wd = parseDateKey(dateKey).getDay();
    return wd >= 1 && wd <= 5 && !SCHOOL_HOLIDAYS[dateKey] && Boolean(moduleAt(dateKey));
}

function nextSchoolDay(after) {
    for (let i = 1; i <= 200; i++) {
        const date = addDays(after, i);
        if (isSchoolDay(date)) return date;
    }
    return null;
}

function lessonsOn(dateKey) {
    return isSchoolDay(dateKey) ? (state.timetable[parseDateKey(dateKey).getDay()] || []) : [];
}

/** Ziua din cardul cu ore: azi sau următoarea zi de școală. */
function homeDays(now = new Date()) {
    const today = getLocalDateKey(now);
    const next = nextSchoolDay(today);
    const todayBusy = isSchoolDay(today) || occurrencesBetween(today, today).length > 0;
    let pick = ui.home.day || (todayBusy && now.getHours() < HOME_EVENING_HOUR ? "today" : "next");
    if (pick === "next" && !next) pick = "today";
    return { today, next, pick, date: pick === "next" ? next : today };
}

/** „azi”, „mâine”, „vineri”, „luni, 2 nov”. */
function dayWord(date, today = getLocalDateKey()) {
    const n = daysBetween(today, date);
    if (n === 0) return "azi";
    if (n === 1) return "mâine";
    if (n === -1) return "ieri";
    const wd = WEEKDAY_LONG[parseDateKey(date).getDay()].toLowerCase();
    return n > 0 && n < 7 ? wd : `${wd}, ${shortDayLabel(date)}`;
}

const capitalize = text => text ? text[0].toLocaleUpperCase("ro") + text.slice(1) : text;

function longDateLabel(date) {
    const d = parseDateKey(date);
    return `${WEEKDAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
}

function greeting(hour) {
    if (hour >= 5 && hour < 11) return "Bună dimineața";
    if (hour >= 11 && hour < 18) return "Bună ziua";
    return "Bună seara";
}

/* ==================== PERSONALIZARE: ELEVUL ȘI MASCOTA ==================== */
/*
 * Mascota e un post-it cu fața desenată; elevul îi alege numele (Setări sau configurarea).
 * Starea ei vine din note și din calendar: bucuroasă după un 10 sau când media e sus,
 * concentrată înaintea unui test, îngrijorată când o materie e sub pragul de risc.
 */
const firstName = () => state.settings.profile.name.split(" ")[0] || "";
const buddyName = () => state.settings.profile.buddy || DEFAULT_SETTINGS.profile.buddy;
const formatAvg = v => Number(v).toFixed(2);

/*
 * Fața mascotei, pe stări (stilul „marker”, mai jos). Efectele din jur folosesc bLine/STAR/HEART.
 */
const INK = "#2A1B5C";
const bLine = (d, w = 3.6, cls = "") => `<path class="${cls}" d="${d}" stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const STAR = (x, y, s = 1, fill = "#FFFFFF") => `<g transform="translate(${x} ${y}) scale(${s})"><path class="b-spark" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="${fill}" stroke="${INK}" stroke-width="0.8"/></g>`;
const HEART = (x, y) => `<g transform="translate(${x} ${y})"><path class="b-heart" d="M0 4 C-7 -1 -4 -7 0 -3 C4 -7 7 -1 0 4 Z" fill="#FF5C8A"/></g>`;
// Efecte în jurul mascotei (steluțe, abur, stropi…), animate din CSS după starea ei.
const BUDDY_FX = {
    giggle: STAR(18, 26, 0.9, "#FFE58A") + STAR(102, 20, 0.7, "#FFE58A") + STAR(106, 44, 0.5, "#FFFFFF"),
    surprised: `<g class="b-shock">${bLine("M10 42 L2 37M9 52 L0 52M10 62 L2 67M110 42 L118 37M111 52 L120 52M110 62 L118 67", 2.6)}</g>`,
    ouch: `<g class="b-orbit">${STAR(38, 6, 1, "#FFE58A")}${STAR(82, 6, 1, "#FFE58A")}${STAR(60, -2, 0.8, "#FFFFFF")}</g>`,
    dizzy: `<g class="b-orbit is-slow">${STAR(38, 6, 0.95, "#FFE58A")}${STAR(82, 6, 0.95, "#FFE58A")}${STAR(60, -2, 0.75, "#FF9EC0")}</g>`,
    angry: `<circle class="b-steam" cx="22" cy="8" r="5" fill="#FFFFFF" stroke="${INK}" stroke-width="0.8"/><circle class="b-steam is-late" cx="98" cy="6" r="5" fill="#FFFFFF" stroke="${INK}" stroke-width="0.8"/>`,
    worried: `<path class="b-sweat" d="M95 30 Q90 38 95 41 Q100 38 95 30 Z" fill="#8FD3FF" stroke="${INK}" stroke-width="0.8"/>`,
    love: HEART(20, 30) + `<g class="is-late">${HEART(100, 24)}</g>` + HEART(104, 52),
    sleepy: `<g class="b-zzz" font-family="Figtree, sans-serif" font-weight="800" fill="${INK}"><text x="90" y="26" font-size="12">z</text><text class="is-late" x="98" y="14" font-size="16">Z</text><text class="is-later" x="108" y="2" font-size="20">Z</text></g>`,
    wink: `<g class="b-wink-spark">${STAR(98, 42, 0.7, "#FFE58A")}</g>`,
    starry: STAR(16, 24, 0.9, "#FFE58A") + STAR(104, 18, 0.8, "#FFE58A") + STAR(108, 50, 0.55, "#FFFFFF") + STAR(10, 56, 0.5, "#FFFFFF"),
    sad: `<path class="b-tear" d="M40 66 Q36 73 40 76 Q44 73 40 66 Z" fill="#8FD3FF" stroke="${INK}" stroke-width="0.8"/>`,
    proud: `<path class="b-glint" d="M34 50 L40 50 L36 60 L30 60 Z" fill="#FFFFFF" opacity="0.85"/>`,
    thinking: `<g class="b-think"><circle cx="98" cy="34" r="3" fill="#FFFFFF" stroke="${INK}" stroke-width="1"/><circle class="is-late" cx="106" cy="22" r="4.5" fill="#FFFFFF" stroke="${INK}" stroke-width="1"/><circle class="is-later" cx="113" cy="7" r="6.5" fill="#FFFFFF" stroke="${INK}" stroke-width="1"/></g>`,
    shy: `<g class="b-blush-lines">${bLine("M24 66 L27 62M29 67 L32 63M34 68 L37 64", 1.6)}${bLine("M84 64 L87 68M89 63 L92 67M94 62 L97 66", 1.6)}</g>`,
    party: `<g class="b-bits"><rect x="10" y="20" width="5" height="8" rx="1" fill="#FF5C7A"/><rect class="is-late" x="104" y="14" width="5" height="8" rx="1" fill="#4F6BF5"/><rect x="108" y="48" width="5" height="8" rx="1" fill="#2EC4B6"/><rect class="is-late" x="6" y="52" width="5" height="8" rx="1" fill="#FFC93C"/><rect x="58" y="-6" width="5" height="8" rx="1" fill="#9B5DE5"/></g>`
};
/* Fața „marker”: linii groase, desenate de mână pe post-it (ca un doodle). Ochii stau în .buddy-pupils,
   așa că se mută spre cursor; .buddy-eyes clipește; clasele b-* sunt animate din CSS după stare. */
const MK = "#1E2B58";
const mk = (d, w = 5, cls = "") => `<path class="${cls}" d="${d}" stroke="${MK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const mkFill = (d, cls = "") => `<path class="${cls}" d="${d}" fill="${MK}" stroke="${MK}" stroke-width="3.6" stroke-linejoin="round"/>`;
/** Ochii-liniuță (dy mută privirea în sus/jos, h e înălțimea). */
const MK_EYES = (dy = 0, h = 11, dx = 0) => `<g class="b-eyes-pop"><g class="buddy-eyes"><g class="buddy-pupils">${mk(`M${44 + dx} ${49 + dy} L${44.5 + dx} ${49 + dy + h}M${76 + dx} ${49 + dy} L${75.5 + dx} ${49 + dy + h}`, 5.4)}</g></g></g>`;
const MK_DOTS = (r = 4.6) => `<g class="b-eyes-pop"><g class="buddy-eyes"><g class="buddy-pupils"><circle cx="44" cy="55" r="${r}" fill="${MK}"/><circle cx="76" cy="55" r="${r}" fill="${MK}"/></g></g></g>`;
const MK_HAPPY_EYES = (cls = "b-squint") => mk("M37 59 L44 51 L51 59M69 59 L76 51 L83 59", 5, cls);
const MK_OPEN_MOUTH = `<g class="b-mouth">${mkFill("M45 69 C50 84 70 84 75 69 Z")}<path d="M52 79 Q60 84 68 79" fill="#FF7AA8"/></g>`;
const STAR_EYE = (x, y) => `<g transform="translate(${x} ${y})"><path class="b-star-eye" d="M0 -10 L2.9 -3 L10 -3 L4.3 1.6 L6.4 9 L0 4.6 L-6.4 9 L-4.3 1.6 L-10 -3 L-2.9 -3 Z" fill="#FFF3B0" stroke="${MK}" stroke-width="3" stroke-linejoin="round"/></g>`;
const MK_HEART_EYE = (x, y) => `<g transform="translate(${x} ${y}) scale(1.6)"><path class="b-heart-eye" d="M0 4 C-7 -1 -4 -7 0 -3 C4 -7 7 -1 0 4 Z" fill="#FF5C8A" stroke="${MK}" stroke-width="1.8" stroke-linejoin="round"/></g>`;
const SPIRAL = (cx, cy) => `<g transform="translate(${cx} ${cy})"><path class="b-spiral" d="M0 0 m0 -1.5 a1.5 1.5 0 1 1 -1.5 1.5 a3.5 3.5 0 1 1 3.5 3.5 a5.5 5.5 0 1 1 -5.5 -5.5 a7.5 7.5 0 1 1 7.5 7.5" stroke="${MK}" stroke-width="3.6" fill="none" stroke-linecap="round"/></g>`;
const BUDDY_FACES = {
    happy: { eyes: MK_EYES(), mouth: mk("M45 70 C51 80 68 81 75 68", 5, "b-mouth") },
    focused: { eyes: MK_EYES(1, 10), brows: mk("M37 44 L50 45M70 45 L83 44", 4, "b-brows"), mouth: mk("M50 75 L70 74", 5, "b-mouth") },
    worried: { eyes: MK_EYES(2), brows: mk("M36 44 L50 40M84 44 L70 40", 4, "b-brows"), mouth: mk("M48 77 q4 -4 8 0 t8 0 t8 0", 4.4, "b-mouth") },
    giggle: { eyes: MK_HAPPY_EYES(), mouth: MK_OPEN_MOUTH },
    surprised: { eyes: MK_DOTS(4.8), brows: mk("M36 41 Q43 35 50 39M70 39 Q77 35 84 41", 4, "b-brows"), mouth: `<ellipse class="b-mouth" cx="60" cy="77" rx="6" ry="7.5" fill="none" stroke="${MK}" stroke-width="4.6"/>` },
    ouch: { eyes: mk("M38 50 L50 61M50 50 L38 61", 5, "b-x") + mk("M70 50 L82 61M82 50 L70 61", 5, "b-x"), mouth: mk("M47 79 l4.3 -4 l4.3 4 l4.3 -4 l4.3 4 l4.3 -4 l4.3 4", 4.2, "b-mouth") },
    dizzy: { eyes: SPIRAL(44, 55) + SPIRAL(76, 55), mouth: mk("M48 79 Q54 73 60 79 T72 79", 4.4, "b-mouth") },
    angry: { eyes: MK_EYES(3, 8), brows: mk("M35 42 L51 48M85 42 L69 48", 5, "b-brows"), mouth: mk("M49 80 Q60 72 71 80", 5, "b-mouth"), hot: true },
    love: { eyes: MK_HEART_EYE(44, 55) + MK_HEART_EYE(76, 55), mouth: mk("M46 70 C52 80 68 80 74 70", 5, "b-mouth"), hot: true },
    sleepy: { eyes: mk("M37 57 Q44 62 51 57M69 57 Q76 62 83 57", 5, "b-sleep-eyes"), mouth: `<ellipse class="b-mouth" cx="60" cy="77" rx="3.4" ry="4" fill="none" stroke="${MK}" stroke-width="4"/>` },
    wink: { eyes: `<g class="b-eyes-pop"><g class="buddy-eyes"><g class="buddy-pupils">${mk("M44 49 L44.5 60", 5.4)}</g></g></g>` + mk("M69 58 L76 51 L83 58", 5, "b-wink"),
        mouth: mk("M46 69 C52 80 67 80 75 66", 5, "b-mouth") },
    starry: { eyes: `<g class="b-star-eyes">${STAR_EYE(44, 55)}${STAR_EYE(76, 55)}</g>`, mouth: MK_OPEN_MOUTH, hot: true },
    sad: { eyes: MK_EYES(4, 9), brows: mk("M36 46 L50 41M84 46 L70 41", 4, "b-brows"), mouth: mk("M49 82 C53 73 67 73 71 82", 5, "b-mouth") },
    proud: { eyes: `<g class="b-shades"><path d="M29 47 H58 V54 Q58 64 46 64 Q32 64 30 54 Z" fill="${MK}"/><path d="M62 47 H91 V54 Q89 64 75 64 Q62 64 62 54 Z" fill="${MK}"/><path d="M57 50 H63" stroke="${MK}" stroke-width="4"/></g>`,
        mouth: mk("M49 74 C56 80 66 79 73 69", 5, "b-mouth") },
    thinking: { eyes: MK_EYES(-4, 10, 3), brows: mk("M37 41 Q44 38 51 41M71 38 Q78 34 85 37", 4, "b-brows"), mouth: mk("M53 78 q3.5 -3 7 0 t7 0", 4.4, "b-mouth") },
    shy: { eyes: MK_EYES(5, 7), mouth: mk("M54 76 Q60 80 66 76", 4.4, "b-mouth"), hot: true },
    party: { eyes: MK_HAPPY_EYES(), mouth: MK_OPEN_MOUTH, hot: true }
};

function buddySVG(mood = "happy", cls = "", look = palLook()) {
    const f = BUDDY_FACES[mood] || BUDDY_FACES.happy;
    const paper = PAL_COLORS[look.color] || PAL_COLORS.yellow;
    const acc = PAL_ACCESSORIES.find(a => a.id === look.acc);
    const cheek = f.hot ? "#FF5C7A" : "#FF7AA8";
    return `<svg class="buddy ${cls}" viewBox="0 0 120 120" aria-hidden="true" data-mood="${mood}">
        <g class="buddy-body"><g class="buddy-anim"><g class="buddy-breath">
            <g transform="rotate(-6 60 62)">
                <path d="M14 18H106V86L88 104H14Z" fill="${paper.fill}"/>
                <path d="M88 104V86H106Z" fill="${paper.fold}"/>
                ${acc?.hat ? "" : `<rect x="44" y="10" width="32" height="13" fill="${look.color === "pink" ? "#FFE58A" : "#FF9EC0"}"/>`}
                ${f.eyes}${f.brows || ""}
                ${f.hot ? `<g class="b-cheeks"><ellipse cx="31" cy="70" rx="6.5" ry="3.8" fill="${cheek}" opacity="0.7"/><ellipse cx="89" cy="70" rx="6.5" ry="3.8" fill="${cheek}" opacity="0.7"/></g>` : ""}
                ${f.mouth}
                ${acc ? palAccessorySVG(acc.id) : ""}
                ${BUDDY_FX[mood] || ""}
            </g>
        </g></g></g>
    </svg>`;
}

/*
 * Mascota urmărește cursorul: pupilele se uită spre el și corpul se apleacă puțin.
 * O singură ascultare de „pointermove” + requestAnimationFrame, pentru toate mascotele de pe ecran.
 */
const buddyLook = { x: -1, y: -1, frame: 0 };
function initBuddyLook() {
    const calm = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const update = () => {
        buddyLook.frame = 0;
        document.querySelectorAll(".buddy").forEach(svg => {
            const r = svg.getBoundingClientRect();
            if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
            const dx = buddyLook.x - (r.left + r.width / 2);
            const dy = buddyLook.y - (r.top + r.height * 0.45);
            const dist = Math.hypot(dx, dy) || 1;
            const reach = Math.min(1, dist / 60) * 3.6; // aproape de el, privirea se adună spre centru
            const pupils = svg.querySelector(".buddy-pupils");
            if (pupils) pupils.style.transform = `translate(${(dx / dist * reach).toFixed(2)}px, ${(dy / dist * reach).toFixed(2)}px)`;
            const body = svg.querySelector(".buddy-body");
            if (body && !calm) body.style.transform = `rotate(${Math.max(-7, Math.min(7, dx / 70)).toFixed(2)}deg)`;
        });
    };
    const track = event => {
        buddyLook.x = event.clientX;
        buddyLook.y = event.clientY;
        if (!buddyLook.frame) buddyLook.frame = requestAnimationFrame(update);
    };
    document.addEventListener("pointermove", track, { passive: true });
    document.addEventListener("pointerdown", track, { passive: true });
}

/*
 * Clic pe mascotă: fără text, doar fața și corpul reacționează. La clicuri repetate:
 * râde, se miră, „au!”, se supără (cu abur), amețește, apoi face pace (cu inimioare).
 */
const BUDDY_POKES = ["giggle", "wink", "giggle", "surprised", "shy", "ouch", "angry", "angry", "dizzy", "love", "party"];
const buddyPoke = { n: 0, last: 0, timer: 0, rest: null };

function pokeBuddy(btn, event) {
    const box = btn.closest(".azi-buddy");
    if (!box) return;
    const now = Date.now();
    buddyPoke.n = now - buddyPoke.last < 4000 ? (buddyPoke.n % BUDDY_POKES.length) + 1 : 1;
    buddyPoke.last = now;
    btn.innerHTML = buddySVG(BUDDY_POKES[buddyPoke.n - 1]);

    // Apăsat ca un buton: se turtește pe loc, apoi revine (nu fuge în nicio direcție).
    btn.classList.remove("is-hit", "is-calm");
    void btn.offsetWidth; // repornește animația
    btn.classList.add("is-hit");

    // După câteva secunde de liniște, revine la fața de zi cu zi (mesajul rămâne neatins).
    clearTimeout(buddyPoke.timer);
    buddyPoke.timer = setTimeout(() => {
        buddyPoke.n = 0;
        if (buddyPoke.rest && document.contains(btn)) {
            btn.classList.remove("is-hit");
            btn.classList.add("is-calm"); // revine fără să „apară” din nou
            btn.innerHTML = buddySVG(buddyPoke.rest.mood);
        }
    }, 5000);
}

/** Ce simte și ce îi spune mascota elevului azi. */
function buddyState({ today }, { tests }) {
    const name = firstName();
    const hey = name ? `, ${name}` : "";
    const mats = Object.keys(state.subjects);
    if (!mats.length) return { mood: "happy", text: `Eu sunt ${buddyName()}, colegul tău de bancă. Adaugă-ți materiile și te ajut să ții evidența notelor.` };

    // Cel mai recent 10 (ultimele 7 zile)
    let ten = null;
    for (const mat of mats) {
        for (const g of state.subjects[mat].grades) {
            if (g.val === 10 && g.date && daysBetween(g.date, today) <= 7 && (!ten || g.date > ten.date)) ten = { mat, date: g.date };
        }
    }
    const risk = mats
        .filter(mat => metrics.subjects[mat]?.statusClass === "badge-danger")
        .sort((a, b) => metrics.subjects[a].exactAvg - metrics.subjects[b].exactAvg)[0];
    const soon = tests.find(o => daysBetween(today, o.date) <= 1);

    if (ten && daysBetween(ten.date, today) <= 2) return { mood: "starry", text: `Un 10 la ${ten.mat}! Bravo${hey}, ți-am lipit o steluță.` };
    const planToday = state.plan.prefs.setup ? state.plan.items.filter(it => it.date === today) : [];
    if (planToday.length && planToday.every(it => it.done)) return { mood: "love", text: `Gata planul de azi! Bravo${hey}, mă bucur tare.` };
    if (risk) return { mood: "worried", text: `${risk} e la ${formatAvg(metrics.subjects[risk].exactAvg)}, sub pragul tău de ${formatAvg(state.settings.calc.riskThreshold)}. ${state.plan.prefs.setup ? "Am pus sesiuni pentru ea în planul tău." : "Facem un plan împreună? Îl găsești la „Plan”."}` };
    const todo = planToday.filter(it => !it.done);
    if (todo.length && new Date().getHours() >= 15) return { mood: "focused", text: `Mai ai ${plural(todo.length, "sesiune", "sesiuni")} în planul de azi. Începem cu ${todo[0].mat}?` };
    if (soon) {
        const what = `${soon.ev.type.toLocaleLowerCase("ro")}${soon.ev.subject ? ` la ${soon.ev.subject}` : ""}`;
        return { mood: "thinking", text: `${capitalize(dayWord(soon.date, today))} ai ${what}. Recapitulăm puțin${hey}?` };
    }
    if (ten) return { mood: "happy", text: `Săptămâna asta ai luat 10 la ${ten.mat}. Continuă tot așa${hey}!` };
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) return { mood: "sleepy", text: `E târziu${hey}. Notele te așteaptă și mâine; somn ușor!` };
    if (metrics.globalAvg >= 9) return { mood: metrics.globalAvg >= 9.5 ? "proud" : "happy", text: `Media ta e ${formatAvg(metrics.globalAvg)}. Ești pe drumul cel bun${hey}!` };
    if (metrics.totalGrades === 0) return { mood: "happy", text: `Când primești prima notă, scrie-o aici și îți calculez media${hey}.` };
    return { mood: "happy", text: `Sunt aici${hey}. Pas cu pas, spre ținta de ${formatAvg(state.settings.goals.targetGPA)}.` };
}

function renderBuddy(days, todo) {
    const box = $("azi-buddy");
    if (!box) return;
    buddyPoke.rest = buddyState(days, todo);
    clearTimeout(buddyPoke.timer);
    buddyPoke.n = 0;
    paintBuddy(box, buddyPoke.rest);
}

function paintBuddy(box, { mood, text }) {
    box.innerHTML = `
        <button type="button" class="buddy-poke" data-action="buddy-poke" aria-label="${escapeHTML(`Gâdilă-l pe ${buddyName()}`)}">${buddySVG(mood)}</button>
        ${palLevelChipHTML()}`;
}

/** Evenimente trecute nefinalizate (ultimele 45 de zile); dintr-o serie, doar ultima apariție (+ câte mai vechi). */
function missedOccurrences(links = gradeLinks(), today = getLocalDateKey()) {
    const out = [];
    const bySeries = new Map();
    occurrencesBetween(addDays(today, -45), addDays(today, -1))
        .filter(o => o.ev.type !== "Personal" && !isOccurrenceDone(o.ev, o.date, links))
        .reverse()
        .forEach(o => {
            const seen = bySeries.get(o.ev.id);
            if (seen) seen.older++;
            else {
                const item = { ...o, older: 0 };
                bySeries.set(o.ev.id, item);
                out.push(item);
            }
        });
    return out;
}

function homeTodo(links, today) {
    return {
        missed: missedOccurrences(links, today),
        homework: occurrencesBetween(today, addDays(today, 6))
            .filter(o => o.ev.type === "Temă" && !isOccurrenceDone(o.ev, o.date, links)),
        tests: occurrencesBetween(today, addDays(today, 13))
            .filter(o => NEEDS_GRADE.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links))
    };
}

function renderDashboard() {
    if (!$("azi-day")) return;
    const now = new Date();
    const links = gradeLinks();
    const days = homeDays(now);
    const todo = homeTodo(links, days.today);

    const mod = moduleAt(days.today);
    setText("azi-date", [
        longDateLabel(days.today),
        mod ? `Modulul ${mod.n}, săptămâna ${Math.floor(daysBetween(weekStart(mod.start), days.today) / 7) + 1}` : "Vacanță"
    ].join(" · "));
    const first = firstName();
    setText("h-dashboard", `${greeting(now.getHours())}${first ? `, ${first}` : ""}!`);
    setText("azi-summary", homeSummary(days, todo));
    renderBuddy(days, todo);

    const step = homeNextStep(days, todo, links);
    if ($("azi-next")) { const nh = homeNextHTML(step, days.today); $("azi-next").innerHTML = nh; $("azi-next").hidden = !nh; }
    $("azi-day").innerHTML = homeDayHTML(days, links);
    $("azi-todo").innerHTML = homeTodoHTML(todo, links, days.today, step.key || "");
    if ($("azi-week")) { const wh = homeWeekHTML(days.today, links); $("azi-week").innerHTML = wh; $("azi-week").hidden = !wh; }
    if ($("azi-plan")) $("azi-plan").innerHTML = homePlanHTML(days.today);
    if ($("azi-year")) { const yh = homeYearHTML(); $("azi-year").innerHTML = yh; $("azi-year").hidden = !yh; }
    if ($("azi-real") && typeof realismCardHTML === "function") { const rh = guest?.on ? "" : realismCardHTML(); $("azi-real").innerHTML = rh; $("azi-real").hidden = !rh; }
    if ($("azi-start")) { const st = homeStartHTML(); $("azi-start").innerHTML = st; $("azi-start").hidden = !st; }
    if ($("azi-install")) { const ih = homeInstallHTML(); $("azi-install").innerHTML = ih; $("azi-install").hidden = !ih; }
    if ($("azi-tiles")) {
        $("azi-tiles").innerHTML = homeTilesHTML(days, todo);
        if (metrics.globalAvg > 0) countUp($("azi-tiles").querySelector(".home-tile.is-hero .home-tile-value"), "gpa", metrics.globalAvg);
    }
}

/** Cele patru cifre ale zilei, ca plăci colorate: media, testele din săptămână, planul de azi, examenul (sau riscul). */
function homeTilesHTML(days, todo) {
    const gpa = metrics.globalAvg;
    const change = generalChange(averageTimeline());
    const prev = lastArchived();
    const tests7 = todo.tests.filter(o => daysBetween(days.today, o.date) <= 6);
    const next = todo.tests[0];
    const items = state.plan.prefs.setup ? state.plan.items.filter(it => it.date === days.today) : null;
    const exam = homeExamInfo();
    const tile = ({ color, tab, label, value, caption, hero = false, tone = "" }) => `
        <button type="button" class="home-tile ${hero ? "is-hero" : ""} ${tone}" style="--tile: var(--c-${color})" data-action="nav" data-tab="${tab}">
            <span class="home-tile-label">${escapeHTML(label)}</span>
            <b class="home-tile-value">${value}</b>
            <small>${caption}</small>
        </button>`;
    const delta = change && Math.abs(change.delta) >= TREND_STABLE
        ? `<span class="${change.delta > 0 ? "is-up" : "is-down"}">${change.delta > 0 ? "▲" : "▼"} ${Math.abs(change.delta).toFixed(2)}</span> ${escapeHTML(change.label)}`
        : prev?.gpa ? `anul trecut ${prev.gpa.toFixed(2)}` : gpa > 0 ? "ca în catalog" : "încă nu ai note";
    return [
        tile({ color: "accent", tab: "tab-catalog", label: "Media generală", value: gpa > 0 ? gpa.toFixed(2) : "–", caption: delta, hero: true }),
        tile({ color: tests7.length ? "sun" : "mint", tab: "tab-calendar", label: "Teste în 7 zile", value: tests7.length,
            caption: next ? escapeHTML(`${next.ev.subject ? shortSubjectName(next.ev.subject) : next.ev.title}, ${relativeDay(next.date)}`) : "nimic programat" }),
        tile({ color: "grape", tab: "tab-plan", label: "Planul de azi", value: items ? (items.length ? `${items.filter(i => i.done).length}/${items.length}` : "liber") : "–",
            caption: items ? (items.length ? `${items.reduce((n, i) => n + i.min, 0)} min de învățat` : "nimic de învățat azi") : "fă-ți un plan" }),
        exam
            ? tile({ color: "tangerine", tab: "tab-examene", label: exam.label, value: exam.n, caption: exam.avg ? `media estimată ${exam.avg.toFixed(2)}` : "adaugă variante" })
            : tile({ color: metrics.riskCount ? "tomato" : "mint", tab: "tab-catalog", label: "Materii la risc", value: metrics.riskCount,
                caption: metrics.riskCount ? `sub ${state.settings.calc.riskThreshold.toFixed(2)}` : "toate în siguranță" })
    ].join("");
}

/** Una-două propoziții cu ce contează: orele zilei afișate, următoarea evaluare, ce așteaptă nota. */
function homeSummary({ today, date }, { missed, tests }) {
    const out = [];
    if (!Object.keys(state.subjects).length) return "Adaugă-ți materiile și orarul, iar pagina asta îți va arăta în fiecare zi ce ai de făcut.";

    if (!moduleAt(today)) {
        const next = nextSchoolDay(today);
        out.push(next ? `Ești în vacanță; școala reîncepe ${dayWord(next, today)}.` : "Anul școlar s-a încheiat.");
    }
    if (date && (moduleAt(today) || daysBetween(today, date) <= 1)) {
        const lessons = lessonsOn(date);
        const exams = occurrencesBetween(date, date).filter(o => NEEDS_GRADE.has(o.ev.type));
        const word = capitalize(dayWord(date, today));
        const examText = exams.length === 1
            ? `${exams[0].ev.type.toLocaleLowerCase("ro")}${exams[0].ev.subject ? ` la ${exams[0].ev.subject}` : ""}`
            : `${exams.length} evaluări`;
        if (lessons.length) out.push(`${word} ai ${plural(lessons.length, "oră", "ore")}${exams.length ? ` și ${examText}` : ""}.`);
        else if (exams.length) out.push(`${word} ai ${examText}.`);
    }
    // „Urmează”: o evaluare după azi (testele de azi sunt deja în propoziția zilei sau au trecut).
    const later = tests.find(o => o.date > today && o.date !== date);
    if (later) out.push(`Urmează „${later.ev.title}”, ${dayWord(later.date, today)}.`);
    const ungraded = missed.filter(o => NEEDS_GRADE.has(o.ev.type)).length;
    if (ungraded) out.push(ungraded === 1 ? "Un test așteaptă nota." : `${ungraded} teste așteaptă nota.`);
    return out.length ? out.join(" ") : "Nimic urgent. Ești la zi.";
}

/* ---------- „?”: explicații pe înțelesul tuturor ---------- */
const HELP = {
    gpa: { title: "Media generală", text: "Media tuturor materiilor tale, calculată ca în catalog: fiecare materie are media ei (rotunjită la final), iar media generală e media lor. Dirigenția din liceu și materiile marcate „exclusă” nu intră." },
    target: { title: "Ținta", text: "Media pe care ți-o dorești. O alegi pentru media generală (în Setări) și pentru fiecare materie (din „Editează”). Aplicația îți spune ce note îți trebuie ca s-o atingi." },
    risk: { title: "„La risc”", text: "O materie e la risc când media ei e sub pragul ales de tine (implicit 8). Le vezi primele în Catalog, iar planul îți pune sesiuni în plus pentru ele." },
    need: { title: "Ce îți trebuie", text: "Ce notă îți trebuie la următoarea evaluare ca să ajungi (sau să rămâi) la țintă. Dacă nu se poate dintr-o singură notă, îți spun câte note de un anumit fel îți trebuie." },
    sim: { title: "Simulatorul", text: "Aici încerci note „ce-ar fi dacă”: adaugi note imaginare și vezi cum s-ar schimba mediile. Notele tale reale nu se schimbă." },
    plan: { title: "Planul", text: "Îți împart timpul de învățat pe 7 zile: înainte de teste, pentru teme și pentru materiile care au nevoie. Apeși „Începe”, înveți cât arată cronometrul, iar sesiunea se bifează singură." },
    programme: { title: "Programa", text: "Materiile tale vin din planul-cadru al profilului și clasei tale, plus dirigenția și maximum un opțional (căruia îi scrii tu tema). Alte materii nu se pot adăuga, ca să nu se strice mediile." }
};
const helpDot = key => `<button type="button" class="help-dot" data-action="help" data-key="${key}" aria-label="${escapeHTML(`Ce înseamnă: ${HELP[key].title}?`)}" title="Ce înseamnă?">?</button>`;
function openHelp(key) {
    const h = HELP[key];
    if (!h) return;
    openModal({ title: h.title, body: `<p class="help-text">${escapeHTML(h.text)}</p>`, confirmText: "", cancelText: "Am înțeles", guestOk: true });
}

/* ---------- iPhone: „Pune pe ecranul principal” ---------- */
/* În Safari nu există buton de instalare; arătăm o dată, pe scurt, cum se face. */
const IOS_HINT_KEY = "pro_ios_install_hidden_v4";
const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
function homeInstallHTML() {
    let hidden = false;
    try { hidden = localStorage.getItem(IOS_HINT_KEY) === "1"; } catch (_) { /* fără stocare */ }
    if (hidden || !isIOS() || isStandalone()) return "";
    return `
        ${homeCardHead("azi-install-title", "download", "urNotes ca aplicație")}
        <p class="azi-more-line">Pune-l pe ecranul principal: se deschide fără bara Safari, merge și fără internet, iar iconița îți arată câte notificări ai.</p>
        <ol class="install-steps">
            <li>Apasă <b>Partajează</b> <span class="install-share" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg></span> în bara Safari.</li>
            <li>Alege <b>„Adaugă pe ecranul principal”</b>.</li>
            <li>Deschide urNotes de pe ecranul principal.</li>
        </ol>
        <button type="button" class="btn btn-text btn-sm" data-action="install-hide">Am înțeles</button>`;
}

/* ---------- „Primii pași”: ce face aplicația utilă, bifat singur pe măsură ce elevul le face ---------- */
const START_HIDE_KEY = "pro_start_hidden_v4";
const START_SETTLED_GRADES = 5;
function startSteps() {
    const hasGrade = Object.values(state.subjects).some(sub => sub.grades.length);
    const hasEvent = Object.keys(state.calendar).length > 0;
    const hasTimetable = Object.values(state.timetable).some(list => list.length);
    return [
        { done: Boolean(myProgramme()), label: "Alege-ți programa", hint: "materiile se completează singure", action: "programme-change" },
        { done: hasTimetable, label: "Completează orarul", hint: "ca să vezi orele fiecărei zile", action: "timetable" },
        { done: hasGrade, label: "Adaugă prima notă", hint: "media se calculează singură", action: "add-grade" },
        { done: hasEvent, label: "Pune un test în calendar", hint: "îți spun ce notă îți trebuie", action: "quick-test" },
        { done: state.plan.prefs.setup, label: "Fă-ți planul de învățat", hint: "2 întrebări, restul e automat", action: "nav", tab: "tab-plan" }
    ];
}
function homeStartHTML() {
    let hidden = false;
    try { hidden = localStorage.getItem(START_HIDE_KEY) === "1"; } catch (_) { /* fără stocare */ }
    const steps = startSteps();
    const done = steps.filter(st => st.done).length;
    // Doar pentru conturile noi: cine are deja câteva note s-a descurcat și fără listă
    const settled = metrics.totalGrades >= START_SETTLED_GRADES;
    if (hidden || settled || done === steps.length || (typeof guest !== "undefined" && guest.on)) return "";
    const next = steps.find(st => !st.done);
    return `
        ${homeCardHead("azi-start-title", "rocket", "Primii pași", `<span class="cat-count">${done} din ${steps.length}</span>`)}
        <p class="azi-more-line">Cinci pași scurți și aplicația lucrează pentru tine.</p>
        <ol class="start-steps">
            ${steps.map(st => `
                <li class="${st.done ? "is-done" : ""} ${st === next ? "is-next" : ""}">
                    <button type="button" class="start-step" data-action="${st.done ? "none" : st.action}" ${st.tab ? `data-tab="${st.tab}"` : ""} ${st.done ? 'aria-disabled="true" tabindex="-1"' : ""}>
                        <span class="start-dot" aria-hidden="true">${st.done ? icon("check") : ""}</span>
                        <span class="start-text"><b>${st.label}</b><small>${st.hint}</small></span>
                        ${st.done ? `<span class="sr-only">(făcut)</span>` : icon("chevron", "start-arrow")}
                    </button>
                </li>`).join("")}
        </ol>
        <button type="button" class="btn btn-text btn-sm" data-action="start-hide">Ascunde, mă descurc</button>`;
}

function homeCardHead(id, iconName, title, extra = "") {
    return `<div class="azi-card-head"><h3 id="${id}">${icon(iconName)} ${title}</h3>${extra}</div>`;
}

/** Eticheta unui eveniment lângă materie: tipul (sau titlul, dacă e unul propriu) + ora. */
function evTagHTML(ev, done) {
    const custom = ev.title && ev.title !== autoEventTitle(ev.type, ev.subject);
    const text = custom ? ev.title : ev.type;
    return `<span class="azi-tag ev-${EVENT_TYPE_CLASS[ev.type] || "personal"} ${done ? "is-done" : ""}" title="${escapeHTML(`${ev.type}: ${ev.title}${done ? " (făcut)" : ""}`)}">${icon(done ? "check" : EVENT_TYPE_ICON[ev.type] || "pin")} ${escapeHTML(text)}${ev.time ? ` · ${escapeHTML(ev.time)}` : ""}</span>`;
}

/* ---------- orele zilei ---------- */
function homeDayHTML({ today, next, pick, date }, links) {
    const hasSubjects = Object.keys(state.subjects).length > 0;
    const word = dayWord(date, today);
    const seg = next ? `
        <div class="azi-seg" role="group" aria-label="Ce zi arăt">
            <button type="button" data-action="home-day" data-day="today" aria-pressed="${pick === "today"}">Azi</button>
            <button type="button" data-action="home-day" data-day="next" aria-pressed="${pick === "next"}">${escapeHTML(capitalize(dayWord(next, today).split(",")[0]))}</button>
        </div>` : "";
    const head = `
        <div class="azi-card-head">
            <div>
                <h3 id="azi-day-title">${icon("clock")} Orele de ${escapeHTML(word.split(",")[0])}</h3>
                <span class="subtitle">${escapeHTML(longDateLabel(date))}</span>
            </div>
            ${seg}
        </div>`;

    if (!hasSubjects) {
        return `${head}
            <div class="azi-empty-box">
                <p>Începe cu materiile tale. Apoi completează orarul și aici vei vedea în fiecare zi orele, testele și temele.</p>
                <div class="azi-empty-actions">
                    <button type="button" class="btn btn-primary" data-action="setup-open">${icon("sparkles")} Alege profilul</button>
                    <button type="button" class="btn btn-glass" data-action="add-subject">${icon("plus")} O singură materie</button>
                </div>
            </div>`;
    }

    const occ = occurrencesBetween(date, date);
    const lessons = lessonsOn(date);
    const ttEmpty = Object.keys(state.timetable).length === 0;
    const links7 = occurrencesBetween(addDays(date, 1), addDays(date, 7))
        .filter(o => EXAM_TYPES.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links));

    let body;
    if (lessons.length) {
        const used = new Set();
        const rows = lessons.map((mat, i) => {
            const mine = used.has(mat) ? [] : occ.filter(o => o.ev.subject === mat);
            used.add(mat);
            const d = metrics.subjects[mat];
            const sub = state.subjects[mat];
            const exam = mine.some(o => NEEDS_GRADE.has(o.ev.type));
            const soon = links7.find(o => o.ev.subject === mat);
            const bits = [
                ...mine.map(o => evTagHTML(o.ev, isOccurrenceDone(o.ev, o.date, links))),
                soon && !exam ? `<span class="azi-hint">${icon("calendar-check")} ${escapeHTML(soon.ev.type.toLocaleLowerCase("ro"))} ${escapeHTML(dayWord(soon.date, today))}</span>` : "",
                d?.statusClass === "badge-danger" ? `<span class="azi-hint is-risk">${icon("alert")} la risc</span>` : "",
                sub?.priority ? `<span class="azi-hint">${icon("star")} prioritară</span>` : ""
            ].filter(Boolean);
            const avg = d && sub.grades.length ? d.exactAvg.toFixed(2) : "–";
            return `
                <li class="azi-lesson ${exam ? "has-exam" : ""}" style="${subjectStyle(mat)}">
                    <span class="azi-lesson-n" aria-hidden="true">${i + 1}</span>
                    <button type="button" class="azi-lesson-main" data-action="open-subject" data-mat="${escapeHTML(mat)}"
                        aria-label="${escapeHTML(`Ora ${i + 1}: ${mat}${exam ? ", are evaluare" : ""}. Deschide în Catalog`)}">
                        <span class="azi-lesson-name">${escapeHTML(mat)}</span>
                        ${bits.length ? `<span class="azi-lesson-meta">${bits.join("")}</span>` : ""}
                    </button>
                    <span class="azi-lesson-avg ${sub.grades.length ? `tone-${gradeTone(d.exactAvg)}` : "is-none"}" title="Media la ${escapeHTML(mat)}">${avg}</span>
                    <button type="button" class="azi-icon-btn" data-action="add-grade" data-mat="${escapeHTML(mat)}"
                        title="Adaugă o notă la ${escapeHTML(mat)}" aria-label="Adaugă o notă la ${escapeHTML(mat)}">${icon("plus")}</button>
                </li>`;
        });
        body = `<ol class="azi-lessons">${rows.join("")}</ol>`;
    } else if (ttEmpty) {
        body = `
            <div class="azi-empty-box">
                <p>Completează orarul ca să vezi aici orele fiecărei zile, cu testele și temele lângă materia lor.</p>
                <div class="azi-empty-actions"><button type="button" class="btn btn-primary" data-action="timetable">${icon("calendar-days")} Completează orarul</button></div>
            </div>`;
    } else {
        const wd = parseDateKey(date).getDay();
        const why = !moduleAt(date) ? "Vacanță — nu ai ore." : wd === 0 || wd === 6 ? "Weekend — nu ai ore." : `Nu ai ore în orar ${WEEKDAY_LONG[wd].toLocaleLowerCase("ro")}.`;
        body = `<p class="azi-empty">${icon("sun")} ${why}</p>`;
    }

    const lessonSet = new Set(lessons);
    const others = occ.filter(o => !lessonSet.has(o.ev.subject));
    const othersHTML = others.length ? `
        <h4 class="azi-group">${lessons.length ? "Tot în ziua asta" : "În ziua asta"}</h4>
        <ul class="azi-list">${others.map(o => `
            <li class="azi-item">
                <i class="ev-dot ev-${EVENT_TYPE_CLASS[o.ev.type] || "personal"}" aria-hidden="true"></i>
                <button type="button" class="azi-item-main" data-action="cal-goto" data-date="${o.date}">
                    <b>${escapeHTML(o.ev.title)}</b>
                    <small>${escapeHTML([o.ev.type, o.ev.subject, o.ev.time].filter(Boolean).join(" · "))}</small>
                </button>
            </li>`).join("")}</ul>` : "";

    return `${head}${body}${othersHTML}
        <div class="azi-card-foot">
            ${ttEmpty ? "" : `<button type="button" class="btn btn-text" data-action="timetable">${icon("pen")} Modifică orarul</button>`}
            <button type="button" class="btn btn-text" data-action="cal-goto" data-date="${date}">${icon("calendar")} Vezi în calendar</button>
        </div>`;
}

/* ---------- următorul pas: un singur lucru, cel mai important acum ---------- */
const occKey = o => `${o.ev.id}@${o.date}`;

/** Alege ce merită făcut acum, în ordinea: o notă de scris, un test azi/mâine, o sesiune din plan, o temă pentru mâine, o materie la risc. */
function homeNextStep(days, todo, links) {
    const { today } = days;
    const tomorrow = addDays(today, 1);
    const hour = new Date().getHours();
    const toGrade = todo.missed.find(o => NEEDS_GRADE.has(o.ev.type) && canGradeOccurrence(o.ev, o.date, links));
    if (toGrade) return { kind: "grade", occ: toGrade, key: occKey(toGrade) };
    const testSoon = todo.tests.find(o => o.date === today || o.date === tomorrow);
    const planToday = state.plan.prefs.setup ? planItemsOn(today).filter(it => !it.done) : [];
    if (testSoon && !(testSoon.date === today && hour >= 15)) {
        const session = planToday.find(it => it.mat === testSoon.ev.subject);
        return { kind: "test", occ: testSoon, key: occKey(testSoon), session };
    }
    if (planToday.length) return { kind: "plan", item: planToday[0], left: planToday.length };
    const hw = todo.homework.find(o => o.date === today || o.date === tomorrow);
    if (hw) return { kind: "homework", occ: hw, key: occKey(hw) };
    const risk = Object.keys(state.subjects)
        .filter(m => metrics.subjects[m]?.statusClass === "badge-danger")
        .sort((a, b) => metrics.subjects[a].exactAvg - metrics.subjects[b].exactAvg)[0];
    if (risk) return { kind: "risk", mat: risk };
    if (todo.tests[0]) return { kind: "upcoming", occ: todo.tests[0], key: occKey(todo.tests[0]) };
    return { kind: "clear" };
}

function homeNextHTML(step, today) {
    if (!Object.keys(state.subjects).length) return "";
    const b = (action, label, ic, cls = "btn-glass", data = "") => `<button type="button" class="btn ${cls} btn-sm" data-action="${action}" ${data}>${icon(ic)} ${label}</button>`;
    const dataOcc = o => `data-id="${escapeHTML(o.ev.id)}" data-date="${o.date}"`;
    const subjBtn = mat => state.subjects[mat] ? b("open-subject", `Notițele de ${escapeHTML(shortSubjectName(mat))}`, "pen", "btn-glass", `data-mat="${escapeHTML(mat)}"`) : "";
    let emoji = "sparkles", kicker = "", title = "", text = "", actions = "", tone = "";
    if (step.kind === "grade") {
        const { ev, date } = step.occ;
        emoji = "note"; tone = "is-warm"; kicker = `${ev.type === "Examen" ? "Examenul" : ev.type === "Test" ? "Testul" : "Evaluarea"} de ${dayWord(date, today)}`;
        title = `Ce ai luat la „${escapeHTML(ev.title)}”?`;
        text = "Scrie nota și îți refac media pe loc.";
        actions = `<div class="azi-quick-grade is-big" role="group" aria-label="${escapeHTML(`Nota la ${ev.title}`)}">${[4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" class="qg-btn tone-${gradeTone(v)}" data-action="event-quick-grade" ${dataOcc(step.occ)} data-val="${v}" aria-label="Nota ${v}">${v}</button>`).join("")}</div>
            <div class="azi-next-actions">${b("event-grade", "Altă notă", "plus", "btn-glass", dataOcc(step.occ))}${b("event-done", "N-am primit notă", "check", "btn-text", dataOcc(step.occ))}</div>`;
    } else if (step.kind === "test" || step.kind === "upcoming") {
        const { ev, date } = step.occ;
        const n = daysBetween(today, date);
        emoji = n <= 1 ? "target" : "calendar"; tone = n <= 1 ? "is-hot" : "";
        kicker = n === 0 ? "Azi" : n === 1 ? "Mâine" : `În ${n} zile`;
        title = `${escapeHTML(ev.type)}${ev.subject ? ` la ${escapeHTML(ev.subject)}` : `: ${escapeHTML(ev.title)}`}${ev.time ? ` · ${escapeHTML(ev.time)}` : ""}`;
        const d = metrics.subjects[ev.subject];
        text = n <= 1
            ? (d && state.subjects[ev.subject].grades.length ? `Media acum e ${d.exactAvg.toFixed(2)}. Recapitulează ce ai notat și vezi de ce notă ai nevoie.` : "Recapitulează ce ai notat la materia asta.")
            : "Cel mai important test din următoarele două săptămâni.";
        actions = `<div class="azi-next-actions">
            ${step.session ? b("focus-start", `Începe recapitularea · ${step.session.min} min`, "timer", "btn-primary", `data-id="${escapeHTML(step.session.id)}"`) : ""}
            ${state.subjects[ev.subject] ? b("open-in-sim", "Ce notă îmi trebuie", "target", step.session ? "btn-glass" : "btn-primary", `data-mat="${escapeHTML(ev.subject)}"`) : ""}
            ${subjBtn(ev.subject)}
        </div>`;
    } else if (step.kind === "plan") {
        const it = step.item, k = PLAN_KINDS[it.kind] || {};
        emoji = "timer"; kicker = "Din planul de azi";
        title = `${escapeHTML(it.mat)} · ${escapeHTML((k.label || "sesiune").toLocaleLowerCase("ro"))} ${it.min} min`;
        text = it.reason ? `De ce acum: ${escapeHTML(it.reason)}.` : (step.left > 1 ? `Mai ai ${plural(step.left, "sesiune", "sesiuni")} azi.` : "Ultima sesiune de azi.");
        actions = `<div class="azi-next-actions">${b("focus-start", "Începe acum", "timer", "btn-primary", `data-id="${escapeHTML(it.id)}"`)}${subjBtn(it.mat)}</div>`;
    } else if (step.kind === "homework") {
        const { ev, date } = step.occ;
        emoji = "book"; kicker = date === today ? "De predat azi" : "De predat mâine";
        title = escapeHTML(ev.title);
        text = ev.description ? escapeHTML(ev.description.slice(0, 140)) : (ev.subject ? escapeHTML(ev.subject) : "");
        actions = `<div class="azi-next-actions">${b("event-done", "Am făcut-o", "check", "btn-primary", dataOcc(step.occ))}${subjBtn(ev.subject)}</div>`;
    } else if (step.kind === "risk") {
        const d = metrics.subjects[step.mat];
        emoji = "alert"; tone = "is-warm"; kicker = "Are nevoie de tine";
        title = `${escapeHTML(step.mat)} e la ${d.exactAvg.toFixed(2)}`;
        text = `Sub pragul tău de ${state.settings.calc.riskThreshold.toFixed(2)}. Vezi ce note te scot din risc.`;
        actions = `<div class="azi-next-actions">${b("open-in-sim", "Ce notă îmi trebuie", "target", "btn-primary", `data-mat="${escapeHTML(step.mat)}"`)}${subjBtn(step.mat)}</div>`;
    } else {
        emoji = "check-circle"; kicker = "Ești la zi";
        title = "Nimic urgent acum";
        text = "Nicio notă de scris, niciun test în următoarele două săptămâni. Bun moment să-ți recitești notițele.";
        actions = `<div class="azi-next-actions">${b("nav", "Vezi materiile", "notebook", "btn-glass", `data-tab="tab-catalog"`)}</div>`;
    }
    return `
        <div class="azi-next ${tone}">
            <span class="azi-next-emoji" aria-hidden="true">${icon(emoji)}</span>
            <div class="azi-next-body">
                <p class="azi-next-kicker">Acum · ${escapeHTML(kicker)}</p>
                <h3 id="azi-next-title" class="azi-next-title">${title}</h3>
                ${text ? `<p class="azi-next-text">${text}</p>` : ""}
                ${actions}
            </div>
        </div>`;
}

/* ---------- de făcut: pe zile (întârziate, azi, mâine, mai încolo) ---------- */
function homeTodoHTML({ missed, homework, tests }, links, today, skip = "") {
    const tomorrow = addDays(today, 1);
    const rows = [];
    missed.forEach(o => rows.push({ o, when: "late", sort: o.date, kind: NEEDS_GRADE.has(o.ev.type) ? "grade" : "late" }));
    homework.forEach(o => rows.push({ o, when: o.date === today ? "today" : o.date === tomorrow ? "tomorrow" : "later", sort: o.date, kind: "homework" }));
    tests.forEach(o => rows.push({ o, when: o.date === today ? "today" : o.date === tomorrow ? "tomorrow" : "later", sort: o.date, kind: "test" }));
    const list = rows.filter(r => occKey(r.o) !== skip);
    const total = rows.length;
    const head = homeCardHead("azi-todo-title", "check-circle", "De făcut", total ? `<span class="cat-count">${total}</span>` : "");
    if (!list.length) {
        return `${head}<p class="azi-empty">${icon("sparkles")} ${total ? "Doar ce e mai sus. În rest, ești la zi." : "Nimic de făcut acum: nicio temă în următoarele 7 zile, niciun test în următoarele două săptămâni."}</p>`;
    }
    const GROUPS = [["late", "Au trecut — completează"], ["today", "Azi"], ["tomorrow", "Mâine"], ["later", "Mai încolo"]];
    const rowHTML = ({ o: { ev, date, older }, kind }) => {
        const id = escapeHTML(ev.id);
        const main = `
            <button type="button" class="azi-item-main" data-action="cal-goto" data-date="${date}">
                <b>${escapeHTML(ev.title)}</b>
                <small>${escapeHTML([ev.type !== "Temă" || kind !== "homework" ? ev.type : "", ev.subject, kind === "later" || kind === "test" || kind === "homework" ? `${dayWord(date, today)}${ev.time ? `, ${ev.time}` : ""}` : dayWord(date, today), older && `+${older} mai ${older === 1 ? "veche" : "vechi"}`].filter(Boolean).join(" · "))}</small>
            </button>`;
        if (kind === "homework") {
            return `<li class="azi-item"><button type="button" class="azi-check" data-action="event-done" data-id="${id}" data-date="${date}" aria-pressed="false" title="Bifează ca făcută" aria-label="${escapeHTML(`Făcută: ${ev.title}`)}"></button>${main}</li>`;
        }
        if (kind === "test") {
            const n = daysBetween(today, date);
            return `<li class="azi-item">
                <span class="azi-count ${n <= 2 ? "is-near" : ""}" aria-hidden="true"><b>${n === 0 ? "azi" : n}</b>${n === 0 ? "" : `<small>${n === 1 ? "zi" : "zile"}</small>`}</span>
                ${main}
                ${state.subjects[ev.subject] ? `<button type="button" class="btn btn-text btn-sm" data-action="open-in-sim" data-mat="${escapeHTML(ev.subject)}" title="Ce notă îți trebuie? (Simulator)" aria-label="${escapeHTML(`Ce notă îmi trebuie la ${ev.subject}`)}">${icon("target")} <span class="azi-btn-label">Ce-mi trebuie</span></button>` : ""}
            </li>`;
        }
        const grade = kind === "grade";
        const canGrade = grade && canGradeOccurrence(ev, date, links);
        return `<li class="azi-item is-missed">
            <i class="ev-dot ev-${EVENT_TYPE_CLASS[ev.type] || "personal"}" aria-hidden="true"></i>
            ${main}
            <span class="azi-item-actions">
                ${canGrade ? `<button type="button" class="btn btn-primary btn-sm" data-action="event-grade" data-id="${id}" data-date="${date}">${icon("plus")} Notă</button>` : ""}
                <button type="button" class="btn btn-glass btn-sm" data-action="event-done" data-id="${id}" data-date="${date}" title="${grade ? "Marchează ca încheiat fără notă" : "Marchează ca făcut"}">${icon("check")} ${grade ? "Fără notă" : "Făcut"}</button>
            </span>
        </li>`;
    };
    const groups = GROUPS.map(([g, label]) => {
        const items = list.filter(r => r.when === g).sort((a, b) => a.sort.localeCompare(b.sort));
        if (!items.length) return "";
        const cap = g === "later" ? 4 : g === "late" ? 5 : 99;
        return `
            <h4 class="azi-group ${g === "late" ? "is-late" : ""}">${label}</h4>
            <ul class="azi-list">${items.slice(0, cap).map(rowHTML).join("")}</ul>
            ${items.length > cap ? `<button type="button" class="btn btn-text btn-sm azi-more-btn" data-action="nav" data-tab="tab-calendar">și încă ${items.length - cap} în Calendar →</button>` : ""}`;
    }).join("");
    return head + groups;
}

/* ---------- săptămâna ta: ce s-a întâmplat și ce urmează ---------- */
function gpaOn(date) {
    const subset = Object.fromEntries(Object.entries(state.subjects).map(([mat, sub]) => [mat, { ...sub, grades: sub.grades.filter(g => g.date && g.date <= date) }]));
    return calculateMetrics(subset).rawGlobalAvg;
}

function homeWeekHTML(today, links = gradeLinks()) {
    if (!Object.keys(state.subjects).length) return "";
    const wd = parseDateKey(today).getDay();
    // luni și marți arătăm săptămâna trecută întreagă (recapitulare); de miercuri, săptămâna în curs
    const recap = wd === 1 || wd === 2;
    const from = recap ? addDays(weekStart(today), -7) : weekStart(today);
    const to = recap ? addDays(from, 6) : today;
    const grades = [];
    Object.entries(state.subjects).forEach(([mat, sub]) => sub.grades.forEach(g => { if (g.date && g.date >= from && g.date <= to) grades.push({ mat, val: Number(g.val) }); }));
    const avg = grades.length ? grades.reduce((n, g) => n + g.val, 0) / grades.length : 0;
    const best = grades.reduce((m, g) => (!m || g.val > m.val ? g : m), null);
    const before = gpaOn(addDays(from, -1)), after = recap ? gpaOn(to) : metrics.rawGlobalAvg;
    const delta = before > 0 && after > 0 ? after - before : null;
    const occ = occurrencesBetween(from, to).filter(o => o.ev.type !== "Personal");
    const doneOcc = occ.filter(o => isOccurrenceDone(o.ev, o.date, links)).length;
    const planItems = state.plan.prefs.setup ? state.plan.items.filter(it => it.date >= from && it.date <= to) : [];
    const planDone = planItems.filter(it => it.done);
    const nextFrom = recap ? weekStart(today) : addDays(weekStart(today), 7);
    const nextTests = occurrencesBetween(nextFrom, addDays(nextFrom, 6)).filter(o => NEEDS_GRADE.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links));
    const stat = (value, label, sub = "") => `<div class="week-stat"><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const flat = delta !== null && Math.abs(delta) <= 0.004;
    const deltaHTML = delta === null ? "–" : flat ? "la fel" : `<span class="${delta > 0 ? "is-up" : "is-down"}">${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(2)}</span>`;
    const line = grades.length
        ? `${plural(grades.length, "notă nouă", "note noi")}, media lor ${avg.toFixed(2)}${best ? `; cea mai bună: ${best.val} la ${shortSubjectName(best.mat)}` : ""}.`
        : recap ? "Nicio notă nouă săptămâna trecută." : "Nicio notă nouă săptămâna asta, deocamdată.";
    return `
        ${homeCardHead("azi-week-title", "chart", recap ? "Săptămâna trecută" : "Săptămâna asta", `<span class="subtitle">${escapeHTML(`${shortDayLabel(from)} – ${shortDayLabel(to)}`)}</span>`)}
        <p class="week-line">${escapeHTML(line)}</p>
        <div class="week-stats">
            ${stat(grades.length, grades.length === 1 ? "notă" : "note")}
            ${stat(deltaHTML, "media generală", delta === null ? "" : `acum ${after.toFixed(2)}`)}
            ${stat(`${doneOcc}/${occ.length}`, "teste și teme", "încheiate")}
            ${planItems.length ? stat(`${planDone.length}/${planItems.length}`, "sesiuni", `${planDone.reduce((n, it) => n + it.min, 0)} min`) : ""}
        </div>
        <p class="week-next">${icon("calendar")} ${nextTests.length
            ? `${recap ? "Săptămâna asta" : "Săptămâna viitoare"}: ${escapeHTML(nextTests.slice(0, 3).map(o => o.ev.subject ? shortSubjectName(o.ev.subject) : o.ev.title).join(", "))}${nextTests.length > 3 ? ` și încă ${nextTests.length - 3}` : ""} (${plural(nextTests.length, "evaluare", "evaluări")}).`
            : `${recap ? "Săptămâna asta" : "Săptămâna viitoare"} n-ai nicio evaluare în calendar.`}</p>`;
}

function formatActivityTime(act) {
    if (!act.ts) return act.time || "";
    const date = new Date(act.ts);
    if (Number.isNaN(date.getTime())) return act.time || "";
    return getLocalDateKey(date) === getLocalDateKey()
        ? act.time
        : `${date.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" })} ${act.time}`;
}

registerTab("tab-dashboard", { render: renderDashboard, title: "Azi", icon: "home", group: "home" });
