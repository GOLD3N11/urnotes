/* Forma datelor școlare — aceeași ca în aplicație (js/config.js, js/exams.js). Ce nu se potrivește e respins. */
import { badRequest } from "../../errors.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKS = ["feb15", "feb22", "mar01"] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v));
const text = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;
const fail = (what: string) => { throw badRequest("invalid_school_data", `Date școlare invalide: ${what}.`); };

export function checkYearKey(key: string): number {
    const y = Number(key);
    if (!/^\d{4}$/.test(key) || y < 2020 || y > 2100) fail("anul trebuie să fie de forma 2026");
    return y;
}

/** Un an școlar: modulele, ultima zi pe clase, săptămânile de schi, sărbătorile și notele. */
export function checkYear(d: unknown): Record<string, unknown> {
    if (!isObj(d)) fail("anul trebuie să fie un obiect");
    const y = d as Record<string, unknown>;
    for (const k of ["m1", "m2"]) {
        const v = y[k];
        if (!Array.isArray(v) || v.length !== 2 || !v.every(isDate) || v[0] > v[1]) fail(`${k} = [început, sfârșit]`);
    }
    for (const k of ["m3Start", "m4End", "m5Start", "end"]) if (!isDate(y[k])) fail(`${k} trebuie să fie o dată`);
    if (y.order !== undefined && !text(y.order)) fail("order");
    if (!isObj(y.lastDay) || !Object.entries(y.lastDay).every(([c, v]) => /^\d{1,2}$/.test(c) && isDate(v))) fail("lastDay = { clasa: dată }");
    if (!isObj(y.mobile) || !WEEKS.every(w => isDate((y.mobile as Record<string, unknown>)[w])) || Object.keys(y.mobile).length !== 3) fail("mobile = { feb15, feb22, mar01 }");
    for (const k of ["holidays", "notes"]) {
        const v = y[k] ?? {};
        if (!isObj(v) || !Object.entries(v).every(([dt, name]) => isDate(dt) && text(name, 80))) fail(`${k} = { dată: nume }`);
    }
    const order = [(y.m1 as string[])[0], (y.m1 as string[])[1], (y.m2 as string[])[0], (y.m2 as string[])[1], y.m3Start, y.m4End, y.m5Start, y.end] as string[];
    if (order.some((v, i) => i && v < order[i - 1])) fail("modulele trebuie să fie în ordine");
    return { order: y.order ?? "", m1: y.m1, m2: y.m2, m3Start: y.m3Start, m4End: y.m4End, m5Start: y.m5Start, end: y.end,
        lastDay: y.lastDay, mobile: y.mobile, holidays: y.holidays ?? {}, notes: y.notes ?? {} };
}

/** Săptămâna de schi a fiecărui județ într-un an: { "Iași": "feb22", … }. */
export function checkCounties(d: unknown): Record<string, string> {
    if (!isObj(d) || !Object.keys(d).length) fail("județele = { județ: feb15 | feb22 | mar01 }");
    for (const [c, w] of Object.entries(d as Record<string, unknown>)) {
        if (!text(c, 40) || !WEEKS.includes(w as never)) fail(`județul ${c}`);
    }
    return d as Record<string, string>;
}

/** Calendarul examenelor dintr-un an: { en?, bac? }, fiecare cu status, sursă și date. */
export function checkExams(d: unknown): Record<string, unknown> {
    if (!isObj(d)) fail("examenele = { en, bac }");
    const out: Record<string, unknown> = {};
    for (const [kind, v] of Object.entries(d as Record<string, unknown>)) {
        if (kind !== "en" && kind !== "bac") fail(`examen necunoscut: ${kind}`);
        if (!isObj(v) || !text(v.status, 40) || !text(v.source, 300) || !Array.isArray(v.dates)) fail(`${kind} = { status, source, dates }`);
        const e = v as { status: string; source: string; dates: unknown[] };
        for (const row of e.dates) {
            if (!Array.isArray(row) || row.length < 2 || row.length > 4 || !isDate(row[0]) || !text(row[1]) || !row.slice(2).every(x => text(x, 20))) fail(`${kind}: fiecare dată = [zi, nume, cheie?, condiție?]`);
        }
        out[kind] = { status: e.status, source: e.source, dates: e.dates };
    }
    return out;
}
