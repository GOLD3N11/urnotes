/* Modulul Student data (faza 4): datele elevului ca înregistrări, cu un număr de versiune (rev) pentru fiecare scriere.
   Aplicația trimite doar ce s-a schimbat și cere doar ce s-a schimbat după ultimul rev văzut, așa că două dispozitive
   pot lucra în același timp: fiecare notă, materie sau eveniment e o înregistrare separată (ultima scriere câștigă). */
import type { Db } from "../../db.js";
import { badRequest, forbidden } from "../../errors.js";
import { rules } from "../../rules.js";
import type { AccountsService } from "../accounts/service.js";
import type { Actor } from "../accounts/policy.js";
import { checkRecord, type Collection } from "./collections.js";

export interface Change { collection: Collection; id: string; data: unknown | null }
export interface RecordOut { collection: Collection; id: string; data: unknown | null; deleted: boolean; rev: number; updatedAt: string }

const MAX_CHANGES = 1000;
const ADSERVIO_PREFIX = "adservio:";

const out = (r: Record<string, unknown>): RecordOut => ({
    collection: r.collection as Collection, id: String(r.record_id), data: r.deleted ? null : r.data, deleted: Boolean(r.deleted),
    rev: Number(r.rev), updatedAt: new Date(String(r.updated_at)).toISOString()
});

export class RecordsService {
    constructor(private db: Db, private accounts: AccountsService) {}

    async canRead(actor: Actor, studentId: string) {
        return (await this.accounts.access(actor, studentId)).read;
    }

    /** Ce s-a schimbat după `since` (0 = tot). Elevul, părintele și profesorul legați pot citi; integrările nu. */
    async pull(actor: Actor, studentId: string, since = 0, limit = 2000) {
        if (!(await this.canRead(actor, studentId))) throw forbidden("Nu ai acces la datele acestui elev.");
        const rows = await this.db.query(
            "SELECT * FROM data_records WHERE student_id = $1 AND rev > $2 ORDER BY rev LIMIT $3",
            [studentId, since, limit + 1]);
        const more = rows.length > limit;
        const records = rows.slice(0, limit).map(out);
        const cursor = records.length ? records.at(-1)!.rev : since;
        return { records, cursor, more };
    }

    /** Scrie schimbările. Elevul scrie orice; integrarea Adservio doar notele importate de ea. */
    async push(actor: Actor, studentId: string, changes: Change[], by: string) {
        const access = await this.accounts.access(actor, studentId);
        if (access.write === "none") throw forbidden("Doar elevul își poate schimba datele.");
        if (!Array.isArray(changes) || changes.length > MAX_CHANGES) throw forbidden(`Cel mult ${MAX_CHANGES} schimbări odată.`);
        for (const c of changes) {
            checkRecord(c.collection, c.id, c.data);
            if (access.write === "grades" && !(c.collection === "grade" && c.id.startsWith(ADSERVIO_PREFIX))) {
                throw forbidden("Importul poate scrie doar notele importate de el.");
            }
        }
        if (access.write !== "grades") await this.checkRealism(studentId, changes);
        return this.write(studentId, changes, by);
    }

    /**
     * Realismul (aceleași reguli ca aplicația, din shared/rules.js), doar pentru înregistrările NOI:
     * cel mult 8 lucruri și 3 evaluări pe zi, o teză pe zi, un test pe zi la o materie; cel mult 2 note pe zi la o materie.
     * Ce exista deja (date vechi) se poate încă actualiza sau șterge.
     */
    private async checkRealism(studentId: string, changes: Change[]) {
        const fresh = changes.filter(c => c.data !== null && (c.collection === "event" || c.collection === "grade"));
        if (!fresh.length) return;
        const existing = new Set((await this.db.query<{ collection: string; record_id: string }>(
            "SELECT collection, record_id FROM data_records WHERE student_id = $1 AND collection IN ('event','grade') AND record_id = ANY($2)",
            [studentId, fresh.map(c => c.id)])).map(r => `${r.collection}/${r.record_id}`));
        const added = fresh.filter(c => !existing.has(`${c.collection}/${c.id}`));
        if (!added.length) return;
        const live = (await this.db.query<{ collection: string; record_id: string; data: Record<string, unknown> }>(
            "SELECT collection, record_id, data FROM data_records WHERE student_id = $1 AND collection IN ('event','grade') AND NOT deleted", [studentId]));
        const events = live.filter(r => r.collection === "event").map(r => r.data);
        const grades = live.filter(r => r.collection === "grade").map(r => r.data);
        for (const c of added) {
            const d = c.data as Record<string, unknown>;
            if (c.collection === "event") {
                const day = events.filter(e => e.start === d.start) as { type?: string; subject?: string; title?: string }[];
                const why = rules.eventProblem(d as { type?: string; subject?: string; title?: string }, String(d.start), day);
                if (why) throw badRequest("unrealistic", `event/${c.id}: ${why}`);
                events.push(d);
            } else if (typeof d.date === "string") {
                const same = grades.filter(g => g.mat === d.mat && g.date === d.date).length;
                const all = grades.filter(g => g.date === d.date).length;
                if (same >= rules.LIMITS.gradesPerSubjectPerDay) throw badRequest("unrealistic", `grade/${c.id}: cel mult ${rules.LIMITS.gradesPerSubjectPerDay} note pe zi la aceeași materie.`);
                if (all >= rules.LIMITS.gradesPerDay) throw badRequest("unrealistic", `grade/${c.id}: prea multe note într-o zi.`);
                grades.push(d);
            }
        }
    }

    /** Fără verificări de acces: pentru celelalte module ale serverului (clasele, importul). */
    async write(studentId: string, changes: Change[], by: string) {
        let cursor = 0;
        await this.db.tx(async t => {
            // un elev = o coadă: numerele rev ale aceluiași elev apar în ordinea în care se salvează,
            // așa că cine cere „după rev N” nu sare niciodată peste o scriere încă în curs
            await t.query("SELECT pg_advisory_xact_lock(hashtext($1))", [studentId]);
            for (const c of changes) {
                const r = await t.one<{ rev: string }>(
                    `INSERT INTO data_records (student_id, collection, record_id, data, deleted, updated_by)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (student_id, collection, record_id) DO UPDATE
                       SET data = EXCLUDED.data, deleted = EXCLUDED.deleted, rev = nextval('data_rev_seq'), updated_at = now(), updated_by = EXCLUDED.updated_by
                     RETURNING rev`,
                    [studentId, c.collection, c.id, c.data === null ? null : JSON.stringify(c.data), c.data === null, by.slice(0, 80)]);
                cursor = Math.max(cursor, Number(r!.rev));
            }
        });
        return { cursor, applied: changes.length };
    }

    async get(studentId: string, collection: Collection, id: string) {
        const r = await this.db.one("SELECT * FROM data_records WHERE student_id = $1 AND collection = $2 AND record_id = $3", [studentId, collection, id]);
        return r ? out(r) : null;
    }

    /** Toate înregistrările vii ale elevului (pentru rezumat). */
    async snapshot(studentId: string): Promise<RecordOut[]> {
        return (await this.db.query("SELECT * FROM data_records WHERE student_id = $1 AND NOT deleted", [studentId])).map(out);
    }

    async count(studentId: string) {
        return Number((await this.db.one("SELECT count(*)::int AS n FROM data_records WHERE student_id = $1 AND NOT deleted", [studentId]))!.n);
    }
}

export const isAdservioId = (id: string) => id.startsWith(ADSERVIO_PREFIX);
export { ADSERVIO_PREFIX };
