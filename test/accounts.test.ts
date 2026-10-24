import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { t = await testApp(); });
afterAll(async () => { await t.close(); });

describe("conturi și roluri", () => {
    it("fără jeton: 401", async () => {
        const r = await t.app.inject({ method: "GET", url: "/v1/me" });
        expect(r.statusCode).toBe(401);
    });

    it("prima intrare: încă fără rol, apoi alege elev", async () => {
        const h = t.auth("ana");
        expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: h })).json()).toEqual({ user: null, registered: false });
        const other = await t.app.inject({ method: "GET", url: "/v1/me/links", headers: h });
        expect(other.statusCode).toBe(403);
        expect(other.json().error).toBe("not_registered");
        const r = await t.app.inject({ method: "POST", url: "/v1/me", headers: h, payload: { role: "student", name: "Ana" } });
        expect(r.statusCode).toBe(201);
        expect(r.json().user).toMatchObject({ role: "student", name: "Ana", email: "ana@urnotes.test", isAdmin: false });
    });

    it("rolul nu se mai schimbă", async () => {
        const r = await t.app.inject({ method: "POST", url: "/v1/me", headers: t.auth("ana"), payload: { role: "parent" } });
        expect(r.statusCode).toBe(409);
    });

    it("rol necunoscut: 400", async () => {
        const r = await t.app.inject({ method: "POST", url: "/v1/me", headers: t.auth("x1"), payload: { role: "admin" } });
        expect(r.statusCode).toBe(400);
    });

    it("emailul din ADMIN_EMAILS devine administrator", async () => {
        const { user } = await t.register("boss", "teacher", "admin@urnotes.test");
        expect(user.isAdmin).toBe(true);
    });
});

describe("părinți și profesori legați de elev", () => {
    it("elevul creează un cod; părintele îl folosește; amândoi văd legătura", async () => {
        const s = await t.register("elev1", "student");
        const p = await t.register("mama1", "parent");
        const inv = await t.app.inject({ method: "POST", url: "/v1/me/invites", headers: s.headers, payload: { relation: "parent" } });
        expect(inv.statusCode).toBe(201);
        const { code } = inv.json();
        expect(code).toMatch(/^[A-Z2-9]{8}$/);

        const before = await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: p.headers });
        expect(before.json()).toEqual({ read: false, write: "none" });

        const link = await t.app.inject({ method: "POST", url: "/v1/links", headers: p.headers, payload: { code: code.toLowerCase().replace(/(....)/, "$1-") } });
        expect(link.statusCode).toBe(201);
        expect(link.json()).toEqual({ studentId: s.user.id, relation: "parent" });

        const after = await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: p.headers });
        expect(after.json()).toEqual({ read: true, write: "none" });

        const mine = (await t.app.inject({ method: "GET", url: "/v1/me/links", headers: s.headers })).json().links;
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ viewerId: p.user.id, relation: "parent", name: "mama1" });
        const theirs = (await t.app.inject({ method: "GET", url: "/v1/me/links", headers: p.headers })).json().links;
        expect(theirs[0]).toMatchObject({ studentId: s.user.id, name: "elev1" });

        // codul e de o singură folosință
        const p2 = await t.register("tata1", "parent");
        const again = await t.app.inject({ method: "POST", url: "/v1/links", headers: p2.headers, payload: { code } });
        expect(again.statusCode).toBe(404);

        // elevul desface legătura → părintele nu mai vede nimic
        const del = await t.app.inject({ method: "DELETE", url: `/v1/links/${s.user.id}/${p.user.id}`, headers: s.headers });
        expect(del.statusCode).toBe(204);
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: p.headers })).json()).toEqual({ read: false, write: "none" });
    });

    it("codul pentru profesor nu merge la un părinte; doar elevii creează coduri", async () => {
        const s = await t.register("elev2", "student");
        const p = await t.register("mama2", "parent");
        const prof = await t.register("prof2", "teacher");
        const { code } = (await t.app.inject({ method: "POST", url: "/v1/me/invites", headers: s.headers, payload: { relation: "teacher" } })).json();
        expect((await t.app.inject({ method: "POST", url: "/v1/links", headers: p.headers, payload: { code } })).statusCode).toBe(400);
        expect((await t.app.inject({ method: "POST", url: "/v1/links", headers: prof.headers, payload: { code } })).statusCode).toBe(201);
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: prof.headers })).json()).toEqual({ read: true, write: "none" });
        expect((await t.app.inject({ method: "POST", url: "/v1/me/invites", headers: p.headers, payload: { relation: "parent" } })).statusCode).toBe(403);
        // un elev nu poate folosi un cod
        const s2 = await t.register("elev3", "student");
        const c2 = (await t.app.inject({ method: "POST", url: "/v1/me/invites", headers: s.headers, payload: { relation: "parent" } })).json().code;
        expect((await t.app.inject({ method: "POST", url: "/v1/links", headers: s2.headers, payload: { code: c2 } })).statusCode).toBe(403);
    });

    it("un străin nu poate desface legătura altora", async () => {
        const s = await t.register("elev4", "student");
        const p = await t.register("mama4", "parent");
        const x = await t.register("strain4", "parent");
        const { code } = (await t.app.inject({ method: "POST", url: "/v1/me/invites", headers: s.headers, payload: { relation: "parent" } })).json();
        await t.app.inject({ method: "POST", url: "/v1/links", headers: p.headers, payload: { code } });
        expect((await t.app.inject({ method: "DELETE", url: `/v1/links/${s.user.id}/${p.user.id}`, headers: x.headers })).statusCode).toBe(403);
        // părintele însuși poate pleca
        expect((await t.app.inject({ method: "DELETE", url: `/v1/links/${s.user.id}/${p.user.id}`, headers: p.headers })).statusCode).toBe(204);
    });
});

describe("integrarea Adservio", () => {
    it("administratorul o creează; elevul o permite; ea poate scrie doar notele elevului", async () => {
        const admin = await t.register("adm", "parent", "admin@urnotes.test");
        const s = await t.register("elev5", "student");
        const other = await t.register("elev6", "student");
        const created = await t.app.inject({ method: "POST", url: "/v1/admin/integrations", headers: admin.headers, payload: { kind: "adservio" } });
        expect(created.statusCode).toBe(201);
        const { integration, key } = created.json();
        expect(key).toMatch(/^urn_int_/);

        // un elev nu poate crea integrări
        expect((await t.app.inject({ method: "POST", url: "/v1/admin/integrations", headers: s.headers, payload: { kind: "adservio" } })).statusCode).toBe(403);

        const ih = { authorization: `Integration ${key}` };
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: ih })).json()).toEqual({ read: false, write: "none" });

        const list = (await t.app.inject({ method: "GET", url: "/v1/integrations", headers: s.headers })).json().integrations;
        expect(list.find((i: { id: string }) => i.id === integration.id)).toMatchObject({ kind: "adservio", granted: false });
        expect((await t.app.inject({ method: "PUT", url: `/v1/me/integrations/${integration.id}`, headers: s.headers })).statusCode).toBe(204);

        expect((await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: ih })).json()).toEqual({ read: false, write: "grades" });
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${other.user.id}/access`, headers: ih })).json()).toEqual({ read: false, write: "none" });

        // retrasă de administrator: cheia nu mai merge
        await t.app.inject({ method: "DELETE", url: `/v1/admin/integrations/${integration.id}`, headers: admin.headers });
        expect((await t.app.inject({ method: "GET", url: `/v1/students/${s.user.id}/access`, headers: ih })).statusCode).toBe(401);
    });

    it("o cheie greșită: 401", async () => {
        const r = await t.app.inject({ method: "GET", url: "/health", headers: { authorization: "Integration nope" } });
        expect(r.statusCode).toBe(401);
    });
});
