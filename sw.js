/* urNotes — lucru fără internet.
   Fișierele aplicației: mai întâi rețeaua (ca să primești mereu ultima versiune), copia salvată doar când nu e semnal.
   Fonturile și Chart.js: copia salvată imediat, actualizată în fundal. Firebase nu trece pe aici. */
const CACHE = "urnotes-v40";
const APP_JS = ["shared/rules.js", "js/config.js", "js/utils.js", "js/model.js", "js/storage.js", "js/metrics.js", "js/render.js", "js/azi.js", "js/catalog.js", "js/phone.js", "js/calendar-view.js", "js/alerts-settings-view.js", "js/selects-charts.js", "js/stats.js", "js/report.js", "js/setup.js", "js/plan.js", "js/tour.js", "js/account.js", "js/guest.js", "js/grades-subjects.js", "js/calendar-actions.js", "js/settings-backup.js", "js/nav.js", "js/motion.js", "js/fluid.js", "js/pagefx.js", "js/simulator.js", "js/events.js", "js/reminders.js", "js/notes.js", "js/quickgrade.js", "js/cal-compose.js", "js/palette.js", "js/settings-sections.js", "js/timetable.js", "js/realism.js", "js/sidetree.js", "js/pages.js", "js/windows.js", "js/api.js", "js/serversync.js", "js/viewer.js", "js/years.js", "js/pal.js", "js/exams.js", "js/growth.js", "js/state.js", "js/boot.js", "js/main.js"];
const CHART_JS = "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"; // aceeași adresă ca în js/selects-charts.js
const SHELL = [...APP_JS, "./", "index.html", "style.css", "ui.css", "tokens.css", "cloud.js", "firebase-config.js", "api-config.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", CHART_JS];
const REMIND_CACHE = "urnotes-remind"; // amintirile scrise de aplicație (vezi checkReminder în js/reminders.js)
const CDN = ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"];
const NAV_TIMEOUT_MS = 3000;  // cât așteptăm pagina de pe rețea când avem o copie salvată
const COHERENT_MS = 30000;    // după o pagină din copie, și fișierele ei vin din copie, ca să nu amestecăm versiuni
let cachedNavAt = 0;

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
        if (req.mode === "navigate") event.respondWith(navigate(req));
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
