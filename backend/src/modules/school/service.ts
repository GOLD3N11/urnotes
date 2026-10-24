/* Modulul School data: anii școlari, județele (săptămâna de schi) și examenele, pentru toată lumea.
   Le schimbă doar administratorul; aplicația le ia de aici, așa că un ordin nou nu mai cere o versiune nouă a aplicației. */
import { createHash } from "node:crypto";
import type { Db } from "../../db.js";
import { notFound } from "../../errors.js";
import { checkCounties, checkExams, checkYear, checkYearKey } from "./validate.js";

export type Kind = "year" | "counties" | "exams";
export interface SchoolSeed { years: Record<string, unknown>; counties: Record<string, unknown>; exams: Record<string, unknown> }
export interface SchoolBundle { version: string; years: Record<string, unknown>; counties: Record<string, unknown>; exams: Record<string, unknown> }

const CHECK: Record<Kind, (d: unknown) => unknown> = { year: checkYear, counties: checkCounties, exams: checkExams };

export class SchoolService {
    constructor(private db: Db) {}

    /** La prima pornire: datele de azi ale aplicației (shared/school-data.json). Nu suprascrie ce a schimbat administratorul. */
    async seed(seed: SchoolSeed): Promise<number> {
        let n = 0;
        const put = async (kind: Kind, key: string, data: unknown) => {
            checkYearKey(key);
            const r = await this.db.query(
                "INSERT INTO school_documents (kind, key, data) VALUES ($1, $2, $3) ON CONFLICT (kind, key) DO NOTHING RETURNING 1",
                [kind, key, JSON.stringify(CHECK[kind](data))]
            );
            n += r.length;
        };
        for (const [k, v] of Object.entries(seed.years)) await put("year", k, v);
        for (const [k, v] of Object.entries(seed.counties)) await put("counties", k, v);
        for (const [k, v] of Object.entries(seed.exams)) await put("exams", k, v);
        return n;
    }

    /** Tot dintr-o dată, cu o versiune după care aplicația știe dacă s-a schimbat ceva. */
    async bundle(): Promise<SchoolBundle> {
        const rows = await this.db.query<{ kind: Kind; key: string; data: unknown; version: number }>(
            "SELECT kind, key, data, version FROM school_documents ORDER BY kind, key");
        const out: SchoolBundle = { version: "", years: {}, counties: {}, exams: {} };
        const h = createHash("sha256");
        for (const r of rows) {
            h.update(`${r.kind}:${r.key}:${r.version};`);
            const target = r.kind === "year" ? out.years : r.kind === "counties" ? out.counties : out.exams;
            target[r.key] = r.data;
        }
        out.version = h.digest("hex").slice(0, 16);
        return out;
    }

    async get(kind: Kind, key: string) {
        checkYearKey(key);
        const r = await this.db.one("SELECT data, version, updated_at FROM school_documents WHERE kind = $1 AND key = $2", [kind, key]);
        if (!r) throw notFound("Nu există date pentru anul acesta.");
        return { data: r.data, version: Number(r.version), updatedAt: new Date(String(r.updated_at)).toISOString() };
    }

    async put(kind: Kind, key: string, data: unknown, by: string) {
        checkYearKey(key);
        const clean = CHECK[kind](data);
        const r = await this.db.one(
            `INSERT INTO school_documents (kind, key, data, updated_by) VALUES ($1, $2, $3, $4)
             ON CONFLICT (kind, key) DO UPDATE SET data = EXCLUDED.data, version = school_documents.version + 1, updated_at = now(), updated_by = EXCLUDED.updated_by
             RETURNING version, updated_at`,
            [kind, key, JSON.stringify(clean), by]
        );
        return { data: clean, version: Number(r!.version), updatedAt: new Date(String(r!.updated_at)).toISOString() };
    }
}
