import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { testApp } from "./helpers.js";
import { SCHOOL_SEED_FILE } from "../src/paths.js";

let t: Awaited<ReturnType<typeof testApp>>;
const seed = JSON.parse(readFileSync(SCHOOL_SEED_FILE, "utf8"));
beforeAll(async () => { t = await testApp(); });
afterAll(async () => { await t.close(); });

describe("datele școlare", () => {
    it("toată lumea le poate citi, fără cont, cu aceleași date ca aplicația", async () => {
        const r = await t.app.inject({ method: "GET", url: "/v1/school" });
        expect(r.statusCode).toBe(200);
        const b = r.json();
        expect(b.years["2026"]).toEqual(seed.years["2026"]);
        expect(b.counties["2026"]["Iași"]).toBe("feb22");
        expect(b.exams["2026"].bac.dates[0]).toEqual(seed.exams["2026"].bac.dates[0]);
        expect(b.version).toMatch(/^[0-9a-f]{16}$/);
        // aceeași versiune → 304
        const again = await t.app.inject({ method: "GET", url: "/v1/school", headers: { "if-none-match": r.headers.etag as string } });
        expect(again.statusCode).toBe(304);
    });

    it("doar administratorul publică un an nou; versiunea se schimbă", async () => {
        const before = (await t.app.inject({ method: "GET", url: "/v1/school" })).json().version;
        const s = await t.register("elevS", "student");
        const year2027 = { ...seed.years["2026"], order: "OM nr. 1/2027",
            m1: ["2027-09-06", "2027-10-22"], m2: ["2027-11-01", "2027-12-21"], m3Start: "2028-01-10", m4End: "2028-04-21", m5Start: "2028-05-03", end: "2028-06-16",
            lastDay: { 12: "2028-06-02", 8: "2028-06-09" }, mobile: { feb15: "2028-02-14", feb22: "2028-02-21", mar01: "2028-02-28" }, holidays: { "2027-12-25": "Crăciunul" }, notes: {} };
        expect((await t.app.inject({ method: "PUT", url: "/v1/school/years/2027", headers: s.headers, payload: year2027 })).statusCode).toBe(403);
        const admin = await t.register("admS", "teacher", "admin@urnotes.test");
        const put = await t.app.inject({ method: "PUT", url: "/v1/school/years/2027", headers: admin.headers, payload: year2027 });
        expect(put.statusCode).toBe(200);
        expect(put.json().version).toBe(1);
        const after = (await t.app.inject({ method: "GET", url: "/v1/school" })).json();
        expect(after.version).not.toBe(before);
        expect(after.years["2027"].order).toBe("OM nr. 1/2027");
        // o a doua modificare crește versiunea
        const put2 = await t.app.inject({ method: "PUT", url: "/v1/school/years/2027", headers: admin.headers, payload: { ...year2027, order: "OM nr. 2/2027" } });
        expect(put2.json().version).toBe(2);
    });

    it("datele greșite sunt respinse", async () => {
        const admin = await t.register("admS2", "teacher", "admin@urnotes.test");
        const bad = { ...seed.years["2026"], m1: ["2026-10-23", "2026-09-07"] };
        const r = await t.app.inject({ method: "PUT", url: "/v1/school/years/2026", headers: admin.headers, payload: bad });
        expect(r.statusCode).toBe(400);
        expect(r.json().error).toBe("invalid_school_data");
        const c = await t.app.inject({ method: "PUT", url: "/v1/school/counties/2026", headers: admin.headers, payload: { "Iași": "apr01" } });
        expect(c.statusCode).toBe(400);
        const e = await t.app.inject({ method: "PUT", url: "/v1/school/exams/2026", headers: admin.headers, payload: { en: { status: "x", source: "y", dates: [["nu-e-data", "z"]] } } });
        expect(e.statusCode).toBe(400);
        expect((await t.app.inject({ method: "GET", url: "/v1/school/years/abcd" })).statusCode).toBe(400);
    });

    it("pornirea din nou nu suprascrie ce a schimbat administratorul", async () => {
        const admin = await t.register("admS3", "teacher", "admin@urnotes.test");
        await t.app.inject({ method: "PUT", url: "/v1/school/counties/2026", headers: admin.headers, payload: { ...seed.counties["2026"], "Iași": "mar01" } });
        expect(await t.services.school.seed(seed)).toBe(0);
        expect((await t.app.inject({ method: "GET", url: "/v1/school/counties/2026" })).json().data["Iași"]).toBe("mar01");
    });
});
