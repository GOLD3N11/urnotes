/* urNotes — lucru fără internet.
   Fișierele aplicației: mai întâi rețeaua (ca să primești mereu ultima versiune), copia salvată doar când nu e semnal.
   Fonturile și Chart.js: copia salvată imediat, actualizată în fundal. Firebase nu trece pe aici. */
const CACHE = "urnotes-v1";
const SHELL = ["./", "index.html", "style.css", "script.js", "cloud.js", "firebase-config.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png"];
const REMIND_CACHE = "urnotes-remind"; // amintirile scrise de aplicație (vezi checkReminder în script.js)
const CDN = ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

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
        event.respondWith(fetch(req).then(res => {
            if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
            return res;
        }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
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

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
        const win = list.find(c => "focus" in c);
        return win ? win.focus() : self.clients.openWindow(event.notification.data?.url || "./");
    }));
});
