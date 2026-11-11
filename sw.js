/* urNotes — lucru fără internet.
   Fișierele aplicației: mai întâi rețeaua (ca să primești mereu ultima versiune), copia salvată doar când nu e semnal.
   Fonturile și Chart.js: copia salvată imediat, actualizată în fundal. Firebase nu trece pe aici. */
const CACHE = "urnotes-v53";
const APP_JS = ["shared/rules.js", "js/core/config.js", "js/core/utils.js", "js/core/model.js", "js/core/storage.js", "js/core/metrics.js", "js/core/render.js", "js/azi/azi.js", "js/note/catalog.js", "js/ui/phone.js", "js/calendar/calendar-view.js", "js/eu/alerts-settings-view.js", "js/note/selects-charts.js", "js/note/stats.js", "js/note/report.js", "js/eu/setup.js", "js/plan/plan.js", "js/eu/tour.js", "js/cont/account.js", "js/cont/guest.js", "js/note/grades-subjects.js", "js/calendar/calendar-actions.js", "js/eu/settings-backup.js", "js/ui/nav.js", "js/ui/motion.js", "js/ui/fluid.js", "js/ui/pagefx.js", "js/note/simulator.js", "js/core/events.js", "js/calendar/reminders.js", "js/note/notes.js", "js/note/quickgrade.js", "js/calendar/cal-compose.js", "js/ui/palette.js", "js/eu/settings-sections.js", "js/calendar/timetable.js", "js/azi/realism.js", "js/ui/sidetree.js", "js/ui/pages.js", "js/ui/windows.js", "js/cont/api.js", "js/cont/serversync.js", "js/cont/viewer.js", "js/eu/years.js", "js/eu/pal.js", "js/plan/exams.js", "js/eu/growth.js", "js/core/router.js", "js/core/state.js", "js/core/boot.js", "js/core/main.js"];
const CHART_JS = "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"; // aceeași adresă ca în js/note/selects-charts.js
const SHELL = [...APP_JS, "./", "index.html", "style.css", "ui.css", "tokens.css", "cloud.js", "firebase-config.js", "api-config.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", CHART_JS];
const REMIND_CACHE = "urnotes-remind"; // amintirile scrise de aplicație (vezi checkReminder în js/calendar/reminders.js)
const CDN = ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"];
const NAV_TIMEOUT_MS = 3000;  // cât așteptăm pagina de pe rețea când avem o copie salvată
const COHERENT_MS = 30000;    // după o pagină din copie, și fișierele ei vin din copie, ca să nu amestecăm versiuni
let cachedNavAt = 0;
// adresele paginilor (js/core/router.js): lucrătorul dă direct aplicația, fără ocolul prin 404.html
const ROUTES = ["azi", "calendar", "note", "plan", "progres", "ce-ar-fi-daca", "examene", "eu", "setari"];
const SCOPE = new URL(self.registration ? self.registration.scope : "./", location.href).pathname;
function routeOf(url) {
    if (!url.pathname.startsWith(SCOPE)) return null;
    const rest = url.pathname.slice(SCOPE.length);
    const m = /^([a-z-]+)(\/?)$/.exec(rest);
    return m && ROUTES.includes(m[1]) ? { slug: m[1], slash: Boolean(m[2]) } : null;
}

self.addEventListener("install", event => {
    // câte un fișier: unul care nu se descarcă nu le pierde pe celelalte
    event.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(url => c.add(url).catch(() => {})))).then(() => self.skipWaiting()));
});

// „no-cache”: întreabă mereu serverul (răspuns scurt 304 dacă nu s-a schimbat), ca după o actualizare
// să nu amestecăm fișiere noi cu unele vechi din memoria browserului (GitHub Pages le ține 10 minute)
const fromNetwork = (req, keep = () => true) => fetch(req, { cache: "no-cache" }).then(res => {
    if (res.ok && keep()) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
});
const fromCache = req => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined));
const networkThenCache = req => fromNetwork(req).catch(() => fromCache(req).then(hit => hit || Response.error()));

/** Pagina: de pe rețea, dar pe un semnal slab nu stăm la nesfârșit dacă avem o copie. */
async function navigate(req) {
    let late = false; // pagina sosită după timp nu intră în copie: ar rămâne lângă fișierele vechi
    const net = fromNetwork(req, () => !late);
    const first = await Promise.race([net.catch(() => null), new Promise(done => setTimeout(done, NAV_TIMEOUT_MS, "slow"))]);
    if (first && first !== "slow") { cachedNavAt = 0; return first; }
    const hit = await fromCache(req);
    if (!hit) return net;
    late = true;
    cachedNavAt = Date.now();
    return hit;
}

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== REMIND_CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin === location.origin) {
        const route = req.mode === "navigate" ? routeOf(url) : null;
        if (route && route.slash) event.respondWith(Response.redirect(SCOPE + route.slug + url.search, 301)); // …/calendar/ → …/calendar
        else if (route) event.respondWith(navigate(new Request(SCOPE, { credentials: "same-origin" })));
        else if (req.mode === "navigate") event.respondWith(navigate(req));
        else if (Date.now() - cachedNavAt < COHERENT_MS) event.respondWith(fromCache(req).then(hit => hit || networkThenCache(req)));
        else event.respondWith(networkThenCache(req));
    } else if (CDN.some(o => req.url.startsWith(o))) {
        event.respondWith(caches.open(CACHE).then(async c => {
            const hit = await c.match(req);
            const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
            return hit || net;
        }));
    }
});

/* Amintirea de seară când aplicația nu e deschisă: doar unde browserul trezește lucrătorul periodic
   (Chrome pe Android, aplicația instalată). Textul e scris dinainte de aplicație în remind.json. */
const two = n => String(n).padStart(2, "0");
async function maybeRemind() {
    const cache = await caches.open(REMIND_CACHE);
    const res = await cache.match("remind.json");
    if (!res) return;
    const data = await res.json();
    const now = new Date();
    const today = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
    const time = `${two(now.getHours())}:${two(now.getMinutes())}`;
    if (!data.on || data.shown === today || time < data.time) return;
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (open.some(c => c.visibilityState === "visible")) return; // aplicația e în față: o arată ea
    data.shown = today;
    await cache.put("remind.json", new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
    const d = data.days?.[today];
    if (!d) return;
    await self.registration.showNotification(d.title, { body: d.body, tag: "urnotes-remind", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: "./" } });
}

self.addEventListener("periodicsync", event => {
    if (event.tag === "urnotes-remind") event.waitUntil(maybeRemind().catch(() => {}));
});

/* Amintirea trimisă de serverul urNotes (Web Push), chiar cu aplicația închisă.
   Dacă aplicația e chiar în față, i-o dăm ei: o arată ca mesaj, nu ca notificare. */
self.addEventListener("push", event => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: "urNotes", body: event.data ? event.data.text() : "" }; }
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const front = open.filter(c => c.visibilityState === "visible");
        if (front.length) { front.forEach(c => c.postMessage({ type: "urn-push", title: d.title, body: d.body, day: d.day })); return; }
        // ținem minte că amintirea zilei a fost arătată (ca lucrătorul periodic să n-o mai arate o dată)
        try {
            const cache = await caches.open(REMIND_CACHE);
            const res = await cache.match("remind.json");
            const data = res ? await res.json() : {};
            if (d.day) data.shown = d.day;
            await cache.put("remind.json", new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
        } catch (_) { /* fără cache */ }
        await self.registration.showNotification(d.title || "urNotes", { body: d.body || "", tag: d.tag || "urnotes-remind", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "./" } });
    })());
});
self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
        const win = list.find(c => "focus" in c);
        return win ? win.focus() : self.clients.openWindow(event.notification.data?.url || "./");
    }));
});
