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
 * Fața mascotei, pe stări. Ochii „normali” au pupilele într-un grup separat (.buddy-pupils),
 * ca să poată urmări cursorul; celelalte stări (râde, „au!”) își desenează singure ochii.
 */
const INK = "#2A1B5C";
const EYES_OPEN = (r = 4.5) => `<g class="b-eyes-pop"><g class="buddy-eyes">
    <circle cx="44" cy="55" r="9.5" fill="#FFFFFF"/><circle cx="76" cy="55" r="9.5" fill="#FFFFFF"/>
    <g class="buddy-pupils"><circle cx="45" cy="56" r="${r}" fill="${INK}"/><circle cx="77" cy="56" r="${r}" fill="${INK}"/></g>
</g></g>`;
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
    love: HEART(20, 30) + `<g class="is-late">${HEART(100, 24)}</g>` + HEART(104, 52)
};
const SPIRAL = (cx, cy) => `<g transform="translate(${cx} ${cy})"><path class="b-spiral" d="M0 0 m0 -1.5 a1.5 1.5 0 1 1 -1.5 1.5 a3.5 3.5 0 1 1 3.5 3.5 a5.5 5.5 0 1 1 -5.5 -5.5 a7.5 7.5 0 1 1 7.5 7.5" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>`;
const BUDDY_FACES = {
    happy: { eyes: EYES_OPEN(), mouth: bLine("M50 72 Q60 84 70 72", 3.6, "b-mouth") },
    focused: { eyes: EYES_OPEN(), mouth: bLine("M52 76 H68", 3.6, "b-mouth") },
    worried: { eyes: EYES_OPEN(), brows: bLine("M36 41 L50 44M84 41 L70 44", 3, "b-brows"), mouth: bLine("M50 81 Q60 70 70 81", 3.6, "b-mouth") },
    giggle: { eyes: bLine("M36 57 Q44 48 52 57M68 57 Q76 48 84 57", 3.4, "b-squint"), mouth: `<g class="b-mouth"><path d="M47 69 Q60 90 73 69 Z" fill="${INK}"/><path d="M53 79 Q60 85 67 79" fill="#FF7AA8"/></g>` },
    surprised: { eyes: EYES_OPEN(3), brows: bLine("M36 39 Q44 34 51 38M69 38 Q76 34 84 39", 3, "b-brows"), mouth: `<ellipse class="b-mouth" cx="60" cy="78" rx="5.5" ry="7" fill="${INK}"/>` },
    ouch: { eyes: bLine("M38 50 L50 61M50 50 L38 61", 3.4, "b-x") + bLine("M70 50 L82 61M82 50 L70 61", 3.4, "b-x"), mouth: bLine("M47 79 q4.3 -5 8.6 0 t8.6 0 t8.6 0", 3.2, "b-mouth") },
    dizzy: { eyes: SPIRAL(44, 55) + SPIRAL(76, 55), mouth: bLine("M48 80 Q54 74 60 80 T72 80", 3.2, "b-mouth") },
    angry: { eyes: EYES_OPEN(4), brows: bLine("M35 42 L51 48M85 42 L69 48", 3.6, "b-brows"), mouth: bLine("M50 80 Q60 73 70 80", 3.6, "b-mouth"), hot: true },
    love: { eyes: HEART(44, 55).replace('class="b-heart"', 'class="b-heart-eye"').replace("translate(44 55)", "translate(44 55) scale(1.7)") + HEART(76, 55).replace('class="b-heart"', 'class="b-heart-eye"').replace("translate(76 55)", "translate(76 55) scale(1.7)"),
        mouth: bLine("M48 71 Q60 86 72 71", 3.6, "b-mouth"), hot: true }
};

function buddySVG(mood = "happy", cls = "", look = palLook()) {
    const f = BUDDY_FACES[mood] || BUDDY_FACES.happy;
    const paper = PAL_COLORS[look.color] || PAL_COLORS.yellow;
    const acc = PAL_ACCESSORIES.find(a => a.id === look.acc);
    const cheek = f.hot ? "#FF5C7A" : "#FF7AA8";
    return `<svg class="buddy ${cls}" viewBox="0 0 120 120" aria-hidden="true" data-mood="${mood}">
        <g class="buddy-body"><g class="buddy-anim">
            <g transform="rotate(-6 60 62)">
                <path d="M14 18H106V86L88 104H14Z" fill="${paper.fill}"/>
                <path d="M88 104V86H106Z" fill="${paper.fold}"/>
                ${acc?.hat ? "" : `<rect x="44" y="10" width="32" height="13" fill="${look.color === "pink" ? "#FFE58A" : "#FF9EC0"}"/>`}
                ${f.eyes}${f.brows || ""}
                <g class="b-cheeks"><ellipse cx="31" cy="70" rx="6.5" ry="3.8" fill="${cheek}" opacity="0.75"/><ellipse cx="89" cy="70" rx="6.5" ry="3.8" fill="${cheek}" opacity="0.75"/></g>
                ${f.mouth}
                ${acc ? palAccessorySVG(acc.id) : ""}
                ${BUDDY_FX[mood] || ""}
            </g>
        </g></g>
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
const BUDDY_POKES = ["giggle", "giggle", "surprised", "ouch", "angry", "angry", "dizzy", "love"];
const buddyPoke = { n: 0, last: 0, timer: 0, rest: null, taps: [] };

function pokeBuddy(btn, event) {
    const box = btn.closest(".azi-buddy");
    if (!box) return;
    const now = Date.now();
    buddyPoke.n = now - buddyPoke.last < 4000 ? (buddyPoke.n % BUDDY_POKES.length) + 1 : 1;
    buddyPoke.last = now;
    btn.innerHTML = buddySVG(BUDDY_POKES[buddyPoke.n - 1]);
    // L-ai „bătut” de 8 ori în 3 secunde? Te provoacă la un joc.
    buddyPoke.taps = [...buddyPoke.taps.filter(t => now - t < 3000), now];
    if (buddyPoke.taps.length >= 8) {
        buddyPoke.taps = [];
        setTimeout(openBuddyGame, 350);
    }

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

/* ---------- minijocul: „Prinde-l pe Tiți!” ---------- */
/* Apare dacă îl „bați” des pe post-it. Iese dintr-una din cele 9 căsuțe; îl atingi cât de des poți în 20 de secunde.
   Nu schimbă nimic în note (merge și pentru vizitatori); doar recordul se ține minte pe dispozitiv. */
const GAME_BEST_KEY = "pro_buddy_game_best_v4";
const game = { score: 0, end: 0, timer: 0, pop: 0, cell: -1, running: false };
const gameBest = () => { try { return Number(localStorage.getItem(GAME_BEST_KEY)) || 0; } catch (_) { return 0; } };

function openBuddyGame() {
    if (!$("action-modal").hidden) return;
    openModal({
        title: `Prinde-l pe ${buddyName()}!`,
        confirmText: "",
        cancelText: "Închide",
        guestOk: true,
        body: `
            <div class="bgame" id="bgame">
                <p class="bgame-intro" id="bgame-msg">Te-ai plictisit, nu? 😄 Atinge-l pe ${escapeHTML(buddyName())} de câte ori poți în 20 de secunde, când iese dintr-o căsuță.</p>
                <div class="bgame-bar"><span>Puncte: <b id="bgame-score">0</b></span><span>Timp: <b id="bgame-time">20</b>s</span><span>Record: <b id="bgame-best">${gameBest()}</b></span></div>
                <div class="bgame-grid" id="bgame-grid">
                    ${Array.from({ length: 9 }, (_, i) => `<button type="button" class="bgame-hole" data-action="bgame-hit" data-i="${i}" aria-label="Căsuța ${i + 1}" disabled><span class="bgame-buddy">${buddySVG("giggle")}</span></button>`).join("")}
                </div>
                <button type="button" class="btn btn-primary bgame-start" data-action="bgame-start" id="bgame-start">${icon("sparkles")} Start</button>
            </div>`
    });
}

function startBuddyGame() {
    if (!$("bgame")) return;
    clearInterval(game.timer); clearTimeout(game.pop);
    Object.assign(game, { score: 0, end: Date.now() + 20000, running: true, cell: -1 });
    $("bgame-score").textContent = "0";
    $("bgame-start").hidden = true;
    $("bgame-msg").textContent = "Hai! Atinge-l repede!";
    document.querySelectorAll(".bgame-hole").forEach(h => { h.disabled = false; });
    game.timer = setInterval(() => {
        if (!$("bgame")) return stopBuddyGame(false);
        const left = Math.max(0, Math.ceil((game.end - Date.now()) / 1000));
        $("bgame-time").textContent = left;
        if (left <= 0) stopBuddyGame(true);
    }, 200);
    popBuddy();
}

/** Iese în altă căsuță; cu cât ai mai multe puncte, cu atât stă mai puțin. */
function popBuddy() {
    if (!game.running || !$("bgame")) return;
    const holes = [...document.querySelectorAll(".bgame-hole")];
    holes.forEach(h => h.classList.remove("is-up", "is-hit"));
    let next;
    do { next = Math.floor(Math.random() * 9); } while (next === game.cell);
    game.cell = next;
    holes[next].classList.add("is-up");
    game.pop = setTimeout(popBuddy, Math.max(450, 1000 - game.score * 25));
}

function hitBuddy(el) {
    if (!game.running || Number(el.dataset.i) !== game.cell || el.classList.contains("is-hit")) return;
    game.score++;
    $("bgame-score").textContent = game.score;
    el.classList.add("is-hit");
    el.querySelector(".bgame-buddy").innerHTML = buddySVG(BUDDY_POKES[Math.floor(Math.random() * BUDDY_POKES.length)]);
    clearTimeout(game.pop);
    game.pop = setTimeout(popBuddy, 220);
}

function stopBuddyGame(finished) {
    clearInterval(game.timer); clearTimeout(game.pop);
    game.running = false;
    if (!finished || !$("bgame")) return;
    const best = gameBest();
    const record = game.score > best;
    if (record) { try { localStorage.setItem(GAME_BEST_KEY, String(game.score)); } catch (_) { /* fără stocare */ } }
    document.querySelectorAll(".bgame-hole").forEach(h => { h.disabled = true; h.classList.remove("is-up"); });
    $("bgame-best").textContent = Math.max(best, game.score);
    $("bgame-msg").textContent = record ? `🏆 Record nou: ${game.score}! ${buddyName()} e amețit.` : game.score >= 15 ? `${game.score} puncte, super rapid!` : `${game.score} puncte. Mai încerci?`;
    const start = $("bgame-start");
    start.hidden = false;
    start.innerHTML = `${icon("refresh")} Încă o dată`;
    start.focus();
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

    if (ten && daysBetween(ten.date, today) <= 2) return { mood: "happy", text: `Un 10 la ${ten.mat}! Bravo${hey}, ți-am lipit o steluță.` };
    const planToday = state.plan.prefs.setup ? state.plan.items.filter(it => it.date === today) : [];
    if (planToday.length && planToday.every(it => it.done)) return { mood: "love", text: `Gata planul de azi! Bravo${hey}, mă bucur tare.` };
    if (risk) return { mood: "worried", text: `${risk} e la ${formatAvg(metrics.subjects[risk].exactAvg)}, sub pragul tău de ${formatAvg(state.settings.calc.riskThreshold)}. ${state.plan.prefs.setup ? "Am pus sesiuni pentru ea în planul tău." : "Facem un plan împreună? Îl găsești la „Plan”."}` };
    const todo = planToday.filter(it => !it.done);
    if (todo.length && new Date().getHours() >= 15) return { mood: "focused", text: `Mai ai ${plural(todo.length, "sesiune", "sesiuni")} în planul de azi. Începem cu ${todo[0].mat}?` };
    if (soon) {
        const what = `${soon.ev.type.toLocaleLowerCase("ro")}${soon.ev.subject ? ` la ${soon.ev.subject}` : ""}`;
        return { mood: "focused", text: `${capitalize(dayWord(soon.date, today))} ai ${what}. Recapitulăm puțin${hey}?` };
    }
    if (ten) return { mood: "happy", text: `Săptămâna asta ai luat 10 la ${ten.mat}. Continuă tot așa${hey}!` };
    if (metrics.globalAvg >= 9) return { mood: "happy", text: `Media ta e ${formatAvg(metrics.globalAvg)}. Ești pe drumul cel bun${hey}!` };
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
        <p class="buddy-bubble" aria-live="polite"><b class="buddy-name">${escapeHTML(buddyName())}</b><span>${escapeHTML(text)}</span></p>
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

    $("azi-day").innerHTML = homeDayHTML(days, links);
    $("azi-todo").innerHTML = homeTodoHTML(todo, links, days.today);
    if ($("azi-plan")) $("azi-plan").innerHTML = homePlanHTML(days.today);
    if ($("azi-exam")) { const eh = homeExamHTML(); $("azi-exam").innerHTML = eh; $("azi-exam").hidden = !eh; }
    if ($("azi-year")) { const yh = homeYearHTML(); $("azi-year").innerHTML = yh; $("azi-year").hidden = !yh; }
    if ($("azi-start")) { const st = homeStartHTML(); $("azi-start").innerHTML = st; $("azi-start").hidden = !st; }
    if ($("azi-install")) { const ih = homeInstallHTML(); $("azi-install").innerHTML = ih; $("azi-install").hidden = !ih; }
    $("azi-avg").innerHTML = homeAverageHTML();
    if (metrics.globalAvg > 0) countUp($("azi-avg").querySelector(".azi-avg-val"), "gpa", metrics.globalAvg);
    const watch = homeWatchHTML();
    $("azi-watch").innerHTML = watch;
    $("azi-watch").hidden = !watch;
    $("azi-recent").innerHTML = homeRecentHTML();
    $("azi-more").innerHTML = homeMoreHTML();
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
    if (hidden || done === steps.length || (typeof guest !== "undefined" && guest.on)) return "";
    const next = steps.find(st => !st.done);
    return `
        ${homeCardHead("azi-start-title", "rocket", "Primii pași", `<span class="cat-count">${done} din ${steps.length}</span>`)}
        <p class="azi-more-line">Cinci lucruri scurte și aplicația lucrează pentru tine. Apasă pe un pas ca să-l faci acum.</p>
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
                <li class="azi-lesson ${exam ? "has-exam" : ""}">
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

/* ---------- de făcut ---------- */
function homeTodoHTML({ missed, homework, tests }, links, today) {
    const total = missed.length + homework.length + tests.length;
    const head = homeCardHead("azi-todo-title", "check-circle", "De făcut", total ? `<span class="cat-count">${total}</span>` : "");
    if (!total) {
        return `${head}<p class="azi-empty">${icon("sparkles")} Nimic de făcut acum: nicio temă în următoarele 7 zile, niciun test în următoarele două săptămâni.</p>`;
    }

    const groups = [];
    if (missed.length) {
        groups.push(`
            <h4 class="azi-group">Au trecut — completează</h4>
            <ul class="azi-list">${missed.slice(0, 5).map(({ ev, date, older }) => {
                const grade = NEEDS_GRADE.has(ev.type);
                return `
                <li class="azi-item is-missed">
                    <i class="ev-dot ev-${EVENT_TYPE_CLASS[ev.type] || "personal"}" aria-hidden="true"></i>
                    <button type="button" class="azi-item-main" data-action="cal-goto" data-date="${date}">
                        <b>${escapeHTML(ev.title)}</b>
                        <small>${escapeHTML([ev.subject, dayWord(date, today), older && `+${older} mai ${older === 1 ? "veche" : "vechi"}`].filter(Boolean).join(" · "))}</small>
                    </button>
                    <span class="azi-item-actions">
                        ${grade && canGradeOccurrence(ev, date, links) ? `<button type="button" class="btn btn-primary btn-sm" data-action="event-grade" data-id="${escapeHTML(ev.id)}" data-date="${date}">${icon("plus")} Notă</button>` : ""}
                        <button type="button" class="btn btn-glass btn-sm" data-action="event-done" data-id="${escapeHTML(ev.id)}" data-date="${date}"
                            title="${grade ? "Marchează ca încheiat fără notă" : "Marchează ca făcut"}">${icon("check")} ${grade ? "Fără notă" : "Făcut"}</button>
                    </span>
                    ${grade && canGradeOccurrence(ev, date, links) ? `
                    <div class="azi-quick-grade" role="group" aria-label="${escapeHTML(`Ce ai luat la ${ev.title}?`)}">
                        <span>Ce ai luat?</span>
                        ${[4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" class="qg-btn tone-${gradeTone(v)}" data-action="event-quick-grade" data-id="${escapeHTML(ev.id)}" data-date="${date}" data-val="${v}" aria-label="Nota ${v}">${v}</button>`).join("")}
                    </div>` : ""}
                </li>`;
            }).join("")}</ul>
            ${missed.length > 5 ? `<p class="azi-more-line">și încă ${missed.length - 5} în Calendar</p>` : ""}`);
    }
    if (homework.length) {
        groups.push(`
            <h4 class="azi-group">Teme de predat</h4>
            <ul class="azi-list">${homework.map(({ ev, date }) => `
                <li class="azi-item">
                    <button type="button" class="azi-check" data-action="event-done" data-id="${escapeHTML(ev.id)}" data-date="${date}"
                        aria-pressed="false" title="Bifează ca făcută" aria-label="${escapeHTML(`Făcută: ${ev.title}`)}"></button>
                    <button type="button" class="azi-item-main" data-action="cal-goto" data-date="${date}">
                        <b>${escapeHTML(ev.title)}</b>
                        <small>${escapeHTML([ev.subject, ev.time].filter(Boolean).join(" · ") || "Temă")}</small>
                    </button>
                    <span class="azi-when ${date === today ? "is-today" : ""}">${escapeHTML(dayWord(date, today).split(",")[0])}</span>
                </li>`).join("")}</ul>`);
    }
    if (tests.length) {
        groups.push(`
            <h4 class="azi-group">Teste și evaluări</h4>
            <ul class="azi-list">${tests.map(({ ev, date }) => {
                const n = daysBetween(today, date);
                return `
                <li class="azi-item">
                    <span class="azi-count ${n <= 2 ? "is-near" : ""}" aria-hidden="true"><b>${n === 0 ? "azi" : n}</b>${n === 0 ? "" : `<small>${n === 1 ? "zi" : "zile"}</small>`}</span>
                    <button type="button" class="azi-item-main" data-action="cal-goto" data-date="${date}">
                        <b>${escapeHTML(ev.title)}</b>
                        <small>${escapeHTML([ev.type, ev.subject, `${dayWord(date, today)}${ev.time ? `, ${ev.time}` : ""}`].filter(Boolean).join(" · "))}</small>
                    </button>
                    ${state.subjects[ev.subject] ? `<button type="button" class="btn btn-text btn-sm" data-action="open-in-sim" data-mat="${escapeHTML(ev.subject)}" title="Ce notă îți trebuie? (Simulator)" aria-label="${escapeHTML(`Ce notă îmi trebuie la ${ev.subject}`)}">${icon("target")} <span class="azi-btn-label">Ce-mi trebuie</span></button>` : ""}
                </li>`;
            }).join("")}</ul>`);
    }
    return head + groups.join("");
}

/* ---------- media ---------- */
function homeSparkSVG(timeline) {
    if (timeline.length < 2) return "";
    const W = 132, H = 44, P = 4;
    const vals = timeline.map(p => p.avg);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 0.5) { const mid = (hi + lo) / 2; lo = mid - 0.25; hi = mid + 0.25; }
    const x = i => P + (i * (W - 2 * P)) / (vals.length - 1);
    const y = v => P + ((hi - v) * (H - 2 * P)) / (hi - lo);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const last = pts.at(-1).split(",");
    return `
        <svg class="azi-spark" viewBox="0 0 ${W} ${H}" role="img"
            aria-label="${escapeHTML(`Media generală de la ${vals[0].toFixed(2)} la ${vals.at(-1).toFixed(2)}, din ${shortDayLabel(timeline[0].date)}`)}">
            <polyline points="${pts.join(" ")}"/>
            <circle cx="${last[0]}" cy="${last[1]}" r="3"/>
        </svg>`;
}

function homeAverageHTML() {
    const gpa = metrics.globalAvg;
    const timeline = averageTimeline();
    const change = generalChange(timeline);
    const goal = getGoalProgress();
    const pct = Math.min(100, Math.max(0, goal.percent));
    const p = metrics.purtare || purtareInfo();
    let delta = `<span class="azi-delta">${gpa > 0 ? "Tendința apare de la notele din zile diferite." : "Încă nu ai note."}</span>`;
    if (change) {
        const dir = change.delta >= TREND_STABLE ? "up" : change.delta <= -TREND_STABLE ? "down" : "flat";
        const text = dir === "flat" ? "stabilă" : `${change.delta > 0 ? "+" : "−"}${Math.abs(change.delta).toFixed(2)}`;
        delta = `<span class="azi-delta is-${dir}">${icon(dir === "down" ? "trend-down" : "trend-up")} ${text} <small>${escapeHTML(change.label)}</small></span>`;
    }

    return `
        <div class="azi-avg-top">
            <div class="azi-avg-main">
                <span class="azi-label">Media generală ${helpDot("gpa")}</span>
                <b class="azi-avg-val">${gpa > 0 ? gpa.toFixed(2) : "–"}</b>
                ${delta}
            </div>
            ${homeSparkSVG(timeline)}
        </div>
        <div class="azi-goal">
            <div class="azi-goal-row"><span>${escapeHTML(goal.label)}</span><b>${escapeHTML(goal.value)}</b></div>
            <div class="azi-meter" role="progressbar" aria-label="${escapeHTML(goal.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}"><i style="width:${pct.toFixed(1)}%"></i></div>
        </div>
        <ul class="azi-facts">
            <li><button type="button" data-action="home-risk" ${metrics.riskCount ? "" : "disabled"}><b class="${metrics.riskCount ? "is-risk" : ""}">${metrics.riskCount}</b><span>${metrics.riskCount === 1 ? "materie la risc" : "materii la risc"}</span></button></li>
            <li><button type="button" data-action="nav" data-tab="tab-statistici"><b>${metrics.tensCount}</b><span>${metrics.tensCount === 1 ? "notă de 10" : "note de 10"}</span></button></li>
            <li><button type="button" data-action="open-subject" data-mat="${escapeHTML(PURTARE_KEY)}"><b>${p.value}</b><span>purtare</span></button></li>
        </ul>
        ${lastYearLine()}`;
}

function getGoalProgress() {
    const { goals, targets } = state.settings;
    if (goals.primary === "tens") {
        return { label: "Note de 10", value: `${metrics.tensCount} din ${targets.tens}`, percent: targets.tens > 0 ? (metrics.tensCount / targets.tens) * 100 : 0 };
    }
    if (goals.primary === "evals") {
        return { label: "Evaluări", value: `${metrics.totalGrades} din ${targets.evals}`, percent: targets.evals > 0 ? (metrics.totalGrades / targets.evals) * 100 : 0 };
    }
    const gpa = metrics.globalAvg;
    const percent = gpa > 0 ? (gpa / goals.targetGPA) * 100 : 0;
    return { label: `Spre ținta ${goals.targetGPA.toFixed(2)}`, value: `${Math.min(100, percent).toFixed(0)}%`, percent };
}

/* ---------- de urmărit ---------- */
function homeWatchHTML() {
    const risk = state.settings.calc.riskThreshold;
    const rows = [];
    statsEntries().forEach(e => {
        if (e.standing.key === "risk") {
            rows.push({ e, rank: 0, plan: planForCondition(e.mat, d => d.exactAvg >= risk), goal: `ieși din risc (${risk.toFixed(2)})` });
        } else if (e.standing.key === "below" && e.sub.priority) {
            rows.push({ e, rank: 1, plan: planForCondition(e.mat, d => reachesTarget(d, e.sub.target)), goal: `ajungi la ${fmtTarget(e.sub.target)}` });
        }
    });
    const empty = Object.entries(state.subjects).filter(([, sub]) => !sub.grades.length).map(([mat]) => mat);
    if (!rows.length && !empty.length) return "";
    rows.sort((a, b) => a.rank - b.rank || a.e.d.rawAvg - b.e.d.rawAvg);

    return `
        ${homeCardHead("azi-watch-title", "alert", "De urmărit")}
        ${rows.length ? `<ul class="azi-watch-list">${rows.slice(0, 4).map(({ e, plan, goal }) => {
            const pill = planPill(plan);
            return `
            <li><button type="button" class="azi-watch-row" data-action="open-subject" data-mat="${escapeHTML(e.mat)}">
                <span class="azi-watch-main">
                    <b>${escapeHTML(e.mat)}</b>
                    <small>Ca să ${escapeHTML(goal)}: ${plan.next > 1
                        ? `<span class="azi-need is-${pill.tone}">${escapeHTML(pill.text)}</span> la următoarea notă`
                        : plan.next === 1 ? `<span class="azi-need is-ok">orice notă</span> e suficientă`
                        : `ai nevoie de <span class="azi-need is-${pill.tone}">${escapeHTML(pill.text)}</span>`}</small>
                </span>
                <span class="azi-lesson-avg tone-${gradeTone(e.d.exactAvg)}">${e.d.exactAvg.toFixed(2)}</span>
            </button></li>`;
        }).join("")}</ul>` : ""}
        ${empty.length ? `<p class="azi-more-line">${icon("note")} Fără note încă: ${empty.slice(0, 4).map(m => `<button type="button" class="azi-inline-link" data-action="add-grade" data-mat="${escapeHTML(m)}">${escapeHTML(m)}</button>`).join(", ")}${empty.length > 4 ? ` și încă ${empty.length - 4}` : ""}</p>` : ""}`;
}

/* ---------- ultimele note ---------- */
function homeRecentHTML() {
    const all = [];
    for (const [mat, sub] of Object.entries(state.subjects)) {
        sub.grades.forEach((g, idx) => all.push({ mat, idx, g }));
    }
    const head = homeCardHead("azi-recent-title", "note", "Ultimele note");
    if (!all.length) {
        return `${head}
            <p class="azi-empty">Aici apar notele pe măsură ce le adaugi.</p>
            <button type="button" class="btn btn-primary btn-sm" data-action="add-grade">${icon("plus")} Adaugă prima notă</button>`;
    }
    all.sort((a, b) => (b.g.date || "").localeCompare(a.g.date || "") || b.idx - a.idx);
    return `${head}
        <ul class="azi-grades">${all.slice(0, 5).map(({ mat, idx, g }) => `
            <li><button type="button" class="azi-grade-row" data-action="edit-grade" data-mat="${escapeHTML(mat)}" data-index="${idx}" title="Modifică nota">
                <span class="cat-grade-val tone-${gradeTone(Number(g.val))}">${escapeHTML(g.val)}</span>
                <span class="azi-grade-info"><b>${escapeHTML(mat)}</b><small>${escapeHTML([g.type || "Altele", g.date ? relativeDayLabel(g.date) : ""].filter(Boolean).join(" · "))}</small></span>
            </button></li>`).join("")}</ul>
        <div class="azi-card-foot"><button type="button" class="btn btn-text" data-action="nav" data-tab="tab-catalog">${icon("notebook")} Toate notele în Catalog</button></div>`;
}

/* ---------- realizări + jurnal ---------- */
function homeMoreHTML() {
    const unlocked = ACHIEVEMENTS.filter(a => state.achievements[a.key]).length;
    return `
        ${homeCardHead("azi-more-title", "trophy", "Realizări", `<span class="cat-count">${unlocked} din ${ACHIEVEMENTS.length}</span>`)}
        <div class="badges-container">${ACHIEVEMENTS.map(a => {
            const on = state.achievements[a.key];
            return `<span class="badge-pill ${on ? "unlocked" : ""}" title="${on ? "Obținută" : "Încă blocată"}">${icon(on ? a.icon : "lock")} ${escapeHTML(a.label)}</span>`;
        }).join("")}</div>
        <details class="azi-log">
            <summary>${icon("clock")} Ce s-a schimbat recent</summary>
            ${state.activity.length
                ? `<ul class="activity-list">${state.activity.slice(0, 8).map(act => `
                    <li class="activity-item"><span>${escapeHTML(act.text)}</span><span>${escapeHTML(formatActivityTime(act))}</span></li>`).join("")}</ul>`
                : emptyNote("Nicio activitate recentă.")}
        </details>`;
}

function formatActivityTime(act) {
    if (!act.ts) return act.time || "";
    const date = new Date(act.ts);
    if (Number.isNaN(date.getTime())) return act.time || "";
    return getLocalDateKey(date) === getLocalDateKey()
        ? act.time
        : `${date.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" })} ${act.time}`;
}

registerTab("tab-dashboard", { render: renderDashboard, title: "Azi", icon: "home", group: "day" });
