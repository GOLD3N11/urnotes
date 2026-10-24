/* O aplicație de test: o bază de date nouă pentru fiecare fișier de test, autentificare de test, push fals. */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { buildApp, createServices } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb, migrate } from "../src/db.js";
import { devVerifier } from "../src/auth.js";
import { MIGRATIONS_DIR, SCHOOL_SEED_FILE } from "../src/paths.js";
import type { PushResult, PushSender, PushTarget } from "../src/modules/notifications/push.js";

export class FakePush implements PushSender {
    sent: { target: PushTarget; payload: Record<string, unknown> }[] = [];
    next: PushResult = "ok";
    async send(target: PushTarget, payload: string) {
        if (this.next === "ok") this.sent.push({ target, payload: JSON.parse(payload) });
        return this.next;
    }
}

export async function testApp(env: Record<string, string> = {}) {
    const adminUrl = process.env.TEST_DATABASE_URL!;
    const name = `t_${randomBytes(6).toString("hex")}`;
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    const url = adminUrl.replace(/\/[^/]*$/, `/${name}`);
    const config = loadConfig({ AUTH_MODE: "dev", DATABASE_URL: url, ADMIN_EMAILS: "admin@urnotes.test", VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "x", ...env });
    const db = createDb(url);
    await migrate(db, MIGRATIONS_DIR);
    const push = new FakePush();
    const deps = { config, db, verifier: devVerifier(), push, today: () => "2026-10-24" };
    const services = createServices(deps);
    await services.school.seed(JSON.parse(readFileSync(SCHOOL_SEED_FILE, "utf8")));
    const app = await buildApp(deps, services);
    const auth = (uid: string, email = `${uid}@urnotes.test`) => ({ authorization: `Bearer dev:${uid}:${email}` });
    /** Creează un cont cu un rol și întoarce antetul lui de autentificare + utilizatorul. */
    const register = async (uid: string, role: "student" | "parent" | "teacher", email?: string) => {
        const headers = auth(uid, email);
        const res = await app.inject({ method: "POST", url: "/v1/me", headers, payload: { role, name: uid } });
        if (res.statusCode !== 201) throw new Error(`register ${uid}: ${res.statusCode} ${res.body}`);
        return { headers, user: res.json().user as { id: string; role: string; isAdmin: boolean } };
    };
    const close = async () => { await app.close(); await db.close(); };
    return { app, db, services, push, auth, register, close, config };
}
