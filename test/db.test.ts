import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { t = await testApp(); });
afterAll(async () => { await t.close(); });

/** Închide din afară toate conexiunile serverului, ca la o repornire a bazei de date. */
async function dropConnections() {
    const admin = new pg.Client({ connectionString: t.config.databaseUrl });
    await admin.connect();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
    await admin.end();
    await new Promise(resolve => setTimeout(resolve, 200));
}

describe("conexiunile la baza de date", () => {
    it("serverul supraviețuiește pierderii conexiunilor inactive", async () => {
        await t.db.query("SELECT 1");
        await dropConnections();
        expect(await t.db.one("SELECT 1 AS ok")).toEqual({ ok: 1 });
    });

    it("o conexiune pierdută în mijlocul unei tranzacții dă o eroare, nu oprește serverul", async () => {
        await expect(t.db.tx(async tx => {
            await tx.query("SELECT 1");
            await dropConnections();
            await tx.query("SELECT 1");
        })).rejects.toThrow();
        expect(await t.db.one("SELECT 1 AS ok")).toEqual({ ok: 1 });
    });
});
