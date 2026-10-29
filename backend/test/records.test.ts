import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { t = await testApp(); });
afterAll(async () => { await t.close(); });

const settings = { calc: { method: "arithmetic", rounding: "2", riskThreshold: 8 }, modules: [
    { start: "2026-09-07", end: "2026-10-23" }, { start: "2026-11-02", end: "2026-12-22" }, { start: "2027-01-11", end: "2027-02-19" },
    { start: "2027-03-02", end: "2027-04-23" }, { start: "2027-05-05", end: "2027-06-18" }] };

async function linked() {
    const s = await t.register(`s${Math.random().toString(36).slice(2, 8)}`, "student");
    const p = await t.register(`p${Math.random().toString(36).slice(2, 8)}`, "parent");
    const { code } = (await t.app.inject({ method: "POST", url: "/v1/me/invites", headers: s.headers, payload: { relation: "parent" } })).json();
    await t.app.inject({ method: "POST", url: "/v1/links", headers: p.headers, payload: { code } });
    return { s, p };
}
const push = (headers: Record<string, string>, id: string, changes: unknown[]) =>
    t.app.inject({ method: "POST", url: `/v1/students/${id}/records`, headers, payload: { changes } });
const pull = (headers: Record<string, string>, id: string, since = 0) =>
    t.app.inject({ method: "GET", url: `/v1/students/${id}/records?since=${since}`, headers });

describe("datele elevului, înregistrare cu înregistrare", () => {
    it("elevul scrie; cere doar ce s-a schimbat după ultimul rev", async () => {
        const { s } = await linked();
        const id = s.user.id;
        const r1 = await push(s.headers, id, [
            { collection: "subject", id: "Matematică", data: { ore: 4, target: 9, grades: [] } },
            { collection: "grade", id: "g1", data: { mat: "Matematică", val: 9, type: "Test", date: "2026-10-01" } },
            { collection: "doc", id: "settings", data: settings }
        ]);
        expect(r1.statusCode).toBe(200);
        const c1 = r1.json().cursor;
        const all = (await pull(s.headers, id)).json();
        expect(all.records.map((r: { collection: string; id: string }) => `${r.collection}/${r.id}`).sort()).toEqual(["doc/settings", "grade/g1", "subject/Matematică"]);
        expect(all.cursor).toBe(c1);
        // nimic nou
        expect((await pull(s.headers, id, c1)).json().records).toEqual([]);
        // o schimbare și o ștergere
        const r2 = await push(s.headers, id, [
            { collection: "grade", id: "g1", data: { mat: "Matematică", val: 10, type: "Test", date: "2026-10-01" } },
            { collection: "grade", id: "g2", data: { mat: "Matematică", val: 7 } }
        ]);
        await push(s.headers, id, [{ collection: "grade", id: "g2", data: null }]);
        const since = (await pull(s.headers, id, c1)).json();
        expect(since.records.map((r: { id: string; deleted: boolean; data: { val?: number } | null }) => [r.id, r.deleted, r.data?.val ?? null])).toEqual([["g1", false, 10], ["g2", true, null]]);
        expect(since.cursor).toBeGreaterThan(r2.json().cursor - 1);
    });

    it("două dispozitive scriu înregistrări diferite în același timp: nimic nu se pierde", async () => {
        const { s } = await linked();
        const id = s.user.id;
        const base = (await pull(s.headers, id)).json().cursor;
        await Promise.all([
            push(s.headers, id, [{ collection: "grade", id: "telefon", data: { mat: "Fizică", val: 8 } }]),
            push(s.headers, id, [{ collection: "grade", id: "laptop", data: { mat: "Chimie", val: 9 } }])
        ]);
        const got = (await pull(s.headers, id, base)).json().records.map((r: { id: string }) => r.id).sort();
        expect(got).toEqual(["laptop", "telefon"]);
    });

    it("părintele citește, nu scrie; un străin nu vede nimic", async () => {
        const { s, p } = await linked();
        await push(s.headers, s.user.id, [{ collection: "grade", id: "g", data: { mat: "Română", val: 10 } }]);
        expect((await pull(p.headers, s.user.id)).json().records).toHaveLength(1);
        expect((await push(p.headers, s.user.id, [{ collection: "grade", id: "x", data: { mat: "Română", val: 10 } }])).statusCode).toBe(403);
        const x = await t.register("strainR", "parent");
        expect((await pull(x.headers, s.user.id)).statusCode).toBe(403);
        // nici elevul altcuiva
        const other = await t.register("altElev", "student");
        expect((await push(other.headers, s.user.id, [{ collection: "grade", id: "x", data: { mat: "Română", val: 1 } }])).statusCode).toBe(403);
    });

    it("înregistrările greșite sunt respinse", async () => {
        const { s } = await linked();
        const bad = async (c: object) => (await push(s.headers, s.user.id, [c])).statusCode;
        expect(await bad({ collection: "grade", id: "g", data: { mat: "Mate", val: 11 } })).toBe(400);
        expect(await bad({ collection: "grade", id: "g", data: { val: 5 } })).toBe(400);
        expect(await bad({ collection: "event", id: "e", data: { title: "x" } })).toBe(400);
        expect(await bad({ collection: "doc", id: "secret", data: {} })).toBe(400);
        expect(await bad({ collection: "nope", id: "x", data: {} })).toBe(400);
        expect(await bad({ collection: "subject", id: "x".repeat(200), data: { ore: 1, target: 9 } })).toBe(400);
    });
});

describe("importul din Adservio", () => {
    it("scrie doar notele lui, cu id-ul din Adservio; un import repetat nu le dublează", async () => {
        const { s, p } = await linked();
        const admin = await t.register("admR", "teacher", "admin@urnotes.test");
        const { integration, key } = (await t.app.inject({ method: "POST", url: "/v1/admin/integrations", headers: admin.headers, payload: { kind: "adservio" } })).json();
        const ih = { authorization: `Integration ${key}` };
        const send = () => t.app.inject({ method: "POST", url: `/v1/students/${s.user.id}/imported-grades`, headers: ih, payload: { grades: [
            { externalId: "123", subject: "Matematică", val: 9, type: "Test", date: "2026-10-10" },
            { externalId: "124", subject: "Fizică", val: 6, date: "2026-10-12" }] } });
        expect((await send()).statusCode).toBe(403); // elevul n-a permis încă
        await t.app.inject({ method: "PUT", url: `/v1/me/integrations/${integration.id}`, headers: s.headers });
        expect((await send()).statusCode).toBe(200);
        expect((await send()).statusCode).toBe(200);
        const grades = (await pull(s.headers, s.user.id)).json().records.filter((r: { collection: string }) => r.collection === "grade");
        expect(grades.map((g: { id: string; data: { val: number; source: string } }) => [g.id, g.data.val, g.data.source]).sort()).toEqual([["adservio:123", 9, "adservio"], ["adservio:124", 6, "adservio"]]);
        // integrarea nu citește și nu atinge notele puse de elev
        expect((await pull(ih, s.user.id)).statusCode).toBe(403);
        expect((await push(ih, s.user.id, [{ collection: "grade", id: "notaMea", data: { mat: "Română", val: 1 } }])).statusCode).toBe(403);
        expect((await push(ih, s.user.id, [{ collection: "doc", id: "settings", data: {} }])).statusCode).toBe(403);
        // un utilizator nu poate trimite „note importate”
        expect((await t.app.inject({ method: "POST", url: `/v1/students/${s.user.id}/imported-grades`, headers: s.headers, payload: { grades: [{ externalId: "1", subject: "X", val: 10 }] } })).statusCode).toBe(403);
        // părintele vede notele importate
        expect((await pull(p.headers, s.user.id)).json().records).toHaveLength(2);
    });
});

describe("rezumatul calculat pe server (aceleași reguli ca aplicația)", () => {
    it("medii pe materii, media generală ca în catalog, purtarea, riscul", async () => {
        const { s, p } = await linked();
        await push(s.headers, s.user.id, [
            { collection: "doc", id: "settings", data: settings },
            { collection: "doc", id: "purtare", data: { grades: {}, excludeFromGPA: false } },
            { collection: "subject", id: "Matematică", data: { ore: 4, target: 9 } },
            { collection: "subject", id: "Fizică", data: { ore: 2, target: 9 } },
            ...[10, 9, 8].map((v, i) => ({ collection: "grade", id: `m${i}`, data: { mat: "Matematică", val: v } })),
            ...[5, 6].map((v, i) => ({ collection: "grade", id: `f${i}`, data: { mat: "Fizică", val: v } }))
        ]);
        const r = await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/summary`, headers: p.headers });
        expect(r.statusCode).toBe(200);
        const b = r.json();
        expect(b.subjects).toEqual([
            { name: "Fizică", grades: 2, avg: 5.5, rounded: 6, status: "Risc", target: 9 },
            { name: "Matematică", grades: 3, avg: 9, rounded: 9, status: "Sigur", target: 9 }
        ]);
        // (9 + 6 + purtarea 10) / 3 = 8.33
        expect(b.globalAvg).toBe(8.33);
        expect(b.riskCount).toBe(1);
        expect(b.purtare).toBe(10);
        const x = await t.register("strainSum", "teacher");
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/summary`, headers: x.headers })).statusCode).toBe(403);
    });
});

describe("ștergerea contului", () => {
    it("șterge și datele elevului", async () => {
        const { s } = await linked();
        await push(s.headers, s.user.id, [{ collection: "grade", id: "g", data: { mat: "Română", val: 10 } }]);
        expect(await t.services.records.count(s.user.id)).toBe(1);
        expect((await t.app.inject({ method: "DELETE", url: "/v1/me", headers: s.headers })).statusCode).toBe(204);
        expect(await t.services.records.count(s.user.id)).toBe(0);
    });
    it("realism: serverul refuză spamul de teste și note (ca aplicația)", async () => {
        const { s } = await linked();
        const id = s.user.id;
        const ev = (n: number, mat: string, type = "Test") => ({ collection: "event", id: `e${n}`, data: { start: "2026-10-13", title: "Test", type, subject: mat } });
        expect((await push(s.headers, id, [ev(1, "Matematică"), ev(2, "Fizică"), ev(3, "Chimie", "Examen")])).statusCode).toBe(200);
        const fourth = await push(s.headers, id, [ev(4, "Biologie")]);
        expect(fourth.statusCode).toBe(400);
        expect(fourth.json().error).toBe("unrealistic");
        // un test fără materie nu trece nici ca formă
        expect((await push(s.headers, id, [{ collection: "event", id: "e9", data: { start: "2026-10-14", title: "Test", type: "Test", subject: "" } }])).statusCode).toBe(400);
        // ce există deja se poate actualiza (date vechi), chiar dacă ziua e plină
        expect((await push(s.headers, id, [{ ...ev(1, "Matematică"), data: { ...ev(1, "Matematică").data, title: "Test la mate" } }])).statusCode).toBe(200);
        const g = (n: number, val = 9) => ({ collection: "grade", id: `g${n}`, data: { mat: "Fizică", val, type: "Test", date: "2026-10-12" } });
        expect((await push(s.headers, id, [g(1), g(2)])).statusCode).toBe(200);
        expect((await push(s.headers, id, [g(3)])).statusCode).toBe(400);
        expect((await push(s.headers, id, [{ collection: "grade", id: "g4", data: { mat: "Fizică", val: 9.5 } }])).statusCode).toBe(400);
    });
});
