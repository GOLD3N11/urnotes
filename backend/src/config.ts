/* Setările serverului, din variabilele de mediu (vezi .env.example). */
export interface VapidKeys { publicKey: string; privateKey: string; subject: string }

export interface Config {
    port: number;
    host: string;
    databaseUrl: string;
    /** „firebase” în producție; „dev” acceptă jetoane de forma dev:<uid>:<email> (doar local și în teste). */
    authMode: "firebase" | "dev";
    firebaseProjectId: string;
    /** Emailurile care pot modifica datele școlare (anii, județele, examenele). */
    adminEmails: string[];
    /** De unde are voie aplicația să cheme API-ul (CORS). */
    corsOrigins: string[];
    vapid: VapidKeys | null;
    /** Cât de des verifică serverul dacă e timpul pentru amintiri. */
    schedulerEveryMs: number;
}

const list = (v: string | undefined) => (v || "").split(",").map(s => s.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const authMode = env.AUTH_MODE === "dev" ? "dev" : "firebase";
    if (authMode === "dev" && env.NODE_ENV === "production") throw new Error("AUTH_MODE=dev nu e permis în producție.");
    const firebaseProjectId = env.FIREBASE_PROJECT_ID || "";
    if (authMode === "firebase" && !firebaseProjectId) throw new Error("Lipsește FIREBASE_PROJECT_ID.");
    const vapid = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "mailto:admin@urnotes.app" }
        : null;
    return {
        port: Number(env.PORT) || 8080,
        host: env.HOST || "0.0.0.0",
        databaseUrl: env.DATABASE_URL || "postgres://urnotes:urnotes@localhost:5432/urnotes",
        authMode,
        firebaseProjectId,
        adminEmails: list(env.ADMIN_EMAILS).map(e => e.toLowerCase()),
        corsOrigins: list(env.CORS_ORIGINS || "https://gold3n11.github.io,http://localhost:5173,http://localhost:8000"),
        vapid,
        schedulerEveryMs: Number(env.SCHEDULER_EVERY_MS) || 60_000
    };
}
