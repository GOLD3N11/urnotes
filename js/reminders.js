/* urNotes · Amintirile de seară.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== AMINTIRI (seara: ce ai mâine) ==================== */
/* O dată pe zi, la ora aleasă: testele și temele de mâine (sau de luni, vinerea) și ce-a rămas din planul de azi.
   Apare ca notificare a telefonului/calculatorului dacă ai dat voie și aplicația nu e în față; altfel ca mesaj în aplicație.
   Fără server nu se poate trimite nimic cât aplicația e închisă complet; pe Android (aplicația instalată din Chrome)
   telefonul o mai trezește din când în când în fundal, așa că amintirea poate veni și atunci. */
const REMIND_SHOWN_KEY = "urnotes_remind_shown_v1";
const REMIND_CACHE = "urnotes-remind";
const REMIND_CACHE_URL = "remind.json";

const remindShownOn = () => { try { return localStorage.getItem(REMIND_SHOWN_KEY) || ""; } catch (_) { return ""; } };
const markRemindShown = day => { try { localStorage.setItem(REMIND_SHOWN_KEY, day); } catch (_) { /* fără stocare */ } };
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const notifSupported = () => typeof window !== "undefined" && "Notification" in window;

/** Ce merită spus în amintirea de seară pentru ziua `today` (sau null dacă nu e nimic). */
function reminderDigest(today = getLocalDateKey()) {
    const tomorrow = addDays(today, 1);
    // Vinerea (sau înainte de o vacanță scurtă) ne uităm până la următoarea zi de școală, dacă e în maximum 4 zile
    const nextSchool = nextSchoolDay(today);
    const until = nextSchool && nextSchool > tomorrow && daysBetween(today, nextSchool) <= 4 ? nextSchool : tomorrow;
    const links = gradeLinks();
    const events = occurrencesBetween(tomorrow, until).filter(o => !isOccurrenceDone(o.ev, o.date, links));
    const plan = state.plan.prefs.setup ? state.plan.items.filter(it => it.date === today && !it.done) : [];
    // din timp: testele de peste 2-3 zile, ca să apuci să recapitulezi
    const ahead = state.settings.remind?.ahead !== false
        ? occurrencesBetween(addDays(until, 1), addDays(today, 3)).filter(o => EXAM_TYPES.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links))
        : [];
    // testele trecute care încă așteaptă nota (doar ultimele 7 zile)
    const ungraded = occurrencesBetween(addDays(today, -7), today)
        .filter(o => NEEDS_GRADE.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links) && canGradeOccurrence(o.ev, o.date, links));
    if (!events.length && !plan.length && !ahead.length && !ungraded.length) return null;

    const label = ev => ev.subject && EXAM_TYPES.has(ev.type) ? `${ev.type.toLocaleLowerCase("ro")} la ${shortSubjectName(ev.subject)}` : ev.title;
    const lines = [];
    const byDay = new Map();
    events.forEach(o => byDay.set(o.date, [...(byDay.get(o.date) || []), label(o.ev)]));
    byDay.forEach((titles, date) => {
        const when = date === tomorrow ? "Mâine" : WEEKDAY_LONG[parseDateKey(date).getDay()];
        lines.push(`${when}: ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` și încă ${titles.length - 3}` : ""}.`);
    });
    if (plan.length) {
        const min = plan.reduce((n, it) => n + it.min, 0);
        lines.push(`Din planul de azi mai ai ${plural(plan.length, "sesiune", "sesiuni")} (${min} min).`);
    }
    if (ahead.length) {
        const o = ahead[0];
        lines.push(`${capitalize(WEEKDAY_LONG[parseDateKey(o.date).getDay()].toLocaleLowerCase("ro"))} ai ${label(o.ev)}${ahead.length > 1 ? ` (și încă ${ahead.length - 1})` : ""}: începe să recapitulezi de acum.`);
    }
    if (ungraded.length) lines.push(ungraded.length === 1 ? `Scrie nota de la „${ungraded[0].ev.title}”.` : `${ungraded.length} teste așteaptă nota.`);
    const examTomorrow = events.find(o => EXAM_TYPES.has(o.ev.type) && o.date === tomorrow);
    const exam = events.some(o => EXAM_TYPES.has(o.ev.type)) || ahead.length > 0;
    const title = examTomorrow ? `Mâine: ${label(examTomorrow.ev)}`
        : events.some(o => EXAM_TYPES.has(o.ev.type)) ? "Ai un test în curând"
        : events.length ? "Pentru mâine"
        : plan.length ? "Planul de azi"
        : ahead.length ? "Un test se apropie"
        : "O notă de scris";
    return { title: capitalize(title), body: lines.join(" "), exam, count: events.length, plan: plan.length, until };
}

async function showSystemNotification(d) {
    if (!notifSupported() || Notification.permission !== "granted") return false;
    const opts = { body: d.body, tag: "urnotes-remind", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: "./" } };
    try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        if (reg?.showNotification) { await reg.showNotification(d.title, opts); return true; }
        new Notification(d.title, opts); // eslint-disable-line no-new
        return true;
    } catch (_) {
        return false;
    }
}

/** Arată amintirea: notificare dacă aplicația nu e în față (sau la probă), altfel mesaj în aplicație. */
async function deliverReminder(d, { test = false } = {}) {
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if ((hidden || test) && await showSystemNotification(d)) return "system";
    showToast(`🔔 ${d.title}. ${d.body}`, {
        duration: 9000, action: "Vezi", actionIcon: "calendar",
        onAction: () => { ui.cal.date = d.until || addDays(getLocalDateKey(), 1); switchTab("tab-calendar"); }
    });
    return "toast";
}

/** Verificată la pornire, la revenirea în aplicație și în fiecare minut. */
async function checkReminder(now = new Date()) {
    const r = state.settings.remind;
    if (!r?.on || guest.on || !canEdit()) return null;
    const today = getLocalDateKey(now);
    if (hhmm(now) < r.time || remindShownOn() === today || await remindShownByWorker(today)) return null;
    markRemindShown(today); // o singură dată pe zi, chiar dacă azi n-a fost nimic de spus
    syncReminderCache();
    const d = reminderDigest(today);
    return d ? deliverReminder(d) : null;
}

/** Ce a trimis deja lucrătorul din fundal (Android), ca să nu primești aceeași amintire de două ori. */
async function remindShownByWorker(today) {
    try {
        const res = await (await caches.open(REMIND_CACHE)).match(REMIND_CACHE_URL);
        const data = res ? await res.json() : null;
        return data?.shown === today;
    } catch (_) {
        return false;
    }
}

/** Pentru lucrătorul din fundal: amintirile gata scrise pentru următoarele zile (el nu vede datele aplicației). */
async function syncReminderCache() {
    if (typeof caches === "undefined") return;
    try {
        const cache = await caches.open(REMIND_CACHE);
        const r = state.settings.remind;
        const old = await cache.match(REMIND_CACHE_URL).then(res => res ? res.json() : {}).catch(() => ({}));
        const today = getLocalDateKey();
        const days = {};
        if (r.on && canEdit()) {
            for (let i = 0; i < 7; i++) {
                const day = addDays(today, i);
                const d = reminderDigest(day);
                if (d) days[day] = { title: d.title, body: d.body };
            }
        }
        const shown = remindShownOn() === today ? today : old.shown || "";
        await cache.put(REMIND_CACHE_URL, new Response(JSON.stringify({ on: r.on, time: r.time, days, shown }), { headers: { "Content-Type": "application/json" } }));
    } catch (_) { /* fără stocare: rămâne amintirea din aplicație */ }
}

/** Android, aplicația instalată: cere telefonului să o trezească periodic (când poate) ca să verifice amintirea. */
async function registerPeriodicReminder() {
    try {
        const reg = await navigator.serviceWorker?.ready;
        if (!reg?.periodicSync) return;
        if (state.settings.remind.on) await reg.periodicSync.register("urnotes-remind", { minInterval: 60 * 60 * 1000 });
        else await reg.periodicSync.unregister("urnotes-remind");
    } catch (_) { /* nepermis sau nesuportat */ }
}

let remindTimer = 0;
/** Ceasul care verifică amintirea în fiecare minut merge doar cât amintirile sunt pornite. */
function armReminderClock() {
    clearInterval(remindTimer);
    remindTimer = 0;
    if (state.settings.remind.on) remindTimer = setInterval(() => checkReminder(), 60 * 1000);
}

function initReminders() {
    armReminderClock();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkReminder(); });
    if (!state.settings.remind.on) return;
    setTimeout(() => checkReminder(), 2500); // după pornire, ca să nu se suprapună cu mesajele de început
    registerPeriodicReminder();
    syncReminderCache();
}

/** Cardul „Amintiri” din Setări. */
function renderReminderSetting() {
    const box = $("remind-setting");
    if (!box) return;
    const r = state.settings.remind;
    const perm = notifSupported() ? Notification.permission : "unsupported";
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const permLine = !r.on ? "" : perm === "granted"
        ? `<p class="remind-perm is-ok">${icon("check")} Notificările sunt pornite pe acest dispozitiv.</p>`
        : perm === "denied"
            ? `<p class="remind-perm is-warn">${icon("alert")} Ai blocat notificările pentru urNotes. Amintirea apare doar ca mesaj în aplicație; le poți reporni din setările browserului sau ale telefonului.</p>`
            : perm === "unsupported"
                ? `<p class="remind-perm">${icon("info")} ${ios && !isStandalone() ? "Pe iPhone, notificările merg doar după ce pui urNotes pe ecranul principal (Distribuie → Adaugă pe ecranul principal)." : "Aici nu se pot trimite notificări; amintirea apare ca mesaj în aplicație."}</p>`
                : `<button type="button" class="btn btn-primary btn-sm" data-action="remind-allow">${icon("bell")} Primește-o și ca notificare</button>`;
    box.innerHTML = `
        <label class="remind-toggle">
            <input type="checkbox" id="set-remind-on" ${r.on ? "checked" : ""}>
            <span><b>Amintește-mi seara ce am a doua zi</b><small>teste, teme și ce a rămas din planul zilei</small></span>
        </label>
        <label class="remind-toggle mt-2">
            <input type="checkbox" id="set-remind-ahead" ${r.ahead !== false ? "checked" : ""} ${r.on ? "" : "disabled"}>
            <span><b>Și cu 2-3 zile înainte de un test</b><small>ca să apuci să recapitulezi; plus notele pe care n-ai apucat să le scrii</small></span>
        </label>
        <div class="form-group mt-3">
            <label for="set-remind-time">La ce oră</label>
            <select id="set-remind-time" class="glass-select" ${r.on ? "" : "disabled"}>
                ${REMIND_TIMES.map(t => `<option value="${t}" ${t === r.time ? "selected" : ""}>${t}</option>`).join("")}
            </select>
        </div>
        ${permLine}
        ${r.on ? `<button type="button" class="btn btn-glass btn-sm mt-2" data-action="remind-test">${icon("bell")} Arată-mi acum cum arată</button>` : ""}
        <p class="subtitle mt-2">Amintirea vine când urNotes e deschis sau rulează în fundal. Când aplicația e închisă de tot, telefonul nu o poate porni singur fără un server; pe Android, cu aplicația instalată, uneori o trezește.</p>`;
    if (guest.on) box.querySelectorAll("input, select, button").forEach(el => { el.disabled = true; el.setAttribute("data-guest-locked", ""); });
}

function saveReminderSetting() {
    const r = state.settings.remind;
    const wasOn = r.on;
    r.on = Boolean($("set-remind-on")?.checked);
    if ($("set-remind-ahead")) r.ahead = Boolean($("set-remind-ahead").checked);
    r.time = REMIND_TIMES.includes(field("set-remind-time")) ? field("set-remind-time") : r.time;
    // Pornită acum, după ora aleasă: nu-ți dăm imediat amintirea de azi (ai văzut deja ce ai, ești chiar aici)
    if (r.on && !wasOn && hhmm() >= r.time) markRemindShown(getLocalDateKey());
    refresh();
    renderReminderSetting();
    armReminderClock();
    registerPeriodicReminder();
    flashSettingsStatus("✓ Salvat");
    if (r.on && !wasOn && notifSupported() && Notification.permission === "default") {
        showToast(`🔔 Gata. Te anunț la ${r.time} ce ai a doua zi.`);
    }
}

const REMIND_ACTIONS = {
    "remind-allow": async () => {
        try { await Notification.requestPermission(); } catch (_) { /* refuzat */ }
        renderReminderSetting();
        renderBadgeSetting();
        renderNotificationBadge();
        registerPeriodicReminder();
    },
    "remind-test": () => {
        const today = getLocalDateKey();
        const d = reminderDigest(today) || { title: "Pentru mâine", body: "Nimic programat pentru mâine. Așa va arăta amintirea când ai un test sau o temă.", until: addDays(today, 1) };
        deliverReminder(d, { test: true });
    }
};
Object.assign(ACTIONS, REMIND_ACTIONS);
