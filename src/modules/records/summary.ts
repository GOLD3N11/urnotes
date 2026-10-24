/* Rezumatul unui elev (faza 5): mediile pe materii, media generală, materiile la risc —
   calculate pe server cu aceleași reguli ca în aplicație (shared/rules.js). Îl folosesc părinții și profesorii. */
import { rules, type Metrics } from "../../rules.js";
import type { RecordOut } from "./service.js";

interface Settings { calc?: { method?: string; rounding?: string | number; riskThreshold?: number }; modules?: { start: string; end: string }[] }

const DEFAULT_CALC = { method: "arithmetic", rounding: "2", riskThreshold: 8 };

export function buildSummary(records: RecordOut[], today: string): { metrics: Metrics; subjects: { name: string; grades: number; avg: number; rounded: number; status: string; target: number }[] } {
    const subjects: Record<string, { ore: number; target: number; excludeFromGPA: boolean; grades: { val: number; date?: string }[] }> = {};
    const docs: Record<string, unknown> = {};
    for (const r of records) {
        if (r.collection === "subject") {
            const d = r.data as { ore: number; target: number; excludeFromGPA?: boolean };
            subjects[r.id] = { ore: d.ore, target: d.target, excludeFromGPA: Boolean(d.excludeFromGPA), grades: subjects[r.id]?.grades || [] };
        } else if (r.collection === "doc") docs[r.id] = r.data;
    }
    for (const r of records) {
        if (r.collection !== "grade") continue;
        const g = r.data as { mat: string; val: number; date?: string };
        // o notă importată pentru o materie încă necreată: materia apare cu valorile obișnuite
        (subjects[g.mat] ||= { ore: 1, target: 10, excludeFromGPA: false, grades: [] }).grades.push({ val: g.val, date: g.date });
    }
    const settings = (docs.settings || {}) as Settings;
    const calc = { ...DEFAULT_CALC, ...(settings.calc || {}) } as { method: string; rounding: string | number; riskThreshold: number };
    const purtareDoc = (docs.purtare || {}) as { grades?: Record<string, { val?: number }>; excludeFromGPA?: boolean };
    const purtare = Array.isArray(settings.modules) && settings.modules.length
        ? rules.purtareSummary(settings.modules, purtareDoc.grades || {}, today)
        : null;
    const metrics = rules.computeMetrics(subjects, { calc, purtare, purtareExcluded: Boolean(purtareDoc.excludeFromGPA), purtareWeight: 1 });
    const list = Object.entries(subjects).map(([name, s]) => ({
        name, grades: s.grades.length, avg: metrics.subjects[name].exactAvg, rounded: metrics.subjects[name].roundedAvg,
        status: metrics.subjects[name].status, target: s.target
    })).sort((a, b) => a.name.localeCompare(b.name, "ro"));
    return { metrics, subjects: list };
}
