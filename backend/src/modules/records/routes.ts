/* API-ul modulului Student data. */
import type { FastifyInstance } from "fastify";
import type { RecordsService, Change } from "./service.js";
import { ADSERVIO_PREFIX } from "./service.js";
import { buildSummary } from "./summary.js";
import { requireActor } from "../../context.js";
import { forbidden, badRequest } from "../../errors.js";
import type { AccountsService } from "../accounts/service.js";

const uuid = { type: "string", pattern: "^[0-9a-fA-F-]{36}$" } as const;
const GRADE_TYPES = ["Test", "Ascultare", "Temă", "Proiect", "Teză", "Altele"];

export async function recordsRoutes(app: FastifyInstance, { records, accounts }: { records: RecordsService; accounts: AccountsService }) {
    const by = (req: { ctx: { user: { id: string } | null; integration: { id: string } | null } }) =>
        req.ctx.integration ? `integration:${req.ctx.integration.id}` : `user:${req.ctx.user!.id}`;

    app.get("/v1/students/:id/records", {
        schema: {
            params: { type: "object", properties: { id: uuid } },
            querystring: { type: "object", properties: { since: { type: "integer", minimum: 0, default: 0 }, limit: { type: "integer", minimum: 1, maximum: 5000, default: 2000 } } }
        }
    }, async req => {
        const q = req.query as { since: number; limit: number };
        return records.pull(requireActor(req), (req.params as { id: string }).id, q.since, q.limit);
    });

    app.post("/v1/students/:id/records", {
        bodyLimit: 4 * 1024 * 1024,
        schema: {
            params: { type: "object", properties: { id: uuid } },
            body: { type: "object", required: ["changes"], additionalProperties: false, properties: {
                changes: { type: "array", maxItems: 1000, items: { type: "object", required: ["collection", "id"], properties: {
                    collection: { type: "string" }, id: { type: "string" }, data: {} } } } } }
        }
    }, async req => {
        const changes = (req.body as { changes: Change[] }).changes.map(c => ({ ...c, data: c.data === undefined ? null : c.data }));
        return records.push(requireActor(req), (req.params as { id: string }).id, changes, by(req as never));
    });

    // faza 5: mediile calculate pe server, cu aceleași reguli ca aplicația
    app.get("/v1/students/:id/summary", { schema: { params: { type: "object", properties: { id: uuid } } } }, async req => {
        const id = (req.params as { id: string }).id;
        if (!(await records.canRead(requireActor(req), id))) throw forbidden("Nu ai acces la datele acestui elev.");
        const student = await accounts.get(id);
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
        const s = buildSummary(await records.snapshot(id), today);
        return { student: { id, name: student?.name || "" }, globalAvg: s.metrics.globalAvg, riskCount: s.metrics.riskCount, totalGrades: s.metrics.totalGrades, purtare: s.metrics.purtare?.avg ?? null, subjects: s.subjects };
    });

    // faza 6: importul din Adservio — notele vin cu id-ul lor din Adservio, deci un import repetat nu le dublează
    app.post("/v1/students/:id/imported-grades", {
        schema: {
            params: { type: "object", properties: { id: uuid } },
            body: { type: "object", required: ["grades"], additionalProperties: false, properties: {
                grades: { type: "array", maxItems: 500, items: { type: "object", required: ["externalId", "subject", "val"], additionalProperties: false, properties: {
                    externalId: { type: "string", minLength: 1, maxLength: 100 }, subject: { type: "string", minLength: 1, maxLength: 80 },
                    val: { type: "number", minimum: 1, maximum: 10 }, type: { type: "string" }, date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } } } } } }
        }
    }, async req => {
        if (!req.ctx.integration) throw forbidden("Doar importul (cu cheia lui) poate trimite note importate.");
        const body = req.body as { grades: { externalId: string; subject: string; val: number; type?: string; date?: string }[] };
        const changes: Change[] = body.grades.map(g => {
            if (!Number.isInteger(g.val)) throw badRequest("invalid_grade", "Notele sunt numere întregi.");
            return {
                collection: "grade", id: `${ADSERVIO_PREFIX}${g.externalId}`,
                data: { mat: g.subject, val: g.val, type: GRADE_TYPES.includes(g.type || "") ? g.type : "Altele", ...(g.date ? { date: g.date } : {}), source: "adservio" }
            };
        });
        return records.push(requireActor(req), (req.params as { id: string }).id, changes, by(req as never));
    });
}
