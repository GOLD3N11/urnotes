/* API-ul modulului School data. Citirea e publică (nu sunt date personale); scrierea, doar pentru administrator. */
import type { FastifyInstance } from "fastify";
import type { Kind, SchoolService } from "./service.js";
import { requireAdmin } from "../../context.js";

const KINDS: Record<string, Kind> = { years: "year", counties: "counties", exams: "exams" };

export async function schoolRoutes(app: FastifyInstance, { school }: { school: SchoolService }) {
    app.get("/v1/school", async (req, reply) => {
        const b = await school.bundle();
        const etag = `"${b.version}"`;
        reply.header("ETag", etag).header("Cache-Control", "public, max-age=300");
        if (req.headers["if-none-match"] === etag) return reply.code(304).send();
        return b;
    });

    app.get("/v1/school/:kind/:key", {
        schema: { params: { type: "object", properties: { kind: { type: "string", enum: Object.keys(KINDS) }, key: { type: "string" } } } }
    }, async req => {
        const p = req.params as { kind: string; key: string };
        return school.get(KINDS[p.kind], p.key);
    });

    app.put("/v1/school/:kind/:key", {
        schema: { params: { type: "object", properties: { kind: { type: "string", enum: Object.keys(KINDS) }, key: { type: "string" } } }, body: { type: "object" } }
    }, async req => {
        const admin = requireAdmin(req);
        const p = req.params as { kind: string; key: string };
        return school.put(KINDS[p.kind], p.key, req.body, admin.id);
    });
}
