/* Ce știe fiecare cerere despre cine o face. */
import type { FastifyRequest } from "fastify";
import type { Identity } from "./auth.js";
import type { Integration, User } from "./modules/accounts/service.js";
import type { Actor } from "./modules/accounts/policy.js";
import { actorOf } from "./modules/accounts/service.js";
import { ApiError, forbidden, unauthorized } from "./errors.js";

export interface RequestContext { identity: Identity | null; user: User | null; integration: Integration | null }

declare module "fastify" {
    interface FastifyRequest { ctx: RequestContext }
}

export function requireIdentity(req: FastifyRequest): Identity {
    if (!req.ctx.identity) throw unauthorized();
    return req.ctx.identity;
}

/** Contul urNotes (după ce și-a ales rolul). */
export function requireUser(req: FastifyRequest): User {
    requireIdentity(req);
    if (!req.ctx.user) throw new ApiError(403, "not_registered", "Alege mai întâi dacă ești elev, părinte sau profesor.");
    return req.ctx.user;
}

export function requireAdmin(req: FastifyRequest): User {
    const u = requireUser(req);
    if (!u.isAdmin) throw forbidden("Doar administratorul poate modifica datele școlare.");
    return u;
}

export function requireActor(req: FastifyRequest): Actor {
    if (req.ctx.integration) return { kind: "integration", id: req.ctx.integration.id, integrationKind: req.ctx.integration.kind };
    return actorOf(requireUser(req));
}
