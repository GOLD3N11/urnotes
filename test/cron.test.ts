import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";
import { loadConfig } from "../src/config.js";
import { localNow } from "../src/modules/notifications/service.js";

let t: Awaited<ReturnType<typeof testApp>>;
let off: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { [t, off] = await Promise.all([testApp({ CRON_SECRET: "cron-test-secret" }), testApp()]); });
afterAll(async () => { await Promise.all([t.close(), off.close()]); });

const call = (app: typeof t.app, authorization?: string) =>
    app.inject({ method: "GET", url: "/internal/cron/reminders", headers: authorization ? { authorization } : {} });

describe("ceasul amintirilor chemat de un cron (Vercel)", () => {
    it("fără CRON_SECRET ruta nu există", async () => {
        expect((await call(off.app, "Bearer cron-test-secret")).statusCode).toBe(404);
    });

    it("fără parolă, cu altă parolă sau cu un jeton de utilizator: 401", async () => {
        expect((await call(t.app)).statusCode).toBe(401);
        expect((await call(t.app, "Bearer altceva")).statusCode).toBe(401);
        expect((await call(t.app, "Bearer dev:u1:u1@urnotes.test")).statusCode).toBe(401);
    });

    it("cu parola: trimite amintirile al căror moment a trecut, o singură dată", async () => {
        const s = await t.register("c1", "student");
        const today = localNow(new Date(), "Europe/Bucharest").day;
        await t.app.inject({ method: "POST", url: "/v1/notifications/subscriptions", headers: s.headers, payload: { endpoint: "https://push.example.com/c1", keys: { p256dh: "p", auth: "a" } } });
        await t.app.inject({ method: "PUT", url: "/v1/notifications/digests", headers: s.headers, payload: { from: today, days: { [today]: { title: "Mâine: test", body: "Mâine: test la Fizică." } } } });
        await t.app.inject({ method: "PUT", url: "/v1/notifications/settings", headers: s.headers, payload: { enabled: true, time: "00:00", timezone: "Europe/Bucharest" } });

        const first = await call(t.app, "Bearer cron-test-secret");
        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ ran: true, sent: 1 });
        expect(t.push.sent.at(-1)?.payload).toMatchObject({ title: "Mâine: test", day: today });
        // al doilea apel (sau un cron dublat) nu o mai trimite
        expect((await call(t.app, "Bearer cron-test-secret")).json()).toEqual({ ran: true, sent: 0 });
    });

    it("pe Vercel: fără cronometru în proces și puține conexiuni la baza de date", () => {
        const c = loadConfig({ AUTH_MODE: "dev", VERCEL: "1" });
        expect(c.schedulerEveryMs).toBe(0);
        expect(c.poolMax).toBe(3);
        const local = loadConfig({ AUTH_MODE: "dev" });
        expect(local.schedulerEveryMs).toBe(60_000);
        expect(local.poolMax).toBe(10);
    });
});
