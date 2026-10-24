/* Serverul urNotes: un singur serviciu, împărțit în module (Accounts, School data, Notifications).
   Fiecare modul își are tabelele, serviciul și rutele lui; nu citește tabelele altui modul. */
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { readCredential, type TokenVerifier } from "./auth.js";
import { ApiError, unauthorized } from "./errors.js";
import "./context.js";
import { AccountsService } from "./modules/accounts/service.js";
import { accountsRoutes } from "./modules/accounts/routes.js";
import { SchoolService } from "./modules/school/service.js";
import { schoolRoutes } from "./modules/school/routes.js";
import { NotificationsService } from "./modules/notifications/service.js";
import { notificationsRoutes } from "./modules/notifications/routes.js";
import { noPushSender, webPushSender, type PushSender } from "./modules/notifications/push.js";
import { RecordsService } from "./modules/records/service.js";
import { recordsRoutes } from "./modules/records/routes.js";
import { ClassesService } from "./modules/classes/service.js";
import { classesRoutes } from "./modules/classes/routes.js";

export interface Services { accounts: AccountsService; school: SchoolService; notifications: NotificationsService; records: RecordsService; classes: ClassesService }

export interface AppDeps {
    config: Config;
    db: Db;
    verifier: TokenVerifier;
    push?: PushSender;
    logger?: boolean;
    /** „azi” în România (testele îl fixează) */
    today?: () => string;
}

export function createServices(deps: AppDeps): Services {
    const { config, db, push } = deps;
    const sender = push ?? (config.vapid ? webPushSender(config.vapid) : noPushSender);
    const today = deps.today ?? (() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date()));
    const accounts = new AccountsService(db, config.adminEmails);
    const records = new RecordsService(db, accounts);
    // ștergerea contului: fiecare modul își șterge datele lui
    accounts.onDelete(async id => { await db.query("DELETE FROM data_records WHERE student_id = $1", [id]); });
    accounts.onDelete(async id => {
        await db.query("DELETE FROM class_members WHERE student_id = $1", [id]);
        await db.query("DELETE FROM class_groups WHERE teacher_id = $1", [id]);
    });
    accounts.onDelete(async id => {
        for (const t of ["notif_subscriptions", "notif_settings", "notif_digests", "notif_delivered"]) await db.query(`DELETE FROM ${t} WHERE user_id = $1`, [id]);
    });
    return {
        accounts,
        school: new SchoolService(db),
        notifications: new NotificationsService(db, sender, config.vapid?.publicKey ?? null),
        records,
        classes: new ClassesService(db, accounts, records, today)
    };
}

export async function buildApp(deps: AppDeps, services = createServices(deps)): Promise<FastifyInstance> {
    const { config, verifier } = deps;
    const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 4 * 1024 * 1024, trustProxy: true });

    await app.register(cors, {
        origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: ["Authorization", "Content-Type", "If-None-Match"],
        exposedHeaders: ["ETag"],
        maxAge: 600
    });

    // cine face cererea: un utilizator (jeton Firebase) sau o integrare (cheie)
    app.decorateRequest("ctx", null as never);
    app.addHook("onRequest", async req => {
        req.ctx = { identity: null, user: null, integration: null };
        const cred = readCredential(req.headers.authorization);
        if (!cred) return;
        if (cred.kind === "user") {
            const identity = await verifier.verify(cred.token);
            req.ctx.identity = identity;
            const user = await services.accounts.findByUid(identity.uid);
            req.ctx.user = user ? await services.accounts.refresh(user, identity) : null;
        } else {
            const integration = await services.accounts.integrationByKey(cred.key);
            if (!integration) throw unauthorized("Cheie de integrare invalidă.");
            req.ctx.integration = integration;
        }
    });

    app.setErrorHandler((err, req, reply) => {
        if (err instanceof ApiError) return reply.code(err.status).send({ error: err.code, message: err.message });
        const e = err as { validation?: unknown; statusCode?: number; message: string };
        if (e.validation) return reply.code(400).send({ error: "invalid_request", message: e.message });
        if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: "request_error", message: e.message });
        req.log.error(err);
        return reply.code(500).send({ error: "server_error", message: "Ceva n-a mers pe server. Încearcă din nou." });
    });

    app.get("/health", async () => ({ ok: true }));
    await app.register(accountsRoutes, { accounts: services.accounts });
    await app.register(schoolRoutes, { school: services.school });
    await app.register(notificationsRoutes, { notifications: services.notifications });
    await app.register(recordsRoutes, { records: services.records, accounts: services.accounts });
    await app.register(classesRoutes, { classes: services.classes });
    return app;
}
