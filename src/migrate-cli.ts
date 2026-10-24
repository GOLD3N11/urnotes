/* npm run migrate: aplică migrările și datele școlare inițiale, fără să pornească serverul. */
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { createDb, migrate } from "./db.js";
import { SchoolService } from "./modules/school/service.js";
import { MIGRATIONS_DIR, SCHOOL_SEED_FILE } from "./paths.js";

const config = loadConfig();
const db = createDb(config.databaseUrl);
console.log("migrări:", (await migrate(db, MIGRATIONS_DIR)).join(", ") || "nimic nou");
console.log("date școlare noi:", await new SchoolService(db).seed(JSON.parse(await readFile(SCHOOL_SEED_FILE, "utf8"))));
await db.close();
