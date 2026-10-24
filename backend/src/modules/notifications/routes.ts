/* API-ul modulului Notifications. Totul e pentru utilizatorul autentificat; cheia VAPID publică e publică. */
import type { FastifyInstance } from "fastify";
import type { NotificationsService } from "./service.js";
import { requireUser } from "../../context.js";
import { ApiError } from "../../errors.js";

const DAY = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;

export async function notificationsRoutes(app: FastifyInstance, { notifications }: { notifications: NotificationsService }) {
    app.get("/v1/notifications/vapid-key", async () => {
        const key = notifications.vapidKey();
        if (!key) throw new ApiError(503, "push_off", "Serverul nu are notificările push configurate.");
        return { publicKey: key };
    });

    app.post("/v1/notifications/subscriptions", {
        schema: { body: { type: "object", required: ["endpoint", "keys"], properties: {
            endpoint: { type: "string", maxLength: 1000 },
            keys: { type: "object", required: ["p256dh", "auth"], properties: { p256dh: { type: "string", maxLength: 200 }, auth: { type: "string", maxLength: 100 } } }
        } } }
    }, async (req, reply) => {
        const b = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
        await notifications.subscribe(requireUser(req).id, b, String(req.headers["user-agent"] || ""));
        reply.code(204);
    });

    app.delete("/v1/notifications/subscriptions", {
        schema: { body: { type: "object", required: ["endpoint"], properties: { endpoint: { type: "string", maxLength: 1000 } } } }
    }, async (req, reply) => {
        await notifications.unsubscribe(requireUser(req).id, (req.body as { endpoint: string }).endpoint);
        reply.code(204);
    });

    app.get("/v1/notifications/settings", async req => {
        const user = requireUser(req);
        return { ...(await notifications.getSettings(user.id)), devices: await notifications.subscriptionCount(user.id) };
    });

    app.put("/v1/notifications/settings", {
        schema: { body: { type: "object", required: ["enabled", "time", "timezone"], additionalProperties: false, properties: {
            enabled: { type: "boolean" }, time: { type: "string" }, timezone: { type: "string", maxLength: 64 } } } }
    }, async req => notifications.putSettings(requireUser(req).id, req.body as { enabled: boolean; time: string; timezone: string }));

    app.put("/v1/notifications/digests", {
        schema: { body: { type: "object", required: ["from", "days"], additionalProperties: false, properties: { from: DAY, days: { type: "object" } } } }
    }, async req => {
        const b = req.body as { from: string; days: Record<string, { title: string; body: string }> };
        return notifications.putDigests(requireUser(req).id, b.from, b.days);
    });

    app.post("/v1/notifications/shown", {
        schema: { body: { type: "object", required: ["day"], additionalProperties: false, properties: { day: DAY } } }
    }, async (req, reply) => {
        await notifications.markShown(requireUser(req).id, (req.body as { day: string }).day);
        reply.code(204);
    });
}
