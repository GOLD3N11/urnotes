/* Regulile de calcul comune cu aplicația (shared/rules.js): același fișier, încărcat aici cu require. */
import { createRequire } from "node:module";
import { join } from "node:path";
import { BACKEND_DIR } from "./paths.js";

export interface SubjectDetail { rawAvg: number; exactAvg: number; roundedAvg: number; requiredNotes: number; status: string; statusClass: string }
export interface Metrics {
    subjects: Record<string, SubjectDetail>;
    globalAvg: number; rawGlobalAvg: number; riskCount: number; totalGrades: number; tensCount: number;
    maxGrade: number | null; minGrade: number | null; purtare: { avg: number } | null;
}
export interface RealismLimits { perDayItems: number; perDayEvaluations: number; perDayExams: number; gradesPerSubjectPerDay: number; gradesPerDay: number; eventTitle: number; subjectName: number; subjects: number; gradesPerSubject: number }
export interface Rules {
    LIMITS: RealismLimits;
    EVALUATIONS: string[];
    NEEDS_SUBJECT: string[];
    cleanText(v: unknown, max?: number): string;
    looksLikeJunk(v: unknown): boolean;
    eventProblem(ev: { type?: string; subject?: string; title?: string }, date: string, dayEvents: { type?: string; subject?: string; title?: string }[], opts?: { modules?: { start: string; end: string }[] }): string | null;
    roundValue(v: number, decimals?: number): number;
    clampNumber(v: unknown, min: number, max: number, fallback: number): number;
    purtareSummary(modules: { start: string; end: string }[], grades: Record<string, { val?: number }>, today: string): { modules: unknown[]; avg: number };
    computeMetrics(subjects: Record<string, { ore: number; excludeFromGPA?: boolean; grades: { val: number }[] }>,
        opts: { calc: { method: string; rounding: string | number; riskThreshold: number }; purtare: { avg: number } | null; purtareExcluded?: boolean; purtareWeight?: number }): Metrics;
}

export const rules = createRequire(import.meta.url)(join(BACKEND_DIR, "..", "shared", "rules.js")) as Rules;
