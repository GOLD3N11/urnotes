import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
/** backend/ (funcționează și din src/ cu tsx, și din dist/ după build) */
export const BACKEND_DIR = join(here, "..");
export const MIGRATIONS_DIR = join(BACKEND_DIR, "migrations");
export const SCHOOL_SEED_FILE = join(BACKEND_DIR, "..", "shared", "school-data.json");
