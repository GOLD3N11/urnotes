import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { t = await testApp(); });
afterAll(async () => { await t.close(); });

const events = async (headers: Record<string, string>, id: string) =>
    (await t.app.inject({ method: "GET", url: `/v1/students/${id}/records`, headers })).json().records.filter((r: { collection: string }) => r.collection === "event");

describe("clasele profesorului", () => {
    it("profesorul pune un test; apare în calendarul elevilor; bifele elevului rămân", async () => {
        const prof = await t.register("profC", "teacher");
        const ana = await t.register("anaC", "student");
        const dan = await t.register("danC", "student");
        expect((await t.app.inject({ method: "POST", url: "/v1/classes", headers: ana.headers, payload: { name: "X" } })).statusCode).toBe(403);
        const cls = (await t.app.inject({ method: "POST", url: "/v1/classes", headers: prof.headers, payload: { name: "a XI-a B", subject: "Fizică" } })).json();
        expect(cls.code).toMatch(/^[A-Z2-9]{6}$/);

        // un test pus înainte ca Dan să intre
        const early = (await t.app.inject({ method: "POST", url: `/v1/classes/${cls.id}/events`, headers: prof.headers, payload: { date: "2026-11-05", time: "08:00", type: "Test", title: "Test cinematică" } })).json();
        expect((await t.app.inject({ method: "POST", url: "/v1/classes/join", headers: ana.headers, payload: { code: cls.code.toLowerCase() } })).statusCode).toBe(201);
        expect((await t.app.inject({ method: "POST", url: "/v1/classes/join", headers: dan.headers, payload: { code: cls.code } })).statusCode).toBe(201);

        // intrat în clasă → îl primește și pe cel pus înainte; profesorul îi vede datele (doar citire)
        const ev = await events(ana.headers, ana.user.id);
        expect(ev.map((e: { id: string; data: { title: string; cls: string; subject: string } }) => [e.id, e.data.title, e.data.cls, e.data.subject])).toEqual([[`class-${early.id}`, "Test cinematică", "a XI-a B", "Fizică"]]);
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${ana.user.id}/access`, headers: prof.headers })).json()).toEqual({ read: true, write: "none" });

        // Ana bifează testul ca făcut, apoi profesorul îl mută: bifa rămâne
        await t.app.inject({ method: "POST", url: `/v1/students/${ana.user.id}/records`, headers: ana.headers, payload: { changes: [
            { collection: "event", id: `class-${early.id}`, data: { ...ev[0].data, doneDates: { "2026-11-05": true } } }] } });
        const moved = await t.app.inject({ method: "PUT", url: `/v1/classes/${cls.id}/events/${early.id}`, headers: prof.headers, payload: { date: "2026-11-06", time: "09:00", type: "Test", title: "Test cinematică (mutat)" } });
        expect(moved.statusCode).toBe(200);
        const after = (await events(ana.headers, ana.user.id))[0].data;
        expect(after).toMatchObject({ start: "2026-11-06", title: "Test cinematică (mutat)", doneDates: { "2026-11-05": true } });
        expect((await events(dan.headers, dan.user.id))[0].data.start).toBe("2026-11-06");

        // lista elevilor și a claselor
        const members = (await t.app.inject({ method: "GET", url: `/v1/classes/${cls.id}/members`, headers: prof.headers })).json().members;
        expect(members.map((m: { name: string }) => m.name).sort()).toEqual(["anaC", "danC"]);
        expect((await t.app.inject({ method: "GET", url: "/v1/classes", headers: prof.headers })).json().classes[0]).toMatchObject({ name: "a XI-a B", members: 2 });
        expect((await t.app.inject({ method: "GET", url: "/v1/classes", headers: ana.headers })).json().classes[0]).toMatchObject({ name: "a XI-a B", teacher: "profC" });

        // alt profesor nu vede clasa
        const other = await t.register("profX", "teacher");
        expect((await t.app.inject({ method: "GET", url: `/v1/classes/${cls.id}/members`, headers: other.headers })).statusCode).toBe(403);

        // testul șters dispare de la toți
        expect((await t.app.inject({ method: "DELETE", url: `/v1/classes/${cls.id}/events/${early.id}`, headers: prof.headers })).statusCode).toBe(204);
        expect((await events(dan.headers, dan.user.id))[0].deleted).toBe(true);

        // Dan iese din clasă; testele viitoare dispar din calendarul lui
        const next = (await t.app.inject({ method: "POST", url: `/v1/classes/${cls.id}/events`, headers: prof.headers, payload: { date: "2026-12-01", type: "Examen", title: "Teză" } })).json();
        expect((await t.app.inject({ method: "DELETE", url: `/v1/classes/${cls.id}/members/${dan.user.id}`, headers: dan.headers })).statusCode).toBe(204);
        const danEv = (await events(dan.headers, dan.user.id)).find((e: { id: string }) => e.id === `class-${next.id}`);
        expect(danEv.deleted).toBe(true);
    });

    it("cod greșit → 404; date greșite → 400", async () => {
        const prof = await t.register("profD", "teacher");
        const s = await t.register("elevD", "student");
        expect((await t.app.inject({ method: "POST", url: "/v1/classes/join", headers: s.headers, payload: { code: "NUEXIS" } })).statusCode).toBe(404);
        const cls = (await t.app.inject({ method: "POST", url: "/v1/classes", headers: prof.headers, payload: { name: "IX A" } })).json();
        const bad = (p: object) => t.app.inject({ method: "POST", url: `/v1/classes/${cls.id}/events`, headers: prof.headers, payload: p });
        expect((await bad({ date: "5 nov", type: "Test", title: "x" })).statusCode).toBe(400);
        expect((await bad({ date: "2026-11-05", type: "Personal", title: "x" })).statusCode).toBe(400);
        expect((await bad({ date: "2026-11-05", type: "Test", title: "" })).statusCode).toBe(400);
        expect((await bad({ date: "2026-11-05", time: "25:00", type: "Test", title: "x" })).statusCode).toBe(400);
    });
});
