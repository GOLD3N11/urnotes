/* Ce fel de înregistrări are un elev și cum arată fiecare. Verificările sunt de formă (nu de conținut):
   aplicația normalizează datele oricum, dar serverul nu primește gunoi sau înregistrări uriașe. */
import { badRequest } from "../../errors.js";

export type Collection = "subject" | "grade" | "event" | "doc";
export const COLLECTIONS: Collection[] = ["subject", "grade", "event", "doc"];
/** Cheile „doc”: restul copiei de siguranță a aplicației, câte o înregistrare fiecare. */
export const DOC_KEYS = ["settings", "timetable", "purtare", "plan", "exams", "pal", "archive", "achievements", "history", "alertMeta", "activity", "simulator"];
export const MAX_RECORD_BYTES = 256 * 1024;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (c: string, id: string, why: string) => badRequest("invalid_record", `${c}/${id}: ${why}.`);

export function checkRecord(collection: string, id: string, data: unknown): void {
    if (!COLLECTIONS.includes(collection as Collection)) throw badRequest("invalid_record", `Colecție necunoscută: ${collection}.`);
    if (typeof id !== "string" || !id.trim() || id.length > 120) throw bad(collection, String(id), "id invalid");
    if (data === null) return; // ștergere
    if (JSON.stringify(data).length > MAX_RECORD_BYTES) throw bad(collection, id, "prea mare");
    switch (collection) {
        case "subject":
            if (!isObj(data) || typeof data.ore !== "number" || typeof data.target !== "number") throw bad(collection, id, "materia are nevoie de ore și țintă");
            break;
        case "grade":
            if (!isObj(data) || typeof data.mat !== "string" || !data.mat || typeof data.val !== "number" || data.val < 1 || data.val > 10) throw bad(collection, id, "nota are nevoie de materie și o valoare 1–10");
            if (data.date !== undefined && !(typeof data.date === "string" && DATE.test(data.date))) throw bad(collection, id, "dată invalidă");
            break;
        case "event":
            if (!isObj(data) || typeof data.start !== "string" || !DATE.test(data.start) || typeof data.title !== "string") throw bad(collection, id, "evenimentul are nevoie de zi și titlu");
            break;
        case "doc":
            if (!DOC_KEYS.includes(id)) throw bad(collection, id, "cheie necunoscută");
            if (typeof data !== "object") throw bad(collection, id, "trebuie să fie un obiect");
            break;
    }
}
