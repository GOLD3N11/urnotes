/* API-ul modulului Accounts. */
import type { FastifyInstance } from "fastify";
import type { AccountsService } from "./service.js";
import { requireActor, requireAdmin, requireIdentity, requireUser } from "../../context.js";

const uuid = { type: "string", pattern: "^[0-9a-fA-F-]{36}$" } as const;

export async function accountsRoutes(app: FastifyInstance, { accounts }: { accounts: AccountsService }) {
    // cine sunt (și dacă mi-am ales deja rolul)
    app.get("/v1/me", async req => {
        requireIdentity(req);
        return { user: req.ctx.user, registered: Boolean(req.ctx.user) };
    });

    app.post("/v1/me", {
        schema: { body: { type: "object", required: ["role"], additionalProperties: false, properties: {
            role: { type: "string", enum: ["student", "parent", "teacher"] }, name: { type: "string", maxLength: 80 } } } }
    }, async (req, reply) => {
        const body = req.body as { role: "student" | "parent" | "teacher"; name?: string };
        const user = await accounts.register(requireIdentity(req), body.role, body.name);
        reply.code(201);
        return { user };
    });

    app.patch("/v1/me", {
        schema: { body: { type: "object", required: ["name"], additionalProperties: false, properties: { name: { type: "string", maxLength: 80 } } } }
    }, async req => ({ user: await accounts.rename(requireUser(req), (req.body as { name: string }).name) }));

    app.delete("/v1/me", async (req, reply) => {
        await accounts.deleteUser(requireUser(req));
        reply.code(204);
    });

    // legăturile părinte/profesor ↔ elev
    app.post("/v1/me/invites", {
        schema: { body: { type: "object", required: ["relation"], additionalProperties: false, properties: { relation: { type: "string", enum: ["parent", "teacher"] } } } }
    }, async (req, reply) => {
        reply.code(201);
        return accounts.createInvite(requireUser(req), (req.body as { relation: "parent" | "teacher" }).relation);
    });

    app.post("/v1/links", {
        schema: { body: { type: "object", required: ["code"], additionalProperties: false, properties: { code: { type: "string", minLength: 4, maxLength: 20 } } } }
    }, async (req, reply) => {
        reply.code(201);
        return accounts.redeem(requireUser(req), (req.body as { code: string }).code);
    });

    app.get("/v1/me/links", async req => ({ links: await accounts.links(requireUser(req)) }));

    app.delete("/v1/links/:studentId/:viewerId", {
        schema: { params: { type: "object", properties: { studentId: uuid, viewerId: uuid } } }
    }, async (req, reply) => {
        const p = req.params as { studentId: string; viewerId: string };
        await accounts.unlink(requireUser(req), p.studentId, p.viewerId);
        reply.code(204);
    });

    // ce poate face cel care întreabă cu datele unui elev (folosit de modulele de date, faza 4)
    app.get("/v1/students/:id/access", { schema: { params: { type: "object", properties: { id: uuid } } } },
        async req => accounts.access(requireActor(req), (req.params as { id: string }).id));

    // integrări: elevul vede ce există și permite sau retrage importul
    app.get("/v1/integrations", async req => {
        const user = requireUser(req);
        const granted = new Set(user.role === "student" ? await accounts.grants(user) : []);
        return { integrations: (await accounts.listIntegrations()).map(i => ({ id: i.id, name: i.name, kind: i.kind, granted: granted.has(i.id) })) };
    });
    app.put("/v1/me/integrations/:id", { schema: { params: { type: "object", properties: { id: uuid } } } }, async (req, reply) => {
        await accounts.setGrant(requireUser(req), (req.params as { id: string }).id, true);
        reply.code(204);
    });
    app.delete("/v1/me/integrations/:id", { schema: { params: { type: "object", properties: { id: uuid } } } }, async (req, reply) => {
        await accounts.setGrant(requireUser(req), (req.params as { id: string }).id, false);
        reply.code(204);
    });

    // administrator
    app.post("/v1/admin/integrations", {
        schema: { body: { type: "object", required: ["kind"], additionalProperties: false, properties: {
            kind: { type: "string", enum: ["adservio"] }, name: { type: "string", maxLength: 80 } } } }
    }, async (req, reply) => {
        const b = req.body as { kind: "adservio"; name?: string };
        reply.code(201);
        return accounts.createIntegration(requireAdmin(req), b.name || "Adservio", b.kind);
    });
    app.delete("/v1/admin/integrations/:id", { schema: { params: { type: "object", properties: { id: uuid } } } }, async (req, reply) => {
        await accounts.revokeIntegration(requireAdmin(req), (req.params as { id: string }).id);
        reply.code(204);
    });
}
