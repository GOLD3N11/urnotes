/* Modulul Classes (faza 6): profesorul își face o clasă, elevii intră cu un cod, iar testele puse de profesor
   apar singure în calendarul fiecărui elev (ca evenimente „class-<id>”; elevul le bifează și le pune nota).
   Scrie în datele elevilor doar prin modulul Student data (RecordsService.write), nu direct în tabelele lui. */
import { randomInt } from "node:crypto";
import type { Db } from "../../db.js";
import { badRequest, forbidden, notFound } from "../../errors.js";
import type { AccountsService, User } from "../accounts/service.js";
import type { RecordsService } from "../records/service.js";

export interface ClassEventInput { date: string; time?: string; type: string; title: string; subject?: string; description?: string }
const TYPES = ["Test", "Examen", "Temă", "Proiect", "Prezentare"];
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const eventRecordId = (eventId: string) => `class-${eventId}`;

export class ClassesService {
    constructor(private db: Db, private accounts: AccountsService, private records: RecordsService, private today: () => string) {}

    private async ownClass(teacher: User, classId: string) {
        const c = await this.db.one("SELECT * FROM class_groups WHERE id = $1", [classId]);
        if (!c) throw notFound("Clasa nu există.");
        if (c.teacher_id !== teacher.id) throw forbidden("Nu e clasa ta.");
        return c;
    }

    async create(teacher: User, name: string, subject = "") {
        if (teacher.role !== "teacher") throw forbidden("Doar un profesor poate face o clasă.");
        const clean = String(name || "").trim().slice(0, 60);
        if (!clean) throw badRequest("bad_name", "Dă-i clasei un nume (de ex. „a XI-a B”).");
        for (let i = 0; i < 5; i++) {
            const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
            const r = await this.db.one(
                "INSERT INTO class_groups (teacher_id, name, subject, join_code) VALUES ($1, $2, $3, $4) ON CONFLICT (join_code) DO NOTHING RETURNING *",
                [teacher.id, clean, String(subject || "").slice(0, 80), code]);
            if (r) return this.view(r, 0);
        }
        throw new Error("Nu am putut genera un cod.");
    }

    private view(r: Record<string, unknown>, members: number) {
        return { id: String(r.id), name: String(r.name), subject: String(r.subject), code: String(r.join_code), members };
    }

    /** Profesorul: clasele lui (cu cod și numărul de elevi). Elevul: clasele în care e. */
    async list(user: User) {
        if (user.role === "teacher") {
            const rows = await this.db.query(
                `SELECT g.*, (SELECT count(*)::int FROM class_members m WHERE m.class_id = g.id) AS n
                 FROM class_groups g WHERE g.teacher_id = $1 ORDER BY g.created_at`, [user.id]);
            return rows.map(r => this.view(r, Number(r.n)));
        }
        const rows = await this.db.query(
            `SELECT g.id, g.name, g.subject, u.name AS teacher FROM class_members m JOIN class_groups g ON g.id = m.class_id
             JOIN accounts_users u ON u.id = g.teacher_id WHERE m.student_id = $1 ORDER BY m.joined_at`, [user.id]);
        return rows.map(r => ({ id: String(r.id), name: String(r.name), subject: String(r.subject), teacher: String(r.teacher) }));
    }

    async join(student: User, rawCode: string) {
        if (student.role !== "student") throw forbidden("Doar un elev intră într-o clasă.");
        const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const c = await this.db.one("SELECT * FROM class_groups WHERE join_code = $1", [code]);
        if (!c) throw notFound("Nu există o clasă cu acest cod.");
        await this.db.query("INSERT INTO class_members (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [c.id, student.id]);
        await this.accounts.linkTeacher(student.id, String(c.teacher_id));
        // testele care urmează ajung și în calendarul lui
        const events = await this.db.query("SELECT * FROM class_events WHERE class_id = $1 AND date >= $2", [c.id, this.today()]);
        for (const e of events) await this.fanOut(String(c.name), e, [student.id]);
        return { id: String(c.id), name: String(c.name), subject: String(c.subject) };
    }

    async members(teacher: User, classId: string) {
        await this.ownClass(teacher, classId);
        const rows = await this.db.query(
            `SELECT u.id, u.name, u.email, m.joined_at FROM class_members m JOIN accounts_users u ON u.id = m.student_id
             WHERE m.class_id = $1 ORDER BY u.name`, [classId]);
        return rows.map(r => ({ id: String(r.id), name: String(r.name), email: String(r.email), joinedAt: new Date(String(r.joined_at)).toISOString() }));
    }

    /** Profesorul scoate un elev, sau elevul iese. Testele viitoare ale clasei dispar din calendarul lui. */
    async removeMember(user: User, classId: string, studentId: string) {
        if (user.id !== studentId) await this.ownClass(user, classId);
        const r = await this.db.query("DELETE FROM class_members WHERE class_id = $1 AND student_id = $2 RETURNING 1", [classId, studentId]);
        if (!r.length) throw notFound("Elevul nu e în clasă.");
        const events = await this.db.query("SELECT id FROM class_events WHERE class_id = $1 AND date >= $2", [classId, this.today()]);
        if (events.length) await this.records.write(studentId, events.map(e => ({ collection: "event", id: eventRecordId(String(e.id)), data: null })), `class:${classId}`);
    }

    private check(e: ClassEventInput) {
        if (!DATE.test(e.date)) throw badRequest("bad_date", "Ziua trebuie să fie de forma 2026-11-05.");
        if (e.time && !TIME.test(e.time)) throw badRequest("bad_time", "Ora trebuie să fie de forma 08:00.");
        if (!TYPES.includes(e.type)) throw badRequest("bad_type", "Tipul: Test, Examen, Temă, Proiect sau Prezentare.");
        if (!e.title?.trim() || e.title.length > 100) throw badRequest("bad_title", "Titlul are între 1 și 100 de caractere.");
    }

    async listEvents(teacher: User, classId: string) {
        await this.ownClass(teacher, classId);
        const rows = await this.db.query("SELECT * FROM class_events WHERE class_id = $1 ORDER BY date, time", [classId]);
        return rows.map(r => this.eventView(r));
    }

    private eventView(r: Record<string, unknown>) {
        return { id: String(r.id), date: String(r.date), time: String(r.time), type: String(r.type), title: String(r.title), subject: String(r.subject), description: String(r.description) };
    }

    async addEvent(teacher: User, classId: string, e: ClassEventInput) {
        const c = await this.ownClass(teacher, classId);
        this.check(e);
        const r = await this.db.one(
            `INSERT INTO class_events (class_id, date, time, type, title, subject, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [classId, e.date, e.time || "", e.type, e.title.trim(), e.subject || String(c.subject), (e.description || "").slice(0, 500)]);
        await this.fanOut(String(c.name), r!, await this.memberIds(classId));
        return this.eventView(r!);
    }

    async updateEvent(teacher: User, classId: string, eventId: string, e: ClassEventInput) {
        const c = await this.ownClass(teacher, classId);
        this.check(e);
        const r = await this.db.one(
            `UPDATE class_events SET date = $3, time = $4, type = $5, title = $6, subject = $7, description = $8, updated_at = now()
             WHERE id = $1 AND class_id = $2 RETURNING *`,
            [eventId, classId, e.date, e.time || "", e.type, e.title.trim(), e.subject || String(c.subject), (e.description || "").slice(0, 500)]);
        if (!r) throw notFound("Testul nu există.");
        await this.fanOut(String(c.name), r, await this.memberIds(classId));
        return this.eventView(r);
    }

    async deleteEvent(teacher: User, classId: string, eventId: string) {
        await this.ownClass(teacher, classId);
        const r = await this.db.query("DELETE FROM class_events WHERE id = $1 AND class_id = $2 RETURNING id", [eventId, classId]);
        if (!r.length) throw notFound("Testul nu există.");
        for (const sid of await this.memberIds(classId)) {
            await this.records.write(sid, [{ collection: "event", id: eventRecordId(eventId), data: null }], `class:${classId}`);
        }
    }

    private async memberIds(classId: string): Promise<string[]> {
        return (await this.db.query("SELECT student_id FROM class_members WHERE class_id = $1", [classId])).map(r => String(r.student_id));
    }

    /** Scrie testul în calendarul fiecărui elev, păstrând ce a bifat elevul (făcut / în lucru). */
    private async fanOut(className: string, e: Record<string, unknown>, studentIds: string[]) {
        const id = eventRecordId(String(e.id));
        for (const sid of studentIds) {
            const old = await this.records.get(sid, "event", id);
            const keep = old && !old.deleted && old.data && typeof old.data === "object" ? old.data as Record<string, unknown> : {};
            const data = {
                start: String(e.date), title: String(e.title), time: String(e.time), type: String(e.type), subject: String(e.subject),
                description: String(e.description), cls: className,
                ...(keep.doneDates ? { doneDates: keep.doneDates } : {}), ...(keep.doingDates ? { doingDates: keep.doingDates } : {})
            };
            await this.records.write(sid, [{ collection: "event", id, data }], `class:${String(e.class_id)}`);
        }
    }
}
