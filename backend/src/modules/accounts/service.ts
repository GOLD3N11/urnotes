/* Modulul Accounts: utilizatorii (elev, părinte, profesor), legăturile dintre ei și integrările. */
import { randomBytes, randomInt } from "node:crypto";
import type { Db } from "../../db.js";
import type { Identity } from "../../auth.js";
import { hashKey } from "../../auth.js";
import { badRequest, conflict, forbidden, notFound } from "../../errors.js";
import { accessTo, type Access, type Actor, type Role } from "./policy.js";

export interface User { id: string; firebaseUid: string; email: string; name: string; role: Role; isAdmin: boolean; createdAt: string }
export interface Integration { id: string; name: string; kind: "adservio"; createdAt: string; revokedAt: string | null }
export interface LinkView { studentId: string; viewerId: string; relation: "parent" | "teacher"; name: string; email: string; createdAt: string }

export const ROLES: Role[] = ["student", "parent", "teacher"];
const INVITE_DAYS = 7;
// fără litere care se confundă (0/O, 1/I/L), ușor de dictat la telefon
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const toUser = (r: Record<string, unknown>): User => ({
    id: String(r.id), firebaseUid: String(r.firebase_uid), email: String(r.email), name: String(r.name),
    role: r.role as Role, isAdmin: Boolean(r.is_admin), createdAt: new Date(String(r.created_at)).toISOString()
});
const toIntegration = (r: Record<string, unknown>): Integration => ({
    id: String(r.id), name: String(r.name), kind: r.kind as "adservio",
    createdAt: new Date(String(r.created_at)).toISOString(), revokedAt: r.revoked_at ? new Date(String(r.revoked_at)).toISOString() : null
});

export class AccountsService {
    private deleteHooks: ((userId: string) => Promise<void>) [] = [];
    constructor(private db: Db, private adminEmails: string[], private now: () => Date = () => new Date()) {}

    /** Celelalte module își șterg datele când un cont e șters (fiecare modul își curăță tabelele lui). */
    onDelete(fn: (userId: string) => Promise<void>) { this.deleteHooks.push(fn); }

    private isAdminEmail(id: Identity) {
        return Boolean(id.email) && id.emailVerified && this.adminEmails.includes(id.email.toLowerCase());
    }

    async findByUid(uid: string): Promise<User | null> {
        const r = await this.db.one("SELECT * FROM accounts_users WHERE firebase_uid = $1", [uid]);
        return r ? toUser(r) : null;
    }

    async get(id: string): Promise<User | null> {
        if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
        const r = await this.db.one("SELECT * FROM accounts_users WHERE id = $1", [id]);
        return r ? toUser(r) : null;
    }

    /** Prima intrare: își alege rolul (elev, părinte sau profesor). Rolul nu se mai schimbă după. */
    async register(id: Identity, role: Role, name?: string): Promise<User> {
        if (!ROLES.includes(role)) throw badRequest("bad_role", "Rolul trebuie să fie elev, părinte sau profesor.");
        const existing = await this.findByUid(id.uid);
        if (existing) {
            if (existing.role !== role) throw conflict("role_locked", "Contul are deja alt rol.");
            return existing;
        }
        const r = await this.db.one(
            `INSERT INTO accounts_users (firebase_uid, email, name, role, is_admin) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (firebase_uid) DO NOTHING RETURNING *`,
            [id.uid, id.email, (name ?? id.name ?? "").trim().slice(0, 80), role, this.isAdminEmail(id)]
        );
        return r ? toUser(r) : (await this.findByUid(id.uid))!;
    }

    /** La fiecare cerere: emailul și dreptul de administrator rămân la zi cu contul Firebase. */
    async refresh(user: User, id: Identity): Promise<User> {
        const admin = this.isAdminEmail(id);
        if (user.email === id.email && user.isAdmin === admin) return user;
        const r = await this.db.one("UPDATE accounts_users SET email = $2, is_admin = $3 WHERE id = $1 RETURNING *", [user.id, id.email, admin]);
        return toUser(r!);
    }

    async rename(user: User, name: string): Promise<User> {
        const clean = String(name || "").trim().slice(0, 80);
        const r = await this.db.one("UPDATE accounts_users SET name = $2 WHERE id = $1 RETURNING *", [user.id, clean]);
        return toUser(r!);
    }

    async deleteUser(user: User): Promise<void> {
        for (const fn of this.deleteHooks) await fn(user.id);
        await this.db.query("DELETE FROM accounts_users WHERE id = $1", [user.id]);
    }

    /* ---------- legături părinte/profesor ---------- */

    async createInvite(student: User, relation: "parent" | "teacher") {
        if (student.role !== "student") throw forbidden("Doar un elev poate invita un părinte sau un profesor.");
        if (relation !== "parent" && relation !== "teacher") throw badRequest("bad_relation", "Invitația e pentru un părinte sau un profesor.");
        const expires = new Date(this.now().getTime() + INVITE_DAYS * 86_400_000);
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
            const r = await this.db.one(
                `INSERT INTO accounts_invites (code, student_id, relation, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (code) DO NOTHING RETURNING code`,
                [code, student.id, relation, this.now(), expires]
            );
            if (r) return { code, relation, expiresAt: expires.toISOString() };
        }
        throw new Error("Nu am putut genera un cod.");
    }

    async redeem(viewer: User, rawCode: string) {
        if (viewer.role !== "parent" && viewer.role !== "teacher") throw forbidden("Doar un părinte sau un profesor poate folosi un cod de elev.");
        const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        return this.db.tx(async t => {
            const inv = await t.one("SELECT * FROM accounts_invites WHERE code = $1 FOR UPDATE", [code]);
            if (!inv || inv.used_at || new Date(String(inv.expires_at)) < this.now()) throw notFound("Codul nu există sau a expirat. Cere elevului unul nou.");
            if (inv.relation !== viewer.role) throw badRequest("wrong_relation", inv.relation === "parent" ? "Codul e pentru un părinte." : "Codul e pentru un profesor.");
            if (inv.student_id === viewer.id) throw badRequest("self_link", "Nu te poți lega de propriul cont.");
            await t.query("UPDATE accounts_invites SET used_at = $2, used_by = $3 WHERE code = $1", [code, this.now(), viewer.id]);
            await t.query(
                `INSERT INTO accounts_links (student_id, viewer_id, relation) VALUES ($1, $2, $3)
                 ON CONFLICT (student_id, viewer_id) DO NOTHING`,
                [inv.student_id, viewer.id, inv.relation]
            );
            return { studentId: String(inv.student_id), relation: inv.relation as "parent" | "teacher" };
        });
    }

    /** Elevul vede cine îi poate vedea datele; părintele/profesorul vede elevii lui. */
    async links(user: User): Promise<LinkView[]> {
        const mine = user.role === "student";
        const rows = await this.db.query(
            `SELECT l.student_id, l.viewer_id, l.relation, l.created_at, u.name, u.email
             FROM accounts_links l JOIN accounts_users u ON u.id = ${mine ? "l.viewer_id" : "l.student_id"}
             WHERE ${mine ? "l.student_id" : "l.viewer_id"} = $1 ORDER BY l.created_at`,
            [user.id]
        );
        return rows.map(r => ({
            studentId: String(r.student_id), viewerId: String(r.viewer_id), relation: r.relation as "parent" | "teacher",
            name: String(r.name), email: String(r.email), createdAt: new Date(String(r.created_at)).toISOString()
        }));
    }

    /** Intrarea într-o clasă îl leagă pe profesorul clasei de elev (vede, nu schimbă). Pentru modulul Classes. */
    async linkTeacher(studentId: string, teacherId: string) {
        await this.db.query(
            `INSERT INTO accounts_links (student_id, viewer_id, relation) VALUES ($1, $2, 'teacher')
             ON CONFLICT (student_id, viewer_id) DO NOTHING`, [studentId, teacherId]);
    }

    /** Elevul sau cel legat pot desface legătura. */
    async unlink(user: User, studentId: string, viewerId: string) {
        if (user.id !== studentId && user.id !== viewerId) throw forbidden();
        const r = await this.db.query("DELETE FROM accounts_links WHERE student_id = $1 AND viewer_id = $2 RETURNING 1", [studentId, viewerId]);
        if (!r.length) throw notFound("Legătura nu există.");
    }

    /* ---------- integrări (Adservio) ---------- */

    /** Doar administratorul creează o integrare; cheia se arată o singură dată. */
    async createIntegration(admin: User, name: string, kind: "adservio") {
        if (!admin.isAdmin) throw forbidden();
        if (kind !== "adservio") throw badRequest("bad_kind", "Integrare necunoscută.");
        const key = `urn_int_${randomBytes(24).toString("base64url")}`;
        const r = await this.db.one("INSERT INTO accounts_integrations (name, kind, key_hash) VALUES ($1, $2, $3) RETURNING *", [String(name || kind).slice(0, 80), kind, hashKey(key)]);
        return { integration: toIntegration(r!), key };
    }

    async revokeIntegration(admin: User, id: string) {
        if (!admin.isAdmin) throw forbidden();
        await this.db.query("UPDATE accounts_integrations SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [id]);
    }

    async integrationByKey(key: string): Promise<Integration | null> {
        const r = await this.db.one("SELECT * FROM accounts_integrations WHERE key_hash = $1 AND revoked_at IS NULL", [hashKey(key)]);
        return r ? toIntegration(r) : null;
    }

    async listIntegrations(): Promise<Integration[]> {
        return (await this.db.query("SELECT * FROM accounts_integrations WHERE revoked_at IS NULL ORDER BY created_at")).map(toIntegration);
    }

    /** Elevul permite (sau retrage) unei integrări să-i scrie notele. */
    async setGrant(student: User, integrationId: string, on: boolean) {
        if (student.role !== "student") throw forbidden("Doar elevul poate permite importul în contul lui.");
        if (on) {
            const ok = await this.db.one("SELECT 1 FROM accounts_integrations WHERE id = $1 AND revoked_at IS NULL", [integrationId]);
            if (!ok) throw notFound("Integrarea nu există.");
            await this.db.query("INSERT INTO accounts_integration_grants (integration_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [integrationId, student.id]);
        } else {
            await this.db.query("DELETE FROM accounts_integration_grants WHERE integration_id = $1 AND student_id = $2", [integrationId, student.id]);
        }
    }

    async grants(student: User): Promise<string[]> {
        return (await this.db.query("SELECT integration_id FROM accounts_integration_grants WHERE student_id = $1", [student.id])).map(r => String(r.integration_id));
    }

    /* ---------- regula de acces, pentru toate modulele ---------- */

    async access(actor: Actor, studentId: string): Promise<Access> {
        const student = await this.get(studentId);
        if (!student) return { read: false, write: "none" };
        const linked = actor.kind === "user" && actor.id !== studentId
            ? Boolean(await this.db.one("SELECT 1 FROM accounts_links WHERE student_id = $1 AND viewer_id = $2", [studentId, actor.id]))
            : false;
        const granted = actor.kind === "integration"
            ? Boolean(await this.db.one("SELECT 1 FROM accounts_integration_grants WHERE student_id = $1 AND integration_id = $2", [studentId, actor.id]))
            : false;
        return accessTo(actor, studentId, student.role, { linked, granted });
    }
}

export const actorOf = (u: User): Actor => ({ kind: "user", id: u.id, role: u.role, isAdmin: u.isAdmin });
