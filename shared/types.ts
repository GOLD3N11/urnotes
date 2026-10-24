/* urNotes · Formele datelor, comune aplicației și serverului (faza 1 din planul de arhitectură).
   Descriu ce salvează azi aplicația (schema 4, vezi js/storage.js) și datele școlare de pe server.
   Serverul le folosește deja pentru datele școlare; în faza 4 le va folosi și pentru notele, calendarul și planul elevului. */

export type DateKey = string; // „2026-10-24”
export type TimeKey = string; // „19:00”

/* ---------- elevul ---------- */
export type GradeType = "Test" | "Ascultare" | "Temă" | "Proiect" | "Teză" | "Altele";
export interface Grade {
    val: number; // 1–10
    type: GradeType;
    date?: DateKey;
    /** testul din calendar din care a fost pusă nota */
    eventId?: string;
    eventDate?: DateKey;
}

export type NoteBlockType = "p" | "h" | "li" | "todo" | "q" | "hr";
export interface NoteBlock { id: string; t: NoteBlockType; text: string; done?: boolean }

export interface Subject {
    ore: number; // ore pe săptămână
    target: number; // ținta (1–10)
    grades: Grade[];
    priority: boolean;
    excludeFromGPA: boolean;
    notes: NoteBlock[];
    /** pictograma paginii materiei (un emoji); lipsă = aleasă automat */
    icon?: string;
}

export type EventType = "Test" | "Examen" | "Temă" | "Proiect" | "Prezentare" | "Personal";
export interface CalendarEvent {
    id: string;
    title: string;
    time: TimeKey | "";
    type: EventType;
    subject: string;
    description: string;
    repeat?: { every: 1 | 2; until: DateKey | "" };
    doneDates?: Record<DateKey, true>;
    doingDates?: Record<DateKey, true>;
    skipDates?: DateKey[];
}
/** evenimentele, după ziua în care încep */
export type Calendar = Record<DateKey, CalendarEvent[]>;
/** orarul: ziua săptămânii (1 = luni … 5 = vineri) → materiile, în ordine */
export type Timetable = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6" | "0", string[]>>;

export type PlanKind = "homework" | "review" | "practice" | "learn" | "free";
export interface PlanItem { id: string; date: DateKey; mat: string; kind: PlanKind; min: number; done: boolean; reason?: string; eventId?: string }
export interface Plan {
    prefs: { school: number; weekend: number; session: number; rest: number; calendar: boolean; setup: boolean; subjects: Record<string, "fav" | "tests"> };
    items: PlanItem[];
}

export interface ReminderSettings { on: boolean; time: TimeKey; ahead: boolean }

/** Copia de siguranță (aceeași formă ca în Firebase azi: users/{uid}.backup). */
export interface Backup {
    app: "urnotes" | "zece";
    version: number;
    exportedAt: string;
    data: {
        settings: Record<string, unknown> & { remind: ReminderSettings };
        subjects: Record<string, Subject>;
        calendar: Calendar;
        timetable: Timetable;
        purtare: Record<string, unknown>;
        plan: Plan;
        meta: { schema: 4 };
        [key: string]: unknown;
    };
}

/* ---------- datele școlare (serverul: /v1/school) ---------- */
export type MobileWeek = "feb15" | "feb22" | "mar01";
export interface SchoolYear {
    order: string; // ordinul ministrului
    m1: [DateKey, DateKey];
    m2: [DateKey, DateKey];
    m3Start: DateKey;
    m4End: DateKey;
    m5Start: DateKey;
    end: DateKey;
    /** ultima zi de cursuri pentru clasele care termină mai devreme (8, 12) */
    lastDay: Record<string, DateKey>;
    /** începutul fiecărei săptămâni posibile de vacanță de schi */
    mobile: Record<MobileWeek, DateKey>;
    holidays: Record<DateKey, string>;
    notes: Record<DateKey, string>;
}
export interface ExamCalendar {
    status: string; // „oficial” / „proiect”
    source: string;
    /** [zi, nume, cheia probei?, condiție?] */
    dates: [DateKey, string, string?, string?][];
}
export interface SchoolBundle {
    version: string;
    years: Record<string, SchoolYear>;
    /** an → județ → săptămâna de schi */
    counties: Record<string, Record<string, MobileWeek>>;
    exams: Record<string, { en?: ExamCalendar; bac?: ExamCalendar }>;
}

/* ---------- conturile (serverul: /v1/me, /v1/links) ---------- */
export type Role = "student" | "parent" | "teacher";
export interface Access { read: boolean; write: "all" | "grades" | "none" }
