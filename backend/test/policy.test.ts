import { describe, expect, it } from "vitest";
import { accessTo } from "../src/modules/accounts/policy.js";

const student = { kind: "user" as const, id: "s", role: "student" as const, isAdmin: false };
const parent = { kind: "user" as const, id: "p", role: "parent" as const, isAdmin: false };
const teacher = { kind: "user" as const, id: "t", role: "teacher" as const, isAdmin: false };
const other = { kind: "user" as const, id: "o", role: "student" as const, isAdmin: true };
const adservio = { kind: "integration" as const, id: "i", integrationKind: "adservio" as const };
const none = { linked: false, granted: false };

describe("cine vede și cine schimbă datele unui elev", () => {
    it("elevul: totul", () => expect(accessTo(student, "s", "student", none)).toEqual({ read: true, write: "all" }));
    it("părintele legat: vede, nu schimbă", () => expect(accessTo(parent, "s", "student", { ...none, linked: true })).toEqual({ read: true, write: "none" }));
    it("profesorul legat: vede, nu schimbă", () => expect(accessTo(teacher, "s", "student", { ...none, linked: true })).toEqual({ read: true, write: "none" }));
    it("părintele nelegat: nimic", () => expect(accessTo(parent, "s", "student", none)).toEqual({ read: false, write: "none" }));
    it("alt elev, chiar administrator: nimic", () => expect(accessTo(other, "s", "student", { linked: true, granted: true })).toEqual({ read: false, write: "none" }));
    it("Adservio permis: doar notele, fără citire", () => expect(accessTo(adservio, "s", "student", { ...none, granted: true })).toEqual({ read: false, write: "grades" }));
    it("Adservio nepermis: nimic", () => expect(accessTo(adservio, "s", "student", none)).toEqual({ read: false, write: "none" }));
    it("contul țintă nu e elev: nimic", () => expect(accessTo(parent, "p2", "parent", { ...none, linked: true })).toEqual({ read: false, write: "none" }));
});
