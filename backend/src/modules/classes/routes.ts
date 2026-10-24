/* API-ul modulului Classes. */
import type { FastifyInstance } from "fastify";
import type { ClassesService, ClassEventInput } from "./service.js";
import { requireUser } from "../../context.js";

const uuid = { type: "string", pattern: "^[0-9a-fA-F-]{36}$" } as const;
const eventBody = { type: "object", required: ["date", "type", "title"], additionalProperties: false, properties: {
    date: { type: "string" }, time: { type: "string" }, type: { type: "string" }, title: { type: "string" }, subject: { type: "string" }, description: { type: "string" } } } as const;

export async function classesRoutes(app: FastifyInstance, { classes }: { classes: ClassesService }) {
    app.get("/v1/classes", async req => ({ classes: await classes.list(requireUser(req)) }));

    app.post("/v1/classes", {
        schema: { body: { type: "object", required: ["name"], additionalProperties: false, properties: { name: { type: "string" }, subject: { type: "string" } } } }
    }, async (req, reply) => {
        const b = req.body as { name: string; subject?: string };
        reply.code(201);
        return classes.create(requireUser(req), b.name, b.subject);
    });

    app.post("/v1/classes/join", {
        schema: { body: { type: "object", required: ["code"], additionalProperties: false, properties: { code: { type: "string", maxLength: 20 } } } }
    }, async (req, reply) => {
        reply.code(201);
        return classes.join(requireUser(req), (req.body as { code: string }).code);
    });

    app.get("/v1/classes/:id/members", { schema: { params: { type: "object", properties: { id: uuid } } } },
        async req => ({ members: await classes.members(requireUser(req), (req.params as { id: string }).id) }));

    app.delete("/v1/classes/:id/members/:studentId", { schema: { params: { type: "object", properties: { id: uuid, studentId: uuid } } } }, async (req, reply) => {
        const p = req.params as { id: string; studentId: string };
        await classes.removeMember(requireUser(req), p.id, p.studentId);
        reply.code(204);
    });

    app.get("/v1/classes/:id/events", { schema: { params: { type: "object", properties: { id: uuid } } } },
        async req => ({ events: await classes.listEvents(requireUser(req), (req.params as { id: string }).id) }));

    app.post("/v1/classes/:id/events", { schema: { params: { type: "object", properties: { id: uuid } }, body: eventBody } }, async (req, reply) => {
        reply.code(201);
        return classes.addEvent(requireUser(req), (req.params as { id: string }).id, req.body as ClassEventInput);
    });

    app.put("/v1/classes/:id/events/:eventId", { schema: { params: { type: "object", properties: { id: uuid, eventId: uuid } }, body: eventBody } }, async req => {
        const p = req.params as { id: string; eventId: string };
        return classes.updateEvent(requireUser(req), p.id, p.eventId, req.body as ClassEventInput);
    });

    app.delete("/v1/classes/:id/events/:eventId", { schema: { params: { type: "object", properties: { id: uuid, eventId: uuid } } } }, async (req, reply) => {
        const p = req.params as { id: string; eventId: string };
        await classes.deleteEvent(requireUser(req), p.id, p.eventId);
        reply.code(204);
    });
}
