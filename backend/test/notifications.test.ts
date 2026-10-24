import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";
import { localNow } from "../src/modules/notifications/service.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { t = await testApp(); });
afterAll(async () => { await t.close(); });

const sub = (n: number) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` } });
// 24 oct 2026, 16:10 UTC = 19:10 la București (UTC+3)
const at = (iso: string) => new Date(iso);

describe("amintirile trimise de server", () => {
    it("ora locală după fusul orar", () => {
        expect(localNow(at("2026-10-24T16:10:00Z"), "Europe/Bucharest")).toEqual({ day: "2026-10-24", time: "19:10" });
        expect(localNow(at("2026-10-24T23:30:00Z"), "Europe/Bucharest")).toEqual({ day: "2026-10-25", time: "02:30" });
        // după trecerea la ora de iarnă (25 oct 2026), UTC+2
        expect(localNow(at("2026-10-26T17:00:00Z"), "Europe/Bucharest")).toEqual({ day: "2026-10-26", time: "19:00" });
    });

    it("cheia publică VAPID e publică", async () => {
        const r = await t.app.inject({ method: "GET", url: "/v1/notifications/vapid-key" });
        expect(r.json()).toEqual({ publicKey: "test-public-key" });
    });

    it("trimite o singură dată, la ora aleasă, doar dacă amintirile sunt pornite", async () => {
        const s = await t.register("n1", "student");
        expect((await t.app.inject({ method: "POST", url: "/v1/notifications/subscriptions", headers: s.headers, payload: sub(1) })).statusCode).toBe(204);
        await t.app.inject({ method: "PUT", url: "/v1/notifications/digests", headers: s.headers, payload: {
            from: "2026-10-24", days: { "2026-10-24": { title: "Mâine: test la Fizică", body: "Mâine: test la Fizică." }, "2026-10-25": { title: "Pentru mâine", body: "Temă română." } } } });

        // oprite: nimic
        await t.services.notifications.runDue(at("2026-10-24T16:10:00Z"));
        expect(t.push.sent).toHaveLength(0);

        const set = await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", headers: s.headers, payload: { enabled: true, time: "19:00", timezone: "Europe/Bucharest" } });
        expect(set.statusCode).toBe(200);
        expect((await t.app.inject({ method: "GET", url: "/v1/notifications/settings", headers: s.headers })).json()).toMatchObject({ enabled: true, time: "19:00", devices: 1 });

        // înainte de oră: nimic
        await t.services.notifications.runDue(at("2026-10-24T15:59:00Z"));
        expect(t.push.sent).toHaveLength(0);
        // după oră: o dată
        await t.services.notifications.runDue(at("2026-10-24T16:01:00Z"));
        await t.services.notifications.runDue(at("2026-10-24T16:30:00Z"));
        expect(t.push.sent).toHaveLength(1);
        expect(t.push.sent[0].payload).toMatchObject({ title: "Mâine: test la Fizică", day: "2026-10-24", tag: "urnotes-remind" });
        expect(t.push.sent[0].target.endpoint).toBe("https://push.example.com/1");
        expect(await t.services.notifications.deliveredOn(s.user.id, "2026-10-24")).toBe("push");
    });

    it("văzută deja în aplicație: serverul n-o mai trimite", async () => {
        const s = await t.register("n2", "student");
        await t.app.inject({ method: "POST", url: "/v1/notifications/subscriptions", headers: s.headers, payload: sub(2) });
        await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", headers: s.headers, payload: { enabled: true, time: "18:00", timezone: "Europe/Bucharest" } });
        await t.app.inject({ method: "PUT", url: "/v1/notifications/digests", headers: s.headers, payload: { from: "2026-10-24", days: { "2026-10-24": { title: "Planul de azi", body: "2 sesiuni." } } } });
        expect((await t.app.inject({ method: "POST", url: "/v1/notifications/shown", headers: s.headers, payload: { day: "2026-10-24" } })).statusCode).toBe(204);
        const before = t.push.sent.length;
        await t.services.notifications.runDue(at("2026-10-24T16:10:00Z"));
        expect(t.push.sent.length).toBe(before);
    });

    it("abonamentele care nu mai există se șterg", async () => {
        const s = await t.register("n3", "student");
        await t.app.inject({ method: "POST", url: "/v1/notifications/subscriptions", headers: s.headers, payload: sub(3) });
        await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", headers: s.headers, payload: { enabled: true, time: "07:00", timezone: "Europe/Bucharest" } });
        await t.app.inject({ method: "PUT", url: "/v1/notifications/digests", headers: s.headers, payload: { from: "2026-10-26", days: { "2026-10-26": { title: "Pentru mâine", body: "x" } } } });
        t.push.next = "gone";
        await t.services.notifications.runDue(at("2026-10-26T06:00:00Z"));
        t.push.next = "ok";
        expect(await t.services.notifications.subscriptionCount(s.user.id)).toBe(0);
        expect(await t.services.notifications.deliveredOn(s.user.id, "2026-10-26")).toBeNull();
    });

    it("amintirile noi le înlocuiesc pe cele vechi; datele greșite sunt respinse", async () => {
        const s = await t.register("n4", "student");
        const put = (days: object, from = "2026-10-24") => t.app.inject({ method: "PUT", url: "/v1/notifications/digests", headers: s.headers, payload: { from, days } });
        expect((await put({ "2026-10-24": { title: "A", body: "a" }, "2026-10-25": { title: "B", body: "b" } })).json()).toEqual({ saved: 2 });
        expect((await put({ "2026-10-25": { title: "C", body: "c" } })).json()).toEqual({ saved: 1 });
        const rows = await t.db.query("SELECT day, title FROM notif_digests WHERE user_id = $1 ORDER BY day", [s.user.id]);
        expect(rows).toEqual([{ day: "2026-10-25", title: "C" }]);
        expect((await put({ "2026-10-23": { title: "x", body: "x" } })).statusCode).toBe(400);
        expect((await put({ "2026-10-24": { title: "", body: "x" } })).statusCode).toBe(400);
        expect((await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", headers: s.headers, payload: { enabled: true, time: "25:00", timezone: "Europe/Bucharest" } })).statusCode).toBe(400);
        expect((await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", headers: s.headers, payload: { enabled: true, time: "19:00", timezone: "Marte/Olymp" } })).statusCode).toBe(400);
    });

    it("fără cont: 401; abonament fără https: 400", async () => {
        expect((await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", payload: { enabled: true, time: "19:00", timezone: "Europe/Bucharest" } })).statusCode).toBe(401);
        const s = await t.register("n5", "student");
        expect((await t.app.inject({ method: "POST", url: "/v1/notifications/subscriptions", headers: s.headers, payload: { endpoint: "http://x", keys: { p256dh: "a", auth: "b" } } })).statusCode).toBe(400);
    });

    it("CORS: doar aplicația urNotes are voie", async () => {
        const ok = await t.app.inject({ method: "OPTIONS", url: "/v1/school", headers: { origin: "https://gold3n11.github.io", "access-control-request-method": "GET" } });
        expect(ok.headers["access-control-allow-origin"]).toBe("https://gold3n11.github.io");
        const no = await t.app.inject({ method: "OPTIONS", url: "/v1/school", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
        expect(no.headers["access-control-allow-origin"]).toBeUndefined();
    });
});
