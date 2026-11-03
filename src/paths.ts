import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
/** rădăcina proiectului (funcționează și din src/ cu tsx, și din dist/ după build) */
// pe Vercel codul e împachetat altundeva, dar fișierele din vercel.json (includeFiles) stau în dosarul de lucru
export const BACKEND_DIR = process.env.VERCEL ? process.cwd() : join(here, "..");
export const MIGRATIONS_DIR = join(BACKEND_DIR, "migrations");
export const SCHOOL_SEED_FILE = join(BACKEND_DIR, "shared", "school-data.json");
