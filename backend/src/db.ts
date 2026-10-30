/* Baza de date (PostgreSQL). Fiecare modul își are tabelele lui (prefix accounts_, school_, notif_)
   și nu citește tabelele altui modul: vorbește cu el prin serviciul lui. */
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type Row = Record<string, unknown>;

export interface Db {
    query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
    one<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T | null>;
    tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
    close(): Promise<void>;
}

function wrap(client: pg.Pool | pg.PoolClient, inTx: boolean): Db {
    const db: Db = {
        async query(sql, params = []) {
            const res = await client.query(sql, params as unknown[]);
            return res.rows;
        },
        async one(sql, params = []) {
            const rows = await db.query(sql, params);
            return (rows[0] as never) ?? null;
        },
        async tx(fn) {
            if (inTx) return fn(db);
            const c = await (client as pg.Pool).connect();
            let lost: Error | undefined; // conexiunea căzută în timpul tranzacției: cererile ei dau eroare, serverul merge mai departe
            const onLost = (err: Error) => { lost = err; };
            c.on("error", onLost);
            try {
                await c.query("BEGIN");
                const out = await fn(wrap(c, true));
                await c.query("COMMIT");
                return out;
            } catch (err) {
                await c.query("ROLLBACK").catch(() => {});
                throw err;
            } finally {
                c.off("error", onLost);
                c.release(lost);
            }
        },
        async close() {
            if (!inTx) await (client as pg.Pool).end();
        }
    };
    return db;
}

export function createDb(url: string): Db {
    // datele calendaristice (date) rămân text „YYYY-MM-DD”, nu devin obiecte Date cu fus orar
    pg.types.setTypeParser(1082, v => v);
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    // o conexiune inactivă pierdută (baza de date a repornit) nu trebuie să oprească serverul: pool-ul deschide alta
    pool.on("error", err => console.error("Conexiune pierdută la baza de date:", err.message));
    return wrap(pool, false);
}

/** Rulează migrările din folderul migrations/ care n-au rulat încă, în ordine. */
export async function migrate(db: Db, dir: string): Promise<string[]> {
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map(r => r.name));
    const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
    const applied: string[] = [];
    for (const f of files) {
        if (done.has(f)) continue;
        const sql = await readFile(join(dir, f), "utf8");
        await db.tx(async t => {
            await t.query(sql);
            await t.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        });
        applied.push(f);
    }
    return applied;
}
